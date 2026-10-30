'use strict';
// ---------------------------------------------------------------------------
// Actions: directing by code. Each function writes ordinary keys at a time and
// returns the frame where the action ends, so actions chain into a performance.
// ---------------------------------------------------------------------------
// Every action can be called directly: Studio.actions.walkTo(nadim, 900, 0)

(function (S) {
  const U = S.util;
  const M = S.model;
  const L = S.library;

  const project = () => S.state.project;
  const scene = () => S.scene();
  const sec = (s) => Math.max(1, Math.round(s * project().fps));
  const floorY = () => scene().floorY || Math.round(project().height * 0.82);

  const ARM_R = ['b.upperArmR', 'b.lowerArmR', 'b.handR'];
  const BONES = S.rig.BONE_NAMES.map((n) => 'b.' + n);
  let clipCache = null;
  const clip = (name) => (clipCache || (clipCache = L.builtinClips())).concat(project().clips).find((c) => c.name.toLowerCase() === name.toLowerCase());

  // --- keys --------------------------------------------------------------------

  const V = (obj, prop, t) => M.getProp(obj, prop, t);

  function K(obj, prop, t, v, ease) {
    t = Math.max(0, Math.round(t));
    if (!obj.tracks[prop] && t > 0) M.upsertKey(obj, prop, 0, U.clone(obj.props[prop] ?? null));
    return M.upsertKey(obj, prop, t, v, ease);
  }

  // Pin the current value down at t, so the change that follows starts here and not at the previous key.
  const hold = (obj, props, t, ease) => props.forEach((p) => K(obj, p, t, U.clone(V(obj, p, t) ?? null), ease));

  function tween(obj, prop, t0, t1, value, ease) {
    hold(obj, [prop], t0, ease || 'inout');
    K(obj, prop, t1, value);
  }

  // --- measuring the scene -------------------------------------------------------

  function info(obj, t) {
    const ctx = M.evalCtx(scene(), t), m = ctx.matrix(obj);
    const [x0, y0, x1, y1] = S.render.boundsOf(obj, ctx);
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => U.apply(m, x, y));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const out = { ctx, m, x: m.e, y: m.f, left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    out.cx = (out.left + out.right) / 2;
    out.cy = (out.top + out.bottom) / 2;
    if (obj.type === 'character') {
      const pose = ctx.pose(obj), h = pose.b.head, sp = pose.b.spine;
      out.pose = pose;
      out.scale = Math.hypot(m.a, m.b);
      out.facing = V(obj, 'flip', t) ? -1 : 1;
      out.head = U.apply(m, (h.sx + h.ex) / 2, (h.sy + h.ey) / 2);
      out.shoulder = U.apply(m, sp.sx + (sp.ex - sp.sx) * 0.9, sp.sy + (sp.ey - sp.sy) * 0.9);
      out.reach = (obj.char.lengths.upperArm + obj.char.lengths.lowerArm) * out.scale;
    }
    return out;
  }

  // what the character is carrying in the front hand at t
  const held = (ch, t) => scene().objects.find((o) => { const a = V(o, 'attach', t); return a && a.id === ch.id && a.bone === 'handR'; }) || null;

  function face(ch, dir, t) {
    const want = dir < 0;
    if (!!V(ch, 'flip', t) !== want) K(ch, 'flip', t, want);
  }

  // Turn to 'front' (facing the camera) or back to 'side'. The switch is a cut, sold by a quick squash of the body.
  function turnTo(ch, view, t) {
    const sx = V(ch, 'scaleX', t);
    K(ch, 'view', t + 3, view);
    hold(ch, ['scaleX'], t, 'in');
    K(ch, 'scaleX', t + 3, sx * 0.55, 'out');
    K(ch, 'scaleX', t + 7, sx);
    return t + 7;
  }

  function reach(ch, t, point, ease) {
    const ctx = M.evalCtx(scene(), t);
    const local = U.apply(ctx.matrix(ch).inverse(), point.x, point.y);
    for (const [p, v] of Object.entries(S.rig.ikProps(ctx.pose(ch), 'Arm', 'R', local.x, local.y, 1))) K(ch, p, t, v, ease);
  }

  function sound(kind, t, gain) {
    S.audio.addClip(scene(), S.audio.builtin(project(), kind), t, S.audio.BUILTIN[kind].track, gain ?? 0.7);
  }

  // --- moving around ---------------------------------------------------------------

  function scaledClip(src, k) {
    if (k === 1) return src;
    const tracks = {};
    for (const [prop, keys] of Object.entries(src.tracks)) tracks[prop] = keys.map((key) => ({ ...key, t: Math.round(key.t * k) }));
    return { ...src, length: Math.round(src.length * k), tracks };
  }

  const withoutArm = (src) => ({ ...src, tracks: Object.fromEntries(Object.entries(src.tracks).filter(([p]) => !ARM_R.includes(p))) });

  // Walk (or run) to a scene x. Whole steps only, so the walk always ends on a planted foot.
  function walkTo(ch, targetX, t0, o = {}) {
    const x0 = V(ch, 'x', t0), dist = targetX - x0;
    if (Math.abs(dist) < 40) return t0;
    face(ch, dist > 0 ? 1 : -1, t0);
    const carrying = held(ch, t0);
    const pace = (o.run ? 0.5 : 1) * (o.pace || 1);
    let cycle = scaledClip(clip('Walk cycle'), pace);
    if (carrying) cycle = withoutArm(cycle);
    const half = cycle.length / 2;
    const stride = clip('Walk cycle').stride * Math.abs(V(ch, 'scaleX', t0)) * (o.run ? 1.5 : 1);
    const steps = Math.max(2, Math.round(Math.abs(dist) / (stride / 2)));
    const bones = BONES.filter((p) => !carrying || !ARM_R.includes(p));
    const y0 = V(ch, 'y', t0);

    hold(ch, [...bones, 'y'], t0);
    const start = t0 + 4, end = start + Math.round(steps * half);
    L.applyClip(ch, cycle, start, { repeats: Math.ceil(steps / 2) });
    for (const prop of Object.keys(cycle.tracks)) if (ch.tracks[prop]) ch.tracks[prop] = ch.tracks[prop].filter((k) => k.t <= end || k.t > start + cycle.length * Math.ceil(steps / 2));
    hold(ch, ['x'], t0, 'linear');
    K(ch, 'x', start, x0, 'linear');
    K(ch, 'x', end, U.round(targetX, 1));
    const rest = S.rig.restProps();
    for (const p of bones) K(ch, p, end + 8, rest[p]);
    K(ch, 'y', end + 8, y0);
    for (let i = 1; i <= steps; i++) sound('footstep', start + Math.round(i * half), o.run ? 0.7 : 0.5);
    return end + 8;
  }

  // Bend the body towards something low: lean in, and sink on pinned feet when the target is near the floor.
  function bendTo(ch, t0, t1, targetY) {
    const c = info(ch, t0), rest = S.rig.restProps();
    const low = Math.max(0, targetY - (c.shoulder.y + c.reach * 0.75));
    const legs = (ch.char.lengths.upperLeg + ch.char.lengths.lowerLeg) * c.scale;
    const drop = Math.min(low, legs * 0.5);
    hold(ch, ['b.spine', 'b.head', ...ARM_R, 'y'], t0);
    K(ch, 'b.spine', t1, rest['b.spine'] + (drop > 0 ? 38 : 12));
    K(ch, 'b.head', t1, rest['b.head'] + (drop > 0 ? -14 : 5));
    if (drop > 0) {
      for (const side of ['L', 'R']) {
        const foot = c.pose.b['foot' + side], a = U.apply(c.m, foot.sx, foot.sy), b = U.apply(c.m, foot.ex, foot.ey);
        K(ch, 'pin' + side, t0, { x: U.round(a.x), y: U.round(a.y), a: U.round(Math.atan2(b.y - a.y, b.x - a.x), 4) });
      }
      K(ch, 'y', t1, c.y + drop);
    }
    return { y: c.y, drop };
  }

  function straighten(ch, t, bend, keepArm) {
    const rest = S.rig.restProps();
    K(ch, 'b.spine', t, rest['b.spine']);
    K(ch, 'b.head', t, rest['b.head']);
    if (!keepArm) for (const p of ARM_R) K(ch, p, t, rest[p]);
    if (bend.drop > 0) { K(ch, 'y', t, bend.y); K(ch, 'pinL', t, null); K(ch, 'pinR', t, null); }
  }

  const carryPoint = (ch, t) => { const c = info(ch, t), l = ch.char.lengths; return U.apply(c.m, (l.upperArm + l.lowerArm) * 0.6, -l.spine * 0.52); };

  // The furniture a thing is standing on (its bounds sit under the thing's base), if any.
  function surfaceUnder(prop, t) {
    const p = info(prop, t);
    return scene().objects.find((o) => {
      if (o === prop || o.type === 'character' || o.kind === 'background' || o.fromBackground || o.hidden) return false;
      const s = info(o, t);
      return p.cx > s.left && p.cx < s.right && Math.abs(s.top - p.bottom) < 40 && s.bottom - s.top > 80;
    }) || null;
  }

  // Where to stand to reach x: within arm's length, but never inside the furniture in the way.
  function standPoint(ch, prop, x, dir, t) {
    const c = info(ch, t), body = ch.char.widths.shoulder * c.scale + 14;
    let want = x - dir * c.reach * 0.72;
    const block = prop && surfaceUnder(prop, t);
    if (block) { const s = info(block, t); want = dir > 0 ? Math.min(want, s.left - body) : Math.max(want, s.right + body); }
    return want;
  }

  function pickUp(ch, prop, t0) {
    let t = t0;
    if (held(ch, t) === prop) return t;
    let c = info(ch, t);
    const g = info(prop, t), grab = { x: g.cx, y: g.cy };
    const dir = grab.x >= c.x ? 1 : -1;
    if (Math.abs(grab.x - c.x) > c.reach * 0.9) { t = walkTo(ch, standPoint(ch, prop, grab.x, dir, t), t); c = info(ch, t); }
    face(ch, dir, t);
    lookAt(ch, grab, t);

    const t1 = t + 14, t2 = t1 + 12;
    const bend = bendTo(ch, t, t1, grab.y);
    reach(ch, t1, { x: grab.x - dir * ch.char.lengths.hand * c.scale * 0.7, y: grab.y });
    K(ch, 'handR', t + 6, 'open');
    K(ch, 'handR', t1, 'grip');
    M.attachTo(scene(), prop, { id: ch.id, bone: 'handR' }, t1);
    const list = scene().objects;
    if (list.indexOf(prop) < list.indexOf(ch)) { list.splice(list.indexOf(prop), 1); list.splice(list.indexOf(ch) + 1, 0, prop); }

    // lift it to a carry position, keeping it as upright as it was
    const handAngle = (f) => M.evalCtx(scene(), f).pose(ch).b.handR.a / U.DEG;
    straighten(ch, t2, bend, true);
    reach(ch, t2, carryPoint(ch, t2));
    K(prop, 'rotation', t2, U.round(V(prop, 'rotation', t1) + handAngle(t1) - handAngle(t2), 2));
    // settle it into the palm while it is lifted, wherever the fingers first touched it
    const after = M.evalCtx(scene(), t2), hand = after.pose(ch).b.handR, cm = after.matrix(ch);
    const palm = U.apply(cm, (hand.sx + hand.ex) / 2, (hand.sy + hand.ey) / 2);
    const local = U.apply(after.parentMatrix(prop).inverse(), palm.x + dir * (g.right - g.left) * 0.2, palm.y + (g.bottom - g.y) - (g.bottom - g.top) * 0.45);
    K(prop, 'x', t2, U.round(local.x, 2)); K(prop, 'y', t2, U.round(local.y, 2));
    tween(ch, 'lookY', t1, t2, 0);
    tween(ch, 'lookX', t1, t2, 0);
    return t2;
  }

  function release(prop, t) {
    M.attachTo(scene(), prop, null, t);
    return info(prop, t);
  }

  // Put what is being carried onto a surface (or the floor when there is none).
  function putDown(ch, prop, surface, t0) {
    let t = t0, c = info(ch, t);
    const dir = surface ? (info(surface, t).cx >= c.x ? 1 : -1) : c.facing;
    const s = surface ? info(surface, t) : null;
    const spot = s ? { x: U.clamp(c.x + dir * c.reach * 0.75, s.left + 40, s.right - 40), y: s.top + 4 } : { x: c.x + dir * c.reach * 0.7, y: floorY() };
    if (s) {
      // the nearest part of the surface, approached from outside it
      const body = ch.char.widths.shoulder * c.scale + 14, edge = dir > 0 ? s.left : s.right;
      spot.x = U.clamp(edge + dir * 70, s.left + 40, s.right - 40);
      const stand = edge - dir * body;
      if (Math.abs(stand - c.x) > 40) { t = walkTo(ch, stand, t); c = info(ch, t); }
    } else if (Math.abs(spot.x - c.x) > c.reach * 0.9) { t = walkTo(ch, spot.x - dir * c.reach * 0.72, t); c = info(ch, t); }
    face(ch, dir, t);
    const p = info(prop, t), halfH = (p.bottom - p.top) / 2;
    const t1 = t + 14, t2 = t1 + 12;
    const bend = bendTo(ch, t, t1, spot.y - halfH);
    reach(ch, t1, { x: spot.x - dir * ch.char.lengths.hand * c.scale * 0.7, y: spot.y - halfH });
    release(prop, t1);
    const base = (prop.bounds ? prop.bounds[3] : (prop.h || 0) / 2) * Math.abs(V(prop, 'scaleY', t1));
    K(prop, 'x', t1, U.round(spot.x)); K(prop, 'y', t1, U.round(spot.y - base)); K(prop, 'rotation', t1, 0);
    K(ch, 'handR', t1 + 3, 'relaxed');
    straighten(ch, t2, bend, false);
    sound('clink', t1, 0.35);
    return t2;
  }

  function drop(ch, prop, t0) {
    const p = release(prop, t0);
    const base = (prop.bounds ? prop.bounds[3] : (prop.h || 0) / 2) * Math.abs(V(prop, 'scaleY', t0));
    const ground = floorY() - base + 30, t1 = t0 + 9;
    K(prop, 'y', t0, p.y, 'in'); K(prop, 'y', t1, ground, 'out'); K(prop, 'y', t1 + 4, ground - 26, 'in'); K(prop, 'y', t1 + 8, ground);
    K(prop, 'rotation', t0, V(prop, 'rotation', t0), 'linear'); K(prop, 'rotation', t1 + 8, V(prop, 'rotation', t0) + 95);
    K(ch, 'handR', t0, 'open'); K(ch, 'handR', t0 + 10, 'relaxed');
    hold(ch, ARM_R, t0);
    const rest = S.rig.restProps();
    for (const prop2 of ARM_R) K(ch, prop2, t0 + 14, rest[prop2]);
    sound('clink', t1, 0.8);
    return t0 + 16;
  }

  function throwIt(ch, prop, t0) {
    const c = info(ch, t0), rest = S.rig.restProps(), W = S.rig.relFromWorld;
    hold(ch, [...ARM_R, 'b.spine'], t0);
    const back = W({ spine: -98, upperArmR: 160, lowerArmR: -140, handR: -140 }), fling = W({ spine: -78, upperArmR: -20, lowerArmR: -10, handR: 0 });
    for (const p of [...ARM_R, 'b.spine']) { K(ch, p, t0 + 7, back[p], 'snap'); K(ch, p, t0 + 11, fling[p], 'out'); K(ch, p, t0 + 24, rest[p]); }
    const tr = t0 + 10, p = release(prop, tr);
    const far = c.facing > 0 ? project().width + 500 : -500;
    K(prop, 'x', tr, p.x, 'linear'); K(prop, 'x', tr + 26, far);
    K(prop, 'y', tr, p.y, 'out'); K(prop, 'y', tr + 11, p.y - 260, 'in'); K(prop, 'y', tr + 26, floorY() + 200);
    K(prop, 'rotation', tr, V(prop, 'rotation', tr), 'linear'); K(prop, 'rotation', tr + 26, V(prop, 'rotation', tr) + 900 * c.facing);
    K(ch, 'handR', tr, 'open'); K(ch, 'handR', t0 + 22, 'relaxed');
    sound('whoosh', t0 + 7, 0.6);
    return t0 + 26;
  }

  function drink(ch, t0) {
    const prop = held(ch, t0), c = info(ch, t0), r = ch.char.lengths.head / 2 * c.scale;
    const mouth = { x: c.head.x + c.facing * r * 1.25, y: c.head.y + r * 0.75 };
    const before = carryPoint(ch, t0), t1 = t0 + 10, t2 = t1 + 16, t3 = t2 + 10;
    hold(ch, [...ARM_R, 'b.head'], t0);
    reach(ch, t1, mouth); reach(ch, t2, mouth, 'inout'); reach(ch, t3, before);
    const rest = S.rig.restProps();
    K(ch, 'b.head', t1, rest['b.head'] - 10); K(ch, 'b.head', t2, rest['b.head'] - 16); K(ch, 'b.head', t3, rest['b.head']);
    K(ch, 'eyes', t1, 'closed'); K(ch, 'eyes', t2, 'auto');
    K(ch, 'mouth', t1, 'o'); K(ch, 'mouth', t2 + 2, 'auto');
    if (prop) {
      const r0 = V(prop, 'rotation', t0);
      hold(prop, ['rotation'], t0);
      K(prop, 'rotation', t1, r0 - 30); K(prop, 'rotation', t2, r0 - 48); K(prop, 'rotation', t3, r0);
    }
    return t3;
  }

  // --- acting ---------------------------------------------------------------------------

  // target: a point in the scene, or a direction name
  function lookAt(ch, target, t0) {
    let lx = 0, ly = 0;
    if (typeof target === 'string') {
      lx = target === 'left' ? -1 : target === 'right' ? 1 : 0;
      ly = target === 'up' ? -1 : target === 'down' ? 1 : 0;
      if (lx) lx *= info(ch, t0).facing;   // "left" is the audience's left, whichever way the head faces
    } else {
      let c = info(ch, t0);
      if ((target.x - c.head.x) * c.facing < -80) { face(ch, -c.facing, t0); c = info(ch, t0); }
      lx = U.clamp(((target.x - c.head.x) * c.facing) / 260, -1, 1);
      ly = U.clamp((target.y - c.head.y) / 260, -1, 1);
    }
    tween(ch, 'lookX', t0, t0 + 5, U.round(lx, 2));
    tween(ch, 'lookY', t0, t0 + 5, U.round(ly, 2));
    return t0 + 6;
  }

  function emote(ch, expression, t0) {
    K(ch, 'expression', t0, expression);
    K(ch, 'eyes', t0, 'auto');
    return t0 + 4;
  }

  function gesture(ch, name, t0, o = {}) {
    let c = clip(name);
    if (!c) return t0;
    if (o.pace && o.pace !== 1) c = scaledClip(c, o.pace);
    if (held(ch, t0)) c = withoutArm(c);
    hold(ch, Object.keys(c.tracks).filter((p) => p !== 'x' && p !== 'y'), t0);
    return L.applyClip(ch, c, t0, { repeats: o.repeats || 1 });
  }

  function pointAt(ch, target, t0) {
    let c = info(ch, t0);
    if ((target.x - c.x) * c.facing < 0) { face(ch, -c.facing, t0); c = info(ch, t0); }
    const local = U.apply(c.m.inverse(), target.x, target.y), sp = c.pose.b.spine;
    const angle = Math.atan2(local.y - (sp.sy + (sp.ey - sp.sy) * 0.9), local.x - (sp.sx + (sp.ex - sp.sx) * 0.9)) / U.DEG;
    const aim = S.rig.relFromWorld({ upperArmR: angle, lowerArmR: angle, handR: angle }), rest = S.rig.restProps();
    hold(ch, ARM_R, t0);
    for (const p of ARM_R) { K(ch, p, t0 + 8, aim[p], 'inout'); K(ch, p, t0 + 34, aim[p], 'inout'); K(ch, p, t0 + 44, rest[p]); }
    K(ch, 'handR', t0 + 4, 'point'); K(ch, 'handR', t0 + 40, 'relaxed');
    lookAt(ch, target, t0);
    return t0 + 44;
  }

  function wrap(text, width) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; } else line = line ? line + ' ' + word : word;
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }

  // A speech bubble that appears for as long as the line takes to read, with the mouth flapping under it.
  function say(ch, text, t0, seconds) {
    const c = info(ch, t0);
    const dur = sec(seconds || Math.max(1.4, text.split(/\s+/).length * 0.38));
    const t1 = t0 + dur;
    const label = M.newObject('text', { name: `“${text.slice(0, 18)}”`, props: { text: wrap(text, 20) } });
    label.font = { size: 40, weight: 700, family: '"Trebuchet MS", sans-serif', color: L.INK, align: 'center' };
    const lay = S.render.boundsOf(label, M.evalCtx(scene(), t0));
    const w = lay[2] - lay[0] + 110, h = lay[3] - lay[1] + 80;
    const bx = U.clamp(c.head.x + c.facing * (w / 2 + 20), w / 2 + 20, project().width - w / 2 - 20);
    const by = Math.max(h / 2 + 30, c.head.y - ch.char.lengths.head * c.scale * 0.5 - h / 2 - 50);
    const bubble = L.makeProp('bubble', bx, by + 14, { name: `${ch.name} says` });
    Object.assign(bubble.props, { scaleX: w / 500, scaleY: h / 210, flip: c.facing < 0 });
    Object.assign(label.props, { x: bx, y: by - 8 });
    for (const o of [bubble, label]) {
      o.props.opacity = 0;
      M.upsertKey(o, 'opacity', 0, 0, 'hold'); M.upsertKey(o, 'opacity', t0, 1, 'hold'); M.upsertKey(o, 'opacity', t1, 0, 'hold');
      scene().objects.push(o);
    }
    const shapes = ['open', 'small', 'wide', 'mm', 'o', 'small', 'open', 'closed'];
    for (let t = t0, i = 0; t < t1 - 2; t += 3, i++) K(ch, 'mouth', t, shapes[(i * 5 + text.length) % shapes.length]);
    K(ch, 'mouth', t1 - 1, 'auto');
    return t1;
  }

  // --- camera ---------------------------------------------------------------------------------

  function cameraTo(view, t0, seconds, cut) {
    const cam = scene().camera, t1 = cut ? t0 : t0 + sec(seconds || 2);
    for (const prop of ['x', 'y', 'zoom']) {
      if (view[prop] == null) continue;
      if (cut && t0 > 0) K(cam, prop, t0 - 1, V(cam, prop, t0 - 1));
      else hold(cam, [prop], t0, 'inout');
      K(cam, prop, t1, U.round(view[prop], 2));
    }
    return t1;
  }

  function shake(t0, seconds) {
    const cam = scene().camera, n = sec(seconds || 0.6), x = V(cam, 'x', t0), y = V(cam, 'y', t0);
    hold(cam, ['x', 'y'], t0, 'linear');
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    for (let t = t0 + 2; t < t0 + n; t += 2) { const k = 1 - (t - t0) / n; K(cam, 'x', t, U.round(x + rnd() * 44 * k, 1), 'linear'); K(cam, 'y', t, U.round(y + rnd() * 44 * k, 1), 'linear'); }
    K(cam, 'x', t0 + n, x); K(cam, 'y', t0 + n, y);
    return t0 + n;
  }

  // Mirror a character's x keys onto the camera from t0 onwards, keeping the framing it has at t0.
  function follow(ch, t0) {
    const cam = scene().camera, offset = V(cam, 'x', t0) - V(ch, 'x', t0);
    hold(cam, ['x'], t0, 'linear');
    cam.tracks.x = cam.tracks.x.filter((k) => k.t <= t0);
    for (const k of ch.tracks.x || []) if (k.t > t0) K(cam, 'x', k.t, U.round(k.v + offset, 1), k.ease);
  }

  // --- building the set ---------------------------------------------------------------------------

  const SLOTS = { 'far left': 0.08, left: 0.24, center: 0.5, right: 0.76, 'far right': 0.92 };
  const slotX = (slot) => (slot === 'off left' ? -260 : slot === 'off right' ? project().width + 260 : project().width * (SLOTS[slot] ?? 0.5));

  function uniqueName(name) {
    const names = new Set(scene().objects.map((o) => o.name.toLowerCase()));
    if (!names.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!names.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  }

  // free x positions, so actors added without a position do not stack up
  function freeSlot() {
    const taken = scene().objects.filter((o) => o.type === 'character').map((o) => o.props.x);
    return ['center', 'left', 'right', 'far left', 'far right'].find((s) => taken.every((x) => Math.abs(x - slotX(s)) > 200)) || 'center';
  }

  function addCharacter(o) {
    const ch = L.makeCharacter(o.preset || 'nadim', slotX(o.slot || freeSlot()), floorY());
    ch.name = uniqueName(o.name || ch.name);
    styleCharacter(ch, o);
    ch.props.scaleX = ch.props.scaleY = o.size || 1.2;   // sized for the library's sets
    ch.props.y = floorY() - S.rig.standingHeight(ch.char) * ch.props.scaleY;
    const slot = o.slot || '';
    ch.props.flip = o.facing ? o.facing === 'left' : slot.includes('right');
    scene().objects.push(ch);
    return ch;
  }

  function styleCharacter(ch, o) {
    const c = ch.char;
    Object.assign(c.colors, o.colors || {});
    for (const key of ['hair', 'facial', 'headShape', 'sleeves', 'style', 'glasses', 'brows', 'tie', 'apron', 'outfit', 'print', 'chain', 'tattoo', 'patch', 'collar', 'jacket', 'lanyard', 'belt', 'bracelet', 'braceletSide']) if (o[key]) c[key] = o[key];
    const k = o.build || {};
    if (k.height) for (const n of ['spine', 'upperLeg', 'lowerLeg', 'upperArm', 'lowerArm']) c.lengths[n] = U.round(c.lengths[n] * k.height, 1);
    if (k.width) for (const n of ['shoulder', 'waist', 'arm', 'leg', 'neck']) c.widths[n] = U.round(c.widths[n] * k.width, 1);
    if (k.head) c.lengths.head = U.round(c.lengths.head * k.head, 1);
    if (k.height) ch.props.y = floorY() - S.rig.standingHeight(c) * (ch.props.scaleY || 1);
  }

  const FLOATING = { cloud: [0.18, 0.25], sun: [0.16, 0.1], frame: [0.3, 1], bubble: [0.25, 1] };

  function addProp(kind, o = {}) {
    const list = scene().objects, P = project();
    const prop = L.makeProp(kind, slotX(o.slot || 'center'), floorY());
    prop.name = uniqueName(o.name || prop.name);
    let index = list.length;
    if (FLOATING[kind]) {
      prop.props.y = P.height * FLOATING[kind][0];
      prop.depth = FLOATING[kind][1];
      // sky things sit behind the set, in front of the sky itself
      if (prop.depth < 0.9) { const i = list.findIndex((x) => x.depth >= 0.9); index = i < 0 ? list.length : i; }
    }
    // furniture stands behind the cast unless told otherwise
    if (!FLOATING[kind] && !o.front) { const i = list.findIndex((x) => x.type === 'character'); if (i >= 0) index = i; }
    if (o.on) {
      const s = info(o.on, 0), side = o.slot && o.slot.includes('left') ? -0.4 : o.slot && o.slot.includes('right') ? 0.4 : 0;
      prop.props.x = U.round(s.cx + (s.right - s.left) * side);
      prop.props.y = U.round(s.top + 4);
      index = list.indexOf(o.on) + 1;
    } else if (o.near) {
      const s = info(o.near, 0), side = o.side === 'left' ? -1 : 1, half = (prop.bounds[2] - prop.bounds[0]) / 2;
      prop.props.x = U.round(side < 0 ? s.left - half - 30 : s.right + half + 30);
      index = list.indexOf(o.near) + (o.behind ? 0 : 1);
      if (o.front) index = list.length;
    }
    if (o.layer === 'foreground') { if (!o.slot) prop.props.x = slotX('far left'); prop.depth = 1.5; prop.props.scaleX = prop.props.scaleY = 1.8; prop.props.y = P.height + 260; index = list.length; }
    if (o.layer === 'background' && !FLOATING[kind]) { prop.depth = 0.85; prop.props.scaleX = prop.props.scaleY = 0.8; const i = list.findIndex((x) => x.type === 'character'); index = i < 0 ? index : i; }
    if (o.size) { prop.props.scaleX *= o.size; prop.props.scaleY *= o.size; }
    if (o.color) L.recolor(prop, o.color);
    list.splice(index, 0, prop);
    return prop;
  }

  function addText(text, o = {}) {
    const P = project();
    const obj = M.newObject('text', { name: uniqueName(o.name || 'Title'), props: { text, x: slotX(o.slot || 'center'), y: P.height * (o.low ? 0.86 : 0.16) } });
    obj.depth = 0;   // glued to the lens, like a title should be
    if (o.color) obj.font.color = o.color;
    if (o.size) obj.font.size = Math.round(obj.font.size * o.size);
    scene().objects.push(obj);
    return obj;
  }

  function remove(obj) {
    const sc = scene();
    sc.objects = sc.objects.filter((o) => o !== obj);
    for (const o of sc.objects) {
      if (o.props.attach && o.props.attach.id === obj.id) o.props.attach = null;
      (o.tracks.attach || []).forEach((k) => { if (k.v && k.v.id === obj.id) k.v = null; });
    }
  }

  function clearScene() {
    const sc = scene();
    sc.objects = []; sc.audio = []; sc.markers = [];
    sc.camera = M.newCamera(project());
    sc.bg = '#f4ecdf';
    delete sc.floorY;
  }

  // Change the frame format, keeping every camera and object centred on the same part of the set.
  function setFormat(w, h) {
    const P = project(), dx = (w - P.width) / 2, dy = (h - P.height) / 2;
    const shift = (obj, prop, d) => { obj.props[prop] += d; (obj.tracks[prop] || []).forEach((k) => { k.v += d; }); };
    P.width = w; P.height = h;
    for (const sc of P.scenes) {
      shift(sc.camera, 'x', dx); shift(sc.camera, 'y', dy);
      if (sc.floorY) sc.floorY += dy;
      for (const o of sc.objects) {
        if (!o.props.attach) { shift(o, 'x', dx); shift(o, 'y', dy); }
        for (const prop of ['pinL', 'pinR']) {
          if (o.props[prop]) { o.props[prop].x += dx; o.props[prop].y += dy; }
          (o.tracks[prop] || []).forEach((k) => { if (k.v) { k.v.x += dx; k.v.y += dy; } });
        }
      }
    }
    S.state.view.fitted = true;
  }

  const LOOKS = {
    night: { tint: '#1d2f7a', tintAmount: 0.75, vignette: 0.55 }, sunset: { tint: '#ff7a3c', tintAmount: 0.5, vignette: 0.3 },
    warm: { tint: '#ffb070', tintAmount: 0.4 }, cold: { tint: '#6fa8ff', tintAmount: 0.4 }, noir: { tint: '#777777', tintAmount: 0.9, vignette: 0.6, grain: 0.35 },
    clean: { tintAmount: 0, grain: 0, vignette: 0 }, day: { tintAmount: 0, vignette: 0.22 },
  };

  S.actions = {
    sec, floorY, K, V, hold, tween, info, held, face, turnTo, reach, carryPoint, release, standPoint, bendTo, straighten, clip, sound,
    walkTo, surfaceUnder, pickUp, putDown, drop, throwIt, drink, lookAt, emote, gesture, pointAt, say,
    cameraTo, shake, follow, slotX, addCharacter, styleCharacter, addProp, addText, remove, clearScene, setFormat, LOOKS,
  };
})(window.Studio);
