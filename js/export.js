'use strict';
// ---------------------------------------------------------------------------
// Export: video with sound, PNG sequence (+ WAV) for Premiere / DaVinci, stills
// ---------------------------------------------------------------------------

(function (S) {
  const U = S.util;
  const el = U.el;

  const VIDEO_TYPES = [
    ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4', 'MP4 video (H.264)'],
    ['video/mp4', 'mp4', 'MP4 video'],
    ['video/webm;codecs=vp9,opus', 'webm', 'WebM video (VP9)'],
    ['video/webm', 'webm', 'WebM video'],
  ];

  let cancelled = false;

  const project = () => S.state.project;
  const safeName = () => (project().name || 'film').replace(/[^\w\- ]+/g, '').trim() || 'film';
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);

  function segmentsFor(scope) {
    const scenes = scope === 'film' ? project().scenes : [S.scene()];
    let start = 0;
    return scenes.map((scene) => { const seg = { scene, start, startSec: start / project().fps }; start += scene.duration; return seg; });
  }
  const totalFrames = (segments) => segments.reduce((n, s) => n + s.scene.duration, 0);

  function makeCanvas(scale) {
    return el('canvas', { width: even(project().width * scale), height: even(project().height * scale) });
  }

  // --- zip (store only): the fallback when a folder cannot be picked -----------------

  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(entries) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const { name, bytes } of entries) {
      const nameBytes = enc.encode(name), crc = crc32(bytes);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(8, 0, true);
      head.setUint32(14, crc, true); head.setUint32(18, bytes.length, true); head.setUint32(22, bytes.length, true); head.setUint16(26, nameBytes.length, true);
      parts.push(head.buffer, nameBytes, bytes);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, bytes.length, true); cd.setUint32(24, bytes.length, true);
      cd.setUint16(28, nameBytes.length, true); cd.setUint32(42, offset, true);
      central.push(cd.buffer, nameBytes);
      offset += 30 + nameBytes.length + bytes.length;
    }
    const size = central.reduce((n, part) => n + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // --- exporters -----------------------------------------------------------------------

  // Real-time capture: the canvas is recorded while the film plays, with the audio mix patched in.
  async function exportVideo(segments, scale, type, ui) {
    const [mime, ext] = type;
    const fps = project().fps;
    const canvas = makeCanvas(scale);
    ui.preview(canvas);
    S.render.toCanvas(canvas, project(), segments[0].scene, 0);

    const stream = canvas.captureStream(fps);
    const ac = S.audio.context();
    if (ac.state === 'suspended') await ac.resume();
    const dest = ac.createMediaStreamDestination();
    stream.addTrack(dest.stream.getAudioTracks()[0]);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 192_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(500);

    const total = totalFrames(segments);
    for (const seg of segments) {
      if (cancelled) break;
      S.audio.start(seg.scene, 0, fps, dest);
      const t0 = performance.now();
      let last = -1;
      await new Promise((resolve) => {
        const tick = (now) => {
          const f = Math.floor(((now - t0) / 1000) * fps);
          if (cancelled || f >= seg.scene.duration) { resolve(); return; }
          if (f !== last) {
            last = f;
            S.render.toCanvas(canvas, project(), seg.scene, f);
            ui.progress((seg.start + f) / total);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      S.audio.stop();
    }
    // give the encoder a moment to take the final frame
    await new Promise((resolve) => setTimeout(resolve, 250));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    if (!cancelled) U.download(new Blob(chunks, { type: mime.split(';')[0] }), `${safeName()}.${ext}`);
  }

  // Frame-accurate: every frame is rendered and written on its own, however long it takes.
  async function exportSequence(segments, scale, ui, dir) {
    const canvas = makeCanvas(scale);
    ui.preview(canvas);
    const total = totalFrames(segments);
    const entries = [];
    const write = async (name, blob) => {
      if (dir) {
        const handle = await dir.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
      } else entries.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
    };

    let n = 0;
    for (const seg of segments) {
      for (let f = 0; f < seg.scene.duration; f++, n++) {
        if (cancelled) return;
        S.render.toCanvas(canvas, project(), seg.scene, f);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        await write(`${safeName()}_${String(n).padStart(5, '0')}.png`, blob);
        ui.progress(n / total);
        if (n % 4 === 0) await new Promise((resolve) => setTimeout(resolve));   // let the progress bar paint
      }
    }
    if (segments.some((s) => s.scene.audio.length)) {
      const mix = await S.audio.mixdown(project(), segments, total / project().fps);
      await write(`${safeName()}_audio.wav`, S.audio.bufferToWavBlob(mix));
    }
    if (!dir && !cancelled) U.download(zip(entries), `${safeName()}_png-sequence.zip`);
  }

  async function exportAudio(segments) {
    const mix = await S.audio.mixdown(project(), segments, totalFrames(segments) / project().fps);
    U.download(S.audio.bufferToWavBlob(mix), `${safeName()}.wav`);
  }

  function exportStill(scale) {
    const canvas = makeCanvas(scale);
    S.render.toCanvas(canvas, project(), S.scene(), S.state.frame);
    canvas.toBlob((blob) => U.download(blob, `${safeName()}_frame${S.state.frame}.png`), 'image/png');
  }

  // --- dialog ---------------------------------------------------------------------------

  function open() {
    S.playback.stop();
    const root = document.getElementById('modal-root');
    const videoTypes = typeof MediaRecorder === 'undefined' ? [] : VIDEO_TYPES.filter(([mime]) => MediaRecorder.isTypeSupported(mime));
    const formats = [];
    const seen = new Set();
    for (const t of videoTypes) if (!seen.has(t[1])) { seen.add(t[1]); formats.push({ id: t[1], label: t[2], type: t }); }
    formats.push({ id: 'png', label: 'PNG sequence + WAV (for Premiere / DaVinci)' }, { id: 'still', label: 'Current frame (PNG)' }, { id: 'wav', label: 'Audio mix only (WAV)' });

    const p = project();
    const format = el('select', {}, formats.map((f) => el('option', { value: f.id, text: f.label })));
    const scope = el('select', {}, [el('option', { value: 'shot', text: `This shot · ${U.round(S.scene().duration / p.fps, 1)}s` }), el('option', { value: 'film', text: `Whole film · ${p.scenes.length} shot${p.scenes.length > 1 ? 's' : ''} · ${U.round(p.scenes.reduce((n, s) => n + s.duration, 0) / p.fps, 1)}s` })]);
    const size = el('select', {}, [[1, 'Full'], [2 / 3, '⅔'], [0.5, 'Half'], [2, 'Double']].map(([k, label]) => el('option', { value: k, text: `${label} · ${even(p.width * k)}×${even(p.height * k)}` })));
    const bar = el('div', { class: 'progress' }, [el('div')]);
    const previewBox = el('div', { class: 'export-preview' });
    const note = el('p', { class: 'hint', text: 'Video is captured in real time: keep this window visible until it finishes. The PNG sequence is frame-accurate at any speed; pick a folder and frames stream straight to disk (film grain makes each PNG a few MB).' });
    const go = el('button', { class: 'primary', text: 'Export' });
    const close = el('button', { text: 'Close' });

    const ui = {
      progress: (k) => { bar.firstChild.style.width = Math.round(k * 100) + '%'; },
      preview: (canvas) => { previewBox.innerHTML = ''; previewBox.append(canvas); },
    };
    const finish = () => { S.state.exporting = false; S.audio.stop(); root.innerHTML = ''; S.touch('view'); };
    close.addEventListener('click', () => { cancelled = true; if (!S.state.exporting) finish(); });

    go.addEventListener('click', async () => {
      const chosen = formats.find((f) => f.id === format.value);
      const segments = segmentsFor(scope.value), scale = Number(size.value);
      let dir = null;
      if (chosen.id === 'png' && window.showDirectoryPicker) {
        try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); }
        catch (err) { if (err.name === 'AbortError') return; }   // anything else: fall back to a zip
      }
      cancelled = false;
      S.state.exporting = true;
      go.disabled = true;
      close.textContent = 'Cancel';
      try {
        if (chosen.type) await exportVideo(segments, scale, chosen.type, ui);
        else if (chosen.id === 'png') await exportSequence(segments, scale, ui, dir);
        else if (chosen.id === 'wav') await exportAudio(segments);
        else exportStill(scale);
        if (!cancelled) S.toast('Export finished.');
      } catch (err) {
        console.error(err);
        S.toast('Export failed: ' + err.message);
      }
      finish();
    });

    const row = (label, node) => el('div', { class: 'field' }, [el('span', { class: 'lbl', text: label }), node]);
    root.innerHTML = '';
    root.append(el('div', { class: 'modal-back' }, [el('div', { class: 'modal' }, [
      el('h2', { text: 'Export' }), row('Format', format), row('Range', scope), row('Size', size),
      previewBox, bar, note, el('div', { class: 'modal-actions' }, [close, go]),
    ])]));
  }

  S.exporter = { open };
})(window.Studio);
