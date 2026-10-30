'use strict';
// ---------------------------------------------------------------------------
// Store: image assets, undo history, autosave, project files, character library
// ---------------------------------------------------------------------------

(function (S) {
  const U = S.util;
  const M = S.model;

  // --- image assets --------------------------------------------------------------
  // Artwork is kept as data URLs inside the project: the file stays self-contained
  // and the canvas is never tainted, so exports keep working from file://.

  const images = new Map();

  function loadImage(asset) {
    return new Promise((resolve) => {
      if (images.has(asset.id)) { resolve(images.get(asset.id)); return; }
      const img = new Image();
      img.onload = () => { images.set(asset.id, img); S.touch('view'); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = asset.dataUrl;
    });
  }

  S.assets = {
    image: (id) => images.get(id) || null,
    loadAll: (project) => Promise.all(Object.values(project.assets).filter((a) => a.kind === 'image').map(loadImage)),
    addImageFile(project, file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = async () => {
          const asset = { id: U.uid('a'), name: file.name.replace(/\.[^.]+$/, ''), kind: 'image', dataUrl: reader.result };
          const img = await loadImage(asset);
          if (!img) { reject(new Error('not an image')); return; }
          asset.w = img.naturalWidth;
          asset.h = img.naturalHeight;
          project.assets[asset.id] = asset;
          resolve(asset);
        };
        reader.readAsDataURL(file);
      });
    },
  };

  // --- undo / redo ---------------------------------------------------------------
  // Snapshots hold everything except the (immutable, heavy) assets.

  const undoStack = [];
  const redoStack = [];
  let inGesture = false;

  function snapshot() {
    const { assets, ...rest } = S.state.project;
    return JSON.stringify({ project: rest, sceneIndex: S.state.sceneIndex });
  }

  function restore(snap) {
    const data = JSON.parse(snap);
    Object.assign(S.state.project, data.project);
    S.state.sceneIndex = U.clamp(data.sceneIndex, 0, S.state.project.scenes.length - 1);
    S.state.selKeys = [];
    if (S.state.sel.kind === 'object' && !S.selected()) S.state.sel = { kind: 'none', id: null };
    if (S.state.sel.kind === 'audio' && !S.scene().audio.some((a) => a.id === S.state.sel.id)) S.state.sel = { kind: 'none', id: null };
    S.touch('all');
  }

  S.history = {
    // one undo step for a discrete action
    push() {
      undoStack.push(snapshot());
      if (undoStack.length > 120) undoStack.shift();
      redoStack.length = 0;
    },
    // one undo step for a whole drag or slider scrub, however many edits it makes
    begin() {
      if (inGesture) return;
      inGesture = true;
      S.history.push();
    },
    end() { inGesture = false; },
    undo() {
      if (!undoStack.length) return;
      if (S.playback) S.playback.stop();
      redoStack.push(snapshot());
      restore(undoStack.pop());
    },
    redo() {
      if (!redoStack.length) return;
      if (S.playback) S.playback.stop();
      undoStack.push(snapshot());
      restore(redoStack.pop());
    },
    clear() { undoStack.length = 0; redoStack.length = 0; },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
  window.addEventListener('pointerup', () => S.history.end(), true);
  window.addEventListener('change', () => S.history.end(), true);

  // --- IndexedDB key/value ---------------------------------------------------------

  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('stick-figure-studio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function kvGet(key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const req = d.transaction('kv').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function kvSet(key, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- projects ------------------------------------------------------------------

  let autosaveTimer = null;

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      kvSet('autosave', S.state.project).catch(() => { /* storage may be unavailable; the app works without it */ });
    }, 800);
  }

  async function loadAutosave() {
    try {
      const project = await kvGet('autosave');
      return isProject(project) ? project : null;
    } catch (err) {
      return null;
    }
  }

  const isProject = (p) => !!p && p.app === 'stick-figure-studio' && Array.isArray(p.scenes) && p.scenes.length > 0;

  // Fill in anything a file from an older build is missing.
  function normalise(project) {
    project.assets = project.assets || {};
    project.clips = project.clips || [];
    for (const scene of project.scenes) {
      scene.audio = scene.audio || [];
      scene.markers = scene.markers || [];
      scene.look = { grain: 0, vignette: 0, tint: '#ffb070', tintAmount: 0, ...scene.look };
      scene.camera = scene.camera || M.newCamera(project);
      for (const obj of scene.objects) {
        obj.tracks = obj.tracks || {};
        if (obj.type === 'character') {
          const def = S.rig.defaultCharacter();
          obj.char = { ...def, ...obj.char, lengths: { ...def.lengths, ...obj.char.lengths }, widths: { ...def.widths, ...obj.char.widths }, colors: { ...def.colors, ...obj.char.colors }, art: obj.char.art || {} };
          obj.props = { ...S.rig.restProps(), ...S.rig.FACE_PROPS, ...obj.props };
        }
      }
    }
    return project;
  }

  function setProject(project) {
    if (S.playback) S.playback.stop();
    S.state.project = normalise(project);
    S.state.sceneIndex = 0;
    S.state.frame = 0;
    S.state.sel = { kind: 'none', id: null };
    S.state.selKeys = [];
    S.state.view.fitted = true;
    S.history.clear();
    S.assets.loadAll(project);
    S.audio.loadAll(project);
    S.touch('all');
  }

  function saveFile() {
    const project = S.state.project;
    const name = (project.name || 'film').replace(/[^\w\- ]+/g, '').trim() || 'film';
    U.download(new Blob([JSON.stringify(project)], { type: 'application/json' }), `${name}.studio.json`);
  }

  function openFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (isProject(data)) setProject(data);
        else if (data && Array.isArray(data.frames)) setProject(importLegacy(data));
        else if (data && data.kind === 'studio-character') { insertSavedCharacter(data); return; }
        else { S.toast('That file is not a Studio project.'); return; }
        S.toast(`Opened “${S.state.project.name}”`);
      } catch (err) {
        S.toast('Could not read that file.');
      }
    };
    reader.readAsText(file);
  }

  // Version 1 projects: one pose per frame. Every frame becomes a key on every bone.
  function importLegacy(data) {
    const project = M.newProject();
    project.name = 'Imported stick animation';
    const scene = project.scenes[0];
    scene.bg = '#ffffff';
    scene.look = { grain: 0, vignette: 0, tint: '#ffb070', tintAmount: 0 };
    const k = 1.5;   // v1 stage was 1280x720
    const char = S.rig.defaultCharacter();
    Object.assign(char, { style: 'stick', shadow: false });
    Object.assign(char.lengths, { spine: 110 * k, head: 56 * k, upperArm: 62 * k, lowerArm: 58 * k, upperLeg: 82 * k, lowerLeg: 80 * k });
    char.widths.arm = 14 * k;
    const obj = M.newObject('character', { name: 'Stick figure', char });
    const names = ['spine', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'upperLegL', 'lowerLegL', 'upperLegR', 'lowerLegR'];
    const fps = U.clamp(data.fps || 8, 1, 30);
    const ease = data.smooth === false ? 'hold' : 'linear';
    data.frames.forEach((frame, i) => {
      const t = Math.round(i * project.fps / fps);
      M.upsertKey(obj, 'x', t, frame.x * k, ease);
      M.upsertKey(obj, 'y', t, frame.y * k, ease);
      names.forEach((name, j) => M.upsertKey(obj, 'b.' + name, t, U.round(U.normDeg(frame.angles[j] / U.DEG), 2), ease));
    });
    scene.duration = Math.max(project.fps, Math.round(data.frames.length * project.fps / fps));
    scene.objects.push(obj);
    return project;
  }

  function legacyAutosave() {
    try {
      const data = JSON.parse(localStorage.getItem('stick-figure-animator.project'));
      return data && Array.isArray(data.frames) && data.frames.length > 1 ? data : null;
    } catch (err) {
      return null;
    }
  }

  // --- character library (shared by every project on this machine) -----------------

  async function savedCharacters() {
    try { return (await kvGet('characters')) || []; } catch (err) { return []; }
  }

  function packCharacter(obj) {
    const assets = {};
    for (const spec of Object.values(obj.char.art)) {
      const asset = S.state.project.assets[spec.asset];
      if (asset) assets[asset.id] = asset;
    }
    return { kind: 'studio-character', id: U.uid('c'), name: obj.name, char: U.clone(obj.char), assets };
  }

  async function saveCharacter(obj) {
    const list = await savedCharacters();
    list.push(packCharacter(obj));
    await kvSet('characters', list);
  }

  async function deleteSavedCharacter(id) {
    await kvSet('characters', (await savedCharacters()).filter((c) => c.id !== id));
  }

  function insertSavedCharacter(saved) {
    const project = S.state.project, scene = S.scene();
    Object.assign(project.assets, saved.assets || {});
    S.assets.loadAll(project);
    S.history.push();
    const obj = M.newObject('character', { name: saved.name, char: U.clone(saved.char) });
    obj.props.x = project.width / 2;
    obj.props.y = (scene.floorY || project.height * 0.8) - S.rig.standingHeight(obj.char);
    scene.objects.push(obj);
    S.select('object', obj.id);
    S.touch('data');
  }

  S.store = {
    scheduleAutosave, loadAutosave, setProject, saveFile, openFile, importLegacy, legacyAutosave,
    savedCharacters, saveCharacter, deleteSavedCharacter, insertSavedCharacter, packCharacter,
  };
})(window.Studio);
