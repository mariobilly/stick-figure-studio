#!/usr/bin/env node
'use strict';
// ---------------------------------------------------------------------------
// Stick Figure Studio MCP server
// ---------------------------------------------------------------------------
//   Claude Code  <-- stdio (MCP / JSON-RPC) -->  this script  <-- http long-poll -->  the Studio window
//
// No dependencies. The Studio page (js/bridge.js) polls http://127.0.0.1:PORT for
// commands, runs them inside the app, and posts the results back.
//
// If a second Claude Code session starts another copy of this script, the port is
// already taken: that copy runs as a proxy and forwards its commands to the owner.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const PORT = Number(process.env.STUDIO_MCP_PORT) || 47821;
const APP_DIR = path.resolve(__dirname, '..');
const APP_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');
const TOKEN_FILE = path.join(__dirname, '.token');
const RENDER_DIR = path.join(os.homedir(), 'Videos', 'Stick Figure Studio');
const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const log = (...a) => process.stderr.write('[studio-mcp] ' + a.join(' ') + '\n');

// ---------------------------------------------------------------------------
// Bridge to the app
// ---------------------------------------------------------------------------

let owner = false;            // true when this process holds the port
let token = '';
let lastPoll = 0;             // when the app last asked for work
let appInfo = null;
const queue = [];             // commands waiting for the app
const waiting = [];           // parked poll responses
const pending = new Map();    // id -> { resolve, timer }
const uploads = new Map();    // job -> directory
const jobs = new Map();       // render job -> { json, workers: [{ from, to, audio, done, error }], waiters }

const connected = () => Date.now() - lastPoll < 40000;

function readBody(req, limit = 1 << 30) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, code, body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

// Only the Studio page (a file:// page, whose Origin is "null") may take commands or post results.
const fromApp = (req) => { const o = req.headers.origin; return o === 'null' || (o || '').startsWith('file://'); };

function dispatch() {
  while (queue.length && waiting.length) {
    const res = waiting.shift();
    clearTimeout(res.timer);
    send(res, 200, queue.shift());
  }
}

// Send one command to the app and wait for its answer.
function callApp(tool, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const id = crypto.randomBytes(6).toString('hex');
    const timer = setTimeout(() => {
      pending.delete(id);
      const i = queue.findIndex((c) => c.id === id);
      if (i >= 0) queue.splice(i, 1);
      resolve({ ok: false, error: connected() ? `The Studio did not answer within ${Math.round(timeoutMs / 1000)}s.` : 'The Studio window is not open (or not responding). Call open_studio, then try again.' });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    queue.push({ id, tool, args: args || {} });
    dispatch();
  });
}

