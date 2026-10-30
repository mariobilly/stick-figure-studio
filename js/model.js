'use strict';
// ---------------------------------------------------------------------------
// Model: Project -> Scenes -> Objects -> Animation tracks
// ---------------------------------------------------------------------------
// Every animatable value lives in obj.props (its base value). A property only
// gets a track once it is keyed, so animating an arm never adds keys to the
// legs, the background or the camera.
//
//   obj.tracks[prop] = [{ t: frame, v: value, ease }]   (sorted by t)

(function (S) {
  const U = S.util;

  const DISCRETE = new Set([
    'flip', 'attach', 'text', 'expression', 'mouth', 'eyes', 'handL', 'handR',
    'pinL', 'pinR', 'zArmL', 'zArmR', 'zLegL', 'zLegR', 'view',
  ]);

  const LABELS = {
    x: 'Position X', y: 'Position Y', rotation: 'Rotation', scaleX: 'Scale X', scaleY: 'Scale Y',
    opacity: 'Opacity', zoom: 'Zoom', flip: 'Flip', attach: 'Attached to', text: 'Text',
    view: 'View', expression: 'Expression', mouth: 'Mouth', eyes: 'Eyes', lookX: 'Look X', lookY: 'Look Y',
    handL: 'Back hand', handR: 'Front hand', pinL: 'Pin back foot', pinR: 'Pin front foot',
    zArmL: 'Back arm layer', zArmR: 'Front arm layer', zLegL: 'Back leg layer', zLegR: 'Front leg layer',
  };

  const BONE_LABELS = {
    spine: 'Torso', head: 'Head',
    upperArmL: 'Back upper arm', lowerArmL: 'Back forearm', handL: 'Back hand',
    upperArmR: 'Front upper arm', lowerArmR: 'Front forearm', handR: 'Front hand',
    upperLegL: 'Back thigh', lowerLegL: 'Back shin', footL: 'Back foot',
    upperLegR: 'Front thigh', lowerLegR: 'Front shin', footR: 'Front foot',
  };

  const metaCache = new Map();
  function meta(name) {
    let m = metaCache.get(name);
    if (!m) {
      if (name.startsWith('b.')) m = { type: 'angle', label: BONE_LABELS[name.slice(2)] || name };
      else m = { type: DISCRETE.has(name) ? 'discrete' : 'num', label: LABELS[name] || name };
      metaCache.set(name, m);
    }
    return m;
  }

  // ---------------------------------------------------------------------------
  // Tracks and keys
  // ---------------------------------------------------------------------------

  function evalTrack(keys, f, type) {
    const n = keys.length;
    if (f <= keys[0].t) return keys[0].v;
    if (f >= keys[n - 1].t) return keys[n - 1].v;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (keys[mid].t <= f) lo = mid; else hi = mid;
    }
    const k0 = keys[lo], k1 = keys[hi];
    if (type === 'discrete' || k0.ease === 'hold') return k0.v;
    const t = S.ease.apply(k0.ease, (f - k0.t) / (k1.t - k0.t));
    return type === 'angle' ? U.lerpAngle(k0.v, k1.v, t) : U.lerp(k0.v, k1.v, t);
  }

  function getProp(obj, name, f) {
    const keys = obj.tracks[name];
    if (keys && keys.length) return evalTrack(keys, f, meta(name).type);
    return obj.props[name];
  }

  function keyAt(obj, name, f) {
    const keys = obj.tracks[name];
    return keys ? keys.find((k) => k.t === f) || null : null;
  }

  function upsertKey(obj, name, f, v, ease) {
    const keys = obj.tracks[name] || (obj.tracks[name] = []);
    const existing = keys.find((k) => k.t === f);
    if (existing) {
      existing.v = v;
      if (ease) existing.ease = ease;
      return existing;
    }
    const key = { t: f, v };
    if (meta(name).type !== 'discrete') key.ease = ease || S.state.defaultEase;
    keys.push(key);
    keys.sort((a, b) => a.t - b.t);
    return key;
  }

  // Edit a property at a frame. A property that is already animated always
  // takes a key; an un-animated one only does when auto-key is on.
  function setProp(obj, name, v, f, autoKey) {
    const keys = obj.tracks[name];
    if (keys && keys.length) { upsertKey(obj, name, f, v); return true; }
    if (autoKey) {
      // keep the starting value so the change plays as a move, not a jump cut to a new constant
      if (f > 0) upsertKey(obj, name, 0, obj.props[name]);
      upsertKey(obj, name, f, v);
      return true;
    }
    obj.props[name] = v;
    return false;
  }

  function removeKey(obj, name, key) {
    const keys = obj.tracks[name];
    if (!keys) return;
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1);
    if (!keys.length) delete obj.tracks[name];
  }

  function toggleKey(obj, name, f) {
    const key = keyAt(obj, name, f);
    if (key) {
      // a track's last key becomes the new base value
      if (obj.tracks[name].length === 1) obj.props[name] = key.v;
      removeKey(obj, name, key);
    } else {
      upsertKey(obj, name, f, U.clone(getProp(obj, name, f) ?? null));
    }
  }

  function keyTimes(obj) {
    const times = new Set();
    for (const keys of Object.values(obj.tracks)) for (const k of keys) times.add(k.t);
    return [...times].sort((a, b) => a - b);
  }

  function sortTracks(obj) {
    for (const keys of Object.values(obj.tracks)) keys.sort((a, b) => a.t - b.t);
  }

  // ---------------------------------------------------------------------------
  // Factories
  // ---------------------------------------------------------------------------

  const BASE_PROPS = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, flip: false, attach: null };

  function newObject(type, init) {
    const obj = {
      id: U.uid('o'),
      name: type,
      type,                 // character | shape | image | text | group
      depth: 1,             // parallax: 0 = glued to the lens, 1 = normal, >1 = foreground
      step: 1,              // hold every N frames: 1 = smooth, 2 = "on twos"
      hidden: false,
      locked: false,
      props: { ...BASE_PROPS },
      tracks: {},
    };
    const { props, ...rest } = init || {};
    Object.assign(obj, rest);
    Object.assign(obj.props, props);
    if (type === 'character') {
      obj.char = obj.char || S.rig.defaultCharacter();
      obj.props = { ...S.rig.restProps(), ...S.rig.FACE_PROPS, ...obj.props };
    }
    if (type === 'text') {
      obj.props.text = obj.props.text ?? 'Text';
      obj.font = obj.font || { size: 64, weight: 700, family: 'Georgia, serif', color: '#1f1b2e', align: 'center' };
    }
    return obj;
  }

  function newCamera(project) {
    return {
      id: 'camera', name: 'Camera', type: 'camera',
      props: { x: project.width / 2, y: project.height / 2, zoom: 1, rotation: 0 },
      tracks: {},
    };
  }

  function newScene(project, name) {
    return {
      id: U.uid('s'),
      name: name || `Shot ${project.scenes.length + 1}`,
      duration: project.fps * 10,     // frames
      bg: '#f4ecdf',
      look: { grain: 0.18, vignette: 0.22, tint: '#ffb070', tintAmount: 0 },
      camera: newCamera(project),
      objects: [],                    // back to front
      audio: [],                      // [{ id, assetId, name, track, start, gain }]
      markers: [],                    // [{ t, label }]
    };
  }

  function newProject() {
    const project = {
      app: 'stick-figure-studio', version: 2,
      name: 'Untitled film',
      width: 1920, height: 1080, fps: 24,
      assets: {},                     // id -> { id, name, kind: image|audio, dataUrl }
      clips: [],                      // saved motion clips
      scenes: [],
    };
    project.scenes.push(newScene(project));
    return project;
  }

  // ---------------------------------------------------------------------------
  // Evaluation context: world matrices and poses for one frame, cached
  // ---------------------------------------------------------------------------

  const effFrame = (obj, f) => (obj.step > 1 ? Math.floor(f / obj.step) * obj.step : f);

  function evalCtx(scene, f) {
    const mats = new Map();
    const poses = new Map();
    const byId = new Map(scene.objects.map((o) => [o.id, o]));

    const ctx = {
      scene, f, byId,
      P: (o, name) => getProp(o, name, effFrame(o, f)),

      local(o) {
        const flip = ctx.P(o, 'flip') ? -1 : 1;
        return new DOMMatrix()
          .translateSelf(ctx.P(o, 'x'), ctx.P(o, 'y'))
          .rotateSelf(ctx.P(o, 'rotation'))
          .scaleSelf(ctx.P(o, 'scaleX') * flip, ctx.P(o, 'scaleY'));
      },

      // Space the object's transform lives in: the scene, another object, or one of a character's bones.
      parentMatrix(o, guard = 0) {
        const at = ctx.P(o, 'attach');
        const parent = at && guard < 16 ? byId.get(at.id) : null;
        if (!parent || parent === o) return new DOMMatrix();
        let m = ctx.matrix(parent, guard + 1);
        if (at.bone && parent.type === 'character') {
          const b = ctx.pose(parent).b[at.bone];
          if (b) m = m.translate(b.ex, b.ey).rotate(b.a / U.DEG);
        }
        return m;
      },

      matrix(o, guard = 0) {
        let m = mats.get(o.id);
        if (!m) {
          m = ctx.parentMatrix(o, guard).multiply(ctx.local(o));
          mats.set(o.id, m);
        }
        return m;
      },

      pose(o) {
        let p = poses.get(o.id);
        if (!p) {
          p = S.rig.computePose(o, ctx);
          poses.set(o.id, p);
        }
        return p;
      },

      // attached objects ride on their root's parallax layer
      depth(o, guard = 0) {
        const at = ctx.P(o, 'attach');
        const parent = at && guard < 16 ? byId.get(at.id) : null;
        return parent && parent !== o ? ctx.depth(parent, guard + 1) : o.depth;
      },

      camera() {
        const cam = scene.camera;
        return {
          x: getProp(cam, 'x', f), y: getProp(cam, 'y', f),
          zoom: Math.max(0.05, getProp(cam, 'zoom', f)), rotation: getProp(cam, 'rotation', f),
        };
      },
    };
    return ctx;
  }

  // Scene space -> stage space for one parallax layer.
  function layerMatrix(project, cam, depth) {
    const cx = project.width / 2, cy = project.height / 2;
    const z = Math.pow(cam.zoom, depth);
    return new DOMMatrix()
      .translateSelf(cx, cy)
      .rotateSelf(depth === 0 ? 0 : -cam.rotation)
      .scaleSelf(z, z)
      .translateSelf(-(cx + (cam.x - cx) * depth), -(cy + (cam.y - cy) * depth));
  }

  // ---------------------------------------------------------------------------
  // Attach / detach: re-parent at a frame without the object jumping on screen
  // ---------------------------------------------------------------------------

  const TRANSFORM = ['x', 'y', 'rotation', 'scaleX', 'scaleY'];

  function attachTo(scene, obj, target, f) {
    const world = evalCtx(scene, f).matrix(obj);
    const animated = f > 0;

    if (animated) {
      // pin down the old motion one frame earlier, so the switch is a clean cut
      for (const name of TRANSFORM) {
        if (!obj.tracks[name]) upsertKey(obj, name, 0, obj.props[name]);
        upsertKey(obj, name, f - 1, getProp(obj, name, f - 1));
      }
      if (!obj.tracks.attach) upsertKey(obj, 'attach', 0, obj.props.attach);
      upsertKey(obj, 'attach', f, target);
    } else {
      setProp(obj, 'attach', target, 0, false);
    }

    const parent = evalCtx(scene, f).parentMatrix(obj);
    const m = parent.inverse().multiply(world);
    const flip = getProp(obj, 'flip', f) ? -1 : 1;
    const sx = Math.hypot(m.a, m.b) || 1e-6;
    const values = {
      x: m.e, y: m.f,
      rotation: Math.atan2(m.b, m.a) / U.DEG,
      scaleX: sx * flip,
      scaleY: U.det(m) / sx,
    };
    for (const name of TRANSFORM) {
      const v = U.round(values[name], 4);
      if (animated || obj.tracks[name]) upsertKey(obj, name, f, v);
      else obj.props[name] = v;
    }
  }

  S.model = {
    meta, BONE_LABELS, TRANSFORM,
    evalTrack, getProp, setProp, keyAt, upsertKey, removeKey, toggleKey, keyTimes, sortTracks,
    newObject, newCamera, newScene, newProject,
    effFrame, evalCtx, layerMatrix, attachTo,
  };
})(window.Studio);
