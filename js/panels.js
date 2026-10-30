'use strict';
// ---------------------------------------------------------------------------
// Panels: scenes bar, layers, library, and the inspector (incl. character studio)
// ---------------------------------------------------------------------------
// Panels rebuild only when their "signature" changes (selection, structure);
// otherwise their fields just re-read values, so a slider survives its own drag.

(function (S) {
  const U = S.util;
  const M = S.model;
  const L = S.library;
  const el = U.el;
  const $ = (id) => document.getElementById(id);

  let syncers = [];
  let inspectorSig = '', layersSig = '', scenesSig = '', librarySig = '';
  let savedCharacters = [];
  let clipChoice = { id: 'builtin-walk-cycle', repeats: 2, travel: true };
  let artPart = 'head';
  let lipTarget = null;

  const frame = () => S.state.frame;
  const project = () => S.state.project;

  // ---------------------------------------------------------------------------
  // Field builders
  // ---------------------------------------------------------------------------

  function scrubLabel(text, input, step, commit) {
    const label = el('span', { class: 'lbl scrub', text, title: 'Drag to adjust' });
    label.addEventListener('pointerdown', (e) => {
      label.setPointerCapture(e.pointerId);
      const x0 = e.clientX, v0 = Number(input.value) || 0;
      const move = (ev) => commit(U.round(v0 + (ev.clientX - x0) * step * (ev.shiftKey ? 0.1 : 1), 3));
      const up = () => { label.removeEventListener('pointermove', move); label.removeEventListener('pointerup', up); };
      label.addEventListener('pointermove', move);
      label.addEventListener('pointerup', up);
    });
    return label;
  }

  function numField(label, get, set, o = {}) {
    const input = el('input', { type: 'number', step: o.step || 1 });
    const commit = (v) => {
      if (!Number.isFinite(v)) return;
      if (o.min != null) v = Math.max(o.min, v);
      if (o.max != null) v = Math.min(o.max, v);
      S.history.begin();
      set(v);
      S.touch('data');
    };
    input.addEventListener('input', () => commit(Number(input.value)));
    syncers.push(() => { if (document.activeElement !== input) input.value = U.round(get() ?? 0, o.digits ?? 2); });
    return el('div', { class: 'field' }, [scrubLabel(label, input, o.step || 1, (v) => { commit(v); input.value = v; }), input, o.after]);
  }

  function rangeField(label, get, set, min, max, step) {
    const input = el('input', { type: 'range', min, max, step });
    const out = el('span', { class: 'out' });
    input.addEventListener('input', () => { S.history.begin(); set(Number(input.value)); S.touch('data'); });
    syncers.push(() => { const v = get() ?? 0; if (document.activeElement !== input) input.value = v; out.textContent = U.round(v, 2); });
    return el('div', { class: 'field' }, [el('span', { class: 'lbl', text: label }), input, out]);
  }

  function selectField(label, options, get, set, after) {
    const input = el('select', {}, options.map((o) => el('option', { value: Array.isArray(o) ? o[0] : o, text: Array.isArray(o) ? o[1] : o })));
    input.addEventListener('change', () => { S.history.push(); set(input.value); S.touch('data'); });
    syncers.push(() => { input.value = get(); });
    return el('div', { class: 'field' }, [el('span', { class: 'lbl', text: label }), input, after]);
  }

  function colorField(label, get, set) {
    const input = el('input', { type: 'color' });
    input.addEventListener('input', () => { S.history.begin(); set(input.value); S.touch('data'); });
    syncers.push(() => { if (document.activeElement !== input) input.value = get(); });
    return el('div', { class: 'field' }, [el('span', { class: 'lbl', text: label }), input]);
  }

  function textField(label, get, set) {
    const input = el('input', { type: 'text' });
    input.addEventListener('input', () => { S.history.begin(); set(input.value); S.touch('data'); });
    syncers.push(() => { if (document.activeElement !== input) input.value = get() ?? ''; });
    return el('div', { class: 'field' }, [el('span', { class: 'lbl', text: label }), input]);
  }

  function checkField(label, get, set) {
    const input = el('input', { type: 'checkbox' });
    input.addEventListener('change', () => { S.history.push(); set(input.checked); S.touch('data'); });
    syncers.push(() => { input.checked = !!get(); });
    return el('label', { class: 'field check' }, [input, el('span', { text: label })]);
  }

  const section = (title, children, extra) => el('section', { class: 'sec' }, [el('h3', {}, [title, extra]), ...children]);
  const button = (text, onclick, cls, title) => el('button', { class: cls || '', text, title, onclick });
  const hint = (text) => el('p', { class: 'hint', text });

  // ◆ button: add/remove a key for one property at the playhead
  function keyButton(target, prop) {
    const btn = el('button', { class: 'keybtn', text: '◆', title: 'Key this property at the playhead', onclick: () => { S.history.push(); M.toggleKey(target(), prop, frame()); S.touch('data'); } });
    syncers.push(() => {
      const obj = target();
      btn.classList.toggle('on', !!(obj && M.keyAt(obj, prop, frame())));
      btn.classList.toggle('tracked', !!(obj && obj.tracks[prop]));
    });
    return btn;
  }

  const setProp = (target, prop, v) => M.setProp(target(), prop, v, frame(), S.state.autoKey);

  const propNum = (target, prop, label, o = {}) => numField(label, () => M.getProp(target(), prop, frame()), (v) => setProp(target, prop, v), { ...o, after: keyButton(target, prop) });

  function propRange(target, prop, label, min, max, step) {
    const field = rangeField(label, () => M.getProp(target(), prop, frame()), (v) => setProp(target, prop, v), min, max, step);
    field.append(keyButton(target, prop));
    return field;
  }

  const propSelect = (target, prop, label, options) => selectField(label, options, () => String(M.getProp(target(), prop, frame())), (v) => setProp(target, prop, v), keyButton(target, prop));

  // ---------------------------------------------------------------------------
  // Adding things to the scene
  // ---------------------------------------------------------------------------

  function dropPoint() {
    const cam = M.evalCtx(S.scene(), frame()).camera();
    return { x: Math.round(cam.x), floorY: S.scene().floorY || Math.round(project().height * 0.8), y: Math.round(cam.y) };
  }

  function addObject(obj) {
    S.history.push();
    S.scene().objects.push(obj);
    S.select('object', obj.id);
    S.touch('data');
  }

  function addProp(kind) {
    const at = dropPoint();
    const floating = ['cloud', 'sun', 'frame', 'bubble'].includes(kind);
    addObject(L.makeProp(kind, at.x, floating ? at.y - 150 : at.floorY));
  }

  function pickFile(accept, handler) {
    const input = el('input', { type: 'file', accept });
    input.addEventListener('change', () => { if (input.files[0]) handler(input.files[0]); });
    input.click();
  }

  function importImage() {
    pickFile('image/*', async (file) => {
      try {
        const asset = await S.assets.addImageFile(project(), file);
        const obj = L.imageObject(asset), at = dropPoint();
        obj.props.x = at.x; obj.props.y = at.y;
        addObject(obj);
      } catch (err) { S.toast('Could not read that image.'); }
    });
  }

  function importAudio(track) {
    pickFile('audio/*', async (file) => {
      try {
        const asset = await S.audio.importFile(project(), file);
        S.history.push();
        const clip = S.audio.addClip(S.scene(), asset, frame(), track, 1);
        S.select('audio', clip.id);
        S.touch('data');
      } catch (err) { S.toast('Could not decode that audio file.'); }
    });
  }

  function addBuiltinSound(kind) {
    S.history.push();
    const clip = S.audio.addClip(S.scene(), S.audio.builtin(project(), kind), frame(), S.audio.BUILTIN[kind].track, 0.8);
    S.select('audio', clip.id);
    S.touch('data');
  }

  function duplicateSelected() {
    const obj = S.selected();
    if (!obj || obj.type === 'camera') return;
    S.history.push();
    const copy = U.clone(obj);
    copy.id = U.uid('o');
    copy.name = obj.name + ' copy';
    const offset = (keysOrValue, d) => (Array.isArray(keysOrValue) ? keysOrValue.forEach((k) => { k.v += d; }) : null);
    if (copy.tracks.x) offset(copy.tracks.x, 40); else copy.props.x += 40;
    const list = S.scene().objects;
    list.splice(list.indexOf(obj) + 1, 0, copy);
    S.select('object', copy.id);
    S.touch('data');
  }

  function deleteSelected() {
    const sel = S.state.sel, scene = S.scene();
    if (sel.kind === 'audio') {
      S.history.push();
      scene.audio = scene.audio.filter((a) => a.id !== sel.id);
    } else if (sel.kind === 'object') {
      S.history.push();
      scene.objects = scene.objects.filter((o) => o.id !== sel.id);
      // anything riding on the deleted object stays where it is
      for (const o of scene.objects) {
        if (o.props.attach && o.props.attach.id === sel.id) o.props.attach = null;
        if (o.tracks.attach) o.tracks.attach.forEach((k) => { if (k.v && k.v.id === sel.id) k.v = null; });
      }
    } else return;
    S.select('none');
    S.touch('data');
  }

  function reorder(delta) {
    const obj = S.selected(), list = S.scene().objects;
    const i = list.indexOf(obj), j = U.clamp(i + delta, 0, list.length - 1);
    if (i < 0 || i === j) return;
    S.history.push();
    list.splice(i, 1);
    list.splice(j, 0, obj);
    S.touch('data');
  }

  // ---------------------------------------------------------------------------
  // Scenes bar
  // ---------------------------------------------------------------------------

  function gotoScene(i) {
    S.playback.stop();
    S.state.sceneIndex = U.clamp(i, 0, project().scenes.length - 1);
    S.state.frame = 0;
    S.state.sel = { kind: 'none', id: null };
    S.state.selKeys = [];
    S.touch('all');
  }

  function buildScenes(force) {
    const p = project();
    const sig = p.scenes.map((s) => s.id + s.name).join('|') + S.state.sceneIndex + p.name;
    if (sig === scenesSig && !force) return;
    scenesSig = sig;
    const bar = $('scenes-bar');
    bar.innerHTML = '';
    bar.append(el('span', { class: 'bar-label', text: 'SHOTS' }));
    p.scenes.forEach((scene, i) => {
      bar.append(el('button', {
        class: 'shot' + (i === S.state.sceneIndex ? ' current' : ''), text: `${i + 1} · ${scene.name}`, title: 'Double-click to rename',
        onclick: () => gotoScene(i),
        ondblclick: () => { const name = prompt('Shot name', scene.name); if (name) { S.history.push(); scene.name = name.trim(); S.touch('data'); } },
      }));
    });
    bar.append(button('+ Shot', () => {
      S.history.push();
      p.scenes.splice(S.state.sceneIndex + 1, 0, M.newScene(p));
      gotoScene(S.state.sceneIndex + 1);
    }, 'ghost'));
  }

  // ---------------------------------------------------------------------------
  // Left: layers and library
  // ---------------------------------------------------------------------------

  const TYPE_ICON = { camera: '🎥', character: '🕴', text: 'T', image: '▧', group: '◻', shape: '◆' };

  function buildLayers(force) {
    const scene = S.scene(), sel = S.state.sel;
    const sig = scene.id + scene.objects.map((o) => `${o.id}${o.name}${o.hidden}${o.locked}`).join('|') + sel.kind + sel.id;
    if (sig === layersSig && !force) return;
    layersSig = sig;
    const box = $('layers');
    box.innerHTML = '';
    box.append(el('div', { class: 'layer' + (sel.kind === 'camera' ? ' selected' : ''), onclick: () => S.select('camera') }, [el('span', { class: 'kind', text: TYPE_ICON.camera }), el('span', { class: 'name', text: 'Camera' })]));
    const list = scene.objects;
    for (let i = list.length - 1; i >= 0; i--) {
      const obj = list[i];
      const row = el('div', {
        class: 'layer' + (sel.kind === 'object' && sel.id === obj.id ? ' selected' : '') + (obj.hidden ? ' off' : ''), draggable: true,
        onclick: () => S.select('object', obj.id),
        ondblclick: () => { const name = prompt('Layer name', obj.name); if (name) { S.history.push(); obj.name = name.trim(); S.touch('data'); } },
        ondragstart: (e) => e.dataTransfer.setData('text/plain', obj.id),
        ondragover: (e) => { e.preventDefault(); row.classList.add('drop'); },
        ondragleave: () => row.classList.remove('drop'),
        ondrop: (e) => {
          e.preventDefault();
          const from = list.findIndex((o) => o.id === e.dataTransfer.getData('text/plain'));
          const to = list.indexOf(obj);
          if (from < 0 || from === to) return;
          S.history.push();
          const [moved] = list.splice(from, 1);
          list.splice(to, 0, moved);
          S.touch('data');
        },
      }, [
        el('span', { class: 'kind', text: TYPE_ICON[obj.type] || '◆' }),
        el('span', { class: 'name', text: obj.name }),
        el('button', { class: 'ghost' + (obj.locked ? ' on' : ''), text: obj.locked ? '🔒' : '·', title: 'Lock', onclick: (e) => { e.stopPropagation(); S.history.push(); obj.locked = !obj.locked; S.touch('data'); } }),
        el('button', { class: 'ghost', text: obj.hidden ? '○' : '●', title: 'Show / hide', onclick: (e) => { e.stopPropagation(); S.history.push(); obj.hidden = !obj.hidden; S.touch('data'); } }),
      ]);
      box.append(row);
    }
  }

  function propThumb(kind) {
    const def = L.PROPS[kind]();
    const canvas = el('canvas', { width: 112, height: 112 });
    const c = canvas.getContext('2d');
    const [x0, y0, x1, y1] = def.bounds;
    const k = Math.min(96 / (x1 - x0), 96 / (y1 - y0));
    c.setTransform(k, 0, 0, k, 56 - ((x0 + x1) / 2) * k, 56 - ((y0 + y1) / 2) * k);
    S.render.drawShape(c, def);
    return canvas;
  }

  function buildLibrary(force) {
    const sig = savedCharacters.map((c) => c.id).join('|');
    if (sig === librarySig && !force && $('library').childElementCount) return;
    librarySig = sig;
    const box = $('library');
    box.innerHTML = '';

    const addCharacter = (preset) => { const at = dropPoint(); addObject(L.makeCharacter(preset, at.x, at.floorY)); };
    box.append(section('Characters', [
      el('div', { class: 'chips' }, Object.entries(L.CHARACTER_PRESETS).map(([id, p]) => button(p.name, () => addCharacter(id), 'chip'))),
      savedCharacters.length ? el('div', { class: 'chips' }, savedCharacters.map((c) => el('span', { class: 'chip saved' }, [
        el('span', { text: '★ ' + c.name, onclick: () => S.store.insertSavedCharacter(c) }),
        el('span', { class: 'x', text: '×', title: 'Remove from library', onclick: async () => { await S.store.deleteSavedCharacter(c.id); loadSaved(); } }),
      ]))) : hint('Characters you save from the Design tab appear here, in every project.'),
      button('Import character file…', () => pickFile('.json,application/json', (file) => S.store.openFile(file)), 'ghost wide'),
    ]));

    box.append(section('Props', [el('div', { class: 'grid' }, Object.keys(L.PROPS).map((kind) => el('button', { class: 'thumb', title: L.PROPS[kind]().name, onclick: () => addProp(kind) }, [propThumb(kind)])))]));

    box.append(section('Backgrounds', [
      el('div', { class: 'chips' }, Object.entries(L.BACKGROUNDS).map(([id, b]) => button(b.name, () => { S.history.push(); L.applyBackground(S.scene(), id); S.touch('all'); }, 'chip'))),
      hint('Backgrounds come as parallax layers: move the camera and the depth appears.'),
    ]));

    box.append(section('Your artwork', [
      el('div', { class: 'chips' }, [
        button('Image…', importImage, 'chip'),
        button('Text', () => { const at = dropPoint(); addObject(M.newObject('text', { name: 'Text', props: { x: at.x, y: at.y } })); }, 'chip'),
        button('Group', () => { const at = dropPoint(); addObject(M.newObject('group', { name: 'Group', props: { x: at.x, y: at.y } })); }, 'chip'),
      ]),
      hint('Transparent PNGs work best. You can also drop images straight onto the stage. Attach layers to a Group to move them as one.'),
    ]));

    box.append(section('Sound', [
      el('div', { class: 'chips' }, Object.entries(S.audio.BUILTIN).map(([id, b]) => button(b.name, () => addBuiltinSound(id), 'chip'))),
      el('div', { class: 'chips' }, [button('Dialogue…', () => importAudio('dialogue'), 'chip'), button('Music…', () => importAudio('music'), 'chip'), button('Effect…', () => importAudio('sfx'), 'chip')]),
      hint('Sounds land at the playhead. Drag them along their track in the timeline.'),
    ]));
  }

  async function loadSaved() {
    savedCharacters = await S.store.savedCharacters();
    buildLibrary(true);
  }

  // ---------------------------------------------------------------------------
  // Inspector sections
  // ---------------------------------------------------------------------------

  function easeSection() {
    const keys = S.state.selKeys;
    const numeric = keys.filter((r) => M.meta(r.prop).type !== 'discrete');
    const first = numeric[0];
    const children = [];
    if (keys.length === 1) {
      children.push(numField('Frame', () => keys[0].key.t, (v) => { keys[0].key.t = Math.max(0, Math.round(v)); M.sortTracks(keys[0].obj); }, { min: 0 }));
      if (typeof keys[0].key.v === 'number') children.push(numField('Value', () => keys[0].key.v, (v) => { keys[0].key.v = v; }, { step: 0.5 }));
    }
    if (first) {
      const setEase = (ease) => { S.history.begin(); numeric.forEach((r) => { r.key.ease = U.clone(ease); }); S.touch('data'); };
      const chips = el('div', { class: 'chips' }, Object.entries(S.ease.LABELS).map(([id, label]) => {
        const b = button(label, () => { setEase(id); S.history.end(); }, 'chip');
        syncers.push(() => b.classList.toggle('on', first.key.ease === id));
        return b;
      }));
      const canvas = el('canvas', { class: 'curve', width: 440, height: 300 });
      const W = 220, H = 150, px = 20, py = 38;   // css size and padding; y spans -0.4 .. 1.4
      const toX = (x) => px + x * (W - px * 2), toY = (y) => H - py - y * (H - py * 2);
      const drawCurve = () => {
        const c = canvas.getContext('2d');
        c.setTransform(2, 0, 0, 2, 0, 0);
        c.clearRect(0, 0, W, H);
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        c.strokeRect(toX(0), toY(1), toX(1) - toX(0), toY(0) - toY(1));
        const ease = first.key.ease;
        c.beginPath();
        if (ease === 'hold') { c.moveTo(toX(0), toY(0)); c.lineTo(toX(1), toY(0)); c.lineTo(toX(1), toY(1)); }
        else for (let i = 0; i <= 40; i++) { const t = i / 40; const y = S.ease.apply(ease, t); if (i) c.lineTo(toX(t), toY(y)); else c.moveTo(toX(t), toY(y)); }
        c.strokeStyle = '#ff9f1a';
        c.lineWidth = 2;
        c.stroke();
        if (ease !== 'hold') {
          const [x1, y1, x2, y2] = S.ease.curve(ease);
          c.strokeStyle = 'rgba(255,255,255,0.4)';
          c.lineWidth = 1;
          c.beginPath(); c.moveTo(toX(0), toY(0)); c.lineTo(toX(x1), toY(y1)); c.moveTo(toX(1), toY(1)); c.lineTo(toX(x2), toY(y2)); c.stroke();
          for (const [x, y] of [[x1, y1], [x2, y2]]) { c.beginPath(); c.arc(toX(x), toY(y), 5, 0, 7); c.fillStyle = '#fff'; c.fill(); }
        }
      };
      canvas.addEventListener('pointerdown', (e) => {
        if (first.key.ease === 'hold') return;
        canvas.setPointerCapture(e.pointerId);
        const rect = canvas.getBoundingClientRect();
        const at = (ev) => [U.clamp((ev.clientX - rect.left - px) / (W - px * 2), 0, 1), U.clamp((H - py - (ev.clientY - rect.top)) / (H - py * 2), -0.6, 1.6)];
        const cur = S.ease.curve(first.key.ease).slice();
        const [mx, my] = at(e);
        const which = Math.hypot(mx - cur[0], my - cur[1]) <= Math.hypot(mx - cur[2], my - cur[3]) ? 0 : 2;
        const move = (ev) => { const [x, y] = at(ev); cur[which] = U.round(x, 3); cur[which + 1] = U.round(y, 3); setEase(cur); };
        const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
      });
      syncers.push(drawCurve);
      children.push(chips, canvas, hint('The curve shapes the move from this key to the next. Drag the two handles; pull past the box for overshoot.'));
    }
    children.push(el('div', { class: 'chips' }, [button('Delete keys', () => S.timeline.deleteSelectedKeys(), 'chip'), button('Copy', () => S.timeline.copyKeys(), 'chip')]));
    return section(`${keys.length} key${keys.length > 1 ? 's' : ''} selected`, children);
  }

  function transformSection(target) {
    const flip = checkField('Flip (face the other way)', () => M.getProp(target(), 'flip', frame()), (v) => setProp(target, 'flip', v));
    flip.append(keyButton(target, 'flip'));
    return section('Transform', [
      el('div', { class: 'pair' }, [propNum(target, 'x', 'X'), propNum(target, 'y', 'Y')]),
      el('div', { class: 'pair' }, [propNum(target, 'scaleX', 'Scale X', { step: 0.01 }), propNum(target, 'scaleY', 'Scale Y', { step: 0.01 })]),
      propNum(target, 'rotation', 'Rotation', { step: 0.5 }),
      propRange(target, 'opacity', 'Opacity', 0, 1, 0.01),
      flip,
    ]);
  }

  function layerSection(target) {
    const scene = S.scene(), obj = target();
    const others = scene.objects.filter((o) => o.id !== obj.id);
    const attachValue = () => { const a = M.getProp(target(), 'attach', frame()); return a ? a.id + (a.bone ? ':' + a.bone : '') : ''; };
    const options = [['', 'Nothing (free)']];
    for (const o of others) {
      if (o.type === 'character') for (const bone of ['handR', 'handL', 'head', 'spine', 'footR', 'footL']) options.push([`${o.id}:${bone}`, `${o.name} · ${M.BONE_LABELS[bone]}`]);
      else options.push([o.id, o.name]);
    }
    const attach = selectField('Attach to', options, attachValue, (v) => {
      const [id, bone] = v.split(':');
      M.attachTo(S.scene(), target(), id ? { id, bone: bone || null } : null, frame());
    }, keyButton(target, 'attach'));
    return section('Layer', [
      attach,
      hint('Attaching at the playhead is animated: a cup can sit on a desk, ride in a hand from frame 100, and be let go later.'),
      numField('Depth', () => target().depth, (v) => { target().depth = v; }, { step: 0.05, min: 0, max: 4 }),
      hint('Depth drives parallax: 0.2 far away · 1 normal · 1.5 close to the lens.'),
      selectField('Rhythm', [['1', 'Smooth (every frame)'], ['2', 'On twos'], ['3', 'On threes'], ['4', 'On fours']], () => String(target().step || 1), (v) => { target().step = Number(v); }),
      el('div', { class: 'chips' }, [
        button('Forward', () => reorder(1), 'chip'), button('Back', () => reorder(-1), 'chip'),
        button('Duplicate', duplicateSelected, 'chip'), button('Delete', deleteSelected, 'chip danger'),
      ]),
    ]);
  }

  function shapeSection(target) {
    const colors = [];
    for (const p of target().paths) for (const c of [p.fill, p.stroke]) if (typeof c === 'string' && c.startsWith('#') && !colors.includes(c)) colors.push(c);
    if (!colors.length) return null;
    const swatches = colors.slice(0, 12).map((color, i) => {
      let current = color;
      const input = el('input', { type: 'color', value: color.length === 4 ? '#' + color.slice(1).split('').map((ch) => ch + ch).join('') : color });
      input.addEventListener('input', () => {
        S.history.begin();
        for (const p of target().paths) { if (p.fill === current) p.fill = input.value; if (p.stroke === current) p.stroke = input.value; }
        current = input.value;
        S.touch('data');
      });
      return input;
    });
    return section('Palette', [el('div', { class: 'swatches' }, swatches), hint('Recolour this prop: each swatch replaces one colour everywhere it is used.')]);
  }

  function textSection(target) {
    const area = el('textarea', { rows: 3 });
    area.addEventListener('input', () => { S.history.begin(); setProp(target, 'text', area.value); S.touch('data'); });
    syncers.push(() => { if (document.activeElement !== area) area.value = M.getProp(target(), 'text', frame()) ?? ''; });
    return section('Text', [
      el('div', { class: 'field' }, [area, keyButton(target, 'text')]),
      numField('Size', () => target().font.size, (v) => { target().font.size = v; }, { min: 6, max: 600 }),
      colorField('Colour', () => target().font.color, (v) => { target().font.color = v; }),
      selectField('Font', [['Georgia, serif', 'Serif'], ['system-ui, sans-serif', 'Sans'], ['"Trebuchet MS", sans-serif', 'Rounded'], ['"Courier New", monospace', 'Typewriter'], ['Impact, sans-serif', 'Poster']], () => target().font.family, (v) => { target().font.family = v; }),
      selectField('Weight', [['400', 'Regular'], ['700', 'Bold'], ['900', 'Black']], () => String(target().font.weight), (v) => { target().font.weight = Number(v); }),
      selectField('Align', ['left', 'center', 'right'], () => target().font.align, (v) => { target().font.align = v; }),
      hint('Key the text itself (◆) to swap subtitles over time.'),
    ]);
  }

  // --- character: animate tab ---------------------------------------------------

  function pinButton(target, side, label) {
    const prop = 'pin' + side;
    const btn = button(label, () => {
      const obj = target(), scene = S.scene();
      const ctx = M.evalCtx(scene, frame());
      S.history.push();
      if (ctx.P(obj, prop)) {
        // bake the solved leg into the bones so releasing the pin does not pop
        const pose = ctx.pose(obj), b = pose.b;
        const rel = (name, parent) => U.round(U.normDeg((b[name].a - (parent ? b[parent].a : 0)) / U.DEG), 2);
        setProp(target, 'b.upperLeg' + side, rel('upperLeg' + side, null));
        setProp(target, 'b.lowerLeg' + side, rel('lowerLeg' + side, 'upperLeg' + side));
        setProp(target, 'b.foot' + side, rel('foot' + side, 'lowerLeg' + side));
        setProp(target, prop, null);
      } else {
        const pose = ctx.pose(obj), m = ctx.matrix(obj), foot = pose.b['foot' + side];
        const ankle = U.apply(m, foot.sx, foot.sy), toe = U.apply(m, foot.ex, foot.ey);
        setProp(target, prop, { x: U.round(ankle.x), y: U.round(ankle.y), a: U.round(Math.atan2(toe.y - ankle.y, toe.x - ankle.x), 4) });
      }
      S.touch('data');
    }, 'chip');
    syncers.push(() => btn.classList.toggle('on', !!M.getProp(target(), prop, frame())));
    return btn;
  }

  function allClips() { return [...L.builtinClips(), ...project().clips]; }

  function animateTab(target) {
    const clipSelect = el('select', {}, allClips().map((c) => el('option', { value: c.id, text: c.name })));
    clipSelect.value = clipChoice.id;
    clipSelect.addEventListener('change', () => { clipChoice.id = clipSelect.value; });
    const repeats = el('input', { type: 'number', min: 1, max: 50, value: clipChoice.repeats });
    repeats.addEventListener('input', () => { clipChoice.repeats = U.clamp(Number(repeats.value) || 1, 1, 50); });
    const travel = el('input', { type: 'checkbox', checked: clipChoice.travel });
    travel.addEventListener('change', () => { clipChoice.travel = travel.checked; });

    return [
      section('Face', [
        propSelect(target, 'view', 'View', [['side', 'Side (three-quarter)'], ['front', 'Front (facing camera)']]),
        propSelect(target, 'expression', 'Expression', Object.keys(S.face.EXPRESSIONS)),
        propSelect(target, 'mouth', 'Mouth', S.face.MOUTHS),
        propSelect(target, 'eyes', 'Eyes', S.face.EYES),
        propRange(target, 'lookX', 'Look ↔', -1, 1, 0.05),
        propRange(target, 'lookY', 'Look ↕', -1, 1, 0.05),
        el('div', { class: 'chips' }, [button('Blink here', () => { S.history.push(); L.applyClip(target(), allClips().find((c) => c.id === 'builtin-blink'), frame()); S.touch('data'); }, 'chip')]),
      ]),
      section('Hands & feet', [
        propSelect(target, 'handR', 'Front hand', S.face.HANDS),
        propSelect(target, 'handL', 'Back hand', S.face.HANDS),
        el('div', { class: 'chips' }, [pinButton(target, 'R', '📌 Pin front foot'), pinButton(target, 'L', '📌 Pin back foot')]),
        hint('A pinned foot stays planted while you move the hips or body, so it never slides. Pins are keyed: pin on contact, release on lift-off.'),
      ]),
      section('Limb layering', [
        propSelect(target, 'zArmR', 'Front arm', ['front', 'back']), propSelect(target, 'zArmL', 'Back arm', ['front', 'back']),
        propSelect(target, 'zLegR', 'Front leg', ['front', 'back']), propSelect(target, 'zLegL', 'Back leg', ['front', 'back']),
      ]),
      section('Motion clips', [
        el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Clip' }), clipSelect]),
        el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Repeat' }), repeats, el('label', { class: 'inline' }, [travel, 'travel'])]),
        el('div', { class: 'chips' }, [
          button('Apply at playhead', () => {
            const clip = allClips().find((c) => c.id === clipChoice.id);
            if (!clip) return;
            S.history.push();
            const end = L.applyClip(target(), clip, frame(), clipChoice);
            S.toast(`${clip.name} applied: frames ${frame()}–${end}`);
            S.touch('data');
          }, 'chip primary'),
          button('Save keys as clip…', () => {
            const obj = target(), times = (S.state.selKeys.length > 1 ? S.state.selKeys.map((r) => r.key.t) : M.keyTimes(obj));
            if (times.length < 2) { S.toast('Key at least two poses first.'); return; }
            const name = prompt('Clip name', obj.name + ' move');
            if (!name) return;
            S.history.push();
            project().clips.push(L.clipFromObject(obj, name.trim(), Math.min(...times), Math.max(...times)));
            S.touch('all');
          }, 'chip'),
        ]),
        hint('Clips are ordinary keys once applied: retime, ease or re-pose any of them.'),
      ]),
    ];
  }

  // --- character: design tab ------------------------------------------------------

  function designTab(target) {
    const ch = () => target().char;
    const colors = [['skin', 'Skin'], ['hair', 'Hair'], ['shirt', 'Top'], ['pants', 'Trousers'], ['shoes', 'Shoes'], ['outline', 'Outline'], ['eyes', 'Eyes'], ['glasses', 'Glasses']];
    const len = (label, keys, min, max) => rangeField(label, () => ch().lengths[keys[0]], (v) => {
      const k = v / ch().lengths[keys[0]];
      keys.forEach((name) => { ch().lengths[name] = U.round(ch().lengths[name] * k, 1); });
    }, min, max, 1);
    const wid = (label, key, min, max) => rangeField(label, () => ch().widths[key], (v) => { ch().widths[key] = v; }, min, max, 1);

    const partNames = [['head', 'Head'], ['spine', 'Torso'], ...S.rig.BONE_NAMES.filter((n) => n !== 'head' && n !== 'spine').map((n) => [n, M.BONE_LABELS[n]])];
    const partSelect = el('select', {}, partNames.map(([v, t]) => el('option', { value: v, text: t })));
    partSelect.value = artPart;
    partSelect.addEventListener('change', () => { artPart = partSelect.value; S.touch('sel'); });
    const spec = () => ch().art[artPart];
    const artField = (label, key, min, max, step, fallback) => rangeField(label, () => (spec() ? spec()[key] ?? fallback : fallback), (v) => { if (spec()) spec()[key] = v; }, min, max, step);

    return [
      section('Look', [
        selectField('Style', [['full', 'Illustrated'], ['stick', 'Stick figure (rig only)']], () => ch().style, (v) => { ch().style = v; }),
        el('div', { class: 'colors' }, colors.map(([key, label]) => colorField(label, () => ch().colors[key], (v) => { ch().colors[key] = v; }))),
        selectField('Hair', ['short', 'fade', 'swept', 'long', 'bun', 'curly', 'wild', 'bald'], () => ch().hair, (v) => { ch().hair = v; }),
        selectField('Facial hair', ['none', 'mustache', 'goatee', 'beard', 'full'], () => ch().facial, (v) => { ch().facial = v; }),
        selectField('Glasses', ['none', 'round', 'square', 'bold', 'shades'], () => ch().glasses || 'none', (v) => { ch().glasses = v; }),
        selectField('Outfit', ['none', 'gi'], () => ch().outfit || 'none', (v) => { ch().outfit = v === 'none' ? undefined : v; }),
        selectField('Brows', ['thin', 'normal', 'thick'], () => ch().brows || 'normal', (v) => { ch().brows = v; }),
        selectField('Head', ['round', 'oval', 'square'], () => ch().headShape, (v) => { ch().headShape = v; }),
        selectField('Sleeves', ['long', 'short', 'none'], () => ch().sleeves, (v) => { ch().sleeves = v; }),
        rangeField('Outline', () => ch().outline, (v) => { ch().outline = v; }, 0, 12, 0.5),
        checkField('Ground shadow', () => ch().shadow, (v) => { ch().shadow = v; }),
      ]),
      section('Proportions', [
        len('Head', ['head'], 40, 180), len('Torso', ['spine'], 70, 260), len('Arms', ['upperArm', 'lowerArm', 'hand'], 40, 160),
        len('Legs', ['upperLeg', 'lowerLeg'], 50, 220), len('Feet', ['foot'], 20, 90),
        wid('Shoulders', 'shoulder', 14, 110), wid('Waist', 'waist', 12, 110), wid('Arm width', 'arm', 5, 46), wid('Leg width', 'leg', 6, 56), wid('Neck', 'neck', 4, 40),
      ]),
      section('Artwork for parts', [
        el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Part' }), partSelect]),
        el('div', { class: 'chips' }, [
          button(spec() ? 'Replace image…' : 'Use an image…', () => pickFile('image/*', async (file) => {
            const asset = await S.assets.addImageFile(project(), file);
            S.history.push();
            ch().art[artPart] = { asset: asset.id, scale: 1, ox: 0, oy: 0, rot: 0 };
            S.touch('all');
          }), 'chip'),
          spec() ? button('Back to vector', () => { S.history.push(); delete ch().art[artPart]; S.touch('all'); }, 'chip') : null,
        ]),
        ...(spec() ? [artField('Scale', 'scale', 0.2, 4, 0.01, 1), artField('Offset X', 'ox', -200, 200, 1, 0), artField('Offset Y', 'oy', -200, 200, 1, 0), artField('Rotate', 'rot', -180, 180, 1, 0)] : []),
        hint('Preparing art: export each body part as its own transparent PNG. Draw the head and torso upright, arms and legs hanging straight down, shoes pointing right. The joint should sit at the top-centre of a limb; then nudge Offset and Scale until it pivots cleanly.'),
      ]),
      section('Reuse', [
        el('div', { class: 'chips' }, [
          button('★ Save to library', async () => { await S.store.saveCharacter(target()); await loadSaved(); S.toast(`${target().name} saved to your character library.`); }, 'chip primary'),
          button('Export file…', () => U.download(new Blob([JSON.stringify(S.store.packCharacter(target()))], { type: 'application/json' }), `${target().name}.character.json`), 'chip'),
        ]),
      ]),
    ];
  }

  // --- scene / camera / audio -----------------------------------------------------

  const FORMATS = { '1920x1080': '16:9 · Film & YouTube', '1080x1920': '9:16 · Reels & Shorts', '1080x1080': '1:1 · Square', '1080x1350': '4:5 · Feed' };

  function sceneSections() {
    const p = project, scene = () => S.scene();
    const moveScene = (d) => {
      const list = p().scenes, i = S.state.sceneIndex, j = U.clamp(i + d, 0, list.length - 1);
      if (i === j) return;
      S.history.push();
      list.splice(j, 0, list.splice(i, 1)[0]);
      S.state.sceneIndex = j;
      S.touch('all');
    };
    return [
      section('Film', [
        textField('Title', () => p().name, (v) => { p().name = v; }),
        selectField('Format', Object.entries(FORMATS), () => `${p().width}x${p().height}`, (v) => {
          const [w, h] = v.split('x').map(Number);
          S.actions.setFormat(w, h);
        }),
        selectField('Frame rate', [['12', '12 fps'], ['24', '24 fps'], ['25', '25 fps'], ['30', '30 fps']], () => String(p().fps), (v) => { p().fps = Number(v); }),
      ]),
      section('This shot', [
        textField('Name', () => scene().name, (v) => { scene().name = v; }),
        numField('Length (s)', () => scene().duration / p().fps, (v) => { scene().duration = Math.max(1, Math.round(v * p().fps)); }, { step: 0.1, min: 0.1 }),
        colorField('Backdrop', () => scene().bg, (v) => { scene().bg = v; }),
        el('div', { class: 'chips' }, [
          button('◂ Earlier', () => moveScene(-1), 'chip'), button('Later ▸', () => moveScene(1), 'chip'),
          button('Duplicate', () => { S.history.push(); const copy = U.clone(scene()); copy.id = U.uid('s'); copy.name += ' copy'; p().scenes.splice(S.state.sceneIndex + 1, 0, copy); gotoScene(S.state.sceneIndex + 1); }, 'chip'),
          button('Delete', () => { if (p().scenes.length < 2) { S.toast('A film needs at least one shot.'); return; } S.history.push(); p().scenes.splice(S.state.sceneIndex, 1); gotoScene(Math.max(0, S.state.sceneIndex - 1)); }, 'chip danger'),
        ]),
      ]),
      section('Look', [
        rangeField('Grain', () => scene().look.grain, (v) => { scene().look.grain = v; }, 0, 0.6, 0.01),
        rangeField('Vignette', () => scene().look.vignette, (v) => { scene().look.vignette = v; }, 0, 0.8, 0.01),
        colorField('Tint', () => scene().look.tint, (v) => { scene().look.tint = v; }),
        rangeField('Tint amount', () => scene().look.tintAmount, (v) => { scene().look.tintAmount = v; }, 0, 1, 0.01),
        hint('The look is applied over the whole frame, so every shot of a film shares one printed texture.'),
      ]),
      section('Getting started', [hint('Click anything on the stage to select it. With auto-key on (the red ● in the timeline), move the playhead, change something, and a key appears on just that property. Select the Camera layer to direct the shot.')]),
    ];
  }

  function cameraSections() {
    const cam = () => S.scene().camera;
    return [
      section('Camera', [
        el('div', { class: 'pair' }, [propNum(cam, 'x', 'X'), propNum(cam, 'y', 'Y')]),
        propRange(cam, 'zoom', 'Zoom', 0.25, 6, 0.01),
        propNum(cam, 'rotation', 'Roll', { step: 0.25 }),
        el('div', { class: 'chips' }, [
          button('Key camera', () => S.timeline.keyAll(), 'chip primary'),
          button(S.state.cameraView ? 'Director view' : 'Camera view', () => { S.state.cameraView = !S.state.cameraView; S.touch('all'); }, 'chip'),
          button('Reset', () => { S.history.push(); const c = cam(); for (const [k, v] of Object.entries({ x: project().width / 2, y: project().height / 2, zoom: 1, rotation: 0 })) M.setProp(c, k, v, frame(), S.state.autoKey); S.touch('data'); }, 'chip'),
        ]),
        hint('Director view shows the whole set with the camera as a teal frame: drag it to pan, drag a corner to zoom. Layers with different Depth slide against each other as the camera moves.'),
      ]),
    ];
  }

  function audioSections() {
    const clip = () => S.scene().audio.find((a) => a.id === S.state.sel.id);
    const characters = S.scene().objects.filter((o) => o.type === 'character');
    if (!lipTarget || !characters.some((ch) => ch.id === lipTarget)) lipTarget = characters[0] ? characters[0].id : null;
    const who = el('select', {}, characters.map((ch) => el('option', { value: ch.id, text: ch.name })));
    if (lipTarget) who.value = lipTarget;
    who.addEventListener('change', () => { lipTarget = who.value; });
    return [
      section('Sound clip', [
        textField('Name', () => clip().name, (v) => { clip().name = v; }),
        selectField('Track', [['dialogue', 'Dialogue'], ['music', 'Music & ambience'], ['sfx', 'Sound effects']], () => clip().track, (v) => { clip().track = v; }),
        numField('Start frame', () => clip().start, (v) => { clip().start = Math.max(0, Math.round(v)); }, { min: 0 }),
        rangeField('Volume', () => clip().gain, (v) => { clip().gain = v; }, 0, 1.5, 0.01),
        el('div', { class: 'chips' }, [button('Delete', deleteSelected, 'chip danger')]),
      ]),
      characters.length ? section('Lip-sync assistant', [
        el('div', { class: 'field' }, [el('span', { class: 'lbl', text: 'Speaker' }), who]),
        el('div', { class: 'chips' }, [button('Key mouth shapes from this clip', () => {
          const obj = S.scene().objects.find((o) => o.id === lipTarget);
          S.history.push();
          const n = S.audio.lipSync(S.scene(), clip(), obj, project().fps);
          S.state.expanded[obj.id] = true;
          S.toast(n ? `${n} mouth keys written to ${obj.name}. Every one is editable.` : 'This clip has not finished loading.');
          S.touch('data');
        }, 'chip primary')]),
        hint('A first pass from loudness, keyed on twos. Swap any shape in the Mouth track: hand-timed accents always beat the assistant.'),
      ]) : null,
    ];
  }

  // ---------------------------------------------------------------------------
  // Inspector assembly
  // ---------------------------------------------------------------------------

  function buildInspector(force) {
    const sel = S.state.sel, obj = S.selected();
    const keysSig = S.state.selKeys.length + ':' + S.state.selKeys.slice(0, 1).map((r) => r.prop).join();
    const sig = [sel.kind, sel.id, obj && obj.type, S.state.charTab, keysSig, S.scene().id, S.scene().objects.length, project().clips.length, artPart, obj && obj.char && !!obj.char.art[artPart], S.state.cameraView].join('/');
    if (sig === inspectorSig && !force) { syncers.forEach((fn) => fn()); return; }
    inspectorSig = sig;
    syncers = [];
    const box = $('inspector');
    const scrollTop = box.scrollTop;
    box.innerHTML = '';
    const add = (...nodes) => nodes.flat().forEach((n) => n && box.append(n));

    if (S.state.selKeys.length) add(easeSection());

    if (sel.kind === 'camera') add(cameraSections());
    else if (sel.kind === 'audio' && S.scene().audio.some((a) => a.id === sel.id)) add(audioSections());
    else if (obj) {
      const target = () => S.selected() || obj;
      add(el('div', { class: 'title' }, [el('span', { class: 'kind', text: TYPE_ICON[obj.type] || '◆' }), (() => {
        const input = el('input', { type: 'text', class: 'name-input' });
        input.addEventListener('input', () => { S.history.begin(); target().name = input.value; S.touch('data'); });
        syncers.push(() => { if (document.activeElement !== input) input.value = target().name; });
        return input;
      })()]));
      if (obj.type === 'character') {
        add(el('div', { class: 'tabs' }, [['animate', 'Animate'], ['design', 'Design']].map(([id, label]) => button(label, () => { S.state.charTab = id; S.touch('sel'); }, 'tab' + (S.state.charTab === id ? ' current' : '')))));
        if (S.state.charTab === 'design') add(designTab(target));
        else add(animateTab(target), transformSection(target), layerSection(target));
      } else {
        add(transformSection(target));
        if (obj.type === 'text') add(textSection(target));
        if (obj.type === 'shape') add(shapeSection(target));
        add(layerSection(target));
      }
    } else add(sceneSections());

    syncers.forEach((fn) => fn());
    box.scrollTop = scrollTop;
  }

  function syncToolbar() {
    $('btn-undo').disabled = !S.history.canUndo();
    $('btn-redo').disabled = !S.history.canRedo();
    $('tg-camera').classList.toggle('on', S.state.cameraView);
    $('tg-camera').textContent = S.state.cameraView ? '🎥 Camera view' : '🎬 Director view';
    $('film-name').textContent = project().name;
    document.title = `${project().name} · Stick Figure Studio`;
  }

  function refresh(deep, force) {
    if (!project()) return;
    if (deep || force || !inspectorSig) {
      buildScenes(force);
      buildLayers(force);
      buildLibrary(force);
    }
    buildInspector(force);
    syncToolbar();
  }

  function init() {
    for (const tab of document.querySelectorAll('#left .tab')) {
      tab.addEventListener('click', () => {
        S.state.leftTab = tab.dataset.tab;
        document.querySelectorAll('#left .tab').forEach((t) => t.classList.toggle('current', t === tab));
        $('layers').hidden = S.state.leftTab !== 'layers';
        $('library').hidden = S.state.leftTab !== 'library';
      });
    }
    loadSaved();
  }

  S.panels = { init, refresh, deleteSelected, duplicateSelected, reorder, gotoScene };
})(window.Studio);
