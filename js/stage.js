'use strict';
// ---------------------------------------------------------------------------
// Stage: the composition workspace. Select, move, pose, and direct the camera
// ---------------------------------------------------------------------------
// Coordinate spaces, outermost first:
//   canvas css pixels -> (view) -> stage pixels -> (camera layer) -> scene -> (object matrix) -> local

(function (S) {
  const U = S.util;
  const M = S.model;

  const HANDLE = { radius: 6.5, hit: 14, ik: '#ff4d4f', fk: '#ffffff', root: '#ff9f1a', pin: '#2ec4b6' };
  const IK_ENDS = { lowerArmL: ['Arm', 'L'], lowerArmR: ['Arm', 'R'], lowerLegL: ['Leg', 'L'], lowerLegR: ['Leg', 'R'] };

  let canvas, c, wrap, hud, ghost;
  let drag = null;
  let hoverHandle = null;
  let spaceDown = false;

  const project = () => S.state.project;
  const usesCamera = () => S.state.cameraView || S.state.playing;
  const viewMatrix = () => { const v = S.state.view; return new DOMMatrix().translateSelf(v.x, v.y).scaleSelf(v.s); };
  const layerFor = (ctx, obj) => (usesCamera() ? M.layerMatrix(project(), ctx.camera(), ctx.depth(obj)) : new DOMMatrix());
  const full = (ctx, obj) => viewMatrix().multiply(layerFor(ctx, obj)).multiply(ctx.matrix(obj));
  const parentFull = (ctx, obj) => viewMatrix().multiply(layerFor(ctx, obj)).multiply(ctx.parentMatrix(obj));
  const evalNow = () => M.evalCtx(S.scene(), S.state.frame);

  function fit() {
    const p = project(), v = S.state.view, pad = 40;
    v.s = Math.max(0.02, Math.min((wrap.clientWidth - pad * 2) / p.width, (wrap.clientHeight - pad * 2) / p.height));
    v.x = (wrap.clientWidth - p.width * v.s) / 2;
    v.y = (wrap.clientHeight - p.height * v.s) / 2;
    v.fitted = true;
  }

  function pointer(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function set(obj, name, value) {
    M.setProp(obj, name, value, S.state.frame, S.state.autoKey);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  function draw() {
    if (!canvas || !project()) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
    }
    if (S.state.view.fitted) fit();

    const p = project(), scene = S.scene(), f = S.state.frame, v = S.state.view;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#121217';
    c.fillRect(0, 0, canvas.width, canvas.height);

    const base = new DOMMatrix().scaleSelf(dpr).multiplySelf(viewMatrix());
    const ctx = S.render.scene(c, p, scene, f, { base, camera: usesCamera(), clip: S.state.playing });

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = v.x, sy = v.y, sw = p.width * v.s, sh = p.height * v.s;
    if (!S.state.playing) {
      // everything off-frame stays visible but dimmed, so actors can wait in the wings
      c.fillStyle = 'rgba(18, 18, 23, 0.74)';
      c.fillRect(0, 0, cw, sy); c.fillRect(0, sy + sh, cw, ch - sy - sh);
      c.fillRect(0, sy, sx, sh); c.fillRect(sx + sw, sy, cw - sx - sw, sh);
    }
    c.strokeStyle = 'rgba(255,255,255,0.28)';
    c.lineWidth = 1;
    c.strokeRect(sx - 0.5, sy - 0.5, sw + 1, sh + 1);

    if (!S.state.playing) drawOverlays(ctx, dpr);
    updateHud();
  }

  function drawGhost(obj, t, color, ctxNow, dpr) {
    if (!ghost) ghost = document.createElement('canvas');
    if (ghost.width !== canvas.width || ghost.height !== canvas.height) { ghost.width = canvas.width; ghost.height = canvas.height; }
    const g = ghost.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, ghost.width, ghost.height);
    const then = M.evalCtx(S.scene(), t);
    g.setTransform(new DOMMatrix().scaleSelf(dpr).multiplySelf(viewMatrix()).multiplySelf(layerFor(ctxNow, obj)).multiplySelf(then.matrix(obj)));
    S.render.drawObject(g, obj, then);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, ghost.width, ghost.height);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 0.24;
    c.drawImage(ghost, 0, 0);
    c.restore();
  }

  function drawMotionPath(obj, ctx) {
    const times = [...(obj.tracks.x || []), ...(obj.tracks.y || [])].map((k) => k.t);
    if (times.length < 2) return;
    const t0 = Math.min(...times), t1 = Math.max(...times);
    if (t1 - t0 > 2000) return;
    const lead = viewMatrix().multiply(layerFor(ctx, obj));
    const at = (t) => { const m = M.evalCtx(S.scene(), t).matrix(obj); return U.apply(lead, m.e, m.f); };
    c.beginPath();
    const pts = [];
    for (let t = t0; t <= t1; t++) { const pt = at(t); pts.push(pt); if (t === t0) c.moveTo(pt.x, pt.y); else c.lineTo(pt.x, pt.y); }
    c.strokeStyle = 'rgba(255,159,26,0.55)';
    c.lineWidth = 1.5;
    c.stroke();
    // one dot per frame: the spacing of the dots is the timing
    c.fillStyle = 'rgba(255,159,26,0.9)';
    for (const pt of pts) { c.beginPath(); c.arc(pt.x, pt.y, 1.6, 0, 7); c.fill(); }
    const keyed = new Set(times);
    for (const t of keyed) { const pt = pts[t - t0]; c.beginPath(); c.rect(pt.x - 3.5, pt.y - 3.5, 7, 7); c.fillStyle = '#ff9f1a'; c.fill(); }
  }

  function characterHandles(obj, ctx) {
    const m = full(ctx, obj), pose = ctx.pose(obj);
    const list = [{ name: 'root', ...U.apply(m, 0, 0) }];
    for (const name of S.rig.BONE_NAMES) list.push({ name, ...U.apply(m, pose.b[name].ex, pose.b[name].ey) });
    return list;
  }

  function boxGizmo(obj, ctx) {
    const m = full(ctx, obj), [x0, y0, x1, y1] = S.render.boundsOf(obj, ctx);
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => U.apply(m, x, y));
    const origin = U.apply(m, 0, 0);
    const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    const mid = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
    const len = Math.hypot(top.x - mid.x, top.y - mid.y) || 1;
    const rotate = { x: top.x + (top.x - mid.x) / len * 26, y: top.y + (top.y - mid.y) / len * 26 };
    return { corners, origin, top, rotate };
  }

  function cameraFrame(ctx) {
    const p = project();
    const inv = viewMatrix().multiply(M.layerMatrix(p, ctx.camera(), 1).inverse());
    return [[0, 0], [p.width, 0], [p.width, p.height], [0, p.height]].map(([x, y]) => U.apply(inv, x, y));
  }

  function dot(pt, r, fill, stroke) {
    c.beginPath();
    c.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = stroke;
    c.stroke();
  }

  function drawOverlays(ctx, dpr) {
    const obj = S.state.sel.kind === 'object' ? S.selected() : null;
    const f = S.state.frame;

    if (obj && !obj.hidden) {
      if (S.state.onion && obj.type === 'character') {
        const times = M.keyTimes(obj);
        const prev = times.filter((t) => t < f).pop(), next = times.find((t) => t > f);
        if (prev != null) drawGhost(obj, prev, '#ff4d4f', ctx, dpr);
        if (next != null) drawGhost(obj, next, '#1890ff', ctx, dpr);
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (S.state.showPaths) drawMotionPath(obj, ctx);

      if (obj.type === 'character') {
        const pinned = { lowerLegL: ctx.P(obj, 'pinL'), lowerLegR: ctx.P(obj, 'pinR') };
        for (const h of characterHandles(obj, ctx)) {
          const active = hoverHandle === h.name || (drag && drag.handle === h.name);
          const r = HANDLE.radius + (active ? 2 : 0);
          if (h.name === 'root') dot(h, r + 1.5, HANDLE.root, '#fff');
          else if (pinned[h.name]) dot(h, r + 1, HANDLE.pin, '#fff');
          else if (IK_ENDS[h.name]) dot(h, r, HANDLE.ik, '#fff');
          else dot(h, r - 1.5, HANDLE.fk, HANDLE.ik);
        }
      } else {
        const g = boxGizmo(obj, ctx);
        c.beginPath();
        g.corners.forEach((pt, i) => (i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y)));
        c.closePath();
        c.moveTo(g.top.x, g.top.y);
        c.lineTo(g.rotate.x, g.rotate.y);
        c.strokeStyle = '#ff9f1a';
        c.lineWidth = 1.5;
        c.stroke();
        if (!obj.locked) {
          for (const pt of g.corners) { c.fillStyle = '#fff'; c.fillRect(pt.x - 4.5, pt.y - 4.5, 9, 9); c.strokeRect(pt.x - 4.5, pt.y - 4.5, 9, 9); }
          dot(g.rotate, 5.5, '#fff', '#ff9f1a');
        }
        dot(g.origin, 3, '#ff9f1a', '#fff');
      }
    }

    if (!S.state.cameraView) {
      const pts = cameraFrame(ctx), selected = S.state.sel.kind === 'camera';
      c.beginPath();
      pts.forEach((pt, i) => (i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y)));
      c.closePath();
      c.setLineDash(selected ? [] : [8, 6]);
      c.strokeStyle = selected ? '#2ec4b6' : 'rgba(46,196,182,0.75)';
      c.lineWidth = selected ? 2.5 : 1.5;
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#2ec4b6';
      c.font = '600 11px system-ui, sans-serif';
      c.fillText('CAMERA', pts[0].x + 6, pts[0].y - 7);
      if (selected) for (const pt of pts) { c.fillStyle = '#2ec4b6'; c.fillRect(pt.x - 5, pt.y - 5, 10, 10); }
    }
  }

  function updateHud() {
    const sel = S.state.sel.kind;
    let text = S.state.cameraView ? 'Camera view' : 'Director view · the teal frame is the camera';
    if (sel === 'camera') text += S.state.cameraView ? ' · drag to move the camera, Alt+wheel to zoom it' : ' · drag the frame to move, a corner to zoom';
    else if (sel === 'object' && S.selected() && S.selected().type === 'character') text += ' · drag a red joint to pose (wrists and ankles pull the whole limb, Alt = rotate only)';
    hud.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Hit testing
  // ---------------------------------------------------------------------------

  function segmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = U.clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  function hits(obj, ctx, pt) {
    const l = U.apply(full(ctx, obj).inverse(), pt.x, pt.y);
    const [x0, y0, x1, y1] = S.render.boundsOf(obj, ctx);
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) return false;
    if (obj.type === 'character') {
      const pose = ctx.pose(obj), w = obj.char.widths;
      for (const [name, b] of Object.entries(pose.b)) {
        const reach = name === 'head' ? b.len / 2 : name === 'spine' ? w.shoulder : Math.max(16, w.leg);
        if (name === 'head' ? Math.hypot(l.x - (b.sx + b.ex) / 2, l.y - (b.sy + b.ey) / 2) < reach : segmentDistance(l.x, l.y, b.sx, b.sy, b.ex, b.ey) < reach) return true;
      }
      return false;
    }
    if (obj.type === 'shape') {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      const inside = obj.paths.some((p) => (p.fill ? c.isPointInPath(S.render.path2d(p.d), l.x, l.y, p.rule || 'nonzero') : false));
      c.restore();
      return inside || (x1 - x0) * (y1 - y0) < 6400;
    }
    return true;
  }

  function pickObject(ctx, pt) {
    const objects = S.scene().objects;
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.hidden || obj.locked || ctx.P(obj, 'opacity') <= 0) continue;
      if (hits(obj, ctx, pt)) return obj;
    }
    return null;
  }

  const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

  function pickHandle(obj, ctx, pt) {
    let best = null, bestDist = HANDLE.hit;
    for (const h of characterHandles(obj, ctx)) {
      const d = Math.hypot(h.x - pt.x, h.y - pt.y);
      // wrists and ankles win ties against the hand/foot joints stacked next to them
      if (d < bestDist - (IK_ENDS[h.name] || h.name === 'root' ? 0 : 2)) { best = h.name; bestDist = d; }
    }
    return best;
  }

  function inPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  // ---------------------------------------------------------------------------
  // Dragging
  // ---------------------------------------------------------------------------

  function beginMove(obj, ctx, pt) {
    const inv = parentFull(ctx, obj).inverse();
    drag = { type: 'move', obj, inv, p0: U.apply(inv, pt.x, pt.y), x0: ctx.P(obj, 'x'), y0: ctx.P(obj, 'y') };
  }

  function poseDrag(e, pt) {
    const obj = drag.obj, name = drag.handle;
    const ctx = evalNow(), pose = ctx.pose(obj);
    const l = U.apply(full(ctx, obj).inverse(), pt.x, pt.y);
    const ik = !e.altKey && IK_ENDS[name];
    const side = name.slice(-1);
    const pinName = 'pin' + side;
    const pin = /Leg|foot/.test(name) ? ctx.P(obj, pinName) : null;

    if (pin) {
      // a planted foot is posed by moving its pin, not the bones
      const world = ctx.matrix(obj);
      if (name.startsWith('lowerLeg')) {
        const s = U.apply(world, l.x, l.y);
        set(obj, pinName, { x: U.round(s.x), y: U.round(s.y), a: pin.a || 0 });
      } else if (name.startsWith('foot')) {
        const ankle = pose.b[name], a = U.apply(world, ankle.sx, ankle.sy), s = U.apply(world, l.x, l.y);
        set(obj, pinName, { ...pin, a: U.round(Math.atan2(s.y - a.y, s.x - a.x), 4) });
      }
      return;
    }

    if (ik) {
      const [limb] = ik;
      const props = S.rig.ikProps(pose, limb, side, l.x, l.y);
      for (const [p, v] of Object.entries(props)) set(obj, p, v);
      if (limb === 'Leg') {
        // keep the sole at the angle it had, so a foot stays flat while the knee bends
        const upperParent = 0;
        const lowerWorld = upperParent + props['b.upperLeg' + side] + props['b.lowerLeg' + side];
        set(obj, 'b.foot' + side, U.round(U.normDeg(pose.b['foot' + side].a / U.DEG - lowerWorld), 2));
      }
      return;
    }

    const bone = pose.b[name];
    const parent = S.rig.PARENT[name];
    const angle = Math.atan2(l.y - bone.sy, l.x - bone.sx);
    set(obj, 'b.' + name, U.round(U.normDeg((angle - (parent ? pose.b[parent].a : 0)) / U.DEG), 2));
  }

  function onPointerDown(e) {
    const pt = pointer(e);
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || spaceDown) {
      drag = { type: 'pan', p0: pt, x0: S.state.view.x, y0: S.state.view.y };
      return;
    }
    if (S.state.playing) { S.playback.stop(); return; }

    const ctx = evalNow();
    const sel = S.state.sel;
    const obj = sel.kind === 'object' ? S.selected() : null;

    // 1. handles of the current selection
    if (obj && !obj.locked && !obj.hidden) {
      if (obj.type === 'character') {
        const handle = pickHandle(obj, ctx, pt);
        if (handle) {
          S.history.begin();
          if (handle === 'root') { beginMove(obj, ctx, pt); drag.handle = 'root'; }
          else drag = { type: 'bone', obj, handle };
          return;
        }
      } else {
        const g = boxGizmo(obj, ctx);
        const pivot = { scaleX: ctx.P(obj, 'scaleX'), scaleY: ctx.P(obj, 'scaleY'), rotation: ctx.P(obj, 'rotation') };
        if (near(pt, g.rotate, 10)) {
          S.history.begin();
          drag = { type: 'rotate', obj, origin: g.origin, a0: Math.atan2(pt.y - g.origin.y, pt.x - g.origin.x), sign: U.det(parentFull(ctx, obj)) < 0 ? -1 : 1, ...pivot };
          return;
        }
        if (g.corners.some((corner) => near(pt, corner, 10))) {
          S.history.begin();
          drag = { type: 'scale', obj, origin: g.origin, d0: Math.hypot(pt.x - g.origin.x, pt.y - g.origin.y) || 1, ...pivot };
          return;
        }
      }
    }

    // 2. camera frame (director view)
    const cam = S.scene().camera;
    if (!S.state.cameraView) {
      const framePts = cameraFrame(ctx);
      const camState = { x0: M.getProp(cam, 'x', S.state.frame), y0: M.getProp(cam, 'y', S.state.frame), z0: M.getProp(cam, 'zoom', S.state.frame) };
      if (sel.kind === 'camera' && framePts.some((corner) => near(pt, corner, 12))) {
        const mid = { x: (framePts[0].x + framePts[2].x) / 2, y: (framePts[0].y + framePts[2].y) / 2 };
        S.history.begin();
        drag = { type: 'cam-zoom', mid, d0: Math.hypot(pt.x - mid.x, pt.y - mid.y) || 1, ...camState };
        return;
      }
      const onEdge = framePts.some((a, i) => { const b = framePts[(i + 1) % 4]; return segmentDistance(pt.x, pt.y, a.x, a.y, b.x, b.y) < 8; });
      if (onEdge || (sel.kind === 'camera' && inPolygon(pt, framePts) && !pickObject(ctx, pt))) {
        if (sel.kind !== 'camera') S.select('camera');
        S.history.begin();
        drag = { type: 'cam-move', p0: pt, k: 1 / S.state.view.s, ...camState };
        return;
      }
    }

    // 3. objects under the pointer
    const hit = pickObject(ctx, pt);
    if (hit) {
      if (!obj || hit.id !== obj.id) S.select('object', hit.id);
      S.history.begin();
      beginMove(hit, ctx, pt);
      return;
    }

    // 4. empty space
    if (sel.kind === 'camera' && S.state.cameraView) {
      S.history.begin();
      const z = M.getProp(cam, 'zoom', S.state.frame);
      drag = { type: 'cam-move', p0: pt, k: -1 / (S.state.view.s * z), x0: M.getProp(cam, 'x', S.state.frame), y0: M.getProp(cam, 'y', S.state.frame) };
      return;
    }
    if (sel.kind !== 'none') S.select('none');
  }

  function onPointerMove(e) {
    const pt = pointer(e);
    if (!drag) {
      const obj = S.state.sel.kind === 'object' ? S.selected() : null;
      const handle = obj && obj.type === 'character' && !S.state.playing ? pickHandle(obj, evalNow(), pt) : null;
      if (handle !== hoverHandle) { hoverHandle = handle; S.touch('view'); }
      canvas.style.cursor = spaceDown ? 'grab' : handle ? 'grab' : 'default';
      return;
    }
    const cam = S.scene().camera;
    switch (drag.type) {
      case 'pan':
        S.state.view.x = drag.x0 + pt.x - drag.p0.x;
        S.state.view.y = drag.y0 + pt.y - drag.p0.y;
        S.state.view.fitted = false;
        S.touch('view');
        return;
      case 'move': {
        const p = U.apply(drag.inv, pt.x, pt.y);
        let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        set(drag.obj, 'x', U.round(drag.x0 + dx, 1));
        set(drag.obj, 'y', U.round(drag.y0 + dy, 1));
        break;
      }
      case 'bone': poseDrag(e, pt); break;
      case 'scale': {
        const k = Math.hypot(pt.x - drag.origin.x, pt.y - drag.origin.y) / drag.d0;
        set(drag.obj, 'scaleX', U.round(drag.scaleX * k, 3));
        set(drag.obj, 'scaleY', U.round(drag.scaleY * k, 3));
        break;
      }
      case 'rotate': {
        let delta = (Math.atan2(pt.y - drag.origin.y, pt.x - drag.origin.x) - drag.a0) / U.DEG * drag.sign;
        let value = drag.rotation + U.normDeg(delta);
        if (e.shiftKey) value = Math.round(value / 15) * 15;
        set(drag.obj, 'rotation', U.round(value, 1));
        break;
      }
      case 'cam-move':
        set(cam, 'x', U.round(drag.x0 + (pt.x - drag.p0.x) * drag.k, 1));
        set(cam, 'y', U.round(drag.y0 + (pt.y - drag.p0.y) * drag.k, 1));
        break;
      case 'cam-zoom':
        set(cam, 'zoom', U.round(U.clamp(drag.z0 * drag.d0 / Math.max(8, Math.hypot(pt.x - drag.mid.x, pt.y - drag.mid.y)), 0.1, 20), 3));
        break;
    }
    canvas.style.cursor = 'grabbing';
    S.touch('data');
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    canvas.style.cursor = 'default';
    S.touch('data');
  }

  function onWheel(e) {
    e.preventDefault();
    const pt = pointer(e), v = S.state.view;
    if (e.altKey && S.state.sel.kind === 'camera') {
      const cam = S.scene().camera;
      S.history.begin();
      set(cam, 'zoom', U.round(U.clamp(M.getProp(cam, 'zoom', S.state.frame) * Math.exp(-e.deltaY * 0.001), 0.1, 20), 3));
      S.history.end();
      S.touch('data');
      return;
    }
    const s = U.clamp(v.s * Math.exp(-e.deltaY * 0.0015), 0.03, 12);
    v.x = pt.x - (pt.x - v.x) * (s / v.s);
    v.y = pt.y - (pt.y - v.y) * (s / v.s);
    v.s = s;
    v.fitted = false;
    S.touch('view');
  }

  // Drop image files straight onto the stage.
  async function onDrop(e) {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    const pt = pointer(e);
    const ctx = evalNow();
    S.history.push();
    for (const file of files) {
      const asset = await S.assets.addImageFile(project(), file);
      const obj = S.library.imageObject(asset);
      const lead = viewMatrix().multiply(usesCamera() ? M.layerMatrix(project(), ctx.camera(), 1) : new DOMMatrix());
      const at = U.apply(lead.inverse(), pt.x, pt.y);
      obj.props.x = U.round(at.x);
      obj.props.y = U.round(at.y);
      S.scene().objects.push(obj);
      S.select('object', obj.id);
    }
    S.touch('data');
  }

  function init() {
    canvas = document.getElementById('stage');
    wrap = document.getElementById('stage-wrap');
    hud = document.getElementById('stage-hud');
    c = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dblclick', (e) => { if (!pickObject(evalNow(), pointer(e))) { fit(); S.touch('view'); } });
    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', onDrop);
    new ResizeObserver(() => S.touch('view')).observe(wrap);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.shiftKey) spaceDown = true; });
    window.addEventListener('keyup', () => { spaceDown = false; });
  }

  S.stage = { init, draw, fit: () => { fit(); S.touch('view'); }, handlesOf: (obj) => characterHandles(obj, evalNow()), gizmoOf: (obj) => boxGizmo(obj, evalNow()) };
})(window.Studio);