async function handleHttp(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/poll' && fromApp(req)) {
    lastPoll = Date.now();
    res.timer = setTimeout(() => { const i = waiting.indexOf(res); if (i >= 0) waiting.splice(i, 1); send(res, 200, { idle: true }); }, 25000);
    req.on('close', () => { clearTimeout(res.timer); const i = waiting.indexOf(res); if (i >= 0) waiting.splice(i, 1); });
    waiting.push(res);
    return dispatch();
  }

  if (url.pathname === '/result' && req.method === 'POST' && fromApp(req)) {
    lastPoll = Date.now();
    const msg = JSON.parse((await readBody(req)).toString('utf8'));
    if (msg.hello) appInfo = msg.hello;
    const p = pending.get(msg.id);
    if (p) { clearTimeout(p.timer); pending.delete(msg.id); p.resolve(msg); }
    return send(res, 200, { ok: true });
  }

  // rendered frames and audio for a video job
  if (url.pathname === '/upload' && req.method === 'POST' && fromApp(req)) {
    lastPoll = Date.now();
    const dir = uploads.get(url.searchParams.get('job'));
    const name = path.basename(url.searchParams.get('name') || '');
    if (!dir || !name) return send(res, 400, { error: 'unknown job' });
    fs.writeFileSync(path.join(dir, name), await readBody(req));
    return send(res, 200, { ok: true });
  }

  // hidden render workers: fetch their assignment, report when they are done
  if (url.pathname === '/job' && fromApp(req)) {
    const job = jobs.get(url.searchParams.get('id')), w = Number(url.searchParams.get('worker'));
    if (!job || !job.workers[w]) return send(res, 404, { error: 'unknown job' });
    return send(res, 200, JSON.stringify({ project: job.json, ...job.args, ...job.workers[w], job: url.searchParams.get('id'), worker: w }));
  }
  if (url.pathname === '/jobdone' && req.method === 'POST' && fromApp(req)) {
    const msg = JSON.parse((await readBody(req)).toString('utf8'));
    const job = jobs.get(msg.job);
    if (job && job.workers[msg.worker]) { Object.assign(job.workers[msg.worker], { done: true, error: msg.error || null, info: msg.info }); job.check(); }
    return send(res, 200, { ok: true });
  }

  // another copy of this script (a second Claude Code session) forwarding a tool call
  if (url.pathname === '/command' && req.method === 'POST') {
    const msg = JSON.parse((await readBody(req)).toString('utf8'));
    if (msg.token !== token) return send(res, 403, { error: 'bad token' });
    return send(res, 200, await runTool(msg.tool, msg.args));
  }

  if (url.pathname === '/status') return send(res, 200, { app: 'stick-figure-studio-mcp', connected: connected() });
  send(res, 404, { error: 'not found' });
}

