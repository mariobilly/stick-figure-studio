'use strict';
// ---------------------------------------------------------------------------
// Renderer: draws one frame of a scene through the camera
// ---------------------------------------------------------------------------
// The same function paints the editor stage, thumbnails and every export, so
// what you direct is exactly what you ship.

(function (S) {
  const U = S.util;
  const M = S.model;

  const pathCache = new Map();
  function path2d(d) {
    let p = pathCache.get(d);
    if (!p) {
      if (pathCache.size > 4000) pathCache.clear();
      p = new Path2D(d);
      pathCache.set(d, p);
    }
    return p;
  }

  function paint(c, fill) {
    if (typeof fill === 'string') return fill;
    const g = c.createLinearGradient(...fill.g);
    for (const [at, color] of fill.stops) g.addColorStop(at, color);
    return g;
  }

  // shape.paths = [{ d, fill, stroke, sw, rule, alpha }]
  function drawShape(c, obj) {
    const base = c.globalAlpha;
    for (const p of obj.paths) {
      const path = path2d(p.d);
      c.globalAlpha = base * (p.alpha ?? 1);
      if (p.fill) { c.fillStyle = paint(c, p.fill); c.fill(path, p.rule || 'nonzero'); }
      if (p.stroke) {
        c.strokeStyle = p.stroke;
        c.lineWidth = p.sw || 4;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.stroke(path);
      }
    }
    c.globalAlpha = base;
  }

  const measure = document.createElement('canvas').getContext('2d');
  const fontOf = (f) => `${f.weight || 400} ${f.size}px ${f.family}`;

  function textLayout(obj, text) {
    const f = obj.font;
    measure.font = fontOf(f);
    const lines = String(text ?? '').split('\n');
    const w = Math.max(10, ...lines.map((l) => measure.measureText(l).width));
    const lh = f.size * 1.2;
    return { lines, w, lh, h: lh * lines.length };
  }

  function drawText(c, obj, text) {
    const f = obj.font, lay = textLayout(obj, text);
    c.font = fontOf(f);
    c.textAlign = f.align || 'center';
    c.textBaseline = 'middle';
    c.fillStyle = f.color;
    const ax = f.align === 'left' ? -lay.w / 2 : f.align === 'right' ? lay.w / 2 : 0;
    const ly = (i) => -lay.h / 2 + lay.lh * (i + 0.5);
    // optional outline (font.stroke = { color, width }), drawn under the fill
    if (f.stroke) {
      c.save();
      c.strokeStyle = f.stroke.color || '#000000';
      c.lineWidth = f.stroke.width || 4;
      c.lineJoin = 'round';
      lay.lines.forEach((line, i) => c.strokeText(line, ax, ly(i)));
      c.restore();
    }
    lay.lines.forEach((line, i) => c.fillText(line, ax, ly(i)));
  }

  // Local-space bounding box [x0, y0, x1, y1] for selection and hit-testing.
  function boundsOf(obj, ctx) {
    if (obj.type === 'shape') return obj.bounds;
    if (obj.type === 'image') return [-obj.w / 2, -obj.h / 2, obj.w / 2, obj.h / 2];
    if (obj.type === 'text') { const l = textLayout(obj, ctx.P(obj, 'text')); return [-l.w / 2, -l.h / 2, l.w / 2, l.h / 2]; }
    if (obj.type === 'character') return S.rig.localBounds(ctx.pose(obj), obj.char);
    if (obj.type === 'link') return [0, 0, 0, 0];
    return [-36, -36, 36, 36];
  }

  // An anchor is { id, bone?, x?, y? }: a bone's end on a character, or a local point on any layer.
  function anchorPoint(ctx, anchor) {
    const obj = ctx.byId.get(anchor.id);
    if (!obj) return null;
    const m = ctx.matrix(obj);
    if (anchor.bone && obj.type === 'character') { const b = ctx.pose(obj).b[anchor.bone]; if (b) return U.apply(m, b.ex, b.ey); }
    return U.apply(m, anchor.x || 0, anchor.y || 0);
  }

  // Drawn in scene space: a line that sags between its two anchors (leash, rope, cable).
  function drawLink(c, obj, ctx) {
    const a = anchorPoint(ctx, obj.from), b = anchorPoint(ctx, obj.to);
    if (!a || !b) return;
    const sag = (obj.sag ?? 0.25) * Math.hypot(b.x - a.x, b.y - a.y);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + sag, b.x, b.y);
    c.strokeStyle = obj.color || '#1f1b2e';
    c.lineWidth = obj.width || 5;
    c.lineCap = 'round';
    c.stroke();
  }

  function drawObject(c, obj, ctx) {
    if (obj.type === 'character') S.drawCharacter(c, obj, ctx.pose(obj), (name) => ctx.P(obj, name));
    else if (obj.type === 'shape') drawShape(c, obj);
    else if (obj.type === 'text') drawText(c, obj, ctx.P(obj, 'text'));
    else if (obj.type === 'image') {
      const img = S.assets.image(obj.asset);
      if (img) c.drawImage(img, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
    }
  }

  // ---------------------------------------------------------------------------
  // Look: grain, vignette and tint give every frame the same printed texture
  // ---------------------------------------------------------------------------

  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 256;
    const g = grainTile.getContext('2d');
    const data = g.createImageData(256, 256);
    let seed = 1234567;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const v = 128 + ((seed >>> 16) % 120) - 60;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    return grainTile;
  }

  function drawLook(c, project, look, f) {
    const W = project.width, H = project.height;
    if (look.tintAmount > 0) {
      c.globalCompositeOperation = 'soft-light';
      c.globalAlpha = look.tintAmount;
      c.fillStyle = look.tint;
      c.fillRect(0, 0, W, H);
    }
    if (look.vignette > 0) {
      c.globalCompositeOperation = 'multiply';
      c.globalAlpha = 1;
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, `rgba(${Math.round(255 * (1 - look.vignette))},${Math.round(245 * (1 - look.vignette))},${Math.round(250 * (1 - look.vignette * 0.8))},1)`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    if (look.grain > 0) {
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = look.grain;
      const pattern = c.createPattern(grain(), 'repeat');
      // the texture "boils" on twos, like a hand-made film
      const k = Math.floor(f / 2);
      pattern.setTransform(new DOMMatrix().translateSelf((k * 89) % 256, (k * 53) % 256).scaleSelf(2.5));
      c.fillStyle = pattern;
      c.fillRect(0, 0, W, H);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------
  // opts.base    DOMMatrix mapping stage pixels to canvas pixels
  // opts.camera  look through the scene camera (false = flat "director" view)
  // opts.clip    hide everything outside the frame (playback, export)

  function renderScene(c, project, scene, f, opts) {
    const base = opts.base || new DOMMatrix();
    const ctx = opts.ctx || M.evalCtx(scene, f);
    const cam = opts.camera === false ? null : ctx.camera();
    const W = project.width, H = project.height;

    c.save();
    c.setTransform(base);
    if (opts.clip) { c.beginPath(); c.rect(0, 0, W, H); c.clip(); }
    c.fillStyle = scene.bg;
    c.fillRect(0, 0, W, H);

    for (const obj of scene.objects) {
      if (obj.hidden) continue;
      const opacity = ctx.P(obj, 'opacity');
      if (opacity <= 0) continue;
      const layer = cam ? M.layerMatrix(project, cam, ctx.depth(obj)) : new DOMMatrix();
      c.globalAlpha = U.clamp(opacity, 0, 1);
      if (obj.type === 'link') { c.setTransform(base.multiply(layer)); drawLink(c, obj, ctx); continue; }
      const frame = obj.clipTo && ctx.byId.get(obj.clipTo.id);
      if (frame) {
        // obj.clipTo = { id, rect: [x0, y0, x1, y1] } in that layer's own coordinates
        const [x0, y0, x1, y1] = obj.clipTo.rect;
        c.save();
        c.setTransform(base.multiply(layer).multiply(ctx.matrix(frame)));
        c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      }
      c.setTransform(base.multiply(layer).multiply(ctx.matrix(obj)));
      const fxOn = obj.blend || obj.glow || obj.blur;
      if (fxOn) {
        // obj.blend: a canvas composite mode ('screen', 'lighter', 'multiply', 'overlay'…) for light, neon and shadow
        // obj.glow = { color, blur }: a soft light around the drawing; obj.blur: px of blur (smoke, haze, bokeh).
        // Sizes are in scene pixels, so they scale with the camera and the export size.
        const T = c.getTransform(), k = Math.hypot(T.a, T.b);
        c.save();
        if (obj.blend) c.globalCompositeOperation = obj.blend;
        if (obj.glow) { c.shadowColor = obj.glow.color || '#ffffff'; c.shadowBlur = (obj.glow.blur ?? 24) * k; }
        if (obj.blur) c.filter = `blur(${obj.blur * k}px)`;
      }
      drawObject(c, obj, ctx);
      if (fxOn) c.restore();
      if (frame) c.restore();
    }

    c.globalAlpha = 1;
    c.setTransform(base);
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    drawLook(c, project, scene.look, f);
    c.restore();
    return ctx;
  }

  // Render a frame to a fresh canvas at any size (thumbnails, stills, exports).
  function renderToCanvas(canvas, project, scene, f) {
    const c = canvas.getContext('2d');
    const base = new DOMMatrix().scaleSelf(canvas.width / project.width, canvas.height / project.height);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    renderScene(c, project, scene, f, { base, clip: true });
  }

  S.render = { scene: renderScene, toCanvas: renderToCanvas, drawObject, drawShape, boundsOf, path2d };
})(window.Studio);
