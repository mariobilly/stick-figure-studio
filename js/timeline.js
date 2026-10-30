'use strict';
// ---------------------------------------------------------------------------
// Timeline: one row per object, one track per animated property, audio below
// ---------------------------------------------------------------------------

(function (S) {
  const U = S.util;
  const M = S.model;
  const el = U.el;

  const ROW = 24, AUDIO_ROW = 44, PAD = 10, RULER_H = 28;
  const ORDER = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'zoom', 'flip', 'attach', 'text', 'view', 'expression', 'mouth', 'eyes', 'lookX', 'lookY', 'handL', 'handR'];

  let ruler, tracks, scroll, labels, rc, tc;
  let ppf = 6;            // pixels per frame
  let scrollX = 0;        // first visible frame
  let rows = [];
  let labelSig = '';
  const propNodes = new Map();   // "objId:prop" -> { value, key } label nodes
  let keyHits = [];       // [{ x, y, refs: [{ obj, prop, key }] }]
  let clipHits = [];      // [{ x0, x1, y0, y1, clip }]
  let drag = null;

  const X = (frame) => (frame - scrollX) * ppf + PAD;
  const frameAt = (x) => (x - PAD) / ppf + scrollX;
  const fps = () => S.state.project.fps;

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  function propOrder(name) {
    const i = ORDER.indexOf(name);
    if (i >= 0) return i;
    if (name.startsWith('b.')) return 100 + S.rig.BONE_NAMES.indexOf(name.slice(2));
    return 200;
  }

  function buildRows() {
    const scene = S.scene();
    const out = [];
    let y = 0;
    const push = (row, h) => { row.y = y; row.h = h; y += h; out.push(row); };
    const add = (obj) => {
      push({ kind: 'obj', obj }, ROW);
      if (!S.state.expanded[obj.id]) return;
      for (const prop of Object.keys(obj.tracks).sort((a, b) => propOrder(a) - propOrder(b))) push({ kind: 'prop', obj, prop }, ROW);
    };
    add(scene.camera);
    for (let i = scene.objects.length - 1; i >= 0; i--) add(scene.objects[i]);
    for (const track of S.audio.TRACKS) push({ kind: 'audio', track }, AUDIO_ROW);
    rows = out;
    return y;
  }

  function formatValue(v, type) {
    if (v == null) return '—';
    if (typeof v === 'number') return type === 'angle' ? `${U.round(v, 1)}°` : String(U.round(v, 2));
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'object') {
      if ('bone' in v || 'id' in v) { const p = S.scene().objects.find((o) => o.id === v.id); return p ? p.name + (v.bone ? ' · ' + (M.BONE_LABELS[v.bone] || v.bone) : '') : '—'; }
      return 'pinned';
    }
    return String(v).split('\n')[0].slice(0, 14);
  }

  function isSelected(obj) {
    const sel = S.state.sel;
    return (obj.type === 'camera' && sel.kind === 'camera') || (sel.kind === 'object' && sel.id === obj.id);
  }

  function syncLabels() {
    const sig = rows.map((r) => (r.kind === 'audio' ? 'a' + r.track : `${r.kind}:${r.obj.id}:${r.prop || ''}:${r.obj.name}:${isSelected(r.obj)}:${Object.keys(r.obj.tracks).length > 0}`)).join('|');
    if (sig === labelSig) return;
    labelSig = sig;
    labels.innerHTML = '';
    propNodes.clear();
    // handlers look objects up by id: undo swaps in fresh copies of every object
    const find = (id) => (id === 'camera' ? S.scene().camera : S.scene().objects.find((o) => o.id === id));
    for (const row of rows) {
      let node;
      if (row.kind === 'obj') {
        const obj = row.obj, open = !!S.state.expanded[obj.id], has = Object.keys(obj.tracks).length > 0;
        node = el('div', { class: 'tl-label obj' + (isSelected(obj) ? ' selected' : ''), onclick: () => S.select(obj.type === 'camera' ? 'camera' : 'object', obj.id) }, [
          el('span', { class: 'twisty' + (has ? '' : ' empty'), text: open ? '▾' : '▸', onclick: (e) => { e.stopPropagation(); S.state.expanded[obj.id] = !open; S.touch('sel'); } }),
          el('span', { class: 'kind', text: { camera: '🎥', character: '🕴', text: 'T', image: '▧', group: '◻', shape: '◆' }[obj.type] || '◆' }),
          el('span', { class: 'name', text: obj.name }),
        ]);
      } else if (row.kind === 'prop') {
        const { prop } = row, id = row.obj.id;
        const nodes = {
          value: el('span', { class: 'value' }),
          key: el('button', { class: 'keybtn', title: 'Add or remove a key at the playhead', text: '◆', onclick: () => { S.history.push(); M.toggleKey(find(id), prop, S.state.frame); S.touch('data'); } }),
        };
        propNodes.set(id + ':' + prop, nodes);
        node = el('div', { class: 'tl-label prop' }, [
          el('span', { class: 'name', text: M.meta(prop).label }), nodes.value, nodes.key,
          el('button', { class: 'ghost', title: 'Remove this track', text: '×', onclick: () => { const obj = find(id); S.history.push(); obj.props[prop] = M.getProp(obj, prop, S.state.frame); delete obj.tracks[prop]; S.state.selKeys = []; S.touch('data'); } }),
        ]);
      } else {
        node = el('div', { class: 'tl-label audio' }, [el('span', { class: 'kind', text: '♪' }), el('span', { class: 'name', text: { dialogue: 'Dialogue', music: 'Music & ambience', sfx: 'Sound effects' }[row.track] })]);
      }
      node.style.height = row.h + 'px';
      labels.append(node);
    }
  }

  function syncValues() {
    const f = S.state.frame;
    for (const row of rows) {
      const nodes = row.kind === 'prop' && propNodes.get(row.obj.id + ':' + row.prop);
      if (!nodes) continue;
      nodes.value.textContent = formatValue(M.getProp(row.obj, row.prop, f), M.meta(row.prop).type);
      nodes.key.classList.toggle('on', !!M.keyAt(row.obj, row.prop, f));
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  function sizeCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function gridStep() {
    const steps = [1, 2, 5, 10, fps() / 2, fps(), fps() * 2, fps() * 5, fps() * 10, fps() * 30, fps() * 60].filter((s) => Number.isInteger(s));
    return steps.find((s) => s * ppf >= 56) || fps() * 60;
  }

  function drawRuler(w) {
    const c = sizeCanvas(ruler, w, RULER_H);
    const scene = S.scene(), F = fps();
    c.fillStyle = '#1d1d25';
    c.fillRect(0, 0, w, RULER_H);
    const step = gridStep();
    const first = Math.max(0, Math.floor(scrollX / step) * step);
    c.font = '10px system-ui, sans-serif';
    c.textBaseline = 'top';
    for (let f = first; X(f) < w; f += step) {
      const x = Math.round(X(f)) + 0.5;
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.beginPath(); c.moveTo(x, 16); c.lineTo(x, RULER_H); c.stroke();
      c.fillStyle = '#9a9aa8';
      c.fillText(f % F === 0 ? `${f / F}s` : `${Math.floor(f / F)}:${String(f % F).padStart(2, '0')}`, x + 3, 3);
    }
    // markers
    for (const m of scene.markers) {
      const x = X(m.t);
      if (x < -80 || x > w) continue;
      c.fillStyle = '#2ec4b6';
      c.beginPath(); c.moveTo(x, RULER_H); c.lineTo(x - 5, RULER_H - 9); c.lineTo(x + 5, RULER_H - 9); c.closePath(); c.fill();
      c.fillText(m.label, x + 7, 15);
    }
    // end of the scene
    const xe = X(scene.duration);
    c.fillStyle = '#ff9f1a';
    c.fillRect(xe - 1, 0, 3, RULER_H);
    c.fillRect(xe - 7, 0, 7, 3);
    // playhead
    const xp = X(S.state.frame);
    c.fillStyle = '#ff4d4f';
    c.beginPath(); c.moveTo(xp - 6, 0); c.lineTo(xp + 6, 0); c.lineTo(xp + 6, 9); c.lineTo(xp, 16); c.lineTo(xp - 6, 9); c.closePath(); c.fill();
  }

  function diamond(c, x, y, r, hold) {
    c.beginPath();
    if (hold) c.rect(x - r + 1, y - r + 1, (r - 1) * 2, (r - 1) * 2);
    else { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); }
  }

  function drawTracks(w, h) {
    const c = tc = sizeCanvas(tracks, w, h);
    const scene = S.scene(), F = fps();
    const selected = new Set(S.state.selKeys.map((r) => r.key));
    keyHits = [];
    clipHits = [];

    c.fillStyle = '#17171d';
    c.fillRect(0, 0, w, h);
    for (const row of rows) {
      if (row.kind === 'obj') { c.fillStyle = isSelected(row.obj) ? 'rgba(255,159,26,0.13)' : 'rgba(255,255,255,0.045)'; c.fillRect(0, row.y, w, row.h); }
      if (row.kind === 'audio') { c.fillStyle = 'rgba(46,196,182,0.05)'; c.fillRect(0, row.y, w, row.h); }
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, row.y + row.h - 1, w, 1);
    }
    const step = gridStep();
    for (let f = Math.max(0, Math.floor(scrollX / step) * step); X(f) < w; f += step) {
      c.fillStyle = f % F === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
      c.fillRect(Math.round(X(f)), 0, 1, h);
    }
    // past the end of the scene
    const xe = X(scene.duration);
    if (xe < w) { c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(Math.max(0, xe), 0, w, h); }

    for (const row of rows) {
      const cy = row.y + row.h / 2;
      if (row.kind === 'prop') {
        const keys = row.obj.tracks[row.prop] || [];
        const discrete = M.meta(row.prop).type === 'discrete';
        // bars show where the value is actually changing
        for (let i = 0; i < keys.length - 1; i++) {
          const a = keys[i], b = keys[i + 1];
          if (discrete || a.ease === 'hold' || JSON.stringify(a.v) === JSON.stringify(b.v)) continue;
          c.fillStyle = 'rgba(255,159,26,0.28)';
          c.fillRect(X(a.t), cy - 2, X(b.t) - X(a.t), 4);
        }
        for (const key of keys) {
          const x = X(key.t);
          if (x < -10 || x > w + 10) continue;
          diamond(c, x, cy, 5.5, discrete || key.ease === 'hold');
          c.fillStyle = selected.has(key) ? '#ffffff' : '#ff9f1a';
          c.fill();
          if (selected.has(key)) { c.strokeStyle = '#ff4d4f'; c.lineWidth = 2; c.stroke(); }
          keyHits.push({ x, y: cy, refs: [{ obj: row.obj, prop: row.prop, key }] });
        }
      } else if (row.kind === 'obj') {
        const byTime = new Map();
        for (const [prop, keys] of Object.entries(row.obj.tracks)) {
          for (const key of keys) { if (!byTime.has(key.t)) byTime.set(key.t, []); byTime.get(key.t).push({ obj: row.obj, prop, key }); }
        }
        for (const [t, refs] of byTime) {
          const x = X(t);
          if (x < -10 || x > w + 10) continue;
          const allSelected = refs.every((r) => selected.has(r.key));
          diamond(c, x, cy, 4.5, false);
          c.fillStyle = allSelected ? '#ffffff' : 'rgba(225,225,235,0.75)';
          c.fill();
          keyHits.push({ x, y: cy, refs });
        }
      } else {
        for (const clip of scene.audio) {
          if (clip.track !== row.track) continue;
          const dur = S.audio.duration(clip.assetId) || 0.5;
          const x0 = X(clip.start), x1 = X(clip.start + dur * F);
          if (x1 < 0 || x0 > w) continue;
          const y0 = row.y + 4, hh = row.h - 8;
          const isSel = S.state.sel.kind === 'audio' && S.state.sel.id === clip.id;
          c.fillStyle = isSel ? 'rgba(46,196,182,0.5)' : 'rgba(46,196,182,0.26)';
          c.beginPath(); c.roundRect(x0, y0, Math.max(4, x1 - x0), hh, 4); c.fill();
          if (isSel) { c.strokeStyle = '#2ec4b6'; c.lineWidth = 1.5; c.stroke(); }
          const pk = S.audio.peaksFor(clip.assetId);
          if (pk) {
            c.fillStyle = 'rgba(200,255,248,0.85)';
            const mid = y0 + hh / 2;
            for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x += 2) {
              const i = Math.floor(((frameAt(x) - clip.start) / F) * S.audio.PEAKS_PER_SEC);
              const amp = Math.min(1, (pk[i] || 0) * (clip.gain ?? 1)) * (hh / 2 - 2);
              c.fillRect(x, mid - amp, 1.4, Math.max(1, amp * 2));
            }
          }
          c.fillStyle = '#d9fffa';
          c.font = '10px system-ui, sans-serif';
          c.textBaseline = 'top';
          c.save(); c.beginPath(); c.rect(x0, y0, Math.max(4, x1 - x0), hh); c.clip();
          c.fillText(clip.name, x0 + 5, y0 + 3);
          c.restore();
          clipHits.push({ x0, x1: Math.max(x0 + 4, x1), y0, y1: y0 + hh, clip });
        }
      }
    }

    for (const m of scene.markers) { c.fillStyle = 'rgba(46,196,182,0.3)'; c.fillRect(Math.round(X(m.t)), 0, 1, h); }
    c.fillStyle = '#ff4d4f';
    c.fillRect(Math.round(X(S.state.frame)), 0, 1.5, h);

    if (drag && drag.type === 'box') {
      c.strokeStyle = '#ff9f1a';
      c.fillStyle = 'rgba(255,159,26,0.12)';
      const bx = Math.min(drag.x0, drag.x1), by = Math.min(drag.y0, drag.y1);
      c.fillRect(bx, by, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
      c.strokeRect(bx + 0.5, by + 0.5, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0));
    }
  }

  function refresh(deep, force) {
    if (!ruler || !S.state.project) return;
    if (force) labelSig = '';
    const total = buildRows();
    if (deep || !labelSig) syncLabels();
    syncValues();
    const w = Math.max(50, scroll.clientWidth - labels.offsetWidth);
    if (S.state.playing) {
      const x = X(S.state.frame);
      if (x > w - 30 || x < 0) scrollX = Math.max(0, S.state.frame - 20 / ppf);
    }
    drawRuler(w);
    drawTracks(w, Math.max(total, scroll.clientHeight - 2));
    syncBar();
  }

  // ---------------------------------------------------------------------------
  // Transport bar
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  function syncBar() {
    const st = S.state, scene = S.scene();
    $('tl-time').textContent = `${U.timecode(st.frame, fps())}  ·  frame ${st.frame} / ${scene.duration}`;
    $('btn-play').textContent = st.playing ? '❚❚' : '▶';
    $('btn-play').classList.toggle('active', st.playing);
    for (const [id, on] of [['tg-loop', st.loop], ['tg-autokey', st.autoKey], ['tg-onion', st.onion], ['tg-paths', st.showPaths]]) $(id).classList.toggle('on', on);
  }

  function jumpKey(dir) {
    const obj = S.selected();
    const times = obj ? M.keyTimes(obj) : S.scene().markers.map((m) => m.t).sort((a, b) => a - b);
    const f = S.state.frame;
    const t = dir > 0 ? times.find((k) => k > f) : times.filter((k) => k < f).pop();
    if (t != null) S.playback.seek(t);
  }

  function addMarker() {
    const scene = S.scene(), f = S.state.frame;
    const existing = scene.markers.find((m) => m.t === f);
    const label = prompt(existing ? 'Rename marker (empty to delete)' : 'Marker name', existing ? existing.label : 'Beat');
    if (label == null) return;
    S.history.push();
    scene.markers = scene.markers.filter((m) => m.t !== f);
    if (label.trim()) scene.markers.push({ t: f, label: label.trim() });
    S.touch('data');
  }

  // Key every animatable property of the selection: a full pose key.
  function keyAll() {
    const obj = S.selected();
    if (!obj) { S.toast('Select a character, an object or the camera first.'); return; }
    S.history.push();
    const names = obj.type === 'camera' ? ['x', 'y', 'zoom', 'rotation']
      : obj.type === 'character' ? [...S.rig.BONE_NAMES.map((n) => 'b.' + n), 'x', 'y'] : ['x', 'y', 'rotation', 'scaleX', 'scaleY'];
    for (const name of names) M.upsertKey(obj, name, S.state.frame, U.clone(M.getProp(obj, name, S.state.frame)));
    S.state.expanded[obj.id] = S.state.expanded[obj.id] ?? false;
    S.touch('data');
  }

  // ---------------------------------------------------------------------------
  // Key editing
  // ---------------------------------------------------------------------------

  function deleteSelectedKeys() {
    if (!S.state.selKeys.length) return false;
    S.history.push();
    for (const { obj, prop, key } of S.state.selKeys) {
      if (obj.tracks[prop] && obj.tracks[prop].length === 1) obj.props[prop] = key.v;
      M.removeKey(obj, prop, key);
    }
    S.state.selKeys = [];
    S.touch('data');
    return true;
  }

  let clipboard = null;
  function copyKeys() {
    if (!S.state.selKeys.length) return false;
    const t0 = Math.min(...S.state.selKeys.map((r) => r.key.t));
    clipboard = S.state.selKeys.map((r) => ({ objId: r.obj.id, prop: r.prop, dt: r.key.t - t0, v: U.clone(r.key.v), ease: U.clone(r.key.ease) }));
    S.toast(`Copied ${clipboard.length} key${clipboard.length > 1 ? 's' : ''}`);
    return true;
  }

  // Keys paste onto the selected object when it is the same kind of thing, otherwise back where they came from.
  function pasteKeys() {
    if (!clipboard) return false;
    const scene = S.scene(), target = S.selected();
    S.history.push();
    const made = [];
    for (const item of clipboard) {
      const source = item.objId === 'camera' ? scene.camera : scene.objects.find((o) => o.id === item.objId);
      const obj = target && (item.prop in target.props) ? target : source;
      if (!obj) continue;
      made.push({ obj, prop: item.prop, key: M.upsertKey(obj, item.prop, S.state.frame + item.dt, U.clone(item.v), item.ease) });
    }
    S.state.selKeys = made;
    S.touch('data');
    return true;
  }

  function finishKeyMove() {
    const moving = new Set(S.state.selKeys.map((r) => r.key));
    for (const { obj, prop, key } of S.state.selKeys) {
      const keys = obj.tracks[prop];
      if (!keys) continue;
      // a key dropped onto another replaces it
      obj.tracks[prop] = keys.filter((k) => k === key || moving.has(k) || k.t !== key.t);
    }
    for (const { obj } of S.state.selKeys) M.sortTracks(obj);
  }

  // ---------------------------------------------------------------------------
  // Pointer input
  // ---------------------------------------------------------------------------

  function local(e, node) {
    const rect = node.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onTracksDown(e) {
    const p = local(e, tracks);
    tracks.setPointerCapture(e.pointerId);
    S.playback.stop();

    const clipHit = clipHits.find((h) => p.x >= h.x0 && p.x <= h.x1 && p.y >= h.y0 && p.y <= h.y1);
    if (clipHit) {
      S.select('audio', clipHit.clip.id);
      S.history.begin();
      drag = { type: 'clip', clip: clipHit.clip, x0: p.x, start: clipHit.clip.start };
      return;
    }

    let best = null, bestDist = 9;
    for (const h of keyHits) {
      const d = Math.abs(h.x - p.x);
      if (Math.abs(h.y - p.y) <= ROW / 2 && d < bestDist) { best = h; bestDist = d; }
    }
    if (best) {
      const already = best.refs.every((r) => S.state.selKeys.some((s) => s.key === r.key));
      if (e.shiftKey) S.state.selKeys = already ? S.state.selKeys.filter((s) => !best.refs.some((r) => r.key === s.key)) : [...S.state.selKeys, ...best.refs];
      else if (!already) S.state.selKeys = best.refs.slice();
      const owner = best.refs[0].obj;
      if (!isSelected(owner)) S.state.sel = { kind: owner.type === 'camera' ? 'camera' : 'object', id: owner.id };
      S.history.begin();
      drag = { type: 'keys', x0: p.x, origin: S.state.selKeys.map((r) => r.key.t), moved: false };
      S.touch('sel');
      return;
    }

    drag = { type: 'box', x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey ? S.state.selKeys.slice() : [] };
  }

  function onTracksMove(e) {
    if (!drag) return;
    const p = local(e, tracks);
    if (drag.type === 'clip') {
      drag.clip.start = Math.max(0, Math.round(drag.start + (p.x - drag.x0) / ppf));
      S.touch('data');
    } else if (drag.type === 'keys') {
      const dt = Math.round((p.x - drag.x0) / ppf);
      const min = Math.min(...drag.origin);
      S.state.selKeys.forEach((r, i) => { r.key.t = drag.origin[i] + Math.max(dt, -min); });
      drag.moved = drag.moved || dt !== 0;
      S.touch('data');
    } else if (drag.type === 'box') {
      drag.x1 = p.x;
      drag.y1 = p.y;
      const x0 = Math.min(drag.x0, p.x), x1 = Math.max(drag.x0, p.x), y0 = Math.min(drag.y0, p.y), y1 = Math.max(drag.y0, p.y);
      const inBox = keyHits.filter((h) => h.x >= x0 && h.x <= x1 && h.y >= y0 && h.y <= y1).flatMap((h) => h.refs);
      const seen = new Set();
      S.state.selKeys = [...drag.add, ...inBox].filter((r) => (seen.has(r.key) ? false : seen.add(r.key)));
      S.touch('sel');
    }
  }

  function onTracksUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.type === 'keys' && d.moved) finishKeyMove();
    if (d.type === 'box' && Math.abs(d.x1 - d.x0) < 3 && Math.abs(d.y1 - d.y0) < 3) {
      S.state.selKeys = d.add;
      S.playback.seek(Math.round(frameAt(d.x0)));
    }
    S.touch('data');
  }

  function onRulerDown(e) {
    const p = local(e, ruler);
    ruler.setPointerCapture(e.pointerId);
    S.playback.stop();
    if (Math.abs(p.x - X(S.scene().duration)) < 7) { S.history.begin(); drag = { type: 'duration' }; return; }
    drag = { type: 'scrub' };
    S.playback.seek(Math.round(frameAt(p.x)));
  }

  function onRulerMove(e) {
    const p = local(e, ruler);
    if (!drag) { ruler.style.cursor = Math.abs(p.x - X(S.scene().duration)) < 7 ? 'ew-resize' : 'default'; return; }
    if (drag.type === 'scrub') S.playback.seek(Math.round(frameAt(p.x)));
    if (drag.type === 'duration') { S.scene().duration = Math.max(fps() / 2, Math.round(frameAt(p.x))); S.touch('data'); }
  }

  function onWheel(e) {
    const p = local(e, tracks);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const f = frameAt(p.x);
      ppf = U.clamp(ppf * Math.exp(-e.deltaY * 0.002), 0.8, 48);
      scrollX = Math.max(0, f - (p.x - PAD) / ppf);
      $('tl-zoom').value = Math.log(ppf);
      S.touch('view');
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      scrollX = Math.max(0, scrollX + (e.deltaX || e.deltaY) / ppf);
      S.touch('view');
    }
  }

  function fitAll() {
    const w = Math.max(200, scroll.clientWidth - labels.offsetWidth - PAD * 2 - 20);
    ppf = U.clamp(w / Math.max(1, S.scene().duration), 0.8, 48);
    scrollX = 0;
    $('tl-zoom').value = Math.log(ppf);
    S.touch('view');
  }

  function init() {
    ruler = $('tl-ruler'); tracks = $('tl-tracks'); scroll = $('tl-scroll'); labels = $('tl-labels');
    tracks.addEventListener('pointerdown', onTracksDown);
    tracks.addEventListener('pointermove', onTracksMove);
    tracks.addEventListener('pointerup', onTracksUp);
    tracks.addEventListener('pointercancel', onTracksUp);
    tracks.addEventListener('wheel', onWheel, { passive: false });
    ruler.addEventListener('pointerdown', onRulerDown);
    ruler.addEventListener('pointermove', onRulerMove);
    ruler.addEventListener('pointerup', () => { drag = null; });
    ruler.addEventListener('wheel', onWheel, { passive: false });
    ruler.addEventListener('dblclick', addMarker);
    new ResizeObserver(() => S.touch('view')).observe(scroll);

    const toggle = (id, key) => $(id).addEventListener('click', () => { S.state[key] = !S.state[key]; S.touch('view'); });
    toggle('tg-loop', 'loop'); toggle('tg-autokey', 'autoKey'); toggle('tg-onion', 'onion'); toggle('tg-paths', 'showPaths');
    $('btn-play').addEventListener('click', () => S.playback.toggle());
    $('btn-first').addEventListener('click', () => S.playback.seek(0));
    $('btn-last').addEventListener('click', () => S.playback.seek(S.scene().duration));
    $('btn-prevkey').addEventListener('click', () => jumpKey(-1));
    $('btn-nextkey').addEventListener('click', () => jumpKey(1));
    $('btn-keyall').addEventListener('click', keyAll);
    $('btn-marker').addEventListener('click', addMarker);
    $('btn-tlfit').addEventListener('click', fitAll);
    $('tl-zoom').addEventListener('input', (e) => { ppf = Math.exp(Number(e.target.value)); S.touch('view'); });
    const easeSel = $('tl-ease');
    for (const [id, label] of Object.entries(S.ease.LABELS)) easeSel.append(el('option', { value: id, text: label }));
    easeSel.value = S.state.defaultEase;
    easeSel.addEventListener('change', () => { S.state.defaultEase = easeSel.value; });

    // drag the top edge to resize
    const grip = $('tl-resize');
    grip.addEventListener('pointerdown', (e) => {
      grip.setPointerCapture(e.pointerId);
      const start = e.clientY, h0 = $('timeline').offsetHeight;
      const move = (ev) => { $('timeline').style.height = U.clamp(h0 + start - ev.clientY, 140, window.innerHeight - 220) + 'px'; S.touch('view'); };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  S.timeline = { init, refresh, fitAll, jumpKey, addMarker, keyAll, deleteSelectedKeys, copyKeys, pasteKeys };
})(window.Studio);
