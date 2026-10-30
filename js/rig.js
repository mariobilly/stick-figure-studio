'use strict';
// ---------------------------------------------------------------------------
// Rig: the stick-figure skeleton that hides underneath every character
// ---------------------------------------------------------------------------
// Characters face right (+x); flip the object to face left. "L" limbs are the
// far side of the body (drawn behind by default), "R" limbs the near side.

(function (S) {
  const U = S.util;
  const DEG = U.DEG;

  // [name, parent, length key, where along the parent it attaches, rest world angle (0 = right, 90 = down)]
  // Parents must be listed before their children. A null parent attaches to the root (hip).
  const BONES = [
    ['spine',     null,        'spine',    1,   -90],
    ['head',      'spine',     'head',     1,   -90],
    ['upperArmL', 'spine',     'upperArm', 0.9, 100],
    ['lowerArmL', 'upperArmL', 'lowerArm', 1,    92],
    ['handL',     'lowerArmL', 'hand',     1,    92],
    ['upperArmR', 'spine',     'upperArm', 0.9,  84],
    ['lowerArmR', 'upperArmR', 'lowerArm', 1,    78],
    ['handR',     'lowerArmR', 'hand',     1,    78],
    ['upperLegL', null,        'upperLeg', 1,    96],
    ['lowerLegL', 'upperLegL', 'lowerLeg', 1,    97],
    ['footL',     'lowerLegL', 'foot',     1,     0],
    ['upperLegR', null,        'upperLeg', 1,    84],
    ['lowerLegR', 'upperLegR', 'lowerLeg', 1,    88],
    ['footR',     'lowerLegR', 'foot',     1,     0],
  ];
  const BONE_NAMES = BONES.map((b) => b[0]);
  const PARENT = Object.fromEntries(BONES.map((b) => [b[0], b[1]]));
  const REST_WORLD = Object.fromEntries(BONES.map((b) => [b[0], b[4]]));

  const FACE_PROPS = {
    expression: 'neutral', mouth: 'auto', eyes: 'auto', lookX: 0, lookY: 0,
    view: 'side',   // side (three-quarter profile) | front (facing the camera)
    handL: 'relaxed', handR: 'relaxed', pinL: null, pinR: null,
    zArmL: 'back', zArmR: 'front', zLegL: 'back', zLegR: 'front',
  };

  function defaultCharacter() {
    return {
      style: 'full',                 // full | stick
      lengths: { spine: 150, head: 88, upperArm: 84, lowerArm: 76, hand: 26, upperLeg: 112, lowerLeg: 108, foot: 46 },
      widths: { shoulder: 46, waist: 40, arm: 16, leg: 21, neck: 13 },
      colors: { skin: '#e2a97e', hair: '#2a1d1a', shirt: '#d9603b', pants: '#1f2a44', shoes: '#1f1b2e', outline: '#1f1b2e', eyes: '#1f1b2e', glasses: '#2b2b33' },
      outline: 5,
      sleeves: 'long',               // long | short | none
      hair: 'short',                 // short | long | bun | curly | wild | bald
      facial: 'none',                // none | mustache | beard | full
      glasses: 'none',               // none | round | square | bold
      brows: 'normal',               // thin | normal | thick
      headShape: 'round',            // round | oval | square
      shadow: true,
      art: {},                       // bone name -> { asset, scale, ox, oy, rot }
    };
  }

  // Pose spec in world degrees -> the parent-relative props the rig stores.
  // Bones left out of the spec keep their rest direction.
  function relFromWorld(world) {
    const out = {};
    for (const name of BONE_NAMES) {
      const w = world[name] ?? REST_WORLD[name];
      const parent = PARENT[name];
      const pw = parent ? (world[parent] ?? REST_WORLD[parent]) : 0;
      out['b.' + name] = U.normDeg(w - pw);
    }
    return out;
  }

  const restProps = () => relFromWorld({});

  // Two-bone analytic IK. Returns world angles (radians) for both bones.
  // bend = +1 or -1 picks which side the middle joint folds towards.
  function solveIK(ax, ay, l1, l2, tx, ty, bend) {
    const dx = tx - ax, dy = ty - ay;
    const dist = Math.hypot(dx, dy);
    const d = U.clamp(dist, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
    const base = Math.atan2(dy, dx);
    const cosA = U.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const a1 = base + bend * Math.acos(cosA);
    const jx = ax + Math.cos(a1) * l1, jy = ay + Math.sin(a1) * l1;
    const ex = ax + Math.cos(base) * d, ey = ay + Math.sin(base) * d;
    return { a1, a2: Math.atan2(ey - jy, ex - jx) };
  }

  function place(bone, sx, sy) {
    bone.sx = sx;
    bone.sy = sy;
    bone.ex = sx + Math.cos(bone.a) * bone.len;
    bone.ey = sy + Math.sin(bone.a) * bone.len;
  }

  // Forward kinematics from the keyed angles, then pinned feet pull their legs
  // back into place so a planted foot never slides while the hips move.
  function computePose(obj, ctx) {
    const L = obj.char.lengths, W = obj.char.widths;
    const b = {};
    // Facing the camera, the same keyed angles are read on a different body plan: arms hang from either
    // shoulder, legs stand side by side, and the forward/back swing of the legs is foreshortened.
    const front = ctx.P(obj, 'view') === 'front';
    const raw = {};
    for (const [name, parent, lenKey, at] of BONES) {
      const p = parent ? b[parent] : null;
      raw[name] = (parent ? raw[parent] : 0) + (ctx.P(obj, 'b.' + name) || 0) * DEG;
      const bone = { a: raw[name], len: L[lenKey] };
      let sx = p ? p.sx + (p.ex - p.sx) * at : 0, sy = p ? p.sy + (p.ey - p.sy) * at : 0;
      if (front) {
        const side = name.endsWith('L') ? -1 : 1;
        if (/Leg/.test(name)) bone.a = Math.PI / 2 + U.normDeg((raw[name] - Math.PI / 2) / DEG) * DEG * 0.3;
        if (name.startsWith('foot')) { bone.a = (90 - side * 20) * DEG; bone.len *= 0.1; }   // toes point at the camera: the sole stays on the same floor line
        if (name.startsWith('upperArm')) { sx += -Math.sin(p.a) * W.shoulder * 0.98 * side; sy += Math.cos(p.a) * W.shoulder * 0.98 * side; }
        if (name.startsWith('upperLeg')) sx += W.waist * 0.52 * side;
      }
      place(bone, sx, sy);
      b[name] = bone;
    }

    for (const side of ['L', 'R']) {
      const pin = ctx.P(obj, 'pin' + side);
      if (!pin) continue;
      const inv = ctx.matrix(obj).inverse();
      const t = U.apply(inv, pin.x, pin.y);
      const upper = b['upperLeg' + side], lower = b['lowerLeg' + side], foot = b['foot' + side];
      const ik = solveIK(upper.sx, upper.sy, upper.len, lower.len, t.x, t.y, -1);   // knees fold forwards
      upper.a = ik.a1; place(upper, upper.sx, upper.sy);
      lower.a = ik.a2; place(lower, upper.ex, upper.ey);
      const c = Math.cos(pin.a || 0), s = Math.sin(pin.a || 0);
      foot.a = Math.atan2(inv.b * c + inv.d * s, inv.a * c + inv.c * s);
      place(foot, lower.ex, lower.ey);
    }
    return { b, front };
  }

  // Props that put the end of a limb at a target (character-local coordinates).
  // limb: 'Arm' | 'Leg'. Keeps the joint folding the way it currently does.
  function ikProps(pose, limb, side, tx, ty, bend) {
    const upper = pose.b['upper' + limb + side], lower = pose.b['lower' + limb + side];
    if (bend == null) {
      const cross = Math.sin(lower.a - upper.a);
      bend = Math.abs(cross) < 0.02 ? (limb === 'Leg' ? -1 : 1) : -Math.sign(cross);
    }
    const ik = solveIK(upper.sx, upper.sy, upper.len, lower.len, tx, ty, bend);
    const parent = PARENT['upper' + limb + side];
    const pa = parent ? pose.b[parent].a : 0;
    return {
      ['b.upper' + limb + side]: U.round(U.normDeg((ik.a1 - pa) / DEG), 3),
      ['b.lower' + limb + side]: U.round(U.normDeg((ik.a2 - ik.a1) / DEG), 3),
    };
  }

  // Lowest point of the feet below the hip in the rest pose: used to stand a character on a floor line.
  function standingHeight(char) {
    const L = char.lengths;
    const drop = Math.sin(REST_WORLD.upperLegR * DEG) * L.upperLeg + Math.sin(REST_WORLD.lowerLegR * DEG) * L.lowerLeg;
    return drop + L.foot * 0.36;
  }

  function localBounds(pose, char) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const bone of Object.values(pose.b)) {
      x0 = Math.min(x0, bone.sx, bone.ex); x1 = Math.max(x1, bone.sx, bone.ex);
      y0 = Math.min(y0, bone.sy, bone.ey); y1 = Math.max(y1, bone.sy, bone.ey);
    }
    const pad = Math.max(char.widths.shoulder, char.lengths.head / 2);
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad * 0.5];
  }

  S.rig = {
    BONES, BONE_NAMES, PARENT, REST_WORLD, FACE_PROPS,
    defaultCharacter, relFromWorld, restProps, solveIK, computePose, ikProps, standingHeight, localBounds,
  };
})(window.Studio);
