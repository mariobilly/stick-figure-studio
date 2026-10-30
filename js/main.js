'use strict';
// ---------------------------------------------------------------------------
// Main: playback, toolbar, keyboard shortcuts, boot
// ---------------------------------------------------------------------------

(function (S) {
  const U = S.util;
  const M = S.model;
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Playback. Frames are whole numbers at the film's frame rate, so the preview
  // has exactly the rhythm the export will have.
  // ---------------------------------------------------------------------------

  let startedAt = 0;

  function tick(now) {
    if (!S.state.playing) return;
    const scene = S.scene(), fps = S.state.project.fps;
    let f = Math.floor(((now - startedAt) / 1000) * fps);
    if (f >= scene.duration) {
      if (!S.state.loop) { S.state.frame = scene.duration - 1; stop(); return; }
      f = 0;
      startedAt = now;
      S.audio.start(scene, 0, fps);
    }
    if (f !== S.state.frame) { S.state.frame = f; S.touch('frame'); }
    requestAnimationFrame(tick);
  }

  function play() {
    if (S.state.playing || S.state.exporting) return;
    const scene = S.scene(), fps = S.state.project.fps;
    if (S.state.frame >= scene.duration - 1) S.state.frame = 0;
    S.state.playing = true;
    startedAt = performance.now() - (S.state.frame / fps) * 1000;
    S.audio.start(scene, S.state.frame, fps);
    S.touch('frame');
    requestAnimationFrame(tick);
  }

  function stop() {
    if (!S.state.playing) return;
    S.state.playing = false;
    S.audio.stop();
    S.touch('frame');
  }

  function seek(frame) {
    stop();
    S.state.frame = U.clamp(Math.round(frame), 0, S.scene().duration);
    S.touch('frame');
  }

  S.playback = { play, stop, seek, toggle: () => (S.state.playing ? stop() : play()) };

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  function blankProject() {
    const project = M.newProject();
    project.scenes[0].floorY = Math.round(project.height * 0.82);
    return project;
  }

  function newMenu(anchor) {
    const root = $('modal-root');
    const rect = anchor.getBoundingClientRect();
    const close = () => { root.innerHTML = ''; };
    const item = (text, fn) => U.el('button', { text, onclick: () => { close(); fn(); } });
    const items = [
      item('Demo film · “The Cup”', () => S.store.setProject(S.demo.demoProject())),
      item('Blank film', () => S.store.setProject(blankProject())),
    ];
    const legacy = S.store.legacyAutosave();
    if (legacy) items.push(item(`Import my old stick animation (${legacy.frames.length} frames)`, () => S.store.setProject(S.store.importLegacy(legacy))));
    root.innerHTML = '';
    root.append(U.el('div', { class: 'menu-back', onclick: close }, [U.el('div', { class: 'menu', style: { left: rect.left + 'px', top: rect.bottom + 4 + 'px' }, onclick: (e) => e.stopPropagation() }, items)]));
  }

  function wireToolbar() {
    $('btn-new').addEventListener('click', (e) => newMenu(e.currentTarget));
    $('btn-save').addEventListener('click', () => S.store.saveFile());
    $('btn-open').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => { if (e.target.files[0]) S.store.openFile(e.target.files[0]); e.target.value = ''; });
    $('btn-undo').addEventListener('click', () => S.history.undo());
    $('btn-redo').addEventListener('click', () => S.history.redo());
    $('btn-export').addEventListener('click', () => S.exporter.open());
    $('btn-fit').addEventListener('click', () => S.stage.fit());
    $('tg-camera').addEventListener('click', () => { S.state.cameraView = !S.state.cameraView; S.touch('all'); });
    $('film-name').addEventListener('click', () => S.select('none'));
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function onKeyDown(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') e.target.blur();
      // sliders and checkboxes should not swallow the transport keys
      if (!(tag === 'INPUT' && ['range', 'checkbox', 'color'].includes(e.target.type)) || e.key !== ' ') return;
    }
    if (S.state.exporting) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const done = () => e.preventDefault();

    if (key === ' ' && !e.shiftKey) { done(); S.playback.toggle(); }
    else if (key === 'ArrowLeft') { done(); seek(S.state.frame - (e.shiftKey ? 10 : 1)); }
    else if (key === 'ArrowRight') { done(); seek(S.state.frame + (e.shiftKey ? 10 : 1)); }
    else if (key === 'Home') { done(); seek(0); }
    else if (key === 'End') { done(); seek(S.scene().duration); }
    else if (key === ',' || key === 'j') S.timeline.jumpKey(-1);
    else if (key === '.' || key === 'l') S.timeline.jumpKey(1);
    else if (mod && key === 'z') { done(); if (e.shiftKey) S.history.redo(); else S.history.undo(); }
    else if (mod && key === 'y') { done(); S.history.redo(); }
    else if (mod && key === 's') { done(); S.store.saveFile(); }
    else if (mod && key === 'd') { done(); S.panels.duplicateSelected(); }
    else if (mod && key === 'c') { if (S.timeline.copyKeys()) done(); }
    else if (mod && key === 'v') { if (S.timeline.pasteKeys()) done(); }
    else if (mod && key === 'e') { done(); S.exporter.open(); }
    else if (key === 'Delete' || key === 'Backspace') { done(); if (!S.timeline.deleteSelectedKeys()) S.panels.deleteSelected(); }
    else if (key === 'k') S.timeline.keyAll();
    else if (key === 'm') S.timeline.addMarker();
    else if (key === 'c') { S.state.cameraView = !S.state.cameraView; S.touch('all'); }
    else if (key === 'o') { S.state.onion = !S.state.onion; S.touch('view'); }
    else if (key === 'a') { S.state.autoKey = !S.state.autoKey; S.touch('view'); }
    else if (key === 'f') S.stage.fit();
    else if (key === ']') S.panels.reorder(1);
    else if (key === '[') S.panels.reorder(-1);
    else if (key === 'Escape') S.select('none');
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  async function boot() {
    S.stage.init();
    S.timeline.init();
    S.panels.init();
    wireToolbar();
    S.bridge.init();
    window.addEventListener('keydown', onKeyDown);
    // keep focus off buttons so Space never double-fires as a click
    document.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    window.addEventListener('beforeunload', () => S.audio.stop());

    const saved = location.hash.includes('demo') ? null : await S.store.loadAutosave();
    S.store.setProject(saved || S.demo.demoProject());
    const goto = /frame=(\d+)/.exec(location.hash);
    if (goto) S.state.frame = Number(goto[1]);
    requestAnimationFrame(() => S.timeline.fitAll());
  }

  boot();
})(window.Studio);
