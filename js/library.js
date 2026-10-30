'use strict';
// ---------------------------------------------------------------------------
// Library: the house style. Props, backgrounds, character presets, motion clips
// ---------------------------------------------------------------------------
// Everything here is generated into plain path data and copied into the
// project, so saved films never depend on this file staying the same.

(function (S) {
  const U = S.util;
  const M = S.model;

  const INK = '#1f1b2e';
  const PAL = {
    cream: '#f6ead7', sand: '#ecd2a8', ochre: '#e8a33d', terracotta: '#d9603b', brick: '#b4462f',
    pink: '#e9a6a0', teal: '#2a7f86', sea: '#3e8fa8', navy: '#1f2a44', olive: '#7a8b4a',
    leaf: '#4f8a5b', wood: '#9b6a43', woodDark: '#70492e', stone: '#b9b2a6', white: '#fffaf0',
  };

  // --- path helpers ----------------------------------------------------------
  const n = (v) => Math.round(v * 10) / 10;
  function R(x, y, w, h, r = 0) {
    if (!r) return `M${n(x)},${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
    r = Math.min(r, w / 2, h / 2);
    return `M${n(x + r)},${n(y)}h${n(w - 2 * r)}a${r},${r} 0 0 1 ${r},${r}v${n(h - 2 * r)}a${r},${r} 0 0 1 ${-r},${r}h${n(-(w - 2 * r))}a${r},${r} 0 0 1 ${-r},${-r}v${n(-(h - 2 * r))}a${r},${r} 0 0 1 ${r},${-r}Z`;
  }
  const E = (cx, cy, rx, ry = rx) => `M${n(cx - rx)},${n(cy)}a${n(rx)},${n(ry)} 0 1 0 ${n(rx * 2)},0a${n(rx)},${n(ry)} 0 1 0 ${n(-rx * 2)},0Z`;
  const poly = (pts) => 'M' + pts.map((p) => `${n(p[0])},${n(p[1])}`).join('L') + 'Z';
  const line = (pts) => 'M' + pts.map((p) => `${n(p[0])},${n(p[1])}`).join('L');
  // window with a round arch on top
  const arch = (x, y, w, h) => `M${n(x)},${n(y + h)}V${n(y + w / 2)}a${n(w / 2)},${n(w / 2)} 0 0 1 ${n(w)},0V${n(y + h)}Z`;
  const P = (d, fill, stroke, sw, extra) => ({ d, fill: fill || null, stroke: stroke || null, sw: sw || 0, ...extra });
  const ink = (d, fill, sw = 5) => P(d, fill, INK, sw);
  const grad = (x0, y0, x1, y1, ...stops) => ({ g: [x0, y0, x1, y1], stops });

  // --- props (origin at the point that touches the ground or the table) -------
  const PROPS = {
    cup: () => ({ name: 'Cup', bounds: [-34, -76, 64, 4], paths: [
      P('M28,-56C62,-56 62,-16 28,-16', null, INK, 8),
      ink(R(-30, -72, 60, 72, 10), PAL.white),
      P(R(-30, -46, 60, 16), PAL.terracotta),
      ink(R(-30, -72, 60, 72, 10), null),
    ] }),
    desk: () => ({ name: 'Desk', bounds: [-250, -312, 250, 2], paths: [
      ink(R(-222, -280, 26, 280), PAL.woodDark), ink(R(196, -280, 26, 280), PAL.woodDark),
      ink(R(50, -282, 150, 130, 4), PAL.wood), P(line([[70, -218], [180, -218]]), null, INK, 4), ink(E(125, -250, 8), PAL.ochre, 4),
      ink(R(-246, -310, 492, 32, 8), PAL.wood),
    ] }),
    chair: () => ({ name: 'Chair', bounds: [-80, -330, 90, 2], paths: [
      ink(R(-70, -160, 16, 160), PAL.woodDark), ink(R(58, -160, 16, 160), PAL.woodDark),
      ink(R(-72, -326, 18, 170, 6), PAL.woodDark), ink(R(-74, -322, 24, 110, 8), PAL.teal),
      ink(R(-78, -178, 160, 26, 8), PAL.teal),
    ] }),
    lamp: () => ({ name: 'Floor lamp', bounds: [-90, -560, 90, 4], paths: [
      P(poly([[-150, -40], [150, -40], [70, -470], [-70, -470]]), grad(0, -470, 0, -40, [0, 'rgba(255,225,150,0.5)'], [1, 'rgba(255,225,150,0)'])),
      ink(E(0, -6, 62, 12), INK), ink(R(-5, -440, 10, 436), INK, 3),
      ink(poly([[-84, -440], [84, -440], [54, -556], [-54, -556]]), PAL.ochre),
    ] }),
    plant: () => ({ name: 'Plant', bounds: [-120, -400, 120, 4], paths: [
      ink('M0,-130C-30,-260 -110,-290 -112,-372C-40,-340 -6,-250 0,-130Z', PAL.leaf),
      ink('M0,-130C30,-270 96,-300 104,-392C36,-350 4,-260 0,-130Z', U.shade(PAL.leaf, 0.85)),
      ink('M0,-130C-10,-220 -60,-230 -96,-216C-70,-170 -30,-150 0,-130Z', U.shade(PAL.leaf, 1.2)),
      ink('M0,-130C20,-210 70,-220 112,-200C80,-160 40,-140 0,-130Z', PAL.leaf),
      ink(poly([[-62, -134], [62, -134], [46, 0], [-46, 0]]), PAL.terracotta), ink(R(-70, -150, 140, 28, 6), PAL.brick),
    ] }),
    frame: () => ({ name: 'Picture', bounds: [-110, -85, 110, 85], paths: [
      ink(R(-106, -82, 212, 164, 4), PAL.woodDark), P(R(-88, -64, 176, 128), '#bfe0e6'),
      P(poly([[-88, 64], [-88, 20], [-30, -24], [16, 14], [48, -8], [88, 30], [88, 64]]), PAL.olive),
      P(E(46, -34, 14), PAL.ochre), ink(R(-88, -64, 176, 128), null, 3),
    ] }),
    door: () => ({ name: 'Door', bounds: [-130, -560, 130, 2], paths: [
      ink(R(-126, -556, 252, 556, 4), PAL.woodDark), ink(R(-104, -534, 208, 534), PAL.teal),
      ink(R(-80, -506, 160, 200, 6), U.shade(PAL.teal, 0.85), 4), ink(R(-80, -270, 160, 220, 6), U.shade(PAL.teal, 0.85), 4),
      ink(E(74, -280, 11), PAL.ochre, 4),
    ] }),
    sandwich: () => ({ name: 'Tiny sandwich', bounds: [-44, -46, 44, 4], paths: [
      ink(E(0, -2, 42, 6), PAL.white, 3),
      ink(poly([[-34, -6], [34, -6], [30, -16], [-30, -16]]), PAL.ochre, 4),
      P('M-36,-16q9,-10 18,0t18,0t18,0t18,0v-5h-72Z', PAL.leaf, INK, 3), P(R(-30, -27, 60, 7, 3), '#d8433b', INK, 3),
      ink('M-34,-26C-30,-46 30,-46 34,-26Z', PAL.ochre, 4),
    ] }),
    cloud: () => ({ name: 'Cloud', bounds: [-170, -80, 170, 50], paths: [
      P(E(-80, 0, 70, 44) + E(-10, -30, 80, 56) + E(80, -6, 76, 48) + R(-120, 0, 250, 44, 22), PAL.white, null, 0, { alpha: 0.95 }),
    ] }),
    sun: () => ({ name: 'Sun', bounds: [-130, -130, 130, 130], paths: [
      P(E(0, 0, 128), 'rgba(255,214,140,0.35)'), P(E(0, 0, 84), '#ffd98a'),
    ] }),
    tree: () => ({ name: 'Tree', bounds: [-190, -640, 190, 4], paths: [
      ink('M-22,0C-16,-140 -30,-220 -26,-330L30,-330C24,-220 18,-140 26,0Z', PAL.woodDark),
      ink(E(-70, -400, 110, 96) + E(70, -420, 116, 100) + E(0, -520, 120, 110), PAL.leaf),
      P(E(-40, -500, 46, 40) + E(80, -450, 40, 34), U.shade(PAL.leaf, 1.25), null, 0, { alpha: 0.6 }),
    ] }),
    streetlamp: () => ({ name: 'Street lamp', bounds: [-40, -760, 170, 4], paths: [
      ink(R(-16, -40, 32, 40, 4), INK), ink(R(-7, -740, 14, 704), INK, 3),
      P('M0,-736C0,-780 120,-780 126,-716', null, INK, 12),
      ink(poly([[96, -716], [156, -716], [144, -684], [108, -684]]), PAL.ochre, 4),
    ] }),
    bubble: () => ({ name: 'Speech bubble', bounds: [-260, -170, 260, 110], paths: [
      ink(R(-250, -160, 500, 210, 50) + poly([[-150, 40], [-90, 40], [-170, 106]]), '#ffffff', 6),
      P(poly([[-146, 40], [-94, 40], [-140, 62]]), '#ffffff'),
    ] }),
    rug: () => ({ name: 'Rug', bounds: [-340, -40, 340, 40], paths: [
      ink(E(0, 0, 330, 36), PAL.brick, 4), P(E(0, 0, 260, 25), null, PAL.ochre, 5), P(E(0, 0, 170, 14), PAL.teal),
    ] }),
  };

  // The colour a description like "a blue door" replaces; its darker companion is shaded to match.
  const PROP_MAIN = {
    cup: [PAL.terracotta], desk: [PAL.wood, PAL.woodDark], chair: [PAL.teal, PAL.woodDark], lamp: [PAL.ochre], plant: [PAL.terracotta, PAL.brick],
    frame: [PAL.woodDark], door: [PAL.teal, U.shade(PAL.teal, 0.85)], rug: [PAL.brick], tree: [PAL.leaf], bubble: ['#ffffff'], cloud: [PAL.white], sun: ['#ffd98a'], streetlamp: [PAL.ochre],
  };

  function recolor(obj, hex) {
    const [main, dark] = PROP_MAIN[obj.kind] || [];
    if (!main) return false;
    const current = obj.mainColor || main, currentDark = obj.mainColor ? U.shade(obj.mainColor, 0.78) : dark;
    for (const p of obj.paths) for (const key of ['fill', 'stroke']) {
      if (p[key] === current) p[key] = hex;
      else if (currentDark && p[key] === currentDark) p[key] = U.shade(hex, 0.78);
    }
    obj.mainColor = hex;
    return true;
  }

  function makeProp(kind, x, y, extra) {
    const def = PROPS[kind]();
    return M.newObject('shape', { name: def.name, kind, paths: def.paths, bounds: def.bounds, props: { x, y }, ...extra });
  }

  // Imported artwork: fitted to a sensible size, then free to scale.
  function imageObject(asset) {
    const k = Math.min(1, 700 / Math.max(asset.w, asset.h));
    return M.newObject('image', { name: asset.name, asset: asset.id, w: Math.round(asset.w * k), h: Math.round(asset.h * k) });
  }

  // --- backgrounds -----------------------------------------------------------
  // Backgrounds are wider than the frame so the camera has room to travel, and
  // are split across parallax depths so any camera move shows real depth.

  function bgLayer(name, depth, paths, bounds) {
    return M.newObject('shape', { name, depth, paths, bounds, locked: true, kind: 'background' });
  }

  function skyline(y, colors, seed) {
    const paths = [];
    let x = -900, s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; };
    while (x < 2900) {
      const w = 110 + rnd() * 150, h = 90 + rnd() * 250;
      paths.push(P(R(x, y - h, w, h + 40), colors[Math.floor(rnd() * colors.length)]));
      if (rnd() > 0.55) paths.push(P(R(x + w * 0.3, y - h - 26, 40, 28, 4), colors[0]));    // rooftop water tank
      for (let wy = y - h + 26; wy < y - 30; wy += 46) {
        for (let wx = x + 18; wx < x + w - 30; wx += 38) if (rnd() > 0.35) paths.push(P(R(wx, wy, 18, 24), 'rgba(255,240,200,0.5)'));
      }
      x += w + rnd() * 14;
    }
    return paths;
  }

  function room() {
    const wall = '#e9c9a0', x0 = -700, x1 = 2700, floorY = 850;
    const win = [1150, 60, 520, 400];   // x, y, w, h
    const sky = bgLayer('Sky', 0.15, [P(R(-1200, -600, 4400, 1900), grad(0, 0, 0, 800, [0, '#8cc7d6'], [1, '#f7dcb2']))], [-1200, -600, 3200, 1300]);
    const city = bgLayer('City outside', 0.45, [
      P(poly([[-900, 640], [-300, 470], [300, 560], [900, 430], [1500, 540], [2100, 450], [2900, 600], [2900, 900], [-900, 900]]), '#9fb7b9'),
      ...skyline(640, ['#c9b8a8', '#d8c4a6', '#bda48f'], 7),
    ], [-900, 200, 2900, 900]);
    const planks = [];
    for (let y = floorY + 60; y < 1500; y += 70) planks.push(P(line([[x0, y], [x1, y]]), null, 'rgba(60,30,10,0.22)', 3));
    const walls = bgLayer('Room', 1, [
      P(R(x0, -500, x1 - x0, floorY + 500) + R(...win), wall, null, 0, { rule: 'evenodd' }),
      P(R(x0, 600, x1 - x0, floorY - 600), U.shade(wall, 0.9)),
      P(line([[x0, 600], [x1, 600]]), null, U.shade(wall, 0.72), 6),
      P(R(x0, floorY, x1 - x0, 700), '#b97f52'), ...planks,
      ink(R(x0, floorY - 34, x1 - x0, 34), PAL.cream, 4),
      P(R(win[0] - 22, win[1] - 22, win[2] + 44, win[3] + 44, 6) + R(...win), PAL.cream, INK, 5, { rule: 'evenodd' }),
      P(R(win[0] + win[2] / 2 - 7, win[1], 14, win[3]) + R(win[0], win[1] + win[3] / 2 - 7, win[2], 14), PAL.cream, INK, 4),
      ink(R(win[0] - 44, win[1] + win[3] + 18, win[2] + 88, 26, 6), PAL.cream),
      P(poly([[win[0] + 30, floorY], [win[0] + win[2] + 120, floorY], [win[0] + win[2] + 420, 1300], [win[0] + 160, 1300]]), 'rgba(255,236,190,0.16)'),
    ], [x0, -500, x1, 1500]);
    const clouds = [makeProp('cloud', 1050, 300, { depth: 0.25, name: 'Cloud A' }), makeProp('cloud', 1700, 420, { depth: 0.3, name: 'Cloud B', props: { x: 1700, y: 420, scaleX: 0.7, scaleY: 0.7 } })];
    // clouds sit between the sky and the wall, so the window frames them
    return { bg: '#f7dcb2', back: [sky, city, ...clouds, walls], floorY };
  }

  function building(x, groundY, w, floors, color, opt = {}) {
    const fh = 170, h = floors * fh + 60, top = groundY - h;
    const trim = PAL.cream, glass = opt.glass || '#274a57', shutter = opt.shutter || PAL.teal;
    const out = [ink(R(x, top, w, h), color, 4)];
    if (opt.roof === 'tile') out.push(ink(poly([[x - 16, top], [x + w + 16, top], [x + w - 30, top - 70], [x + 30, top - 70]]), PAL.brick, 4));
    else out.push(ink(R(x - 8, top - 18, w + 16, 22, 3), U.shade(color, 0.85), 4), ink(R(x + w * 0.62, top - 78, 64, 60, 8), PAL.stone, 4));
    for (let f = 0; f < floors; f++) {
      const fy = top + 50 + f * fh;
      const ground = f === floors - 1;
      if (ground && opt.shop) {
        const stripes = [];
        for (let i = 0; i < 8; i++) stripes.push(P(poly([[x + 24 + i * (w - 48) / 8, fy - 6], [x + 24 + (i + 1) * (w - 48) / 8, fy - 6], [x + 14 + (i + 1) * (w - 28) / 8, fy + 50], [x + 14 + i * (w - 28) / 8, fy + 50]]), i % 2 ? PAL.cream : opt.shop));
        out.push(ink(R(x + 34, fy + 40, w - 68, fh - 30), glass, 4), P(R(x + 50, fy + 60, (w - 100) * 0.55, fh - 60), 'rgba(255,230,170,0.35)'), ...stripes, P(poly([[x + 24, fy - 6], [x + w - 24, fy - 6], [x + w - 14, fy + 50], [x + 14, fy + 50]]), null, INK, 4));
        continue;
      }
      // the Beirut signature: a triple arcade in the middle of the facade
      const aw = Math.min(62, (w - 150) / 3), ax = x + w / 2 - aw * 1.5 - 8;
      for (let i = 0; i < 3; i++) out.push(ink(arch(ax + i * (aw + 8), fy, aw, 112), glass, 4));
      out.push(P(line([[ax - 6, fy + 112], [ax + aw * 3 + 22, fy + 112]]), null, trim, 8));
      for (const sx of [x + 26, x + w - 26 - 44]) {
        if (sx + 44 > ax - 12 && sx < ax + aw * 3 + 28) continue;
        out.push(ink(R(sx, fy + 14, 44, 92, 3), glass, 4), ink(R(sx - 20, fy + 14, 20, 92), shutter, 3), ink(R(sx + 44, fy + 14, 20, 92), shutter, 3));
      }
      if (opt.balcony && f % 2 === 0) {
        const bx = ax - 26, bw = aw * 3 + 68, by = fy + 116;
        const rails = [];
        for (let rx = bx + 10; rx < bx + bw; rx += 16) rails.push([[rx, by - 44], [rx, by]]);
        out.push(P(rails.map(line).join(''), null, INK, 3), P(line([[bx, by - 44], [bx + bw, by - 44]]), null, INK, 5), ink(R(bx - 6, by, bw + 12, 14, 3), trim, 4));
      }
    }
    return out;
  }

  function street() {
    const groundY = 860;
    const sky = bgLayer('Sky', 0.05, [
      P(R(-1400, -900, 4800, 2400), grad(0, -200, 0, 900, [0, '#5fa3c4'], [0.55, '#f3c9a0'], [1, '#f6a57a'])),
      P(E(1480, 330, 210), 'rgba(255,224,160,0.35)'), P(E(1480, 330, 120), '#ffe3a3'),
    ], [-1400, -900, 3400, 1500]);
    const far = bgLayer('Sea and hills', 0.2, [
      P(poly([[-1000, 640], [-400, 420], [100, 520], [700, 360], [1300, 500], [1900, 380], [2500, 470], [3000, 420], [3000, 1100], [-1000, 1100]]), '#8fa5b8'),
      P(R(-1000, 700, 4000, 500), grad(0, 700, 0, 900, [0, '#5e9db3'], [1, '#3e7f98'])),
      ...skyline(720, ['#b6a9a6', '#c7b5a2', '#a99a9c'], 21),
    ], [-1000, 300, 3000, 1100]);
    const mid = bgLayer('Old town', 0.55, [
      ...building(-560, groundY, 420, 3, PAL.pink, { roof: 'tile', balcony: true }),
      ...building(-120, groundY, 380, 4, PAL.sand, { balcony: true, shutter: PAL.olive }),
      ...building(280, groundY, 460, 3, '#a9c7c4', { roof: 'tile', balcony: true, shutter: PAL.brick }),
      ...building(760, groundY, 360, 4, PAL.ochre, { shutter: PAL.teal }),
      ...building(1140, groundY, 440, 3, PAL.cream, { roof: 'tile', balcony: true, shutter: PAL.teal }),
      ...building(1600, groundY, 380, 4, PAL.pink, { balcony: true, shutter: PAL.olive }),
      ...building(2000, groundY, 460, 3, PAL.sand, { roof: 'tile', shutter: PAL.brick }),
      P(R(-1000, groundY - 4, 4000, 400), '#8d8478'),
    ], [-600, 0, 2500, 1100]);
    const stripes = [];
    for (let x = -900; x < 2900; x += 260) stripes.push(P(R(x, 1012, 130, 12, 4), 'rgba(255,250,235,0.75)'));
    const near = bgLayer('Street', 1, [
      ...building(-760, groundY + 30, 560, 4, '#e2b07a', { shop: PAL.terracotta, balcony: true, shutter: PAL.teal }),
      ...building(2050, groundY + 30, 600, 4, '#d8c2a0', { shop: PAL.teal, balcony: true, shutter: PAL.brick }),
      P(R(-1200, groundY + 30, 4400, 70), '#cfc3ae'), P(line([[-1200, groundY + 30], [3200, groundY + 30]]), null, INK, 4),
      P(R(-1200, groundY + 100, 4400, 700), '#5d5a63'), P(R(-1200, groundY + 92, 4400, 14), '#a79f92', INK, 3), ...stripes,
      // the tangle of overhead wires
      P('M-760,250C-200,380 300,300 900,360S1900,300 2650,240M-760,290C0,420 600,360 1200,420S2200,330 2650,300M-760,330C-100,400 500,440 1000,400S2100,420 2650,350', null, INK, 3),
    ], [-1200, -200, 3200, 1600]);
    const front = [makeProp('streetlamp', 330, groundY + 60, { depth: 1 }), makeProp('tree', 1730, groundY + 50, { depth: 1 })];
    return { bg: '#f3c9a0', back: [sky, far, mid, near, ...front], floorY: groundY + 78 };
  }

  const BACKGROUNDS = { room: { name: 'Room with a view', build: room }, street: { name: 'Beirut street', build: street } };

  // Replace the scene's background layers, keeping everything the user added.
  function applyBackground(scene, kind) {
    const built = BACKGROUNDS[kind].build();
    scene.objects = scene.objects.filter((o) => o.kind !== 'background' && !o.fromBackground);
    built.back.forEach((o) => { o.fromBackground = true; });
    scene.objects.unshift(...built.back);
    scene.bg = built.bg;
    scene.floorY = built.floorY;
    return built;
  }

  // --- characters ------------------------------------------------------------

  const CHARACTER_PRESETS = {
    nadim: { name: 'Nadim', colors: { skin: '#d99f72', hair: '#2a1d1a', shirt: '#d9603b', pants: '#1f2a44', shoes: '#1f1b2e', outline: INK }, hair: 'short', facial: 'mustache' },
    layal: { name: 'Layal', colors: { skin: '#e8b48f', hair: '#3a2218', shirt: '#2a7f86', pants: '#e8a33d', shoes: '#7a2f2a', outline: INK }, hair: 'long', sleeves: 'short' },
    tarek: { name: 'Tarek', colors: { skin: '#b9825c', hair: '#15110f', shirt: '#f6ead7', pants: '#7a8b4a', shoes: '#3b2a20', outline: INK }, hair: 'curly', facial: 'beard', headShape: 'oval' },
    stick: { name: 'Stick figure', style: 'stick', shadow: false },
  };

  function makeCharacter(preset, x, floorY) {
    const spec = CHARACTER_PRESETS[preset] || CHARACTER_PRESETS.nadim;
    const char = S.rig.defaultCharacter();
    const { name, colors, lengths, widths, ...rest } = spec;
    Object.assign(char, rest);
    Object.assign(char.colors, colors);
    Object.assign(char.lengths, lengths);
    Object.assign(char.widths, widths);
    const obj = M.newObject('character', { name, char });
    obj.props.x = x;
    obj.props.y = floorY - S.rig.standingHeight(char);
    return obj;
  }

  // --- motion clips ----------------------------------------------------------
  // A clip is a set of tracks with times relative to its start. Tracks listed in
  // clip.relative (x, y) are offsets from wherever the object is when applied.

  const W = S.rig.relFromWorld;
  const mirror = (pose) => {
    const out = {};
    for (const [k, v] of Object.entries(pose)) out[k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k] = v;
    return out;
  };

  function clipFromPoses(name, length, poses, extra) {
    const tracks = {};
    for (const [t, world, ease, offsets] of poses) {
      for (const [prop, v] of Object.entries(W(world))) (tracks[prop] = tracks[prop] || []).push({ t, v: U.round(v, 2), ease: ease || 'inout' });
      for (const [prop, v] of Object.entries(offsets || {})) (tracks[prop] = tracks[prop] || []).push({ t, v, ease: ease || 'inout' });
    }
    return { id: 'builtin-' + name.toLowerCase().replace(/\W+/g, '-'), name, length, builtin: true, tracks, relative: ['x', 'y'], ...extra };
  }

  function walkClip() {
    const contact = { spine: -86, head: -88, upperLegR: 62, lowerLegR: 72, footR: -18, upperLegL: 112, lowerLegL: 138, footL: 42, upperArmL: 62, lowerArmL: 40, handL: 40, upperArmR: 116, lowerArmR: 100, handR: 100 };
    const down = { spine: -84, head: -88, upperLegR: 70, lowerLegR: 98, footR: 0, upperLegL: 104, lowerLegL: 164, footL: 70, upperArmL: 70, lowerArmL: 52, handL: 52, upperArmR: 110, lowerArmR: 94, handR: 94 };
    const pass = { spine: -87, head: -89, upperLegR: 90, lowerLegR: 93, footR: 0, upperLegL: 68, lowerLegL: 134, footL: 36, upperArmL: 88, lowerArmL: 78, handL: 78, upperArmR: 94, lowerArmR: 84, handR: 84 };
    const up = { spine: -88, head: -90, upperLegR: 104, lowerLegR: 112, footR: 18, upperLegL: 54, lowerLegL: 96, footL: 8, upperArmL: 106, lowerArmL: 92, handL: 92, upperArmR: 72, lowerArmR: 54, handR: 54 };
    const half = [[0, contact, 0], [3, down, 9], [6, pass, -5], [9, up, -10]];
    const poses = [];
    for (const [t, pose, dy] of half) poses.push([t, pose, 'linear', { y: dy }]);
    for (const [t, pose, dy] of half) poses.push([t + 12, mirror(pose), 'linear', { y: dy }]);
    poses.push([24, contact, 'linear', { y: 0 }]);
    // stride: how far one full cycle carries a character of scale 1
    return clipFromPoses('Walk cycle', 24, poses, { loop: true, stride: 400, contacts: [0, 12] });
  }

  const customClips = [];

  function builtinClips() {
    const rest = {};
    return [...customClips.map((c) => U.clone(c)), ...standardClips(rest)];
  }

  function standardClips(rest) {
    return [
      walkClip(),
      clipFromPoses('Wave', 40, [
        [0, rest], [8, { upperArmR: -60, lowerArmR: -110, handR: -110 }, 'out'], [14, { upperArmR: -60, lowerArmR: -70, handR: -60 }],
        [20, { upperArmR: -60, lowerArmR: -115, handR: -125 }], [26, { upperArmR: -60, lowerArmR: -70, handR: -60 }], [32, { upperArmR: -60, lowerArmR: -110, handR: -110 }], [40, rest],
      ]),
      clipFromPoses('Nod', 24, [[0, rest], [6, { head: -72 }, 'out'], [12, { head: -94 }], [18, { head: -78 }], [24, rest]]),
      clipFromPoses('Shrug', 30, [
        [0, rest, 'inout', { y: 0 }], [8, { upperArmL: 130, lowerArmL: 60, handL: 20, upperArmR: 50, lowerArmR: 10, handR: -20, head: -80 }, 'out', { y: -8 }],
        [20, { upperArmL: 130, lowerArmL: 60, handL: 20, upperArmR: 50, lowerArmR: 10, handR: -20, head: -80 }, 'inout', { y: -8 }], [30, rest, 'inout', { y: 0 }],
      ]),
      clipFromPoses('Surprise take', 26, [
        [0, rest, 'out', { y: 0 }], [5, { spine: -80, head: -70, upperLegR: 70, lowerLegR: 110, upperLegL: 78, lowerLegL: 122 }, 'snap', { y: 34 }],
        [10, { spine: -96, head: -104, upperArmL: 150, lowerArmL: 170, upperArmR: 30, lowerArmR: 10 }, 'out', { y: -30 }],
        [18, { spine: -93, head: -98, upperArmL: 140, lowerArmL: 160, upperArmR: 40, lowerArmR: 20 }, 'inout', { y: -6 }], [26, rest, 'inout', { y: 0 }],
      ]),
      clipFromPoses('Jump', 24, [
        [0, rest, 'out', { y: 0 }],
        [5, { spine: -78, head: -80, upperLegR: 60, lowerLegR: 120, upperLegL: 70, lowerLegL: 130, upperArmL: 125, lowerArmL: 120, upperArmR: 120, lowerArmR: 110 }, 'snap', { y: 30 }],
        [9, { spine: -92, head: -96, upperLegR: 86, lowerLegR: 94, upperLegL: 96, lowerLegL: 100, upperArmL: -70, lowerArmL: -85, upperArmR: -60, lowerArmR: -80, footR: 40, footL: 50 }, 'out', { y: -110 }],
        [13, { spine: -90, upperLegR: 70, lowerLegR: 110, upperLegL: 84, lowerLegL: 124, upperArmL: -50, lowerArmL: -70, upperArmR: -40, lowerArmR: -60 }, 'in', { y: -140 }],
        [18, { spine: -80, head: -82, upperLegR: 62, lowerLegR: 118, upperLegL: 72, lowerLegL: 128, upperArmL: 110, lowerArmL: 100, upperArmR: 60, lowerArmR: 40 }, 'out', { y: 28 }],
        [24, rest, 'inout', { y: 0 }],
      ]),
      clipFromPoses('Bow', 32, [[0, rest], [9, { spine: -42, head: -30, upperArmL: 92, lowerArmL: 90, upperArmR: 88, lowerArmR: 86 }, 'inout'], [20, { spine: -42, head: -30, upperArmL: 92, lowerArmL: 90, upperArmR: 88, lowerArmR: 86 }, 'inout'], [32, rest]]),
      clipFromPoses('Dance', 24, [
        [0, { spine: -84, upperArmR: -60, lowerArmR: -100, handR: -100, upperArmL: 150, lowerArmL: 120, handL: 120 }, 'inout', { y: 0 }],
        [6, { spine: -90, upperLegR: 66, lowerLegR: 108, upperLegL: 104, lowerLegL: 116, upperArmR: 0, lowerArmR: -60, upperArmL: 120, lowerArmL: 60 }, 'inout', { y: 14 }],
        [12, { spine: -96, upperArmL: -120, lowerArmL: -80, handL: -80, upperArmR: 30, lowerArmR: 60, handR: 60 }, 'inout', { y: 0 }],
        [18, { spine: -90, upperLegR: 66, lowerLegR: 108, upperLegL: 104, lowerLegL: 116, upperArmL: 180, lowerArmL: -120, upperArmR: 60, lowerArmR: 120 }, 'inout', { y: 14 }],
        [24, { spine: -84, upperArmR: -60, lowerArmR: -100, handR: -100, upperArmL: 150, lowerArmL: 120, handL: 120 }, 'inout', { y: 0 }],
      ], { loop: true }),
      (() => {
        const c = clipFromPoses('Laugh', 24, [0, 4, 8, 12, 16, 20, 24].map((t, i) => [t, i === 0 || i === 6 ? rest : { spine: -97, head: -102 }, 'inout', { y: i % 2 ? -7 : 0 }]));
        c.tracks.mouth = [{ t: 0, v: 'grin' }, { t: 4, v: 'open' }, { t: 8, v: 'grin' }, { t: 12, v: 'open' }, { t: 16, v: 'grin' }, { t: 20, v: 'open' }, { t: 24, v: 'auto' }];
        return c;
      })(),
      (() => {
        const c = clipFromPoses('Shake head', 24, [[0, rest], [5, { head: -84 }], [11, { head: -96 }], [17, { head: -84 }], [24, rest]]);
        c.tracks.lookX = [0, 5, 11, 17, 24].map((t, i) => ({ t, v: [0, -1, 1, -1, 0][i], ease: 'inout' }));
        return c;
      })(),
      clipFromPoses('Think', 48, [[0, rest], [10, { upperArmR: 62, lowerArmR: -72, handR: -84, head: -84 }, 'inout'], [38, { upperArmR: 62, lowerArmR: -72, handR: -84, head: -84 }, 'inout'], [48, rest]]),
      clipFromPoses('Cheer', 30, [
        [0, rest, 'out', { y: 0 }], [7, { upperArmL: -112, lowerArmL: -100, handL: -100, upperArmR: -68, lowerArmR: -80, handR: -80, head: -98 }, 'overshoot', { y: -22 }],
        [14, { upperArmL: -104, lowerArmL: -92, handL: -92, upperArmR: -76, lowerArmR: -88, handR: -88, head: -96 }, 'inout', { y: 0 }],
        [21, { upperArmL: -112, lowerArmL: -100, handL: -100, upperArmR: -68, lowerArmR: -80, handR: -80, head: -98 }, 'inout', { y: -16 }], [30, rest, 'inout', { y: 0 }],
      ]),
      { id: 'builtin-blink', name: 'Blink', length: 5, builtin: true, relative: [], tracks: { eyes: [{ t: 0, v: 'closed' }, { t: 3, v: 'auto' }] } },
    ];
  }

  // Paste a clip onto an object at a frame. Returns the frame where it ends.
  function applyClip(obj, clip, start, opts = {}) {
    const repeats = Math.max(1, opts.repeats || 1);
    const relative = new Set(clip.relative || []);
    const end = start + clip.length * repeats;
    for (const [prop, keys] of Object.entries(clip.tracks)) {
      if (prop.startsWith('b.') && obj.type !== 'character') continue;
      const base = relative.has(prop) ? M.getProp(obj, prop, start) : 0;
      const existing = obj.tracks[prop];
      if (!existing && start > 0) M.upsertKey(obj, prop, 0, obj.props[prop]);
      if (obj.tracks[prop]) obj.tracks[prop] = obj.tracks[prop].filter((k) => k.t < start || k.t > end);
      for (let r = 0; r < repeats; r++) {
        for (const k of keys) {
          if (r > 0 && k.t === 0) continue;
          M.upsertKey(obj, prop, start + r * clip.length + k.t, relative.has(prop) ? base + k.v : U.clone(k.v), k.ease);
        }
      }
    }
    if (opts.travel && clip.stride) {
      const dir = M.getProp(obj, 'flip', start) ? -1 : 1;
      const x0 = M.getProp(obj, 'x', start);
      if (!obj.tracks.x && start > 0) M.upsertKey(obj, 'x', 0, obj.props.x);
      if (obj.tracks.x) obj.tracks.x = obj.tracks.x.filter((k) => k.t < start || k.t > end);
      M.upsertKey(obj, 'x', start, x0, 'linear');
      M.upsertKey(obj, 'x', end, x0 + dir * clip.stride * repeats * Math.abs(M.getProp(obj, 'scaleX', start)), 'out');
    }
    return end;
  }

  // Save an object's keys between two frames as a reusable clip.
  function clipFromObject(obj, name, from, to) {
    const tracks = {};
    const relative = ['x', 'y'];
    for (const [prop, keys] of Object.entries(obj.tracks)) {
      if (prop === 'attach' || prop.startsWith('pin')) continue;
      const slice = keys.filter((k) => k.t >= from && k.t <= to);
      if (!slice.length) continue;
      const origin = relative.includes(prop) ? slice[0].v : 0;
      tracks[prop] = slice.map((k) => ({ t: k.t - from, v: relative.includes(prop) ? k.v - origin : U.clone(k.v), ease: k.ease }));
    }
    return { id: U.uid('clip'), name, length: Math.max(1, to - from), tracks, relative };
  }

  // Registration point for js/custom.js: house-made props, clips, characters and sets that outlive any one project.
  S.custom = {
    prop(kind, def) { PROPS[kind] = () => U.clone(def); },
    clip(clip) { customClips.push({ builtin: true, relative: ['x', 'y'], ...clip, id: 'custom-' + clip.name.toLowerCase().replace(/\W+/g, '-') }); },
    clipFromPoses(name, length, poses, extra) { S.custom.clip(clipFromPoses(name, length, poses, extra)); },
    character(id, spec) { CHARACTER_PRESETS[id] = spec; },
    background(id, name, build) { BACKGROUNDS[id] = { name, build }; },
    helpers: { R, E, poly, line, arch, P, ink, grad, bgLayer, building, skyline },
  };

  S.library = {
    INK, PAL, PROPS, PROP_MAIN, BACKGROUNDS, CHARACTER_PRESETS, clipFromPoses,
    makeProp, recolor, imageObject, makeCharacter, applyBackground, builtinClips, applyClip, clipFromObject,
  };
})(window.Studio);
