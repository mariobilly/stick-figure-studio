'use strict';
// ---------------------------------------------------------------------------
// Core: namespace, shared state, small utilities, easing
// ---------------------------------------------------------------------------
// The app runs straight from file://, where ES module imports are blocked, so
// every file is a classic script that hangs its API off window.Studio.

(function () {
  const S = window.Studio = {};
  const DEG = Math.PI / 180;
  let seq = 0;

  S.state = {
    project: null,
    sceneIndex: 0,
    frame: 0,
    playing: false,
    exporting: false,
    sel: { kind: 'none', id: null },   // none | object | camera | audio
    selKeys: [],                       // [{ obj, prop, key }]
    autoKey: true,
    onion: true,
    cameraView: true,
    showPaths: true,
    loop: true,
    defaultEase: 'inout',
    view: { x: 0, y: 0, s: 1, fitted: true },
    expanded: {},                      // timeline rows, by object id
    charTab: 'animate',
    leftTab: 'layers',
  };

  S.scene = () => S.state.project.scenes[S.state.sceneIndex];

  S.selected = function () {
    const { kind, id } = S.state.sel;
    const scene = S.scene();
    if (kind === 'camera') return scene.camera;
    if (kind === 'object') return scene.objects.find((o) => o.id === id) || null;
    return null;
  };

  S.select = function (kind, id) {
    S.state.sel = { kind, id: id || null };
    S.state.selKeys = [];
    S.touch('sel');
  };

  S.util = {
    DEG,
    uid: (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    normDeg: (d) => ((d % 360) + 540) % 360 - 180,
    // Always rotate the short way round, so a limb never spins 350 degrees between keys.
    lerpAngle: (a, b, t) => a + (((b - a) % 360 + 540) % 360 - 180) * t,
    clone: (o) => JSON.parse(JSON.stringify(o)),
    round(v, p = 2) { const k = 10 ** p; return Math.round(v * k) / k; },

    apply: (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }),
    det: (m) => m.a * m.d - m.b * m.c,

    hexToRgb(hex) {
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
      const n = parseInt(h, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },
    // k < 1 darkens, k > 1 lightens
    shade(hex, k) {
      const [r, g, b] = S.util.hexToRgb(hex).map((v) => Math.round(S.util.clamp(k <= 1 ? v * k : v + (255 - v) * (k - 1), 0, 255)));
      return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    },
    mix(hexA, hexB, t) {
      const a = S.util.hexToRgb(hexA), b = S.util.hexToRgb(hexB);
      return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
    },

    // el('div', { class: 'row', onclick: fn, text: 'Hi' }, [children])
    el(tag, attrs, children) {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k in node && k !== 'list') node[k] = v;
        else node.setAttribute(k, v);
      }
      for (const child of [].concat(children || [])) {
        if (child != null && child !== false) node.append(child);
      }
      return node;
    },

    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    timecode(frame, fps) {
      const s = Math.floor(frame / fps);
      const f = Math.floor(frame % fps);
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    },
  };

  // ---------------------------------------------------------------------------
  // Easing. A key's ease shapes the segment from that key to the next one.
  // 'hold' never interpolates; everything else is a cubic bezier, so presets and
  // hand-tuned curves share one code path. y may leave 0..1 for overshoot.
  // ---------------------------------------------------------------------------

  const PRESETS = {
    linear: [0, 0, 1, 1],
    in: [0.42, 0, 1, 1],
    out: [0, 0, 0.58, 1],
    inout: [0.42, 0, 0.58, 1],
    snap: [0.7, 0, 0.2, 1],
    overshoot: [0.34, 1.56, 0.64, 1],
    anticipate: [0.36, -0.56, 0.66, 1],
  };

  function bezierAt(p1, p2, u) {
    const v = 1 - u;
    return 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u;
  }

  S.ease = {
    PRESETS,
    LABELS: {
      linear: 'Linear', in: 'Ease in', out: 'Ease out', inout: 'Ease in-out', snap: 'Snap',
      overshoot: 'Overshoot', anticipate: 'Anticipate', hold: 'Hold',
    },
    curve: (ease) => (Array.isArray(ease) ? ease : PRESETS[ease] || PRESETS.linear),
    apply(ease, t) {
      if (ease === 'hold') return 0;
      if (ease === 'linear' || ease == null) return t;
      const [x1, y1, x2, y2] = S.ease.curve(ease);
      // solve bezier x(u) = t by bisection: robust for any handle position
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 24; i++) {
        const x = bezierAt(x1, x2, u);
        if (Math.abs(x - t) < 1e-5) break;
        if (x < t) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
      return bezierAt(y1, y2, u);
    },
  };

  // ---------------------------------------------------------------------------
  // Refresh scheduling: every mutation calls S.touch(kind); the UI repaints once
  // per animation frame. kind: frame | view | sel | data | all
  // ---------------------------------------------------------------------------

  const dirty = new Set();
  let queued = false;

  S.touch = function (kind) {
    dirty.add(kind || 'data');
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const kinds = new Set(dirty);
      dirty.clear();
      const deep = kinds.has('data') || kinds.has('sel') || kinds.has('all');
      if (S.stage) S.stage.draw();
      if (S.timeline) S.timeline.refresh(deep, kinds.has('all'));
      if (S.panels) S.panels.refresh(deep, kinds.has('all'));
      if (S.store && (kinds.has('data') || kinds.has('all'))) S.store.scheduleAutosave();
    });
  };

  let toastTimer = null;
  S.toast = function (message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  };
})();
