'use strict';
// ---------------------------------------------------------------------------
// Character drawing: the artwork the audience sees on top of the rig
// ---------------------------------------------------------------------------
// Each limb is drawn as one group: every part is stroked in the outline colour
// first and filled afterwards, so joints merge into a single clean silhouette.

(function (S) {
  const U = S.util;
  const TAU = Math.PI * 2;

  // bn/bf: near/far brow tilt (degrees, + = inner end down), rn/rf: brow raise, eye: openness
  const EXPRESSIONS = {
    neutral:    { bn: 0,   bf: 0,   rn: 0,     rf: 0,    eye: 1,    mouth: 'closed' },
    happy:      { bn: -8,  bf: 8,   rn: 0.04,  rf: 0.04, eye: 0.85, mouth: 'smile' },
    delighted:  { bn: -10, bf: 10,  rn: 0.1,   rf: 0.1,  eye: 1.05, mouth: 'grin' },
    sad:        { bn: -20, bf: 20,  rn: 0.02,  rf: 0.02, eye: 0.85, mouth: 'frown' },
    angry:      { bn: 22,  bf: -22, rn: -0.07, rf: -0.07, eye: 0.75, mouth: 'frown' },
    surprised:  { bn: -6,  bf: 6,   rn: 0.17,  rf: 0.17, eye: 1.35, mouth: 'o' },
    scared:     { bn: -22, bf: 22,  rn: 0.13,  rf: 0.13, eye: 1.3,  mouth: 'open' },
    suspicious: { bn: 16,  bf: 8,   rn: -0.08, rf: 0.1,  eye: 0.5,  mouth: 'flat' },
    smug:       { bn: -4,  bf: -12, rn: 0,     rf: 0.09, eye: 0.65, mouth: 'smirk' },
  };
  const MOUTHS = ['auto', 'closed', 'smile', 'grin', 'frown', 'flat', 'smirk', 'mm', 'small', 'open', 'o', 'wide'];
  const EYES = ['auto', 'open', 'wide', 'half', 'closed'];
  const HANDS = ['relaxed', 'open', 'fist', 'grip', 'point'];

  function capsule(x1, y1, r1, x2, y2, r2) {
    const p = new Path2D();
    const a = Math.atan2(y2 - y1, x2 - x1);
    p.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
    p.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
    p.closePath();
    return p;
  }

  // A path authored in a bone's own frame (origin at its start, +x along it), moved into character space.
  function alongBone(bone, build) {
    const local = new Path2D();
    build(local, bone.len);
    const out = new Path2D();
    out.addPath(local, new DOMMatrix().translateSelf(bone.sx, bone.sy).rotateSelf(bone.a / U.DEG));
    return out;
  }

  function handPath(bone, shape) {
    return alongBone(bone, (p, L) => {
      if (shape === 'fist' || shape === 'grip' || shape === 'point') {
        p.arc(L * 0.5, 0, L * 0.58, 0, TAU);
        if (shape === 'grip') p.addPath(capsule(L * 0.2, -L * 0.45, L * 0.2, L * 0.75, -L * 0.62, L * 0.18));
        if (shape === 'point') p.addPath(capsule(L * 0.7, -L * 0.12, L * 0.19, L * 1.75, -L * 0.12, L * 0.16));
      } else {
        const open = shape === 'open';
        p.ellipse(L * 0.62, 0, L * (open ? 0.82 : 0.7), L * (open ? 0.5 : 0.42), 0, 0, TAU);
        p.addPath(capsule(L * 0.25, -L * 0.3, L * 0.18, L * (open ? 0.8 : 0.6), -L * (open ? 0.85 : 0.55), L * 0.16));
      }
    });
  }

  const footPath = (bone) => alongBone(bone, (p, L) => {
    p.addPath(capsule(-L * 0.12, 0, L * 0.36, L, L * 0.08, L * 0.27));
  });

  function drawArt(c, bone, name, spec, img) {
    const scale = spec.scale || 1;
    c.save();
    c.translate(bone.sx, bone.sy);
    if (name.startsWith('foot')) {
      // shoes are drawn pointing right
      c.rotate(bone.a + (spec.rot || 0) * U.DEG);
      const w = bone.len * 1.5 * scale, h = w * img.height / img.width;
      c.drawImage(img, -bone.len * 0.35 + (spec.ox || 0), -h / 2 + (spec.oy || 0), w, h);
    } else {
      const upright = name === 'spine' || name === 'head';   // drawn the right way up; limbs are drawn hanging down
      c.rotate(bone.a + (upright ? Math.PI / 2 : -Math.PI / 2) + (spec.rot || 0) * U.DEG);
      const h = bone.len * 1.2 * scale, w = h * img.width / img.height;
      const top = upright ? -bone.len - (h - bone.len) / 2 : -(h - bone.len) / 2;
      c.drawImage(img, -w / 2 + (spec.ox || 0), top + (spec.oy || 0), w, h);
    }
    c.restore();
  }

  function drawGroup(c, ch, items) {
    const vector = items.filter((it) => it.path);
    if (ch.outline > 0) {
      c.strokeStyle = ch.colors.outline;
      c.lineWidth = ch.outline * 2;
      c.lineJoin = 'round';
      for (const it of vector) c.stroke(it.path);
    }
    for (const it of items) {
      if (it.path) { c.fillStyle = it.fill; c.fill(it.path); }
      else drawArt(c, it.bone, it.name, it.spec, it.img);
    }
  }

  // ---------------------------------------------------------------------------
  // Head and face, drawn in the head's own frame (facing +x, up = -y)
  // ---------------------------------------------------------------------------

  function drawMouth(c, shape, r, ink, lw, mx = 0.5 * r, hw = 0.19 * r) {
    const my = 0.58 * r;
    c.lineWidth = lw;
    c.strokeStyle = ink;
    c.lineCap = 'round';
    c.beginPath();
    const line = (y0, cy, y1, k = 1) => {
      c.moveTo(mx - hw * k, my + y0 * r);
      c.quadraticCurveTo(mx, my + cy * r, mx + hw * k, my + y1 * r);
      c.stroke();
    };
    const dark = (rx, ry, dy) => {
      c.ellipse(mx, my + dy * r, rx * r, ry * r, 0, 0, TAU);
      c.fillStyle = '#5b1a24';
      c.fill();
      c.save();
      c.clip();
      c.beginPath();
      c.ellipse(mx, my + (dy + ry * 0.9) * r, rx * r * 0.8, ry * r * 0.7, 0, 0, TAU);
      c.fillStyle = '#e0676d';
      c.fill();
      c.restore();
      c.beginPath();
      c.ellipse(mx, my + dy * r, rx * r, ry * r, 0, 0, TAU);
      c.stroke();
    };
    switch (shape) {
      case 'smile': line(-0.02, 0.24, -0.02); break;
      case 'frown': line(0.1, -0.1, 0.1); break;
      case 'flat': line(0.02, 0.02, 0); break;
      case 'smirk': line(0.05, 0.1, -0.1); break;
      case 'mm': line(0, 0.01, 0, 0.55); break;
      case 'small': dark(0.09, 0.06, 0.02); break;
      case 'open': dark(0.15, 0.17, 0.05); break;
      case 'o': dark(0.085, 0.11, 0.03); break;
      case 'grin':
        c.moveTo(mx - hw, my - 0.05 * r);
        c.lineTo(mx + hw, my - 0.05 * r);
        c.quadraticCurveTo(mx, my + 0.36 * r, mx - hw, my - 0.05 * r);
        c.fillStyle = '#ffffff';
        c.fill();
        c.stroke();
        break;
      case 'wide':
        c.roundRect(mx - hw, my - 0.07 * r, hw * 2, 0.17 * r, 0.06 * r);
        c.fillStyle = '#ffffff';
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(mx - hw, my + 0.015 * r);
        c.lineTo(mx + hw, my + 0.015 * r);
        c.lineWidth = lw * 0.5;
        c.stroke();
        break;
      default: line(0, 0.05, 0);
    }
  }

  function drawHead(c, ch, head, P, dark) {
    const r = head.len / 2;
    const col = ch.colors, ink = col.outline, ow = ch.outline;
    const lw = Math.max(2, r * 0.075);
    const art = ch.art.head && S.assets.image(ch.art.head.asset);
    if (art) { drawArt(c, head, 'head', ch.art.head, art); return; }

    c.save();
    c.translate((head.sx + head.ex) / 2, (head.sy + head.ey) / 2);
    c.rotate(head.a + Math.PI / 2);
    c.lineJoin = 'round';

    const strokeFill = (path, fill) => {
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow * 2; c.stroke(path); }
      c.fillStyle = fill;
      c.fill(path);
    };

    // [angle (0 = face front, -90 = top, 180 = back), distance, radius], all in head radii
    const blobs = (list) => list.map(([a, d, k]) => { const p = new Path2D(); p.arc(Math.cos(a * U.DEG) * d * r, Math.sin(a * U.DEG) * d * r, k * r, 0, TAU); return p; });
    const fillGroup = (paths, fill) => {
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow * 2; paths.forEach((p) => c.stroke(p)); }
      c.fillStyle = fill;
      paths.forEach((p) => c.fill(p));
    };

    // hair that falls behind the head
    if (ch.hair === 'wild') {
      // a big unruly mass: tall on top, wide at the sides, a little down the neck
      fillGroup(blobs([
        [172, 0.92, 0.46], [-165, 1.05, 0.52], [-135, 1.2, 0.58], [-104, 1.3, 0.6], [-74, 1.3, 0.56], [-48, 1.22, 0.46], [-26, 1.12, 0.3],
        [-150, 1.62, 0.34], [-122, 1.8, 0.36], [-92, 1.86, 0.34], [-64, 1.78, 0.32], [-40, 1.58, 0.26],
        [-172, 1.38, 0.3], [-108, 2.12, 0.2], [-138, 1.98, 0.18], [-56, 2.04, 0.17], [168, 1.22, 0.22],
      ]), col.hair);
    }
    if (ch.hair === 'long') strokeFill(capsule(-0.5 * r, -0.2 * r, 0.55 * r, -0.72 * r, 1.3 * r, 0.42 * r), col.hair);
    if (ch.hair === 'bun') { const p = new Path2D(); p.arc(-0.72 * r, -0.86 * r, 0.4 * r, 0, TAU); strokeFill(p, col.hair); }

    const skull = new Path2D();
    if (ch.headShape === 'oval') skull.ellipse(0, 0, r * 0.88, r * 1.06, 0, 0, TAU);
    else if (ch.headShape === 'square') skull.roundRect(-r * 0.92, -r, r * 1.84, r * 2, r * 0.42);
    else skull.arc(0, 0, r, 0, TAU);
    const nose = new Path2D();
    const specs = ch.glasses && ch.glasses !== 'none';
    nose.arc(r * (ch.headShape === 'oval' ? 0.86 : 0.95) - (specs ? 0.03 * r : 0), r * (specs ? 0.26 : 0.12), r * 0.14, 0, TAU);
    if (ow > 0) {
      c.strokeStyle = ink;
      c.lineWidth = ow * 2;
      c.stroke(skull);
      c.stroke(nose);
    }
    c.fillStyle = col.skin;
    c.fill(skull);
    c.fill(nose);

    // ear
    c.beginPath();
    c.arc(-0.42 * r, 0.12 * r, 0.17 * r, 0, TAU);
    c.fillStyle = U.shade(col.skin, 0.93);
    c.fill();
    c.lineWidth = lw * 0.7;
    c.strokeStyle = ink;
    c.stroke();

    const bearded = ch.facial === 'beard' || ch.facial === 'full';
    if (bearded) {
      const a0 = (ch.facial === 'full' ? 27 : 6) * U.DEG, R = r * 1.02;
      c.beginPath();
      if (ch.facial === 'full') {
        // follows the jaw from under the nose, round the chin, and up the sideburn to meet the hair
        c.arc(0, 0, R, a0, 128 * U.DEG);
        c.lineTo(-0.52 * r, 0.22 * r);
        c.lineTo(-0.48 * r, -0.34 * r);
        c.lineTo(-0.24 * r, -0.34 * r);
        c.quadraticCurveTo(-0.22 * r, 0.3 * r, 0.22 * r, 0.36 * r);
        c.quadraticCurveTo(0.6 * r, 0.3 * r, Math.cos(a0) * R, Math.sin(a0) * R);
      } else {
        c.arc(0, 0, R, 8 * U.DEG, 150 * U.DEG);
        c.quadraticCurveTo(0.1 * r, 0.25 * r, R * Math.cos(8 * U.DEG), R * Math.sin(8 * U.DEG));
      }
      c.fillStyle = col.hair;
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = ink;
      c.stroke();
      if (col.streak) {
        // a grey streak at the chin, kept inside the beard
        c.save();
        c.clip();
        c.beginPath();
        c.ellipse(0.42 * r, 0.98 * r, 0.24 * r, 0.16 * r, 0.5, 0, TAU);
        c.fillStyle = col.streak;
        c.fill();
        c.restore();
      }
    }

    // eyes and brows
    const ex = EXPRESSIONS[P('expression')] || EXPRESSIONS.neutral;
    const eyes = P('eyes');
    const open = eyes === 'closed' ? 0 : eyes === 'half' ? 0.5 : eyes === 'wide' ? 1.35 : eyes === 'open' ? 1 : ex.eye;
    const lookX = U.clamp(P('lookX') || 0, -1, 1), lookY = U.clamp(P('lookY') || 0, -1, 1);
    const ey = -0.12 * r;
    for (const [x, rx, ry, tilt, raise] of [[0.3, 0.13, 0.17, ex.bn, ex.rn], [0.76, 0.1, 0.16, ex.bf, ex.rf]]) {
      c.lineCap = 'round';
      c.strokeStyle = ink;
      if (open < 0.2) {
        c.beginPath();
        c.moveTo((x - rx) * r, ey);
        c.quadraticCurveTo(x * r, ey + ry * r * 0.8, (x + rx) * r, ey);
        c.lineWidth = lw;
        c.stroke();
      } else {
        c.beginPath();
        c.ellipse(x * r, ey, rx * r, ry * r * open, 0, 0, TAU);
        c.fillStyle = '#ffffff';
        c.fill();
        c.lineWidth = lw * 0.7;
        if (!ch.glasses || ch.glasses === 'none') c.stroke();
        c.save();
        c.clip();
        c.beginPath();
        const px = (x + rx * 0.18 + lookX * rx * 0.45) * r, py = ey + lookY * ry * r * 0.55;
        c.arc(px, py, rx * r * 0.62, 0, TAU);
        c.fillStyle = col.eyes || ink;
        c.fill();
        c.beginPath();
        c.arc(px, py, rx * r * 0.36, 0, TAU);
        c.fillStyle = ink;
        c.fill();
        c.restore();
      }
      c.save();
      c.translate(x * r, ey - (ry + 0.13 + raise) * r);
      c.rotate(tilt * U.DEG);
      c.beginPath();
      c.moveTo(-rx * r * 1.3, 0);
      c.lineTo(rx * r * 1.3, 0);
      c.lineWidth = lw * (ch.brows === 'thick' ? 2.3 : ch.brows === 'thin' ? 0.8 : 1.25);
      if (ch.brows === 'thick') c.strokeStyle = U.shade(col.hair, 0.8);
      c.stroke();
      c.restore();
    }

    if (ch.glasses && ch.glasses !== 'none') {
      const shades = ch.glasses === 'shades';
      const frame = shades ? ink : col.glasses || '#2b2b33', square = ch.glasses === 'square' || shades;
      const lenses = [[0.29, 0.27], [0.79, 0.215]];
      c.strokeStyle = frame;
      c.lineWidth = lw * (ch.glasses === 'bold' || shades ? 1.6 : 0.85);
      for (const [x, k] of lenses) {
        c.beginPath();
        if (square) c.roundRect((x - k) * r, ey - k * 0.8 * r, k * 2 * r, k * 1.6 * r, k * 0.35 * r); else c.arc(x * r, ey, k * r, 0, TAU);
        c.fillStyle = shades ? '#1d1b22' : 'rgba(255, 255, 255, 0.16)';
        c.fill();
        c.stroke();
        if (shades) {
          // a glint across each dark lens
          c.save();
          c.beginPath();
          c.moveTo((x - k * 0.5) * r, ey + k * 0.3 * r);
          c.lineTo((x + k * 0.1) * r, ey - k * 0.45 * r);
          c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          c.lineWidth = lw * 0.6;
          c.stroke();
          c.restore();
        }
      }
      c.beginPath();
      c.moveTo((lenses[0][0] + lenses[0][1]) * r, ey - 0.03 * r);
      c.lineTo((lenses[1][0] - lenses[1][1]) * r, ey - 0.03 * r);
      c.moveTo((lenses[0][0] - lenses[0][1]) * r, ey - 0.02 * r);
      c.lineTo(-0.4 * r, ey + 0.06 * r);   // the arm, back to the ear
      c.stroke();
    }

    const mouth = P('mouth');
    // on a dark beard the mouth is drawn in a light line so it still reads
    drawMouth(c, !mouth || mouth === 'auto' ? ex.mouth : mouth, r, bearded ? U.shade(col.skin, 1.5) : ink, lw);

    if (ch.facial === 'mustache' || ch.facial === 'goatee') {
      const goatee = ch.facial === 'goatee';
      c.beginPath();
      c.moveTo(0.27 * r, 0.37 * r);
      c.quadraticCurveTo(0.55 * r, (goatee ? 0.26 : 0.2) * r, 0.82 * r, 0.37 * r);
      c.strokeStyle = col.hair;
      c.lineWidth = (goatee ? 0.08 : 0.12) * r;
      c.lineCap = 'round';
      c.stroke();
      if (goatee) {
        // thin lines from the moustache corners down to a trimmed chin beard
        c.beginPath();
        c.moveTo(0.3 * r, 0.42 * r); c.lineTo(0.36 * r, 0.7 * r);
        c.lineWidth = 0.05 * r;
        c.stroke();
        const chin = new Path2D();
        chin.moveTo(0.34 * r, 0.7 * r);
        chin.quadraticCurveTo(0.5 * r, 0.66 * r, 0.76 * r, 0.7 * r);
        chin.arc(0, 0, r * 1.03, Math.atan2(0.72, 0.72), Math.atan2(0.99, 0.16));
        chin.quadraticCurveTo(0.24 * r, 0.86 * r, 0.34 * r, 0.7 * r);
        chin.closePath();
        c.fillStyle = col.hair;
        c.fill(chin);
        c.lineWidth = lw * 0.8;
        c.strokeStyle = ink;
        c.stroke(chin);
      }
    }

    // hair on top
    if (ch.hair === 'fade' || ch.hair === 'swept') {
      // fade: short faded sides under a solid swept-back top. swept: the same volume on top, full sides.
      const R = r * 1.04, a0 = -35 * U.DEG, a1 = 165 * U.DEG;
      const cap = new Path2D();
      cap.arc(0, 0, R, a0, a1, true);
      cap.quadraticCurveTo(-0.1 * r, -0.25 * r, Math.cos(a0) * R, Math.sin(a0) * R);
      cap.closePath();
      const fade = ch.hair === 'fade';
      c.fillStyle = fade ? U.mix(col.skin, col.hair, 0.3) : col.hair;
      c.fill(cap);
      if (!fade && ow > 0) { c.strokeStyle = ink; c.lineWidth = ow; c.stroke(cap); }
      // a quiff: highest over the forehead, swept back over the crown
      const k = fade ? 0.9 : 1.08;
      const outer = new Path2D();
      outer.moveTo(0.84 * r, -0.6 * r);
      outer.quadraticCurveTo(1.05 * r, -1.3 * k * r, 0.42 * r, -1.3 * k * r);
      outer.quadraticCurveTo(0.0, -1.32 * k * r, -0.45 * r, -1.14 * k * r);
      outer.quadraticCurveTo(-0.95 * r, -0.98 * k * r, -1.0 * r, -0.42 * r);
      const top = new Path2D(outer);
      top.quadraticCurveTo(-0.2 * r, -0.66 * r, 0.84 * r, -0.6 * r);
      top.closePath();
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow * 2; c.stroke(outer); }
      c.fillStyle = col.hair;
      c.fill(top);
      c.strokeStyle = U.shade(col.hair, 1.9);
      c.lineWidth = lw * 0.4;
      c.beginPath();
      c.moveTo(0.6 * r, -0.86 * r); c.quadraticCurveTo(0.2 * r, -1.12 * k * r, -0.3 * r, -1.05 * k * r);
      c.moveTo(0.3 * r, -0.78 * r); c.quadraticCurveTo(-0.05 * r, -0.98 * k * r, -0.5 * r, -0.9 * k * r);
      c.stroke();
    } else if (ch.hair === 'wild') {
      fillGroup(blobs([
        [-170, 0.96, 0.32], [-150, 1.02, 0.34], [-128, 1.08, 0.34], [-106, 1.12, 0.33], [-84, 1.14, 0.31], [-63, 1.16, 0.27], [-46, 1.16, 0.2],
        [-150, 0.7, 0.26], [-120, 0.78, 0.22], [176, 0.9, 0.26],
      ]), col.hair);
      c.strokeStyle = U.shade(col.hair, 1.3);
      c.lineWidth = lw * 0.55;
      c.lineCap = 'round';
      for (const [a, d, k, turn] of [[-150, 1.3, 0.17, 0], [-120, 1.55, 0.19, 2], [-88, 1.55, 0.17, 4], [-62, 1.45, 0.15, 1], [-104, 1.12, 0.13, 3], [-136, 1.0, 0.12, 5], [-74, 1.12, 0.11, 2.5]]) {
        c.beginPath();
        c.arc(Math.cos(a * U.DEG) * d * r, Math.sin(a * U.DEG) * d * r, k * r, turn, turn + 3.6);
        c.stroke();
      }
    } else if (ch.hair === 'curly') {
      const curls = [];
      for (let a = -45; a >= -195; a -= 25) {
        const p = new Path2D();
        p.arc(Math.cos(a * U.DEG) * r * 0.95, Math.sin(a * U.DEG) * r * 0.95, r * 0.33, 0, TAU);
        curls.push(p);
      }
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow * 2; curls.forEach((p) => c.stroke(p)); }
      c.fillStyle = col.hair;
      curls.forEach((p) => c.fill(p));
    } else if (ch.hair !== 'bald') {
      const R = r * 1.04, a0 = -35 * U.DEG, a1 = 165 * U.DEG;
      const cap = new Path2D();
      cap.arc(0, 0, R, a0, a1, true);
      cap.quadraticCurveTo(-0.1 * r, -0.25 * r, Math.cos(a0) * R, Math.sin(a0) * R);
      cap.closePath();
      c.fillStyle = col.hair;
      c.fill(cap);
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow; c.stroke(cap); }
    }

    if (dark) { c.globalAlpha = 0.2; c.fillStyle = '#000'; c.fill(skull); }
    c.restore();
  }

  // ---------------------------------------------------------------------------
  // Whole character
  // ---------------------------------------------------------------------------

  function drawStick(c, ch, pose) {
    c.strokeStyle = ch.colors.outline;
    c.fillStyle = ch.colors.outline;
    c.lineWidth = ch.widths.arm;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    for (const [name, bone] of Object.entries(pose.b)) {
      if (name === 'head') continue;
      c.moveTo(bone.sx, bone.sy);
      c.lineTo(bone.ex, bone.ey);
    }
    c.stroke();
    const h = pose.b.head;
    c.beginPath();
    c.arc((h.sx + h.ex) / 2, (h.sy + h.ey) / 2, h.len / 2, 0, TAU);
    c.fill();
  }

  // P(name) returns the character's evaluated property at the current frame.
  function drawCharacter(c, obj, pose, P) {
    const ch = obj.char, b = pose.b, col = ch.colors, W = ch.widths;
    if (pose.front && ch.style !== 'stick') { S.drawCharacterFront(c, obj, pose, P); return; }

    if (ch.shadow) {
      const fl = b.footL, fr = b.footR;
      const gy = Math.max(fl.sy, fr.sy) + ch.lengths.foot * 0.36;
      const gx = (fl.sx + fr.sx) / 2 + ch.lengths.foot * 0.3;
      c.beginPath();
      c.ellipse(gx, gy, Math.abs(fl.sx - fr.sx) / 2 + W.shoulder * 1.7, W.shoulder * 0.32, 0, 0, TAU);
      c.fillStyle = 'rgba(20, 12, 30, 0.2)';
      c.fill();
    }

    if (ch.style === 'stick') { drawStick(c, ch, pose); return; }

    const part = (name, path, fill) => {
      const spec = ch.art[name];
      const img = spec && S.assets.image(spec.asset);
      return img ? { bone: b[name], name, spec, img } : { path, fill };
    };

    const arm = (s, far) => {
      const tone = (hex) => (far ? U.shade(hex, 0.78) : hex);
      const ua = b['upperArm' + s], la = b['lowerArm' + s], sleeve = ch.jacket || col.shirt;
      return [
        part('upperArm' + s, capsule(ua.sx, ua.sy, W.arm, ua.ex, ua.ey, W.arm * 0.92), tone(ch.sleeves === 'none' && !ch.jacket ? col.skin : sleeve)),
        part('lowerArm' + s, capsule(la.sx, la.sy, W.arm * 0.92, la.ex, la.ey, W.arm * 0.74), tone(ch.sleeves === 'long' || ch.jacket ? sleeve : col.skin)),
        part('hand' + s, handPath(b['hand' + s], P('hand' + s)), tone(col.skin)),
      ];
    };

    const leg = (s, far) => {
      const tone = (hex) => (far ? U.shade(hex, 0.78) : hex);
      const ul = b['upperLeg' + s], ll = b['lowerLeg' + s];
      return [
        part('upperLeg' + s, capsule(ul.sx, ul.sy, W.leg, ul.ex, ul.ey, W.leg * 0.84), tone(col.pants)),
        part('lowerLeg' + s, capsule(ll.sx, ll.sy, W.leg * 0.84, ll.ex, ll.ey, W.leg * 0.66), tone(ch.shorts ? col.skin : col.pants)),
        part('foot' + s, footPath(b['foot' + s]), tone(col.shoes)),
      ];
    };

    const isBack = (name) => P(name) === 'back';
    const sides = ['L', 'R'];

    for (const s of sides) if (isBack('zArm' + s)) { drawGroup(c, ch, arm(s, true)); drawTattoo(c, ch, b, s); drawWrist(c, ch, b, s); }
    for (const s of sides) if (isBack('zLeg' + s)) drawGroup(c, ch, leg(s, true));
    for (const s of sides) if (!isBack('zLeg' + s)) drawGroup(c, ch, leg(s, false));

    const sp = b.spine, hd = b.head;
    const torsoItems = [
      { path: capsule(sp.ex, sp.ey, W.neck, (hd.sx + hd.ex) / 2, (hd.sy + hd.ey) / 2, W.neck), fill: U.shade(col.skin, 0.9) },
      part('spine', capsule(sp.sx, sp.sy, W.waist, sp.sx + (sp.ex - sp.sx) * 0.86, sp.sy + (sp.ey - sp.sy) * 0.86, W.shoulder), col.shirt),
    ];
    // a gi jacket hangs below the belt over the top of the thighs
    if (ch.outfit === 'gi' && !ch.art.spine) torsoItems.push({ path: inSpine(sp, (p, L) => p.roundRect(-0.17 * L, -W.waist * 1.02, 0.3 * L, W.waist * 2.12, W.waist * 0.4)), fill: col.shirt });
    // a suit jacket: the body in the jacket's colour, its hem over the hips (the shirt is drawn back in by drawWardrobeSide)
    if (ch.jacket && !ch.art.spine) {
      torsoItems[1].fill = ch.jacket;
      torsoItems.push({ path: inSpine(sp, (p, L) => p.roundRect(-0.2 * L, -W.waist * 1.04, 0.34 * L, W.waist * 2.08, W.waist * 0.3)), fill: ch.jacket });
    }
    drawGroup(c, ch, torsoItems);
    if (!ch.art.spine) drawWardrobeSide(c, ch, sp, W);

    drawHead(c, ch, hd, P, false);
    for (const s of sides) if (!isBack('zArm' + s)) { drawGroup(c, ch, arm(s, false)); drawTattoo(c, ch, b, s); drawWrist(c, ch, b, s); }
  }

  // A path authored in the spine's frame (x runs up the spine from the hip, +y is the chest side).
  function inSpine(sp, build) {
    const local = new Path2D();
    build(local, sp.len);
    const out = new Path2D();
    out.addPath(local, new DOMMatrix().translateSelf(sp.sx, sp.sy).rotateSelf(sp.a / U.DEG));
    return out;
  }

  // A superhero-tee shield centred on (0, 0), upright: a five-sided badge, red rim, yellow inside, the letter in ch.shield.
  function drawShield(c, ch, w, thin) {
    const col = ch.colors, h = w * 0.8, rim = col.shieldRim || '#d8333b';
    const badge = (k) => { c.beginPath(); c.moveTo(-0.5 * w * k, -0.22 * h * k); c.lineTo(-0.3 * w * k, -0.5 * h * k); c.lineTo(0.3 * w * k, -0.5 * h * k); c.lineTo(0.5 * w * k, -0.22 * h * k); c.lineTo(0, 0.5 * h * k); c.closePath(); };
    badge(1); c.fillStyle = rim; c.fill(); c.strokeStyle = col.outline; c.lineWidth = thin; c.stroke();
    badge(0.74); c.fillStyle = col.shieldFill || '#f2c230'; c.fill();
    c.font = `900 ${h * 0.46}px "Arial Black", Impact, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = rim;
    c.fillText(String(ch.shield), 0, -0.08 * h);
  }

  // Clothing details drawn over the torso in side (three-quarter) view.
  function drawWardrobeSide(c, ch, sp, W) {
    const col = ch.colors, ink = col.outline, L = sp.len;
    const thin = Math.max(2, ch.outline * 0.6);
    c.save();
    c.translate(sp.sx, sp.sy);
    c.rotate(sp.a);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const shape = (build, fill, sw = thin) => { c.beginPath(); build(); c.fillStyle = fill; c.fill(); c.strokeStyle = ink; c.lineWidth = sw; c.stroke(); };
    const band = (pts, w, fill) => {
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = ink; c.lineWidth = w + thin * 2; c.stroke();
      c.strokeStyle = fill; c.lineWidth = w; c.stroke();
    };
    const S1 = W.shoulder, Wa = W.waist;

    if (ch.jacket) {
      // worn open: the shirt shows down the chest side, the belt and trousers below it, all clipped to the jacket's outline
      const edge = (x) => Wa + (S1 - Wa) * U.clamp(x / (0.86 * L), 0, 1);
      const inner = [[1.1 * L, 0.3 * S1], [0.5 * L, 0.64 * edge(0.5 * L)], [0.16 * L, 0.68 * Wa], [-0.22 * L, 0.72 * Wa]];
      const body = capsule(0, 0, Wa, 0.86 * L, 0, S1);
      body.roundRect(-0.2 * L, -Wa * 1.04, 0.34 * L, Wa * 2.08, Wa * 0.3);
      c.save();
      c.clip(body);
      // fill the open front (chest side of the jacket's edge) between x0 and x1 along the spine
      const fillPast = (x0, x1, fill) => {
        c.save(); c.beginPath(); c.rect(x0, -3 * S1, x1 - x0, 6 * S1); c.clip();
        c.beginPath(); c.moveTo(inner[0][0], inner[0][1]); inner.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(-0.22 * L, 3 * S1); c.lineTo(1.1 * L, 3 * S1); c.closePath();
        c.fillStyle = fill; c.fill();
        c.restore();
      };
      fillPast(0.16 * L, 0.9 * L, col.shirt);
      fillPast(0.06 * L, 0.16 * L, ch.belt || col.pants);
      fillPast(-0.22 * L, 0.06 * L, col.pants);
      // shirt buttons, belt buckle
      c.fillStyle = U.shade(col.shirt, 0.72);
      for (const k of [0.3, 0.46, 0.62]) { c.beginPath(); c.arc(k * L, 0.84 * edge(k * L), S1 * 0.035, 0, TAU); c.fill(); }
      if (ch.belt) shape(() => c.roundRect(0.075 * L, 0.76 * Wa, 0.07 * L, 0.16 * Wa, 3), col.buckle || '#c9ccd2', thin * 0.8);
      // the jacket's front edge
      c.beginPath(); inner.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = ink; c.lineWidth = thin; c.stroke();
      c.restore();
      // lanyard down the chest to a badge above the belt
      if (ch.lanyard) {
        band([[0.9 * L, 0.5 * S1], [0.62 * L, 0.78 * S1], [0.42 * L, 0.84 * Wa]], S1 * 0.09, ch.lanyard);
        c.save(); c.setLineDash([3, 5]); c.beginPath(); c.moveTo(0.88 * L, 0.52 * S1); c.lineTo(0.62 * L, 0.78 * S1); c.lineTo(0.44 * L, 0.84 * Wa);
        c.strokeStyle = 'rgba(255, 255, 255, 0.85)'; c.lineWidth = 1.6; c.stroke(); c.restore();
        drawBadge(c, ch, 0.34 * L, 0.86 * Wa, 0.15 * L, S1 * 0.3, thin, 0.8);
      }
      // the lapel along the opening, notched where it meets the collar
      shape(() => {
        c.moveTo(0.92 * L, 0.3 * S1); c.lineTo(0.5 * L, 0.64 * edge(0.5 * L)); c.lineTo(0.58 * L, 0.4 * S1);
        c.lineTo(0.72 * L, 0.2 * S1); c.lineTo(0.76 * L, 0.3 * S1); c.lineTo(0.84 * L, 0.1 * S1); c.lineTo(0.93 * L, 0.16 * S1); c.closePath();
      }, U.shade(ch.jacket, 1.3));
      // hip pocket flap
      shape(() => c.roundRect(-0.02 * L, -0.1 * Wa, 0.06 * L, 0.5 * Wa, 3), U.shade(ch.jacket, 1.25), thin * 0.8);
    }

    if (ch.collar) shape(() => { c.moveTo(0.88 * L, 0.12 * S1); c.lineTo(0.9 * L, 0.78 * S1); c.lineTo(0.74 * L, 0.5 * S1); c.closePath(); }, U.shade(col.shirt, 1.08));

    if (ch.outfit === 'gi') {
      const under = col.under || '#f4f1ea', belt = col.belt || '#f4f1ea', trim = col.trim || '#d8b04a';
      // the tee showing in the neck opening, then the lapel crossing the chest down to the belt
      shape(() => { c.moveTo(0.87 * L, 0.04 * S1); c.lineTo(0.87 * L, 0.72 * S1); c.lineTo(0.6 * L, 0.42 * S1); c.closePath(); }, under);
      band([[0.9 * L, 0.06 * S1], [0.55 * L, 0.5 * S1], [0.2 * L, 0.88 * Wa]], S1 * 0.2, U.shade(col.shirt, 1.35));
      // embroidery on the shoulder
      c.fillStyle = trim;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.roundRect(0.72 * L + i * 0.045 * L, -0.62 * S1, 0.03 * L, 0.36 * S1, 2); c.fill(); }
      // belt, rank bar, knot and tails
      shape(() => c.rect(0.08 * L, -Wa * 1.03, 0.1 * L, Wa * 2.06), belt);
      shape(() => c.rect(0.08 * L, -Wa * 0.7, 0.1 * L, Wa * 0.34), '#1d1b22');
      shape(() => { c.moveTo(0.15 * L, 0.86 * Wa); c.lineTo(-0.16 * L, 1.05 * Wa); c.lineTo(-0.18 * L, 0.84 * Wa); c.lineTo(0.1 * L, 0.66 * Wa); c.closePath(); }, belt);
      shape(() => { c.moveTo(0.14 * L, 0.9 * Wa); c.lineTo(-0.1 * L, 1.32 * Wa); c.lineTo(-0.14 * L, 1.16 * Wa); c.lineTo(0.09 * L, 0.74 * Wa); c.closePath(); }, belt);
      shape(() => { c.moveTo(-0.06 * L, 1.15 * Wa); c.lineTo(-0.1 * L, 1.32 * Wa); c.lineTo(-0.14 * L, 1.16 * Wa); c.lineTo(-0.1 * L, 1.0 * Wa); c.closePath(); }, '#1d1b22');
      shape(() => c.roundRect(0.1 * L, 0.72 * Wa, 0.08 * L, 0.36 * Wa, 4), belt);
    }

    if (ch.print) {
      // a chest print, seen at an angle: squeezed onto the front half of the torso
      const text = String(ch.print), fs = S1 * 0.42;
      c.save();
      c.translate(0.6 * L, 0.42 * S1);
      c.rotate(Math.PI / 2);
      c.scale(0.72, 1);
      c.font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
      c.textBaseline = 'middle';
      const widths = [...text].map((ch2) => c.measureText(ch2).width);
      let x = -widths.reduce((a, v) => a + v, 0) / 2;
      [...text].forEach((glyph, i) => {
        const accent = col.printAccent && (i === 0 || i === text.length - 1);
        c.fillStyle = accent ? col.printAccent : col.print || ink;
        c.fillText(glyph, x, 0);
        x += widths[i];
      });
      c.restore();
    }

    if (ch.shield) {
      // seen at an angle: squeezed onto the front half of the torso, like the print
      c.save();
      c.translate(0.6 * L, 0.42 * S1);
      c.rotate(Math.PI / 2);
      c.scale(0.72, 1);
      drawShield(c, ch, S1 * 0.9, thin);
      c.restore();
    }

    if (ch.patch) shape(() => c.roundRect(0.66 * L, 0.36 * S1, 0.1 * L, 0.32 * S1, 3), ch.patch);

    if (ch.chain) {
      c.beginPath();
      c.moveTo(0.93 * L, -0.25 * S1);
      c.quadraticCurveTo(0.66 * L, 0.2 * S1, 0.86 * L, 0.78 * S1);
      c.strokeStyle = U.shade(ch.chain, 0.6); c.lineWidth = 6; c.stroke();
      c.strokeStyle = ch.chain; c.lineWidth = 3.5; c.stroke();
      c.beginPath(); c.arc(0.72 * L, 0.36 * S1, S1 * 0.11, 0, TAU);
      c.fillStyle = ch.chain; c.fill(); c.strokeStyle = U.shade(ch.chain, 0.6); c.lineWidth = 2; c.stroke();
    }
    c.restore();
  }

  // An ID badge on a lanyard, centred on (x, y) in the spine's frame: white card, red band, photo and two text lines.
  function drawBadge(c, ch, x, y, h, w, thin, squeeze = 1) {
    const col = ch.colors, ink = col.outline, band = ch.lanyard || '#d23a3a';
    c.save();
    c.translate(x, y);
    c.scale(1, squeeze);
    c.fillStyle = '#8d8f96'; c.strokeStyle = ink; c.lineWidth = thin * 0.7;
    c.beginPath(); c.roundRect(h * 0.42, -w * 0.08, h * 0.2, w * 0.16, 2); c.fill(); c.stroke();
    c.beginPath(); c.roundRect(-h * 0.5, -w * 0.5, h, w, 3); c.fillStyle = col.badge || '#f4f1ea'; c.fill(); c.lineWidth = thin; c.stroke();
    c.fillStyle = band; c.fillRect(h * 0.24, -w * 0.5 + 1, h * 0.24, w - 2);
    c.fillStyle = '#c9a98c'; c.fillRect(-h * 0.2, w * 0.08, h * 0.36, w * 0.3);
    c.fillStyle = '#9a9ca3'; c.fillRect(-h * 0.06, -w * 0.38, h * 0.08, w * 0.4); c.fillRect(-h * 0.28, -w * 0.38, h * 0.08, w * 0.4);
    c.restore();
  }

  // Shirt cuff under a jacket sleeve, and a bracelet on one wrist (ch.braceletSide, default the near arm 'R').
  function drawWrist(c, ch, b, s) {
    const la = b['lowerArm' + s], w = ch.widths.arm, ink = ch.colors.outline;
    const cuff = ch.jacket, bracelet = ch.bracelet && (ch.braceletSide || 'R') === s;
    if (!cuff && !bracelet) return;
    c.save();
    c.translate(la.sx, la.sy);
    c.rotate(la.a);
    c.strokeStyle = ink;
    c.lineWidth = Math.max(2, ch.outline * 0.6);
    if (cuff) { c.beginPath(); c.roundRect(la.len * 0.9, -w * 0.72, la.len * 0.1, w * 1.44, 3); c.fillStyle = ch.colors.shirt; c.fill(); c.stroke(); }
    if (bracelet) {
      c.beginPath(); c.roundRect(la.len * 1.0, -w * 0.62, la.len * 0.07, w * 1.24, 3);
      c.fillStyle = ch.bracelet; c.fill(); c.lineWidth = 1.6; c.strokeStyle = U.shade(ch.bracelet, 0.55); c.stroke();
    }
    c.restore();
  }

  // Ink on the forearm: only shows where the sleeve leaves the skin bare.
  function drawTattoo(c, ch, b, s) {
    if (!ch.tattoo || ch.sleeves === 'long') return;
    if (ch.tattoo !== 'both' && ch.tattoo !== s && ch.tattoo !== true) return;
    const la = b['lowerArm' + s], w = ch.widths.arm;
    c.save();
    c.translate(la.sx, la.sy);
    c.rotate(la.a);
    c.strokeStyle = 'rgba(38, 52, 68, 0.78)';
    c.fillStyle = 'rgba(38, 52, 68, 0.78)';
    c.lineWidth = Math.max(1.6, w * 0.13);
    c.lineCap = 'round';
    const L = la.len;
    c.beginPath();
    c.moveTo(L * 0.12, -w * 0.35);
    c.bezierCurveTo(L * 0.3, w * 0.45, L * 0.45, -w * 0.5, L * 0.62, w * 0.25);
    c.bezierCurveTo(L * 0.7, w * 0.5, L * 0.78, -w * 0.1, L * 0.84, 0);
    c.stroke();
    c.beginPath(); c.arc(L * 0.3, -w * 0.18, w * 0.16, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(L * 0.5, w * 0.1); c.lineTo(L * 0.56, -w * 0.32); c.lineTo(L * 0.62, w * 0.1); c.closePath(); c.fill();
    c.restore();
  }

  S.drawCharacter = drawCharacter;
  S.charDraw = { capsule, alongBone, handPath, drawGroup, drawMouth, drawTattoo, drawWrist, drawBadge, EXPRESSIONS };
  S.face = { EXPRESSIONS, MOUTHS, EYES, HANDS };
})(window.Studio);
