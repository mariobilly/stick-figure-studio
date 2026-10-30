'use strict';
// ---------------------------------------------------------------------------
// Character drawing, front view: the same rig and keys, facing the camera
// ---------------------------------------------------------------------------
// Set the character's `view` prop to 'front' (it is keyable, so a character can
// turn to the audience mid-shot). rig.js rearranges the body plan; this file
// draws the symmetric artwork on top of it.

(function (S) {
  const U = S.util;
  const TAU = Math.PI * 2;
  const { capsule, handPath, drawGroup, drawMouth, EXPRESSIONS } = S.charDraw;

  // [angle (0 = screen right, -90 = top, 90 = chin), distance, radius], in head radii
  const WILD_BACK = [];
  for (let a = -205; a <= 25; a += 23) WILD_BACK.push([a, 1.2, 0.52 + ((a * 7) % 5) * 0.015]);
  for (let a = -170; a <= -10; a += 26) WILD_BACK.push([a, 1.72 + ((a * 3) % 4) * 0.03, 0.34]);
  WILD_BACK.push([-128, 2.08, 0.19], [-96, 2.16, 0.2], [-58, 2.06, 0.18], [-22, 1.6, 0.24], [-160, 1.62, 0.24]);
  const WILD_FRONT = [];
  for (let a = -168; a <= -12; a += 19.5) WILD_FRONT.push([a, 1.1, 0.29 + ((Math.round(a) * 5) % 3) * 0.015]);
  WILD_FRONT.push([-112, 0.82, 0.2], [-70, 0.84, 0.19], [-90, 0.86, 0.18]);

  function drawHeadFront(c, ch, head, P) {
    const r = head.len / 2;
    const col = ch.colors, ink = col.outline, ow = ch.outline;
    const lw = Math.max(2, r * 0.075);

    c.save();
    c.translate((head.sx + head.ex) / 2, (head.sy + head.ey) / 2);
    c.rotate(head.a + Math.PI / 2);
    c.lineJoin = 'round';
    c.lineCap = 'round';

    const blobs = (list) => list.map(([a, d, k]) => { const p = new Path2D(); p.arc(Math.cos(a * U.DEG) * d * r, Math.sin(a * U.DEG) * d * r, k * r, 0, TAU); return p; });
    const fillGroup = (paths, fill) => {
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow * 2; paths.forEach((p) => c.stroke(p)); }
      c.fillStyle = fill;
      paths.forEach((p) => c.fill(p));
    };

    // hair behind the head
    if (ch.hair === 'wild') fillGroup(blobs(WILD_BACK), col.hair);
    if (ch.hair === 'long') fillGroup([capsule(-0.85 * r, -0.2 * r, 0.42 * r, -0.95 * r, 1.35 * r, 0.34 * r), capsule(0.85 * r, -0.2 * r, 0.42 * r, 0.95 * r, 1.35 * r, 0.34 * r)], col.hair);
    if (ch.hair === 'bun') fillGroup(blobs([[-90, 1.18, 0.42]]), col.hair);

    const wide = ch.headShape === 'oval' ? 0.9 : ch.headShape === 'square' ? 0.94 : 1;
    const skull = new Path2D();
    if (ch.headShape === 'oval') skull.ellipse(0, 0, r * 0.9, r * 1.06, 0, 0, TAU);
    else if (ch.headShape === 'square') skull.roundRect(-r * 0.94, -r, r * 1.88, r * 2, r * 0.42);
    else skull.arc(0, 0, r, 0, TAU);
    const ears = blobs([[172, wide * 1.0, 0.17], [8, wide * 1.0, 0.17]]);
    fillGroup([...ears, skull], col.skin);

    const bearded = ch.facial === 'beard' || ch.facial === 'full';
    if (bearded) {
      const full = ch.facial === 'full', R = r * 1.02;
      const a0 = (full ? -14 : 12) * U.DEG, a1 = Math.PI - a0;
      c.beginPath();
      c.ellipse(0, 0, R * wide, R * (ch.headShape === 'oval' ? 1.06 : 1), 0, a0, a1);
      // inner edge: down the cheek, across under the nose, and back up the other cheek
      c.quadraticCurveTo(-0.62 * r, 0.3 * r, -0.34 * r, 0.36 * r);
      c.quadraticCurveTo(0, 0.24 * r, 0.34 * r, 0.36 * r);
      c.quadraticCurveTo(0.62 * r, 0.3 * r, Math.cos(a0) * R * wide, Math.sin(a0) * R);
      c.closePath();
      c.fillStyle = col.hair;
      c.fill();
      c.lineWidth = lw;
      c.strokeStyle = ink;
      c.stroke();
      if (col.streak) {
        c.save();
        c.clip();
        c.beginPath();
        c.ellipse(0, 1.02 * r, 0.24 * r, 0.2 * r, 0, 0, TAU);
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
    const specs = ch.glasses && ch.glasses !== 'none';
    const ey = -0.1 * r, rx = 0.15, ry = 0.18;
    // screen-left eye is the character's right: brow tilts mirror each other
    for (const [x, tilt, raise] of [[-0.37, -ex.bf, ex.rf], [0.37, ex.bn, ex.rn]]) {
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
        if (!specs) c.stroke();
        c.save();
        c.clip();
        const px = (x + lookX * rx * 0.5) * r, py = ey + lookY * ry * r * 0.55;
        c.beginPath();
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
      c.translate(x * r, ey - (ry + 0.14 + raise) * r);
      c.rotate(tilt * U.DEG);
      c.beginPath();
      c.moveTo(-rx * r * 1.3, 0);
      c.lineTo(rx * r * 1.3, 0);
      c.lineWidth = lw * (ch.brows === 'thick' ? 2.3 : ch.brows === 'thin' ? 0.8 : 1.25);
      c.strokeStyle = ch.brows === 'thick' ? U.shade(col.hair, 0.8) : ink;
      c.stroke();
      c.restore();
    }

    // nose
    c.beginPath();
    c.arc(0, 0.14 * r, 0.12 * r, 0.12 * Math.PI, 0.88 * Math.PI);
    c.strokeStyle = U.shade(col.skin, 0.62);
    c.lineWidth = lw;
    c.stroke();

    if (specs) {
      const shades = ch.glasses === 'shades';
      const k = shades ? 0.3 : 0.27, square = ch.glasses === 'square' || shades;
      c.strokeStyle = shades ? ink : col.glasses || '#2b2b33';
      c.lineWidth = lw * (ch.glasses === 'bold' || shades ? 1.6 : 0.85);
      for (const x of [-0.37, 0.37]) {
        c.beginPath();
        if (square) c.roundRect((x - k) * r, ey - k * 0.8 * r, k * 2 * r, k * 1.6 * r, k * 0.35 * r); else c.arc(x * r, ey, k * r, 0, TAU);
        c.fillStyle = shades ? '#1d1b22' : 'rgba(255, 255, 255, 0.16)';
        c.fill();
        c.stroke();
        if (shades) {
          c.save();
          c.beginPath();
          c.moveTo((x - k * 0.5) * r, ey + k * 0.35 * r);
          c.lineTo((x + k * 0.05) * r, ey - k * 0.5 * r);
          c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          c.lineWidth = lw * 0.6;
          c.stroke();
          c.restore();
        }
      }
      c.beginPath();
      c.moveTo((-0.37 + k) * r, ey - 0.03 * r); c.lineTo((0.37 - k) * r, ey - 0.03 * r);
      c.moveTo((-0.37 - k) * r, ey - 0.02 * r); c.lineTo(-wide * 0.98 * r, ey + 0.04 * r);
      c.moveTo((0.37 + k) * r, ey - 0.02 * r); c.lineTo(wide * 0.98 * r, ey + 0.04 * r);
      c.stroke();
    }

    const mouth = P('mouth');
    drawMouth(c, !mouth || mouth === 'auto' ? ex.mouth : mouth, r, bearded ? U.shade(col.skin, 1.5) : ink, lw, 0, 0.25 * r);

    if (ch.facial === 'mustache' || ch.facial === 'goatee') {
      const goatee = ch.facial === 'goatee';
      c.beginPath();
      c.moveTo(-0.34 * r, 0.4 * r);
      c.quadraticCurveTo(0, (goatee ? 0.28 : 0.2) * r, 0.34 * r, 0.4 * r);
      c.strokeStyle = col.hair;
      c.lineWidth = (goatee ? 0.08 : 0.13) * r;
      c.stroke();
      if (goatee) {
        c.beginPath();
        c.moveTo(-0.33 * r, 0.44 * r); c.lineTo(-0.22 * r, 0.74 * r);
        c.moveTo(0.33 * r, 0.44 * r); c.lineTo(0.22 * r, 0.74 * r);
        c.lineWidth = 0.05 * r;
        c.stroke();
        const chin = new Path2D();
        chin.moveTo(-0.24 * r, 0.74 * r);
        chin.quadraticCurveTo(0, 0.66 * r, 0.24 * r, 0.74 * r);
        chin.quadraticCurveTo(0.24 * r, 0.98 * r, 0, 1.05 * r);
        chin.quadraticCurveTo(-0.24 * r, 0.98 * r, -0.24 * r, 0.74 * r);
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
      const R = r * 1.05;
      const cap = new Path2D();
      cap.arc(0, 0, R, -168 * U.DEG, -12 * U.DEG);
      cap.quadraticCurveTo(0.45 * r, -0.62 * r, 0, -0.56 * r);
      cap.quadraticCurveTo(-0.45 * r, -0.62 * r, Math.cos(-168 * U.DEG) * R, Math.sin(-168 * U.DEG) * R);
      cap.closePath();
      const fade = ch.hair === 'fade';
      // faded sides are short stubble: close to the skin, and never outlined, so there is no "hat brim"
      c.fillStyle = fade ? U.mix(col.skin, col.hair, 0.3) : col.hair;
      c.fill(cap);
      if (!fade && ow > 0) { c.strokeStyle = ink; c.lineWidth = ow; c.stroke(cap); }
      // the top: a quiff that rises at the front; only its outer edge is inked
      const k = fade ? 0.9 : 1.08;
      const outer = new Path2D();
      outer.moveTo(-0.93 * r, -0.42 * r);
      outer.quadraticCurveTo(-1.02 * r, -1.0 * k * r, -0.55 * r, -1.14 * k * r);
      outer.quadraticCurveTo(-0.28 * r, -1.32 * k * r, 0.06 * r, -1.24 * k * r);
      outer.quadraticCurveTo(0.42 * r, -1.36 * k * r, 0.7 * r, -1.1 * k * r);
      outer.quadraticCurveTo(1.02 * r, -0.92 * k * r, 0.93 * r, -0.42 * r);
      const top = new Path2D(outer);
      top.quadraticCurveTo(0.5 * r, -0.7 * r, 0, -0.6 * r);
      top.quadraticCurveTo(-0.5 * r, -0.7 * r, -0.93 * r, -0.42 * r);
      top.closePath();
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow * 2; c.stroke(outer); }
      c.fillStyle = col.hair;
      c.fill(top);
      // two short strands of texture
      c.strokeStyle = U.shade(col.hair, 1.9);
      c.lineWidth = lw * 0.4;
      c.beginPath();
      c.moveTo(-0.2 * r, -0.78 * r); c.quadraticCurveTo(0.0, -1.0 * k * r, 0.3 * r, -1.08 * k * r);
      c.moveTo(0.18 * r, -0.74 * r); c.quadraticCurveTo(0.38 * r, -0.92 * k * r, 0.58 * r, -0.98 * k * r);
      c.stroke();
    } else if (ch.hair === 'wild') {
      fillGroup(blobs(WILD_FRONT), col.hair);
      c.strokeStyle = U.shade(col.hair, 1.3);
      c.lineWidth = lw * 0.55;
      for (const [a, d, k, turn] of [[-150, 1.4, 0.17, 0], [-122, 1.6, 0.19, 2], [-90, 1.62, 0.17, 4], [-60, 1.58, 0.16, 1], [-32, 1.4, 0.15, 3], [-105, 1.12, 0.12, 5], [-72, 1.12, 0.11, 2.5], [-140, 1.05, 0.11, 1.2]]) {
        c.beginPath();
        c.arc(Math.cos(a * U.DEG) * d * r, Math.sin(a * U.DEG) * d * r, k * r, turn, turn + 3.6);
        c.stroke();
      }
    } else if (ch.hair === 'curly') {
      const curls = [];
      for (let a = -172; a <= -8; a += 20.5) curls.push([a, 0.97, 0.3]);
      fillGroup(blobs(curls), col.hair);
    } else if (ch.hair !== 'bald') {
      // a cap of hair with a soft hairline
      const R = r * 1.05;
      const cap = new Path2D();
      cap.arc(0, 0, R, -168 * U.DEG, -12 * U.DEG);
      cap.quadraticCurveTo(0.45 * r, -0.62 * r, 0, -0.52 * r);
      cap.quadraticCurveTo(-0.45 * r, -0.62 * r, Math.cos(-168 * U.DEG) * R, Math.sin(-168 * U.DEG) * R);
      cap.closePath();
      c.fillStyle = col.hair;
      c.fill(cap);
      if (ow > 0) { c.strokeStyle = ink; c.lineWidth = ow; c.stroke(cap); }
    }
    c.restore();
  }

  function drawCharacterFront(c, obj, pose, P) {
    const ch = obj.char, b = pose.b, col = ch.colors, W = ch.widths;

    if (ch.shadow) {
      const gy = Math.max(b.footL.ey, b.footR.ey) + ch.lengths.foot * 0.2;
      c.beginPath();
      c.ellipse((b.footL.sx + b.footR.sx) / 2, gy, W.shoulder * 2.1, W.shoulder * 0.34, 0, 0, TAU);
      c.fillStyle = 'rgba(20, 12, 30, 0.2)';
      c.fill();
    }

    const arm = (s) => {
      const ua = b['upperArm' + s], la = b['lowerArm' + s], sleeve = ch.jacket || col.shirt;
      return [
        { path: capsule(ua.sx, ua.sy, W.arm, ua.ex, ua.ey, W.arm * 0.92), fill: ch.sleeves === 'none' && !ch.jacket ? col.skin : sleeve },
        { path: capsule(la.sx, la.sy, W.arm * 0.92, la.ex, la.ey, W.arm * 0.74), fill: ch.sleeves === 'long' || ch.jacket ? sleeve : col.skin },
        { path: handPath(b['hand' + s], P('hand' + s)), fill: col.skin },
      ];
    };
    const leg = (s) => {
      const ul = b['upperLeg' + s], ll = b['lowerLeg' + s], ft = b['foot' + s], fl = ch.lengths.foot;
      return [
        { path: capsule(ul.sx, ul.sy, W.leg, ul.ex, ul.ey, W.leg * 0.84), fill: col.pants },
        { path: capsule(ll.sx, ll.sy, W.leg * 0.84, ll.ex, ll.ey, W.leg * 0.66), fill: ch.shorts ? col.skin : col.pants },
        { path: (() => { const p = new Path2D(); p.ellipse(ft.ex + (s === 'L' ? -1 : 1) * fl * 0.08, ft.ey, fl * 0.36, fl * 0.27, 0, 0, TAU); return p; })(), fill: col.shoes },
      ];
    };

    const sides = ['L', 'R'];
    for (const s of sides) drawGroup(c, ch, leg(s));

    // torso: a rounded trapezoid from the hips to the shoulders, built in the spine's own frame
    const sp = b.spine, hd = b.head, len = sp.len;
    const x0 = -0.05 * len, x1 = 0.9 * len, wb = W.waist * 1.12, wt = W.shoulder * 1.22, k = Math.min(wb, wt) * 0.55;
    const local = new Path2D();
    local.moveTo(x0, 0);
    local.arcTo(x0, -wb, x1, -wt, k);
    local.arcTo(x1, -wt, x1, wt, k * 1.15);
    local.arcTo(x1, wt, x0, wb, k * 1.15);
    local.arcTo(x0, wb, x0, 0, k);
    local.closePath();
    const torso = new Path2D();
    torso.addPath(local, new DOMMatrix().translateSelf(sp.sx, sp.sy).rotateSelf(sp.a / U.DEG));
    const items = [
      { path: capsule(sp.ex, sp.ey, W.neck * 1.15, (hd.sx + hd.ex) / 2, (hd.sy + hd.ey) / 2, W.neck * 1.15), fill: U.shade(col.skin, 0.9) },
      { path: torso, fill: col.shirt },
    ];
    if (ch.outfit === 'gi') {
      // the jacket skirt below the belt
      const skirt = new Path2D(), sl = new Path2D();
      sl.roundRect(-0.2 * len, -wb * 1.08, 0.3 * len, wb * 2.16, wb * 0.3);
      skirt.addPath(sl, new DOMMatrix().translateSelf(sp.sx, sp.sy).rotateSelf(sp.a / U.DEG));
      items.push({ path: skirt, fill: col.shirt });
    }
    if (ch.jacket) {
      // a suit jacket: the body in the jacket's colour and its hem over the hips; drawWardrobeFront opens the front
      items[1].fill = ch.jacket;
      const hem = new Path2D(), hl = new Path2D();
      hl.roundRect(-0.22 * len, -wb * 1.06, 0.34 * len, wb * 2.12, wb * 0.25);
      hem.addPath(hl, new DOMMatrix().translateSelf(sp.sx, sp.sy).rotateSelf(sp.a / U.DEG));
      items.push({ path: hem, fill: ch.jacket });
    }
    drawGroup(c, ch, items);
    drawWardrobeFront(c, ch, sp, { x0, x1, wb, wt, len });

    // wardrobe drawn on the chest, in the spine's frame (x runs up the spine)
    if (ch.tie || ch.apron) {
      c.save();
      c.translate(sp.sx, sp.sy);
      c.rotate(sp.a);
      c.lineJoin = 'round';
      c.strokeStyle = col.outline;
      c.lineWidth = Math.max(2, ch.outline * 0.7);
      if (ch.apron) {
        const w = wb * 0.86;
        c.beginPath(); c.roundRect(x0 + 2, -w, len * 0.62, w * 2, 8); c.fillStyle = ch.apron; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x0 + len * 0.62, -w * 0.7); c.lineTo(x1 - 6, -wt * 0.42); c.moveTo(x0 + len * 0.62, w * 0.7); c.lineTo(x1 - 6, wt * 0.42); c.stroke();
      }
      if (ch.tie) {
        const top = x1 - 4, k = len * 0.09;
        c.beginPath(); c.moveTo(top, -k * 0.8); c.lineTo(top, k * 0.8); c.lineTo(top - k * 1.3, 0); c.closePath(); c.fillStyle = ch.tie; c.fill(); c.stroke();
        c.beginPath(); c.moveTo(top - k * 1.1, -k * 0.55); c.lineTo(top - len * 0.5, -k * 1.1); c.lineTo(top - len * 0.6, 0); c.lineTo(top - len * 0.5, k * 1.1); c.lineTo(top - k * 1.1, k * 0.55); c.closePath(); c.fill(); c.stroke();
      }
      c.restore();
    }

    drawHeadFront(c, ch, hd, P);
    for (const s of sides) { drawGroup(c, ch, arm(s)); S.charDraw.drawTattoo(c, ch, b, s); S.charDraw.drawWrist(c, ch, b, s); }   // facing us, both arms are in front
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

  // Gi, chest print, shield, chain, patch and collar, drawn in the spine's frame (x runs up the spine, y across the chest).
  function drawWardrobeFront(c, ch, sp, g) {
    const { x0, x1, wb, wt, len } = g;
    const col = ch.colors, ink = col.outline;
    const thin = Math.max(2, ch.outline * 0.6);
    if (!(ch.outfit === 'gi' || ch.print || ch.shield || ch.chain || ch.patch || ch.collar || ch.jacket)) return;
    c.save();
    c.translate(sp.sx, sp.sy);
    c.rotate(sp.a);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const shape = (build, fill) => { c.beginPath(); build(); c.fillStyle = fill; c.fill(); c.strokeStyle = ink; c.lineWidth = thin; c.stroke(); };
    const band = (pts, w, fill) => {
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = ink; c.lineWidth = w + thin * 2; c.stroke();
      c.strokeStyle = fill; c.lineWidth = w; c.stroke();
    };

    if (ch.outfit === 'gi') {
      const under = col.under || '#f4f1ea', belt = col.belt || '#f4f1ea', trim = col.trim || '#d8b04a', lapel = U.shade(col.shirt, 1.35);
      shape(() => { c.moveTo(x1 - 2, -wt * 0.42); c.lineTo(x1 - 2, wt * 0.42); c.lineTo(x1 - 0.36 * len, 0); c.closePath(); }, under);
      // right lapel tucks under, left lapel crosses over it down to the belt
      band([[x1 - 2, wt * 0.46], [x1 - 0.36 * len, 0]], wt * 0.2, lapel);
      band([[x1 - 2, -wt * 0.46], [x1 - 0.36 * len, 0], [0.2 * len, wb * 0.62]], wt * 0.2, lapel);
      c.fillStyle = trim;
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.roundRect(x1 - 0.2 * len + i * 0.05 * len, side * wt * 0.78 - wt * 0.08, 0.03 * len, wt * 0.16, 2); c.fill(); }
      // belt with a black rank bar, a knot in the middle and two tails
      shape(() => c.rect(0.08 * len, -wb * 1.1, 0.1 * len, wb * 2.2), belt);
      shape(() => c.rect(0.08 * len, wb * 0.55, 0.1 * len, wb * 0.3), '#1d1b22');
      shape(() => { c.moveTo(0.12 * len, -wb * 0.08); c.lineTo(-0.2 * len, -wb * 0.42); c.lineTo(-0.22 * len, -wb * 0.24); c.lineTo(0.1 * len, wb * 0.06); c.closePath(); }, belt);
      shape(() => { c.moveTo(0.12 * len, wb * 0.08); c.lineTo(-0.18 * len, wb * 0.4); c.lineTo(-0.16 * len, wb * 0.58); c.lineTo(0.12 * len, wb * 0.24); c.closePath(); }, belt);
      shape(() => { c.moveTo(-0.1 * len, wb * 0.31); c.lineTo(-0.18 * len, wb * 0.4); c.lineTo(-0.16 * len, wb * 0.58); c.lineTo(-0.08 * len, wb * 0.49); c.closePath(); }, '#1d1b22');
      shape(() => c.roundRect(0.075 * len, -wb * 0.2, 0.11 * len, wb * 0.4, 5), belt);
    }

    if (ch.jacket) {
      // worn open: half-width of the opening at a point x along the spine (V to mid-chest, then straight down, flaring at the hem)
      const hem = -0.22 * len;
      const gap = [[x1 - 1, wt * 0.44], [0.45 * len, wt * 0.15], [0.16 * len, wb * 0.2], [hem, wb * 0.34]];
      const at = (x) => { for (let i = 1; i < gap.length; i++) if (x >= gap[i][0]) { const [xa, ya] = gap[i - 1], [xb, yb] = gap[i]; return ya + (yb - ya) * (x - xa) / (xb - xa); } return gap[gap.length - 1][1]; };
      const opening = (xa, xb) => { c.beginPath(); const pts = gap.map(([x]) => x).filter((x) => x < xa && x > xb); const xs = [xa, ...pts, xb]; xs.forEach((x, i) => (i ? c.lineTo(x, -at(x)) : c.moveTo(x, -at(x)))); [...xs].reverse().forEach((x) => c.lineTo(x, at(x))); c.closePath(); };
      opening(x1 - 1, 0.16 * len); c.fillStyle = col.shirt; c.fill();
      opening(0.16 * len, 0.06 * len); c.fillStyle = ch.belt || col.pants; c.fill();
      opening(0.06 * len, hem); c.fillStyle = col.pants; c.fill();
      // the open neck, shirt buttons, belt buckle
      c.beginPath(); c.moveTo(x1 - 2, -ch.widths.neck * 0.8); c.lineTo(x1 - 2, ch.widths.neck * 0.8); c.lineTo(x1 - 0.16 * len, 0); c.closePath(); c.fillStyle = U.shade(col.skin, 0.9); c.fill();
      c.fillStyle = U.shade(col.shirt, 0.72);
      for (const k of [0.62, 0.48, 0.34, 0.22]) { c.beginPath(); c.arc(k * len, 0, wt * 0.035, 0, TAU); c.fill(); }
      if (ch.belt) shape(() => c.roundRect(0.07 * len, -wb * 0.13, 0.08 * len, wb * 0.26, 3), col.buckle || '#c9ccd2');
      // the jacket's two front edges
      for (const side of [-1, 1]) { c.beginPath(); gap.forEach(([x, y], i) => (i ? c.lineTo(x, side * y) : c.moveTo(x, side * y))); c.strokeStyle = ink; c.lineWidth = thin; c.stroke(); }
    }

    if (ch.collar) {
      for (const side of [-1, 1]) shape(() => { c.moveTo(x1 - 2, side * ch.widths.neck * 1.1); c.lineTo(x1 - 2, side * ch.widths.neck * 2.7); c.lineTo(x1 - 0.15 * len, side * ch.widths.neck * 1.2); c.closePath(); }, U.shade(col.shirt, 1.06));
    }

    if (ch.jacket) {
      if (ch.lanyard) {
        // the strap from both sides of the collar, meeting at a clip, the badge hanging above the belt
        for (const side of [-1, 1]) band([[x1 - 6, side * ch.widths.neck * 1.5], [0.42 * len, side * wt * 0.06]], wt * 0.07, ch.lanyard);
        c.save(); c.setLineDash([3, 5]); c.strokeStyle = 'rgba(255, 255, 255, 0.85)'; c.lineWidth = 1.6;
        for (const side of [-1, 1]) { c.beginPath(); c.moveTo(x1 - 8, side * ch.widths.neck * 1.5); c.lineTo(0.43 * len, side * wt * 0.06); c.stroke(); }
        c.restore();
        S.charDraw.drawBadge(c, ch, 0.3 * len, 0, 0.17 * len, wt * 0.36, thin);
      }
      // notched lapels lying on the jacket beside the opening
      const lapel = U.shade(ch.jacket, 1.16), a = wt * 0.44, bV = wt * 0.15;
      for (const s of [-1, 1]) shape(() => {
        c.moveTo(x1 - 1, s * a); c.lineTo(0.45 * len, s * bV); c.lineTo(0.52 * len, s * (bV + wt * 0.2));
        c.lineTo(0.74 * len, s * (a + wt * 0.18)); c.lineTo(0.78 * len, s * (a + wt * 0.08)); c.lineTo(0.84 * len, s * (a + wt * 0.24)); c.lineTo(x1 - 1, s * (a + wt * 0.16)); c.closePath();
      }, lapel);
      // hip pocket flaps and the chest pocket
      for (const s of [-1, 1]) shape(() => c.roundRect(0.0, s > 0 ? wb * 0.42 : -wb * 0.98, 0.06 * len, wb * 0.56, 3), U.shade(ch.jacket, 1.25));
      shape(() => c.roundRect(0.6 * len, -wt * 0.86, 0.035 * len, wt * 0.3, 2), U.shade(ch.jacket, 1.25));
    }

    if (ch.print) {
      const text = String(ch.print), fs = wt * 0.38;
      c.save();
      c.translate(0.58 * len, 0);
      c.rotate(Math.PI / 2);
      c.font = `900 ${fs}px "Arial Black", Impact, sans-serif`;
      c.textBaseline = 'middle';
      const widths = [...text].map((g2) => c.measureText(g2).width);
      // fit between the arms, which are drawn over the chest's outer edges
      const total = widths.reduce((a, v) => a + v, 0), squeeze = Math.min(1, (wt * 0.95) / total);
      c.scale(squeeze, 1);
      let x = -total / 2;
      [...text].forEach((glyph, i) => {
        const accent = col.printAccent && (i === 0 || i === text.length - 1);
        c.fillStyle = accent ? col.printAccent : col.print || ink;
        c.fillText(glyph, x, 0);
        x += widths[i];
      });
      c.restore();
    }

    if (ch.shield) {
      c.save();
      c.translate(0.6 * len, 0);
      c.rotate(Math.PI / 2);
      drawShield(c, ch, wt * 0.9, thin);
      c.restore();
    }

    if (ch.patch) shape(() => c.roundRect(0.64 * len, wt * 0.28, 0.1 * len, wt * 0.3, 3), ch.patch);

    if (ch.chain) {
      c.beginPath();
      c.moveTo(x1 - 4, -ch.widths.neck * 1.2);
      c.quadraticCurveTo(x1 - 0.42 * len, 0, x1 - 4, ch.widths.neck * 1.2);
      c.strokeStyle = U.shade(ch.chain, 0.6); c.lineWidth = 6; c.stroke();
      c.strokeStyle = ch.chain; c.lineWidth = 3.5; c.stroke();
      c.beginPath(); c.arc(x1 - 0.23 * len, 0, wt * 0.13, 0, TAU);
      c.fillStyle = ch.chain; c.fill(); c.strokeStyle = U.shade(ch.chain, 0.6); c.lineWidth = 2; c.stroke();
    }
    c.restore();
  }

  S.drawCharacterFront = drawCharacterFront;
})(window.Studio);