function startBridge() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handleHttp(req, res).catch((err) => { log('http error', err.message); try { send(res, 500, { error: err.message }); } catch (e) { /* closed */ } }));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') { owner = false; log(`port ${PORT} is owned by another session: running as a proxy`); } else log('bridge error', err.message);
      try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) { /* no owner token yet */ }
      resolve();
    });
    server.listen(PORT, '127.0.0.1', () => {
      owner = true;
      token = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(TOKEN_FILE, token);
      log(`bridge listening on 127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

function forward(tool, args) {
  return new Promise((resolve) => {
    let t = token;
    try { t = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) { /* keep */ }
    const body = JSON.stringify({ token: t, tool, args });
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/command', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { resolve(text('The other Studio MCP session returned something unreadable.', true)); } });
    });
    req.on('error', async () => {
      // the owner is gone: take the port over and handle it ourselves
      await startBridge();
      resolve(owner ? await runTool(tool, args) : text('Could not reach the Studio bridge.', true));
    });
    req.end(body);
  });
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const text = (t, isError) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 1) }], isError: !!isError });

// readable for small answers, dense for big ones (every character costs context)
function compact(value) {
  const pretty = JSON.stringify(value, null, 1);
  return pretty.length < 700 ? pretty : JSON.stringify(value).replace(/\{"order":/g, '\n{"order":');
}

function formatRun(r) {
  const parts = [];
  if (r.logs && r.logs.length) parts.push('log:\n' + r.logs.join('\n'));
  if (!r.ok) parts.push('ERROR: ' + r.error + (r.rolledBack ? '\n(The scene was rolled back to how it was before this call.)' : ''));
  else parts.push(r.result === undefined ? 'done' : typeof r.result === 'string' ? r.result : compact(r.result));
  return text(parts.join('\n\n'), !r.ok);
}

async function waitForApp(ms) {
  const until = Date.now() + ms;
  while (!connected() && Date.now() < until) await new Promise((r) => setTimeout(r, 300));
  return connected();
}

function ffmpeg(args) {
  return new Promise((resolve) => execFile('ffmpeg', args, { windowsHide: true, maxBuffer: 1 << 26 }, (err, so, se) => resolve({ err, se })));
}

const TOOLS = {
  open_studio: {
    description: 'Open the Stick Figure Studio window if it is not already open, and wait until it is linked. Call this first when any other tool says the Studio is not open.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      if (connected()) return text('The Studio is already open and linked.' + (appInfo ? ` Film: “${appInfo.name}”.` : ''));
      const exe = EDGE_PATHS.find((p) => fs.existsSync(p));
      if (!exe) return text('Could not find Edge or Chrome. Open the desktop shortcut "Stick Figure Animator" by hand.', true);
      spawn(exe, [`--app=${APP_URL}`], { detached: true, stdio: 'ignore' }).unref();
      return (await waitForApp(20000)) ? text('Studio opened and linked.') : text('The window was launched but has not linked yet. Wait a moment and call studio_status.', true);
    },
  },

  studio_status: {
    description: 'Is the Studio window open and linked? Returns the film name, shots and current frame.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      if (!(await waitForApp(7000))) return text('Not linked: the Studio window is not open. Call open_studio.');
      return formatRun(await callApp('status', {}, 15000));
    },
  },

  get_api: {
    description: 'The reference for driving the Studio with run_code: data model, the actions layer (walkTo, pickUp, say, cameraTo...), the rig, library, conventions and worked examples. READ THIS ONCE at the start of every session before using run_code.',
    inputSchema: { type: 'object', properties: {} },
    async run() { return text(fs.readFileSync(path.join(__dirname, 'API.md'), 'utf8')); },
  },

  get_scene: {
    description: 'Describe the current shot: every layer (name, type, position, size, world bounds, parent, which properties are animated and over which frames), the camera, sounds, markers, shot length and playhead. Pass `object` to get one layer in full, including every key.',
    inputSchema: { type: 'object', properties: { object: { type: 'string', description: 'Name of one layer (or "camera") to return in full detail.' }, frame: { type: 'number', description: 'Frame to measure positions at. Default: the playhead.' } } },
    async run(a) { return formatRun(await callApp('scene', a, 20000)); },
  },

  run_code: {
    description: 'Run JavaScript inside the Studio to build or animate the scene. The code is the BODY of an async function with these arguments: S (Studio namespace), A (S.actions), M (S.model), L (S.library), U (S.util), scene (current shot), project, find(name) (layer by name, or "camera"), log(...) (collect debug output). `return` a value to get it back as JSON. The whole call is ONE undo step for the user; if it throws, the scene is rolled back. Call get_api first for the API. After changing things, look at the result with get_frame.',
    inputSchema: { type: 'object', required: ['code'], properties: { code: { type: 'string' }, description: { type: 'string', description: 'A few words on what this does (shown to the user in the app).' } } },
    async run(a) { return formatRun(await callApp('run', a, 120000)); },
  },

  get_frame: {
    description: 'Render what the audience sees and return it as an image, so you can check your work. One frame, or several frames as a labelled contact sheet (great for checking motion). Use `crop` to zoom into a region of the scene (e.g. a hand or a face).',
    inputSchema: {
      type: 'object',
      properties: {
        frames: { type: 'array', items: { type: 'number' }, description: 'Frame numbers. Default: the playhead. Up to 12.' },
        width: { type: 'number', description: 'Width in pixels of each frame. Default 800 for one frame, 400 for a sheet.' },
        crop: { type: 'array', items: { type: 'number' }, description: '[x, y, w, h] region in output-frame pixels (film resolution, e.g. 1920x1080) to enlarge.' },
        director: { type: 'boolean', description: 'true = ignore the camera and show the whole set flat, with the camera frame drawn on it.' },
      },
    },
    async run(a) {
      const r = await callApp('frame', a, 60000);
      if (!r.ok) return formatRun(r);
      return { content: [{ type: 'image', data: r.result.data, mimeType: r.result.mime }, { type: 'text', text: r.result.caption }] };
    },
  },

  playback: {
    description: 'Control the playhead in the Studio window: play, stop, or seek to a frame. Use play after finishing an animation so the user sees it.',
    inputSchema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['play', 'stop', 'seek'] }, frame: { type: 'number' }, from: { type: 'number', description: 'With play: frame to start from.' } } },
    async run(a) { return formatRun(await callApp('playback', a, 15000)); },
  },

  render_video: {
    description: 'Render the current shot or the whole film to an MP4 file on disk, frame-accurate, with the sound mix. Returns the file path. Takes roughly 0.1-0.3 s per frame.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['shot', 'film'], description: 'Default: shot.' },
        scale: { type: 'number', description: '1 = full resolution (default), 0.5 = half.' },
        path: { type: 'string', description: 'Output file. Default: ~/Videos/Stick Figure Studio/<film name>.mp4' },
      },
    },
    async run(a) {
      // The film is rendered by hidden browser workers, in parallel, from a snapshot of the open project:
      // the user's window stays free, and background-window throttling cannot slow the render down.
      const snap = await callApp('project', { stats: true }, 120000);
      if (!snap.ok) return formatRun(snap);
      const exe = EDGE_PATHS.find((p) => fs.existsSync(p));
      if (!exe) return text('Could not find Edge or Chrome to render with.', true);
      const { json, name, fps, shotFrames, currentShot } = snap.result;
      const total = a.scope === 'film' ? shotFrames.reduce((n, x) => n + x, 0) : shotFrames[currentShot];
      const n = Math.max(1, Math.min(4, Math.ceil(total / 300)));
      const job = crypto.randomBytes(5).toString('hex');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-render-'));
      uploads.set(job, dir);
      const workers = [];
      for (let i = 0; i < n; i++) workers.push({ from: Math.floor((total * i) / n), to: Math.floor((total * (i + 1)) / n), audio: i === 0, done: false });
      const procs = [], profiles = [];
      try {
        const finished = new Promise((resolve) => { jobs.set(job, { json, args: { scope: a.scope || 'shot', scale: a.scale || 1, shot: currentShot }, workers, check: () => { if (workers.every((w) => w.done)) resolve(); } }); });
        workers.forEach((w, i) => {
          const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-worker-'));
          profiles.push(profile);
          procs.push(spawn(exe, ['--headless=new', '--disable-gpu', '--mute-audio', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--user-data-dir=' + profile, '--window-size=1280,800', APP_URL + '#render=' + job + '&worker=' + i], { stdio: 'ignore' }));
        });
        const timeout = new Promise((resolve) => setTimeout(resolve, 50 * 60000, 'timeout'));
        if ((await Promise.race([finished, timeout])) === 'timeout') return text('The render timed out. Frames so far are in ' + dir, true);
        const failed = workers.find((w) => w.error);
        if (failed) return text('A render worker failed: ' + failed.error, true);
        const frames = total, hasAudio = !!(workers[0].info && workers[0].info.hasAudio);
        const out = path.resolve(a.path || path.join(RENDER_DIR, `${name}.mp4`));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const args = ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f_%05d.png')];
        if (hasAudio) args.push('-i', path.join(dir, 'audio.wav'));
        args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium');
        if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
        args.push('-movflags', '+faststart', out);
        const { err, se } = await ffmpeg(args);
        if (err) return text('Frames were rendered, but ffmpeg failed:\n' + String(se).split('\n').slice(-8).join('\n') + `\nThe PNG frames are in ${dir}`, true);
        fs.rmSync(dir, { recursive: true, force: true });
        return text(`Rendered ${frames} frames (${(frames / fps).toFixed(1)}s) to:\n${out}`);
      } finally {
        uploads.delete(job);
        jobs.delete(job);
        for (const p of procs) { try { p.kill(); } catch (e) { /* gone */ } }
        setTimeout(() => { for (const d of profiles) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* locked: the OS temp cleaner gets it */ } } }, 4000);
      }
    },
  },

  import_files: {
    description: 'Bring audio or image files from disk into the open project as assets (dialogue recordings, music, artwork). Returns each asset id (and its duration for audio). Use the ids afterwards in run_code: S.audio.addClip(scene, project.assets[id], frame, "dialogue"|"music"|"sfx", gain), S.audio.lipSync(scene, clip, character, project.fps), or for images L.imageObject(project.assets[id]).',
    inputSchema: { type: 'object', required: ['files'], properties: { files: { type: 'array', items: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, id: { type: 'string', description: 'Asset id to use (default: the file name without extension).' }, name: { type: 'string' } } } } } },
    async run(a) {
      const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
      const results = [];
      for (let i = 0; i < a.files.length; i += 6) {
        const items = a.files.slice(i, i + 6).map((f) => {
          const ext = path.extname(f.path).toLowerCase(), mime = MIME[ext];
          if (!mime) throw new Error('Unsupported file type: ' + f.path);
          const base = path.basename(f.path, ext);
          return { id: f.id || base, name: f.name || base, kind: mime.startsWith('audio') ? 'audio' : 'image', dataUrl: 'data:' + mime + ';base64,' + fs.readFileSync(f.path).toString('base64') };
        });
        const r = await callApp('import', { items }, 120000);
        if (!r.ok) return formatRun(r);
        results.push(...r.result);
      }
      return text(results);
    },
  },

  save_project: {
    description: 'Save the whole film (all shots, artwork and sounds embedded) to a .studio.json file on disk. Default location: ~/Videos/Stick Figure Studio/<film name>.studio.json',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    async run(a) {
      const r = await callApp('project', {}, 60000);
      if (!r.ok) return formatRun(r);
      const out = path.resolve(a.path || path.join(RENDER_DIR, `${r.result.name}.studio.json`));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, r.result.json);
      return text(`Saved to ${out}`);
    },
  },

  load_project: {
    description: 'Open a .studio.json project file from disk in the Studio, replacing the current film (the app autosaves, and the user can undo nothing here: save first if in doubt).',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
    async run(a) {
      if (!fs.existsSync(a.path)) return text('No such file: ' + a.path, true);
      return formatRun(await callApp('load', { json: fs.readFileSync(a.path, 'utf8') }, 60000));
    },
  },
};

async function runTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) return text('Unknown tool: ' + name, true);
  if (!owner && name !== 'get_api') return forward(name, args);
  try {
    // the page retries its link every few seconds, so give an already-open window a moment to find us
    if (!['open_studio', 'studio_status', 'get_api'].includes(name) && !(await waitForApp(7000))) {
      return text('The Studio window is not open. Call open_studio first.', true);
    }
    return await tool.run(args || {});
  } catch (err) {
    return text('Tool failed: ' + err.message, true);
  }
}

// ---------------------------------------------------------------------------
// MCP over stdio (newline-delimited JSON-RPC 2.0)
// ---------------------------------------------------------------------------

const INSTRUCTIONS = [
  'This server drives Stick Figure Studio, the user\'s 2D animation app, so they can describe a scene or a change in plain language and you build it.',
  'Workflow: 1) studio_status (open_studio if needed)  2) get_api ONCE per session  3) get_scene to see what exists  4) run_code to build/animate  5) get_frame to LOOK at the result (use several frames for motion) and fix what is off  6) playback play so the user sees it.',
  'Prefer the high-level actions (A.walkTo, A.pickUp, A.say, A.cameraTo...) and add hand-made keys with A.K for anything they do not cover. Everything you create is ordinary layers and keys the user can keep editing by hand.',
].join('\n');

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function fail(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }

async function onMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return reply(id, { protocolVersion: (params && params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'stick-figure-studio', version: '1.0.0' }, instructions: INSTRUCTIONS });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) });
  if (method === 'tools/call') return reply(id, await runTool(params.name, params.arguments));
  if (method === 'resources/list') return reply(id, { resources: [] });
  if (method === 'prompts/list') return reply(id, { prompts: [] });
  if (id !== undefined) fail(id, -32601, 'Method not found: ' + method);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (err) { log('bad json'); continue; }
    onMessage(msg).catch((err) => { log('handler error', err.stack || err.message); if (msg.id !== undefined) fail(msg.id, -32603, err.message); });
  }
});
process.stdin.on('end', () => process.exit(0));

startBridge();
