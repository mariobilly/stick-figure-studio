'use strict';
// ---------------------------------------------------------------------------
// Bridge: lets Claude Code drive the Studio through the MCP server (mcp/server.js)
// ---------------------------------------------------------------------------
// The page long-polls http://127.0.0.1:47821 for commands, runs them here, and
// posts the results back. When the server is not running this does nothing but
// retry quietly; the app works exactly the same without it.

(function (S) {
  const U = S.util;
  const M = S.model;
  const BASE = 'http://127.0.0.1:47821';
  const AsyncFunction = (async () => {}).constructor;

  let pill = null;
  let linked = false;
  let standby = false;   // another, newer Studio window holds the link
  const BORN = Date.now() + Math.random();

  function setLinked(on) {
    if (on === linked) return;
    linked = on;
    if (pill) { pill.hidden = !on; }
  }

  const find = (name) => {
    const scene = S.scene(), n = String(name || '').toLowerCase().trim();
    if (n === 'camera') return scene.camera;
    return scene.objects.find((o) => o.id === name) || scene.objects.find((o) => o.name.toLowerCase() === n) || scene.objects.find((o) => o.name.toLowerCase().includes(n)) || null;
  };

  // JSON that is safe to send back: no cycles, no functions, rounded numbers, bounded size.
  function safe(value) {
    if (value === undefined) return undefined;
    const seen = new WeakSet();
    const json = JSON.stringify(value, (key, v) => {
      if (typeof v === 'function') return undefined;
      if (typeof v === 'number') return Math.round(v * 1000) / 1000;
      if (v instanceof DOMMatrix) return { a: v.a, b: v.b, c: v.c, d: v.d, e: v.e, f: v.f };
      if (key === 'dataUrl' || key === 'paths') return Array.isArray(v) ? `[${v.length} paths]` : '[data]';
      if (v && typeof v === 'object') { if (seen.has(v)) return '[circular]'; seen.add(v); }
      return v;
    });
    if (json === undefined) return undefined;
    return json.length > 30000 ? json.slice(0, 30000) + ' …[truncated: ask for less at a time]' : JSON.parse(json);
  }

  // --- describing the scene ------------------------------------------------------------

  function trackSummary(obj) {
    const out = {};
    for (const [prop, keys] of Object.entries(obj.tracks)) out[prop] = keys.length === 1 ? `1 key @${keys[0].t}` : `${keys.length} keys @${keys[0].t}–${keys[keys.length - 1].t}`;
    return out;
  }

  function describe(args) {
    const P = S.state.project, scene = S.scene();
    const f = Number.isFinite(args.frame) ? args.frame : S.state.frame;

    if (args.object) {
      const obj = find(args.object);
      if (!obj) throw new Error(`No layer called "${args.object}". Layers: ${scene.objects.map((o) => o.name).join(', ')}`);
      const { paths, ...rest } = obj;
      return { ...rest, paths: paths ? `${paths.length} paths` : undefined, valuesAtFrame: Object.fromEntries(Object.keys(obj.props).map((p) => [p, M.getProp(obj, p, f)])) };
    }

    const objects = scene.objects.map((o, i) => {
      const at = M.getProp(o, 'attach', f);
      const entry = { order: i, name: o.name, type: o.type, kind: o.kind, depth: o.depth };
      if (o.kind === 'background' || (o.fromBackground && o.locked)) { entry.background = true; return entry; }
      const info = S.actions.info(o, f);
      Object.assign(entry, {
        x: M.getProp(o, 'x', f), y: M.getProp(o, 'y', f), scale: M.getProp(o, 'scaleX', f), rotation: M.getProp(o, 'rotation', f) || undefined,
        flip: M.getProp(o, 'flip', f) || undefined, opacity: M.getProp(o, 'opacity', f) === 1 ? undefined : M.getProp(o, 'opacity', f),
        worldBounds: { left: info.left, top: info.top, right: info.right, bottom: info.bottom },
        attachedTo: at ? `${(scene.objects.find((x) => x.id === at.id) || {}).name}${at.bone ? '.' + at.bone : ''}` : undefined,
        hidden: o.hidden || undefined, locked: o.locked || undefined, step: o.step > 1 ? o.step : undefined,
        animated: Object.keys(o.tracks).length ? trackSummary(o) : undefined,
      });
      if (o.type === 'character') Object.assign(entry, { facing: info.facing > 0 ? 'right' : 'left', head: info.head, shoulder: info.shoulder, reach: info.reach, expression: M.getProp(o, 'expression', f), holding: (S.actions.held(o, f) || {}).name });
      if (o.type === 'text') entry.text = M.getProp(o, 'text', f);
      return entry;
    });

    const cam = M.evalCtx(scene, f).camera();
    return {
      film: { name: P.name, width: P.width, height: P.height, fps: P.fps, shots: P.scenes.map((s, i) => `${i}: ${s.name} (${s.duration}f)`), currentShot: S.state.sceneIndex, savedClips: P.clips.map((c) => c.name) },
      shot: { name: scene.name, durationFrames: scene.duration, seconds: scene.duration / P.fps, floorY: S.actions.floorY(), backdrop: scene.bg, look: scene.look },
      playhead: S.state.frame, measuredAtFrame: f,
      camera: { ...cam, animated: Object.keys(scene.camera.tracks).length ? trackSummary(scene.camera) : undefined },
      layers_back_to_front: objects,
      sounds: scene.audio.map((a) => ({ name: a.name, track: a.track, startFrame: a.start, gain: a.gain, seconds: S.audio.duration(a.assetId) })),
      markers: scene.markers,
    };
  }

  // --- pictures ---------------------------------------------------------------------------

  // what region of the scene a picture shows: an explicit crop, the film frame, or (director view) the set around it
  function regionOf(args) {
    const P = S.state.project;
    if (Array.isArray(args.crop) && args.crop.length === 4) return args.crop;
    return args.director ? [-P.width * 0.4, -P.height * 0.4, P.width * 1.8, P.height * 1.8] : [0, 0, P.width, P.height];
  }

  function renderCell(canvas, scene, f, args) {
    const P = S.state.project, c = canvas.getContext('2d');
    const crop = regionOf(args);
    const k = canvas.width / crop[2];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#121217';
    c.fillRect(0, 0, canvas.width, canvas.height);
    const base = new DOMMatrix().scaleSelf(k).translateSelf(-crop[0], -crop[1]);
    const ctx = S.render.scene(c, P, scene, f, { base, camera: !args.director, clip: !args.director });
    if (args.director) {
      const inv = base.multiply(M.layerMatrix(P, ctx.camera(), 1).inverse());
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.beginPath();
      [[0, 0], [P.width, 0], [P.width, P.height], [0, P.height]].forEach(([x, y], i) => { const pt = U.apply(inv, x, y); if (i) c.lineTo(pt.x, pt.y); else c.moveTo(pt.x, pt.y); });
      c.closePath();
      c.strokeStyle = '#2ec4b6';
      c.lineWidth = 3;
      c.stroke();
      const a = U.apply(base, 0, 0), b = U.apply(base, P.width, P.height);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 1.5;
      c.setLineDash([8, 6]);
      c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.setLineDash([]);
    }
  }

  function frameImage(args) {
    const P = S.state.project, scene = S.scene();
    const frames = (Array.isArray(args.frames) && args.frames.length ? args.frames : [S.state.frame]).slice(0, 12).map((f) => Math.max(0, Math.round(f)));
    const crop = regionOf(args);
    const w = Math.round(U.clamp(args.width || (frames.length > 1 ? 400 : 800), 120, 1600));
    const h = Math.round(w * crop[3] / crop[2]);
    const cols = frames.length <= 3 ? frames.length : frames.length <= 8 ? Math.ceil(frames.length / 2) : 4;
    const sheet = document.createElement('canvas');
    sheet.width = cols * w;
    sheet.height = Math.ceil(frames.length / cols) * h;
    const cell = document.createElement('canvas');
    cell.width = w;
    cell.height = h;
    const g = sheet.getContext('2d');
    frames.forEach((f, i) => {
      renderCell(cell, scene, f, args);
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      g.drawImage(cell, x, y);
      if (frames.length > 1) {
        const label = `f${f} · ${(f / P.fps).toFixed(2)}s`;
        g.font = '600 13px system-ui, sans-serif';
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(x + 4, y + 4, g.measureText(label).width + 10, 20);
        g.fillStyle = '#fff';
        g.fillText(label, x + 9, y + 18);
      }
    });
    const data = sheet.toDataURL('image/jpeg', 0.85);
    return { mime: 'image/jpeg', data: data.slice(data.indexOf(',') + 1), caption: `${args.director ? 'Director view: the whole set, flat. Dashed white = the film frame, teal = what the camera sees' : 'Camera view'} · frames ${frames.join(', ')} of ${scene.duration} · ${P.width}×${P.height}${args.crop ? ' · crop ' + crop.join(',') : ''}` };
  }

  // --- rendering a film to disk (frames go to the server, which runs ffmpeg) ---------------------

  async function renderVideo(args) {
    const P = S.state.project;
    const scenes = args.scope === 'film' ? P.scenes : [P.scenes[args.shot ?? S.state.sceneIndex]];
    const from = args.from ?? 0, to = args.to ?? Infinity;
    const scale = U.clamp(args.scale || 1, 0.1, 2);
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = even(P.width * scale);
    canvas.height = even(P.height * scale);
    const total = scenes.reduce((n, s) => n + s.duration, 0);
    const post = (name, blob) => fetch(`${BASE}/upload?job=${args.job}&name=${name}`, { method: 'POST', body: blob });
    S.playback.stop();
    S.state.exporting = true;
    try {
      let n = 0;
      const segments = [];
      for (const scene of scenes) {
        segments.push({ scene, startSec: n / P.fps });
        for (let f = 0; f < scene.duration; f++, n++) {
          if (n < from || n >= to) continue;
          S.render.toCanvas(canvas, P, scene, f);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          await post(`f_${String(n).padStart(5, '0')}.png`, blob);
          if (n % 24 === 0) S.toast(`Claude is rendering… ${Math.round((n / total) * 100)}%`);
        }
      }
      const hasAudio = args.audio !== false && scenes.some((s) => s.audio.length);
      if (hasAudio) await post('audio.wav', S.audio.bufferToWavBlob(await S.audio.mixdown(P, segments, total / P.fps)));
      S.toast('Render finished.');
      return { fps: P.fps, frames: total, hasAudio, name: (P.name || 'film').replace(/[^\w\- ]+/g, '').trim() || 'film' };
    } finally {
      S.state.exporting = false;
    }
  }

  // --- commands ----------------------------------------------------------------------------------

  const status = () => ({ linked: true, window: Math.round(BORN), film: S.state.project.name, shots: S.state.project.scenes.map((s) => s.name), currentShot: S.state.sceneIndex, playhead: S.state.frame, shotFrames: S.scene().duration, fps: S.state.project.fps, layers: S.scene().objects.length });

  async function execute(cmd) {
    const { tool, args } = cmd;
    if (tool === 'status') return { result: status() };
    if (tool === 'scene') return { result: describe(args) };
    if (tool === 'frame') return { result: frameImage(args) };
    if (tool === 'render') return { result: await renderVideo(args) };
    if (tool === 'project') return { result: { name: (S.state.project.name || 'film').replace(/[^\w\- ]+/g, '').trim() || 'film', json: JSON.stringify(S.state.project), fps: S.state.project.fps, shotFrames: S.state.project.scenes.map((s) => s.duration), currentShot: S.state.sceneIndex } };
    if (tool === 'load') { const data = JSON.parse(args.json); if (!data || data.app !== 'stick-figure-studio') throw new Error('Not a Studio project file.'); S.store.setProject(data); return { result: `Opened “${data.name}”` }; }
    if (tool === 'import') {
      const P = S.state.project, out = [];
      for (const item of args.items) {
        const asset = { id: item.id, name: item.name, kind: item.kind, dataUrl: item.dataUrl };
        if (item.kind === 'audio') { const buf = await S.audio.decodeAsset(asset); P.assets[asset.id] = asset; out.push({ id: asset.id, seconds: Math.round(buf.duration * 1000) / 1000 }); }
        else { P.assets[asset.id] = asset; await S.assets.loadAll(P); const img = S.assets.image(asset.id); if (img) { asset.w = img.naturalWidth; asset.h = img.naturalHeight; } out.push({ id: asset.id, w: asset.w, h: asset.h }); }
      }
      S.touch('data');
      return { result: out };
    }
    if (tool === 'playback') {
      if (args.action === 'play') { S.playback.stop(); if (Number.isFinite(args.from)) S.state.frame = Math.max(0, Math.round(args.from)); S.playback.play(); }
      else if (args.action === 'seek') S.playback.seek(args.frame || 0);
      else S.playback.stop();
      return { result: { playing: S.state.playing, frame: S.state.frame } };
    }
    if (tool === 'run') {
      const logs = [];
      const log = (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(safe(x)))).join(' '));
      S.playback.stop();
      S.history.push();
      if (args.description) S.toast('Claude: ' + args.description);
      try {
        const fn = new AsyncFunction('S', 'A', 'M', 'L', 'U', 'scene', 'project', 'find', 'log', args.code);
        const value = await fn(S, S.actions, M, S.library, U, S.scene(), S.state.project, find, log);
        S.state.selKeys = [];
        if (S.state.sel.kind === 'object' && !S.selected()) S.state.sel = { kind: 'none', id: null };
        const scene = S.scene();
        S.state.frame = U.clamp(S.state.frame, 0, scene.duration);
        S.touch('all');
        return { result: safe(value), logs };
      } catch (err) {
        S.history.undo();   // leave the scene exactly as it was
        const where = /<anonymous>:(\d+):(\d+)/.exec(err.stack || '');
        return { error: `${err.name}: ${err.message}${where ? ` (line ${Number(where[1]) - 2} of your code)` : ''}`, rolledBack: true, logs };
      }
    }
    throw new Error('Unknown command: ' + tool);
  }

  // Only one Studio window may take Claude's commands: the newest one. Windows talk to each other directly,
  // so this holds whichever MCP server process happens to be running.
  function claimLink() {
    if (typeof BroadcastChannel === 'undefined') return;
    const chan = new BroadcastChannel('stick-figure-studio-link');
    chan.onmessage = (e) => {
      const m = e.data || {};
      if (m.claim && m.claim > BORN && !standby) { standby = true; setLinked(false); if (pill) { pill.hidden = false; pill.textContent = '○ Claude is linked to a newer Studio window'; pill.style.color = '#8f90a3'; } }
      else if (m.claim && m.claim < BORN && !standby) chan.postMessage({ claim: BORN });            // an older window woke up: remind it
      else if (m.release && standby) { standby = false; if (pill) { pill.hidden = true; pill.textContent = '● Claude linked'; pill.style.color = ''; } chan.postMessage({ claim: BORN }); }
    };
    chan.postMessage({ claim: BORN });
    window.addEventListener('pagehide', () => { if (!standby) chan.postMessage({ release: BORN }); });
  }

  async function loop() {
    let delay = 2000;
    for (;;) {
      if (standby) { await new Promise((resolve) => setTimeout(resolve, 1500)); continue; }
      try {
        if (!linked) {
          // a quick handshake first: the poll below can stay parked for 25 seconds when there is nothing to do
          await fetch(`${BASE}/result`, { method: 'POST', body: JSON.stringify({ hello: { name: S.state.project.name } }) });
          setLinked(true);
        }
        const res = await fetch(`${BASE}/poll`, { cache: 'no-store' });
        const cmd = await res.json();
        delay = 2000;
        if (cmd.idle || !cmd.id) continue;
        if (standby) { await fetch(`${BASE}/result`, { method: 'POST', body: JSON.stringify({ id: cmd.id, ok: false, error: 'That Studio window just handed the link to a newer window. Run the command again.' }) }); continue; }
        let out;
        try { out = await execute(cmd); } catch (err) { out = { error: err.message }; }
        await fetch(`${BASE}/result`, { method: 'POST', body: JSON.stringify({ id: cmd.id, ok: !out.error, ...out }) });
      } catch (err) {
        // the MCP server is not running: keep quiet and try again later
        setLinked(false);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.25, 5000);
      }
    }
  }

  // Render-worker mode: this page was opened hidden by the MCP server to render part of a film. It never polls for commands.
  async function renderJob(id, worker) {
    const done = (body) => fetch(BASE + '/jobdone', { method: 'POST', body: JSON.stringify({ job: id, worker, ...body }) });
    try {
      while (!S.state.project) await new Promise((r) => setTimeout(r, 50));   // let the normal boot finish first
      await new Promise((r) => setTimeout(r, 200));
      const spec = await (await fetch(BASE + '/job?id=' + id + '&worker=' + worker, { cache: 'no-store' })).json();
      const project = JSON.parse(spec.project);
      S.store.scheduleAutosave = () => {};
      S.store.setProject(project);
      await S.assets.loadAll(project);
      await S.audio.loadAll(project);
      const info = await renderVideo({ job: id, scope: spec.scope, scale: spec.scale, shot: spec.shot, from: spec.from, to: spec.to, audio: spec.audio });
      await done({ info });
    } catch (err) {
      await done({ error: String(err && err.message || err) });
    }
  }

  function init() {
    const m = /render=([0-9a-f]+)&worker=(\d+)/.exec(location.hash);
    if (m) { renderJob(m[1], Number(m[2])); return; }
    pill = U.el('span', { class: 'claude-link', hidden: true, title: 'Claude Code is linked to this window through the Studio MCP server', text: '● Claude linked' });
    const exportBtn = document.getElementById('btn-export');
    exportBtn.parentNode.insertBefore(pill, exportBtn);
    claimLink();
    setTimeout(loop, 400);   // give older windows a moment to stand down first
  }

  S.bridge = { init, describe, find };
})(window.Studio);
