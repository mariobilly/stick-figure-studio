'use strict';
// ---------------------------------------------------------------------------
// Custom library: props, motion clips, characters and sets added after the fact.
// Anything registered here shows up in the Library panel of every project.
// (Claude appends to this file when asked to make something reusable.)
// ---------------------------------------------------------------------------
//
//   Studio.custom.prop('falafel-cart', { name: 'Falafel cart', bounds: [x0, y0, x1, y1], paths: [{ d, fill, stroke, sw }] });
//   Studio.custom.clipFromPoses('Backflip', 30, [[0, {}], [10, { spine: -60 }, 'out', { y: -120 }], [30, {}]]);
//   Studio.custom.character('waiter', { name: 'Waiter', colors: { shirt: '#ffffff' }, facial: 'mustache' });
//
// Bigger things that are several layers working together (a dog, rain, a flood) are builders:
//   const dog = Studio.custom.build.dog(scene, { x: 900, y: floorY });   Studio.custom.build.dogTrot(dog, 0, 72);

(function (S) {
  const { R, E, poly, line, P, ink, grad } = S.custom.helpers;
  const U = S.util, M = S.model, L = S.library;
  const PAL = L.PAL, INK = L.INK;

  // ---------------------------------------------------------------------------
  // Street furniture and traffic (side view, facing right; flip to face left)
  // ---------------------------------------------------------------------------

  const GLASS = '#a9cbd3';
  const wheel = (x) => [ink(E(x, -30, 34), '#26232e', 5), P(E(x, -30, 14), PAL.stone)];

  function car(main, extra = []) {
    const dark = U.shade(main, 0.78);
    return [
      ink('M-138,-92 L-104,-156 Q-99,-165 -88,-165 L62,-165 Q74,-165 80,-157 L132,-92 Z', dark),
      P('M-112,-98 L-88,-150 L-22,-150 L-22,-98 Z', GLASS, INK, 4), P('M-8,-98 L-8,-150 L58,-150 L96,-98 Z', GLASS, INK, 4),
      ink(R(-222, -98, 444, 68, 20), main),
      P(line([[-15, -96], [-15, -36]]), null, INK, 3), P(R(-40, -78, 20, 6, 3), INK),
      P(R(204, -86, 18, 20, 5), '#ffe9a8', INK, 3), P(R(-222, -86, 12, 20, 4), '#d8433b', INK, 3),
      P(R(-228, -48, 456, 12, 6), '#3a3844'),
      ...extra, ...wheel(-135), ...wheel(135),
    ];
  }

  const CAR_COLORS = { 'car': '#c8553d', 'car-blue': '#3e6f9e', 'car-grey': '#8f9198', 'car-green': '#5f8a62', 'car-black': '#34323c' };
  for (const [kind, color] of Object.entries(CAR_COLORS)) {
    S.custom.prop(kind, { name: 'Car', bounds: [-232, -170, 232, 6], paths: car(color) });
    L.PROP_MAIN[kind] = [color, U.shade(color, 0.78)];
  }
  // the Beirut "service": an old cream saloon with a roof sign and a red plate
  S.custom.prop('taxi', { name: 'Service taxi', bounds: [-232, -196, 232, 6], paths: car('#efe3c4', [ink(R(-30, -190, 60, 26, 6), PAL.ochre, 4), P(R(-226, -64, 22, 12, 2), '#c0392b', INK, 2)]) });
  L.PROP_MAIN.taxi = ['#efe3c4', U.shade('#efe3c4', 0.78)];

  S.custom.prop('van', { name: 'Van', bounds: [-250, -236, 250, 6], paths: [
    ink(R(-240, -232, 480, 200, 26), '#f1efe9'),
    P('M120,-212 L206,-212 Q224,-212 228,-190 L236,-128 L120,-128 Z', GLASS, INK, 4), P(R(-206, -212, 130, 78, 8), GLASS, INK, 4), P(R(-60, -212, 150, 78, 8), GLASS, INK, 4),
    P(R(-240, -104, 480, 16), PAL.teal), P(line([[104, -232], [104, -36]]), null, INK, 3),
    P(R(222, -92, 18, 22, 5), '#ffe9a8', INK, 3), P(R(-240, -92, 12, 22, 4), '#d8433b', INK, 3), P(R(-246, -48, 492, 12, 6), '#3a3844'),
    ...wheel(-150), ...wheel(150),
  ] });

  // the white monobloc chair that holds every Beirut parking space
  S.custom.prop('plastic-chair', { name: 'Plastic chair', bounds: [-60, -176, 62, 4], paths: [
    ink(R(-46, -84, 12, 84, 5), '#dcd8cf', 4), ink(R(40, -84, 12, 84, 5), '#dcd8cf', 4),
    ink('M-52,-172 Q-52,-178 -44,-178 L-30,-178 Q-24,-178 -24,-170 L-20,-96 L-54,-96 Z', '#f6f3ec', 4),
    P(line([[-44, -160], [-40, -104]]) + line([[-34, -160], [-31, -104]]), null, 'rgba(0,0,0,0.18)', 3),
    ink(R(-56, -100, 114, 18, 8), '#f6f3ec', 4),
  ] });

  // ---------------------------------------------------------------------------
  // Builders
  // ---------------------------------------------------------------------------

  const build = S.custom.build = {};
  const K = (obj, prop, t, v, ease) => S.actions.K(obj, prop, t, v, ease);

  // A shape whose overlapping parts share one outline: stroke the union first, then fill it.
  const blob = (d, fill, sw = 10) => [P(d, null, INK, sw), P(d, fill)];

  // Dog artwork by breed. Every breed uses the same parts and pivots, so the rig and its animation never change.
  //   'mutt'      a small scruffy tan dog (default)
  //   'cavalier'  Cavalier King Charles Spaniel, Blenheim: white coat, chestnut patches, long feathered ears, plumed tail
  function dogArt(breed, o = {}) {
    if (breed === 'cavalier') {
      const white = o.color || '#fbf6ec', chestnut = o.dark || '#b5562a', shade = U.shade(white, 0.8);
      const leg = (color) => [...blob(R(-10, -6, 20, 62, 10) + E(4, 60, 16, 10), color, 9), P('M-10,20 q-9,10 -3,22 M-10,34 q-8,8 -2,18', null, INK, 3)];
      return {
        legFar: leg(shade), legNear: leg(white), legBounds: [-20, -10, 24, 76],
        tail: [P('M0,0 C-28,-4 -48,-26 -40,-58', null, INK, 26), P('M0,0 C-28,-4 -48,-26 -40,-58', null, chestnut, 17), P('M-47,-38 C-48,-46 -45,-52 -40,-58', null, white, 17),
          P('M-20,-4 q-14,8 -10,20 M-36,-16 q-16,4 -16,18 M-46,-34 q-16,0 -18,12', null, INK, 3)],
        tailBounds: [-70, -74, 12, 24],
        body: [
          ...blob(E(0, 0, 82, 40) + E(52, -8, 38, 40) + E(-54, 2, 36, 34), white),
          P(E(-12, -10, 44, 25), chestnut), P(E(-60, -2, 21, 23), chestnut),
          P('M-52,30 q7,20 15,3 q7,20 15,3 q7,20 15,3 q7,20 15,3 q7,18 15,1 q7,16 15,-1', white, INK, 3),   // feathered belly
          P('M62,18 q6,18 14,4 q6,16 12,0', white, INK, 3),                                                     // chest fluff
          P(R(50, -50, 16, 50, 6), '#2a7f86', INK, 4),
        ],
        bodyBounds: [-92, -52, 94, 56],
        head: [
          ...blob(E(30, -26, 36, 37) + E(64, -9, 23, 18), white),
          P(E(21, -33, 24, 22), chestnut),                                                                       // the patch over the eye and skull; the white blaze stays
          P('M12,-56 C-20,-60 -36,-8 -26,30 q6,15 12,3 q6,15 12,3 q7,12 12,-3 C24,6 26,-30 12,-56Z', chestnut, INK, 4),   // long feathered ear
          P('M-14,8 q4,10 8,18 M-2,12 q3,10 7,16', null, U.shade(chestnut, 0.7), 3),
          P(E(47, -29, 7.5), INK), P(E(49.5, -31.5, 2.2), '#ffffff'), P(E(85, -13, 8, 7), INK), P('M62,4 Q72,11 82,3', null, INK, 3),
        ],
        headBounds: [-40, -70, 100, 56],
      };
    }
    const fur = o.color || '#c98d4e', dark = o.dark || '#7a4a2b';
    const leg = (color) => blob(R(-10, -6, 20, 70, 10) + E(4, 64, 15, 9), color, 9);
    return {
      legFar: leg(U.shade(fur, 0.74)), legNear: leg(fur), legBounds: [-16, -10, 22, 76],
      tail: [P('M0,0 C-26,-8 -40,-36 -26,-62', null, INK, 18), P('M0,0 C-26,-8 -40,-36 -26,-62', null, fur, 9)], tailBounds: [-46, -70, 8, 8],
      body: [...blob(E(0, 0, 82, 40) + E(52, -8, 38, 40) + E(-54, 2, 36, 34), fur), P(R(50, -50, 16, 50, 6), '#d8433b', INK, 4)], bodyBounds: [-92, -52, 94, 44],
      head: [
        ...blob(E(30, -24, 38) + E(68, -12, 26, 19), fur),
        P('M8,-54 C-20,-54 -26,-6 -6,10 C12,4 24,-26 8,-54Z', dark, INK, 4),
        P(E(42, -34, 5.5), INK), P(E(91, -16, 8, 7), INK), P('M60,0 Q72,8 84,0', null, INK, 3),
      ],
      headBounds: [-24, -66, 100, 16],
    };
  }

  // A small dog: a group with a body, a head, a tail and four legs that rotate at the hip.
  // Origin = the ground under its middle. Faces right. o.breed: 'mutt' | 'cavalier'
  build.dog = function (scene, o = {}) {
    const name = o.name || 'Dog', art = dogArt(o.breed, o);
    const root = M.newObject('group', { name, breed: o.breed || 'mutt', props: { x: o.x || 0, y: o.y || 0, scaleX: o.scale || 1, scaleY: o.scale || 1 } });
    const part = (label, paths, bounds, x, y) => M.newObject('shape', { name: name + ' ' + label, kind: 'dog-part', paths, bounds, props: { x, y, attach: { id: root.id, bone: null } } });
    const legs = [
      part('far back leg', art.legFar, art.legBounds, -50, -74), part('far front leg', art.legFar, art.legBounds, 46, -74),
      part('near back leg', art.legNear, art.legBounds, -62, -74), part('near front leg', art.legNear, art.legBounds, 34, -74),
    ];
    const tail = part('tail', art.tail, art.tailBounds, -70, -112);
    const body = part('body', art.body, art.bodyBounds, 0, -98);
    const head = part('head', art.head, art.headBounds, 56, -120);
    const parts = [root, legs[0], legs[1], tail, body, legs[2], legs[3], head];
    scene.objects.push(...parts);
    return { root, body, head, tail, legs, parts };
  };

  // Change the breed of a dog that is already in a scene. Only the artwork is swapped: every key stays.
  build.restyleDog = function (scene, name, breed, o = {}) {
    const art = dogArt(breed, o), get = (label) => scene.objects.find((x) => x.name === name + ' ' + label);
    const set = (label, paths, bounds) => { const p = get(label); if (p) { p.paths = U.clone(paths); p.bounds = bounds; } return !!p; };
    const done = [
      set('far back leg', art.legFar, art.legBounds), set('far front leg', art.legFar, art.legBounds),
      set('near back leg', art.legNear, art.legBounds), set('near front leg', art.legNear, art.legBounds),
      set('tail', art.tail, art.tailBounds), set('body', art.body, art.bodyBounds), set('head', art.head, art.headBounds),
    ];
    const root = scene.objects.find((x) => x.name === name && x.type === 'group');
    if (root) root.breed = breed;
    return done.filter(Boolean).length;
  };

  // Trot in place between two frames: diagonal leg pairs swing together, the body bobs, the tail wags.
  // Move the dog by keying its root's x separately.
  build.dogTrot = function (dog, t0, t1, o = {}) {
    const half = o.half || 5, swing = o.swing || 26, y0 = S.actions.V(dog.root, 'y', t0);
    const phase = [1, -1, -1, 1];
    dog.legs.forEach((leg, i) => {
      S.actions.hold(leg, ['rotation'], t0);
      for (let t = t0 + half, k = 1; t <= t1; t += half, k = -k) K(leg, 'rotation', t, swing * k * phase[i], 'inout');
      K(leg, 'rotation', t1 + 4, 0);
    });
    S.actions.hold(dog.root, ['y'], t0);
    for (let t = t0 + half, k = 1; t <= t1; t += half, k = -k) K(dog.root, 'y', t, y0 + (k > 0 ? -5 : 0), 'inout');
    K(dog.root, 'y', t1 + 4, y0);
  };

  build.dogWag = function (dog, t0, t1, o = {}) {
    const half = o.half || 3, swing = o.swing || 18;
    S.actions.hold(dog.tail, ['rotation'], t0);
    for (let t = t0 + half, k = 1; t <= t1; t += half, k = -k) K(dog.tail, 'rotation', t, swing * k, 'inout');
    K(dog.tail, 'rotation', t1 + 3, 0);
  };

  // A value that ramps and snaps back every `period` frames, for seamless scrolling patterns.
  function sawtooth(obj, prop, t0, t1, period, from, to) {
    const step = (to - from) / period;
    for (let t = t0; t < t1; t += period) {
      M.upsertKey(obj, prop, t, from, 'linear');
      M.upsertKey(obj, prop, t + period - 1, from + step * (period - 1), 'hold');
    }
  }

  // Falling rain: one big streak pattern that tiles vertically and scrolls. Returns the layer.
  build.rain = function (scene, o = {}) {
    const t0 = o.from || 0, t1 = o.to || scene.duration, tile = 1200, n = o.count || 170;
    let seed = o.seed || 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const len = o.length || 58, slant = o.slant ?? -0.22;
    let d = '';
    for (let i = 0; i < n; i++) {
      const x = Math.round(-900 + rnd() * 3700), y = Math.round(rnd() * tile), l = Math.round(len * (0.7 + rnd() * 0.6));
      for (let k = 0; k < 3; k++) d += `M${x},${y + k * tile}l${Math.round(l * slant)},${l}`;
    }
    const rain = M.newObject('shape', { name: o.name || 'Rain', kind: 'rain', locked: true, depth: o.depth ?? 1, bounds: [-900, 0, 2800, tile * 3], paths: [P(d, null, o.color || 'rgba(214, 232, 255, 0.62)', o.width || 3)], props: { x: 0, y: -tile, opacity: 0 } });
    sawtooth(rain, 'y', t0, t1, 12, -tile, 0);
    M.upsertKey(rain, 'opacity', 0, 0, 'hold');
    M.upsertKey(rain, 'opacity', t0, 0, 'inout');
    M.upsertKey(rain, 'opacity', t0 + (o.fadeIn || 14), o.opacity ?? 1);
    scene.objects.push(rain);
    return rain;
  };

  // Flood water with a rolling surface. Key its `y` (the height of the surface in the scene) to make it rise.
  build.water = function (scene, o = {}) {
    const t0 = o.from || 0, t1 = o.to || scene.duration;
    let top = 'M-1000,0';
    for (let x = -1000; x < 3000; x += 200) top += 'q50,-14 100,0t100,0';
    const body = top + 'V1600H-1000Z';
    const water = M.newObject('shape', {
      name: o.name || 'Flood water', kind: 'water', locked: true, depth: o.depth ?? 1, bounds: [-1000, -20, 3000, 1600],
      paths: [
        P(body, grad(0, 0, 0, 520, [0, o.top || 'rgba(128, 150, 140, 0.9)'], [1, o.bottom || 'rgba(58, 84, 86, 0.96)'])),
        P(top, null, 'rgba(235, 245, 240, 0.55)', 5),
        P(top.replace('M-1000,0', 'M-1100,26'), null, 'rgba(235, 245, 240, 0.2)', 4),
      ],
      props: { x: 0, y: o.y ?? 1300 },
    });
    sawtooth(water, 'x', t0, t1, o.period || 20, 0, o.reverse ? 200 : -200);
    scene.objects.push(water);
    return water;
  };

  // A full-frame colour wash glued to the lens (darkening skies, lightning). Key its opacity.
  build.wash = function (scene, color, name) {
    const P0 = S.state.project;
    const wash = M.newObject('shape', { name: name || 'Colour wash', kind: 'wash', locked: true, depth: 0, bounds: [-200, -200, P0.width + 200, P0.height + 200], paths: [P(R(-200, -200, P0.width + 400, P0.height + 400), color)], props: { opacity: 0 } });
    scene.objects.push(wash);
    return wash;
  };


  // ---------------------------------------------------------------------------
  // The beach: a Beirut shoreline with the Pigeon Rocks on the horizon
  // ---------------------------------------------------------------------------

  function wavyTop(x0, x1, amp, half) { let d = 'M' + x0 + ',0'; for (let x = x0; x < x1; x += half * 2) d += 'q' + half / 2 + ',' + -amp + ' ' + half + ',0t' + half + ',0'; return d; }

  function beach() {
    const { bgLayer, skyline } = S.custom.helpers;
    const HORIZON = 590, SHORE = 800;
    const sky = bgLayer('Sky', 0.04, [
      P(R(-1400, -900, 4800, 1700), grad(0, -300, 0, HORIZON, [0, '#3fa7d6'], [0.6, '#a9dcec'], [1, '#f4e6c4'])),
      P(E(420, 210, 170), 'rgba(255,240,190,0.35)'), P(E(420, 210, 92), '#fff1b8'),
    ], [-1400, -900, 3400, 800]);
    const city = bgLayer('Beirut in the haze', 0.12, [...skyline(HORIZON + 6, ['#b9cbd6', '#c6d5dd', '#aebfcb'], 13).map((p) => ({ ...p, alpha: 0.75 }))], [-900, 250, 2900, 640]);
    const sea = bgLayer('Sea', 0.18, [
      P(R(-1400, HORIZON, 4800, 700), grad(0, HORIZON, 0, SHORE + 60, [0, '#2f7fa6'], [0.55, '#3fa6b8'], [1, '#7fd0c8'])),
      // the Pigeon Rocks of Raouche: the big one with its arch, and its smaller neighbour
      ink('M1290,' + (HORIZON + 40) + ' C1292,480 1320,430 1372,424 C1440,420 1474,470 1480,' + (HORIZON + 40) + ' L1436,' + (HORIZON + 40) + ' C1434,560 1420,536 1396,536 C1372,536 1360,560 1358,' + (HORIZON + 40) + ' Z', '#c9b28a', 4),
      P('M1302,470 C1340,452 1420,450 1466,474', null, '#7a8b4a', 9),
      ink('M1540,' + (HORIZON + 34) + ' C1544,520 1560,492 1588,490 C1618,490 1630,524 1634,' + (HORIZON + 34) + ' Z', '#bfa67e', 4),
      P(wavyTop(1270, 1660, 5, 20).replace('M1270,0', 'M1270,' + (HORIZON + 40)), null, 'rgba(255,255,255,0.7)', 4),
    ], [-1400, 400, 3400, 1300]);
    const swell = (name, depth, y, color, foam, period, reverse) => {
      const top = wavyTop(-1200, 3200, 9, 60);
      const o = bgLayer(name, depth, [P(top + 'V500H-1200Z', color), P(top, null, foam, 4)], [-1200, -12, 3200, 500]);
      o.props.y = y;
      sawtooth(o, 'x', 0, 2400, period, 0, reverse ? 240 : -240);
      return o;
    };
    const sand = bgLayer('Sand', 1, [
      P(wavyTop(-1400, 3400, 10, 220).replace('M-1400,0', 'M-1400,' + (SHORE + 26)) + 'V1700H-1400Z', grad(0, SHORE, 0, 1150, [0, '#d9bf85'], [0.16, '#f0d9a0'], [1, '#e6c98a'])),
      P('M-300,930 q160,-26 320,0 M520,1010 q200,-30 400,0 M1300,905 q150,-22 300,0 M1750,1030 q180,-26 360,0 M60,1060 q140,-20 280,0', null, 'rgba(160,120,60,0.22)', 5),
      P(E(300, 985, 5) + E(980, 940, 4) + E(1210, 1040, 5) + E(1620, 960, 4) + E(640, 1065, 4) + E(1880, 915, 5), 'rgba(140,100,50,0.35)'),
    ], [-1400, 790, 3400, 1700]);
    const foam = swell('Shoreline', 1, SHORE + 6, 'rgba(190,236,230,0.85)', '#ffffff', 40, true);
    foam.paths[0].d = wavyTop(-1200, 3200, 9, 60) + 'V34H-1200Z';
    return { bg: '#a9dcec', floorY: 968, back: [sky, city, sea, swell('Swell (far)', 0.3, 664, '#3b9db4', 'rgba(255,255,255,0.45)', 64, false), swell('Swell', 0.55, 728, '#57b9bf', 'rgba(255,255,255,0.6)', 52, true), foam, sand] };
  }
  S.custom.background('beach', 'Beirut beach', beach);

  S.custom.prop('beach-umbrella', { name: 'Beach umbrella', bounds: [-170, -400, 170, 6], paths: [
    ink(R(-6, -330, 12, 334), '#f6f3ec', 4),
    ink('M-168,-300 C-150,-420 150,-420 168,-300 Q126,-322 84,-300 Q42,-322 0,-300 Q-42,-322 -84,-300 Q-126,-322 -168,-300 Z', '#d9603b'),
    P('M-84,-300 C-78,-372 -40,-392 0,-392 C-26,-372 -40,-340 -42,-311 Q-63,-311 -84,-300Z', '#fffaf0'), P('M84,-300 C78,-372 40,-392 0,-392 C26,-372 40,-340 42,-311 Q63,-311 84,-300Z', '#fffaf0'),
    P(E(0, -396, 8), '#f6f3ec', INK, 3),
  ] });
  S.custom.prop('towel', { name: 'Beach towel', bounds: [-150, -16, 150, 22], paths: [ink('M-140,-10 L130,-14 L148,16 L-126,20 Z', '#2a7f86', 4), P('M-96,-11 L-74,-11 L-58,19 L-80,19Z M-10,-12 L12,-12 L28,18 L6,18Z M76,-13 L98,-13 L114,17 L92,17Z', '#fffaf0')] });
  S.custom.prop('sandcastle', { name: 'Sandcastle', bounds: [-130, -150, 160, 6], paths: [
    ink('M-96,0 L-84,-78 L-72,-78 L-72,-92 L-56,-92 L-56,-78 L-40,-78 L-40,-92 L-24,-92 L-24,-78 L-12,-78 L0,0Z', '#e2c27c', 4),
    ink('M-30,0 L-22,-112 L-10,-112 L-10,-128 L6,-128 L6,-112 L22,-112 L22,-128 L38,-128 L38,-112 L48,-112 L58,0Z', '#eccf8a', 4),
    P(R(4, -50, 22, 50, 11), '#8a6a3a'), P(line([[14, -128], [14, -150]]), null, INK, 3), P('M14,-150 L40,-142 L14,-134Z', '#d9603b', INK, 3),
    ink('M92,0 L84,-54 L150,-54 L142,0Z', '#3e6f9e', 4), P('M84,-54 C90,-92 144,-92 150,-54', null, INK, 4),
  ] });
  // two states of one flag: swap their opacity when the wind changes
  const pole = [ink(R(-5, -520, 10, 524), '#f6f3ec', 4), P(E(0, -526, 9), PAL.ochre, INK, 3)];
  S.custom.prop('flag-limp', { name: 'Flag (no wind)', bounds: [-30, -540, 60, 6], paths: [...pole, ink('M5,-508 C26,-500 30,-470 24,-430 C20,-400 28,-380 20,-352 C14,-360 8,-356 5,-362 Z', '#d8433b', 4)] });
  S.custom.prop('flag-flying', { name: 'Flag (windy)', bounds: [-30, -540, 230, 6], paths: [...pole, ink('M5,-508 C50,-530 90,-486 140,-504 C170,-514 196,-500 214,-496 C200,-470 206,-440 214,-412 C176,-424 150,-404 110,-416 C70,-428 40,-400 5,-416 Z', '#d8433b', 4)] });

  S.custom.prop('kite', { name: 'Kite', bounds: [-84, -116, 84, 146], paths: [
    ink('M0,-112 L80,-16 L0,140 L-80,-16 Z', '#d9603b'),
    P('M0,-112 L80,-16 L0,-16 Z', '#e8a33d'), P('M0,-16 L0,140 L-80,-16 Z', '#2a7f86'),
    P(line([[0, -112], [0, 140]]) + line([[-80, -16], [80, -16]]), null, INK, 4), ink('M0,-112 L80,-16 L0,140 L-80,-16 Z', null),
  ] });
  S.custom.prop('kite-tail', { name: 'Kite tail', bounds: [-40, 0, 40, 250], paths: [
    P('M0,0 C-30,40 26,80 0,120 C-26,160 24,200 0,240', null, INK, 5),
    ink('M-22,52 L0,64 L-22,76Z M22,52 L0,64 L22,76Z', '#e8a33d', 3), ink('M-22,128 L0,140 L-22,152Z M22,128 L0,140 L22,152Z', '#2a7f86', 3), ink('M-22,204 L0,216 L-22,228Z M22,204 L0,216 L22,228Z', '#d9603b', 3),
  ] });
  S.custom.prop('kite-spool', { name: 'Kite spool', bounds: [-22, -14, 22, 14], paths: [ink(R(-18, -10, 36, 20, 6), '#8a5a2b', 4), P(R(-8, -10, 16, 20), '#f6ead7', INK, 2)] });

  // A kite with its tail (the tail is a child that swishes). Origin = the middle of the kite.
  build.kite = function (scene, o = {}) {
    const kite = L.makeProp('kite', o.x || 0, o.y || 0, { name: o.name || 'Kite' });
    const tail = L.makeProp('kite-tail', 0, 138, { name: (o.name || 'Kite') + ' tail' });
    tail.props.attach = { id: kite.id, bone: null };
    scene.objects.push(tail, kite);
    return { kite, tail };
  };
  build.swish = function (obj, t0, t1, o = {}) {
    const half = o.half || 6, swing = o.swing || 14, mid = o.mid || 0;
    S.actions.hold(obj, ['rotation'], t0);
    for (let t = t0 + half, k = 1; t <= t1; t += half, k = -k) K(obj, 'rotation', t, mid + swing * k, 'inout');
  };

  // A seagull: body, head and two wings that beat around the shoulder. Faces right; flip the root to fly left.
  build.seagull = function (scene, o = {}) {
    const name = o.name || 'Seagull';
    const root = M.newObject('group', { name, props: { x: o.x || 0, y: o.y || 0, scaleX: o.scale || 1, scaleY: o.scale || 1, flip: !!o.flip } });
    const part = (label, paths, bounds, x, y) => M.newObject('shape', { name: name + ' ' + label, kind: 'gull-part', paths, bounds, props: { x, y, attach: { id: root.id, bone: null } } });
    const wingPath = (fill, tip) => [ink('M-20,4 C-40,-64 -30,-128 -4,-170 C20,-124 30,-60 22,4 Z', fill, 5), P('M-16,-122 C-12,-142 -8,-158 -4,-170 C4,-154 10,-140 14,-122 Z', tip)];
    const farWing = part('far wing', wingPath('#aeb6bd', '#2b2b33'), [-44, -176, 34, 12], 6, -14);
    const body = part('body', [
      ink('M-96,-8 L-150,-22 L-150,10 Z', '#c9d0d6', 4),
      ...blob(E(0, 0, 100, 40) + E(84, -22, 36, 32), '#fdfdfb'),
      P('M-92,-10 C-60,-38 20,-40 60,-24 C20,-14 -40,-4 -92,-10Z', '#c4ccd3'),
      ink('M112,-24 L162,-14 L114,-4 Z', '#f0b429', 4), P('M140,-12 L160,-13', null, '#c0392b', 5),
      P(E(96, -28, 5.5), INK), P('M-20,38 l-6,26 M8,38 l-4,26', null, '#e8793a', 6),
    ], [-156, -60, 166, 70], 0, 0);
    const nearWing = part('near wing', wingPath('#dfe5e9', '#2b2b33'), [-44, -176, 34, 12], -6, -10);
    const parts = [root, farWing, body, nearWing];
    scene.objects.push(...parts);
    return { root, body, farWing, nearWing, parts };
  };
  // Beat the wings between two frames (rotation 0 = wing straight up).
  build.flap = function (gull, t0, t1, o = {}) {
    const half = o.half || 4, up = o.up ?? -38, down = o.down ?? 118;
    for (const [wing, lag] of [[gull.nearWing, 0], [gull.farWing, 1]]) {
      for (let t = t0, k = 0; t <= t1; t += half, k++) K(wing, 'rotation', t + lag, k % 2 ? down : up, 'inout');
    }
  };

  build.sawtooth = sawtooth;

})(window.Studio);
