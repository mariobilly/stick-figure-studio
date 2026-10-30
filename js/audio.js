'use strict';
// ---------------------------------------------------------------------------
// Audio: dialogue, music and effects tracks, waveforms, built-in sounds, lip-sync
// ---------------------------------------------------------------------------

(function (S) {
  const U = S.util;
  const M = S.model;

  let ac = null;
  let master = null;
  let sources = [];
  const buffers = new Map();   // asset id -> AudioBuffer
  const decodedFrom = new Map();   // asset id -> the dataUrl its buffer was decoded from (a new film may reuse an id for a different recording)
  const peaks = new Map();     // asset id -> Float32Array, PEAKS_PER_SEC buckets per second
  const PEAKS_PER_SEC = 100;
  const TRACKS = ['dialogue', 'music', 'sfx'];

  function context() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    return ac;
  }

  // --- encoding helpers --------------------------------------------------------

  function bytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // 16-bit PCM WAV from per-channel Float32Arrays
  function wavBytes(channels, sampleRate) {
    const frames = channels[0].length, nch = channels.length;
    const view = new DataView(new ArrayBuffer(44 + frames * nch * 2));
    const tag = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); view.setUint32(4, 36 + frames * nch * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, nch, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * nch * 2, true);
    view.setUint16(32, nch * 2, true); view.setUint16(34, 16, true); tag(36, 'data');
    view.setUint32(40, frames * nch * 2, true);
    let at = 44;
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < nch; ch++, at += 2) view.setInt16(at, U.clamp(channels[ch][i], -1, 1) * 32767, true);
    }
    return new Uint8Array(view.buffer);
  }

  function bufferToWavBlob(buffer) {
    const channels = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
    return new Blob([wavBytes(channels, buffer.sampleRate)], { type: 'audio/wav' });
  }

  // --- assets ------------------------------------------------------------------

  function register(asset, buffer) {
    buffers.set(asset.id, buffer);
    const data = buffer.getChannelData(0);
    const bucket = buffer.sampleRate / PEAKS_PER_SEC;
    const out = new Float32Array(Math.ceil(data.length / bucket));
    for (let i = 0; i < out.length; i++) {
      let peak = 0;
      const end = Math.min(data.length, Math.floor((i + 1) * bucket));
      for (let j = Math.floor(i * bucket); j < end; j += 4) peak = Math.max(peak, Math.abs(data[j]));
      out[i] = peak;
    }
    peaks.set(asset.id, out);
  }

  async function decodeAsset(asset) {
    if (buffers.has(asset.id) && decodedFrom.get(asset.id) === asset.dataUrl) return buffers.get(asset.id);
    const bytes = dataUrlToBytes(asset.dataUrl);
    const buffer = await context().decodeAudioData(bytes.buffer);
    register(asset, buffer);
    decodedFrom.set(asset.id, asset.dataUrl);
    return buffer;
  }

  async function loadAll(project) {
    const audio = Object.values(project.assets).filter((a) => a.kind === 'audio');
    await Promise.all(audio.map((a) => decodeAsset(a).catch(() => null)));
    S.touch('view');
  }

  function importFile(project, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = async () => {
        try {
          const asset = { id: U.uid('a'), name: file.name.replace(/\.[^.]+$/, ''), kind: 'audio', dataUrl: reader.result };
          await decodeAsset(asset);
          project.assets[asset.id] = asset;
          resolve(asset);
        } catch (err) { reject(err); }
      };
      reader.readAsDataURL(file);
    });
  }

  // --- built-in sounds, synthesised so a fresh install can already make noise ---

  function synth(seconds, sr, fn) {
    const data = new Float32Array(Math.floor(seconds * sr));
    fn(data, sr);
    return { data, sr };
  }
  let noiseSeed = 22222;
  const noise = () => { noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0; return noiseSeed / 2147483648 - 1; };

  const BUILTIN = {
    footstep: { name: 'Footstep', track: 'sfx', make: () => synth(0.22, 44100, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += 0.12 * (noise() - lp);
        d[i] = lp * Math.exp(-t * 38) * 1.6 + Math.sin(2 * Math.PI * (95 - t * 120) * t) * Math.exp(-t * 30) * 0.55;
      }
    }) },
    clink: { name: 'Cup clink', track: 'sfx', make: () => synth(0.5, 44100, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(2 * Math.PI * 2140 * t) + 0.6 * Math.sin(2 * Math.PI * 3390 * t) + 0.35 * Math.sin(2 * Math.PI * 5120 * t)) * Math.exp(-t * 16) * 0.28;
      }
    }) },
    ding: { name: 'Surprise sting', track: 'sfx', make: () => synth(1.3, 44100, (d, sr) => {
      const note = (t, f) => (t < 0 ? 0 : (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t)) * Math.exp(-t * 4.5));
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (note(t, 659.3) + note(t - 0.11, 987.8) + note(t - 0.22, 1318.5)) * 0.2; }
    }) },
    whoosh: { name: 'Whoosh', track: 'sfx', make: () => synth(0.9, 44100, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length;
        lp += (0.02 + 0.28 * Math.sin(Math.PI * u) ** 2) * (noise() - lp);
        d[i] = lp * Math.sin(Math.PI * u) ** 2 * 0.9;
      }
    }) },
    pop: { name: 'Pop', track: 'sfx', make: () => synth(0.18, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) { const t = i / sr; ph += 2 * Math.PI * (520 - 2400 * t) / sr; d[i] = Math.sin(ph) * Math.exp(-t * 28) * 0.6; }
    }) },
    honk: { name: 'Car horn', track: 'sfx', make: () => synth(0.55, 44100, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, env = Math.min(1, t * 60) * Math.min(1, (0.55 - t) * 18);
        const saw = (f) => ((t * f) % 1) * 2 - 1;
        d[i] = (saw(392) + saw(494) + 0.5 * saw(784)) * 0.16 * env;
      }
    }) },
    bark: { name: 'Dog bark', track: 'sfx', make: () => synth(0.2, 44100, (d, sr) => {
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, env = Math.min(1, t * 120) * Math.exp(-t * 16);
        ph += (520 - 1500 * t) / sr;
        lp += 0.35 * (noise() - lp);
        d[i] = (((ph % 1) * 2 - 1) * 0.55 + lp * 0.9) * env * 0.75;
      }
    }) },
    thunder: { name: 'Thunder', track: 'sfx', make: () => synth(3.2, 22050, (d, sr) => {
      let brown = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        brown = (brown + 0.06 * noise()) / 1.015;
        lp += 0.5 * (noise() - lp);
        const crack = lp * Math.exp(-t * 14) * 0.9;
        const roll = brown * (Math.exp(-t * 1.1) * (0.7 + 0.3 * Math.sin(t * 9))) * 2.6;
        d[i] = U.clamp(crack + roll, -1, 1) * 0.9;
      }
    }) },
    rain: { name: 'Rain', track: 'music', make: () => synth(14, 22050, (d, sr) => {
      let lp = 0, hp = 0, prev = 0;
      for (let i = 0; i < d.length; i++) {
        const x = noise();
        lp += 0.45 * (x - lp);
        hp = 0.93 * (hp + lp - prev);
        prev = lp;
        const edge = Math.min(1, i / (sr * 1.2), (d.length - i) / (sr * 0.8));
        d[i] = hp * 0.5 * edge * (0.85 + 0.15 * Math.sin(i / sr * 2.1));
      }
    }) },
    splash: { name: 'Splash', track: 'sfx', make: () => synth(0.7, 44100, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (0.5 - 0.42 * Math.min(1, t * 2.5)) * (noise() - lp);
        d[i] = lp * Math.min(1, t * 80) * Math.exp(-t * 6) * 0.9;
      }
    }) },
    gull: { name: 'Seagull', track: 'sfx', make: () => synth(1.1, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, cry = t < 0.42 ? t / 0.42 : t < 0.5 ? -1 : (t - 0.5) / 0.6;
        if (cry < 0) { d[i] = 0; continue; }
        const f = (t < 0.42 ? 1500 - 520 * cry : 1350 - 600 * cry) * (1 + 0.035 * Math.sin(t * 95));
        ph += f / sr;
        const env = Math.sin(Math.PI * Math.min(1, cry)) ** 0.6;
        d[i] = ((((ph % 1) * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * ph) * 0.5)) * env * 0.42;
      }
    }) },
    waves: { name: 'Waves', track: 'music', make: () => synth(16, 22050, (d, sr) => {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += 0.2 * (noise() - lp);
        lp2 += 0.04 * (lp - lp2);
        const swell = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.15)) ** 2;
        const edge = Math.min(1, t / 1.5, (16 - t) / 1.5);
        d[i] = (lp * 0.5 + lp2 * 1.6) * swell * edge * 0.6;
      }
    }) },
    wind: { name: 'Gust of wind', track: 'sfx', make: () => synth(3.2, 22050, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length, env = Math.sin(Math.PI * u) ** 1.5;
        lp += (0.05 + 0.2 * env + 0.04 * Math.sin(u * 40)) * (noise() - lp);
        d[i] = lp * env * 1.5;
      }
    }) },
    slidedown: { name: 'Slide whistle down', track: 'sfx', make: () => synth(0.8, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length, f = (1500 - 1150 * u * u) * (1 + 0.012 * Math.sin(u * 60));
        ph += f / sr;
        d[i] = (Math.sin(2 * Math.PI * ph) + 0.25 * Math.sin(4 * Math.PI * ph)) * Math.min(1, u * 30) * Math.min(1, (1 - u) * 12) * 0.32;
      }
    }) },
    slideup: { name: 'Slide whistle up', track: 'sfx', make: () => synth(0.5, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length, f = 380 + 1500 * u * u;
        ph += f / sr;
        d[i] = (Math.sin(2 * Math.PI * ph) + 0.25 * Math.sin(4 * Math.PI * ph)) * Math.min(1, u * 30) * Math.min(1, (1 - u) * 10) * 0.32;
      }
    }) },
    thud: { name: 'Thud', track: 'sfx', make: () => synth(0.3, 44100, (d, sr) => {
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        ph += (130 - 260 * t) / sr;
        lp += 0.08 * (noise() - lp);
        d[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 16) * 0.9 + lp * Math.exp(-t * 30) * 1.4;
      }
    }) },
    scrape: { name: 'Sand scrape', track: 'sfx', make: () => synth(0.32, 44100, (d, sr) => {
      let lp = 0, hp = 0, prev = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length;
        lp += 0.3 * (noise() - lp); hp = 0.9 * (hp + lp - prev); prev = lp;
        d[i] = hp * Math.sin(Math.PI * u) ** 0.7 * (0.7 + 0.3 * Math.sin(u * 70)) * 0.9;
      }
    }) },
    breath: { name: 'Panting breath', track: 'sfx', make: () => synth(0.34, 44100, (d, sr) => {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length;
        lp += 0.22 * (noise() - lp); lp2 += 0.22 * (lp - lp2);
        d[i] = lp2 * Math.sin(Math.PI * u) ** 1.4 * 2.2;
      }
    }) },
    sigh: { name: 'Sigh', track: 'sfx', make: () => synth(1.2, 44100, (d, sr) => {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length, k = 0.3 - 0.22 * u;
        lp += k * (noise() - lp); lp2 += k * (lp - lp2);
        d[i] = lp2 * Math.min(1, u * 8) * (1 - u) ** 1.3 * 2.4;
      }
    }) },
    flap: { name: 'Wing flap', track: 'sfx', make: () => synth(0.14, 44100, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const u = i / d.length;
        lp += 0.07 * (noise() - lp);
        d[i] = lp * Math.sin(Math.PI * u) ** 2 * 3.2;
      }
    }) },
    twang: { name: 'String twang', track: 'sfx', make: () => synth(0.7, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, f = 196 * (1 + 0.5 * Math.exp(-t * 9)) * (1 + 0.02 * Math.sin(t * 50));
        ph += f / sr;
        d[i] = (((ph % 1) * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * ph) * 0.6) * Math.exp(-t * 6) * 0.5;
      }
    }) },
    boing: { name: 'Boing', track: 'sfx', make: () => synth(0.75, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, f = 170 + 120 * Math.exp(-t * 3) * (1 + Math.sin(t * 46));
        ph += f / sr;
        d[i] = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 4.5) * 0.55;
      }
    }) },
    flagsnap: { name: 'Flag snap', track: 'sfx', make: () => synth(1.6, 44100, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += 0.18 * (noise() - lp);
        const crack = Math.exp(-t * 40) * 2.4;
        const flutter = Math.max(0, Math.sin(t * 2 * Math.PI * 9)) ** 3 * Math.min(1, t * 6) * Math.min(1, (1.6 - t) * 2) * 0.9;
        d[i] = lp * (crack + flutter);
      }
    }) },
    trombone: { name: 'Sad trombone', track: 'sfx', make: () => synth(2.7, 44100, (d, sr) => {
      const notes = [[0, 0.5, 233.1], [0.55, 0.5, 220], [1.1, 0.5, 207.7], [1.65, 1.0, 196]];
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, n = notes.find(([s, l]) => t >= s && t < s + l);
        if (!n) { d[i] = 0; continue; }
        const u = (t - n[0]) / n[1], last = n[1] > 0.6;
        const f = n[2] * (last ? 1 - 0.06 * u * u + 0.012 * Math.sin(t * 34) * u : 1);
        ph += f / sr;
        const saw = (ph % 1) * 2 - 1;
        lp += (0.06 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 2))) * (saw - lp);   // the "wah": the filter opens and closes on each note
        d[i] = lp * Math.min(1, u * 14) * Math.min(1, (1 - u) * (last ? 3 : 9)) * 1.5;
      }
    }) },
    blip: { name: 'Curious blip', track: 'sfx', make: () => synth(0.3, 44100, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, f = t < 0.12 ? 660 : 880;
        d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-((t < 0.12 ? t : t - 0.12)) * 14) * 0.3;
      }
    }) },
    ring: { name: 'Phone ring', track: 'sfx', make: () => synth(1.6, 44100, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, on = (t % 0.8) < 0.5 ? 1 : 0;
        d[i] = (Math.sin(2 * Math.PI * 1320 * t) + Math.sin(2 * Math.PI * 1660 * t)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 22 * t)) * on * 0.22;
      }
    }) },
    buzz: { name: 'Phone buzz', track: 'sfx', make: () => synth(0.9, 44100, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, on = (t % 0.45) < 0.3 ? 1 : 0;
        d[i] = ((((t * 155) % 1) * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 78 * t)) * on * 0.4;
      }
    }) },
    alarm: { name: 'Alarm', track: 'sfx', make: () => synth(2.4, 44100, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, f = 520 + 260 * ((t * 1.6) % 1);
        ph += f / sr;
        d[i] = (((ph % 1) * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * ph) * 0.4) * Math.min(1, t * 20) * Math.min(1, (2.4 - t) * 5) * 0.33;
      }
    }) },
    click: { name: 'Click', track: 'sfx', make: () => synth(0.09, 44100, (d, sr) => {
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 1900 * t) * 0.6 + noise() * 0.5) * Math.exp(-t * 90) * 0.8; }
    }) },
    chaching: { name: 'Cha-ching', track: 'sfx', make: () => synth(0.9, 44100, (d, sr) => {
      const note = (t, f) => (t < 0 ? 0 : (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.76 * t)) * Math.exp(-t * 7));
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (note(t, 1568) + note(t - 0.09, 2093) + noise() * Math.exp(-t * 60) * 0.6) * 0.25; }
    }) },
    cheer: { name: 'Crowd cheer', track: 'sfx', make: () => synth(3.4, 22050, (d, sr) => {
      let lp = 0, hp = 0, prev = 0;
      const woos = [[0.1, 700, 1300], [0.35, 620, 1150], [0.8, 760, 1500], [1.3, 680, 1250], [1.9, 800, 1400]];
      const ph = woos.map(() => 0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, env = Math.min(1, t * 5) * Math.min(1, (3.4 - t) * 1.2);
        lp += 0.35 * (noise() - lp); hp = 0.85 * (hp + lp - prev); prev = lp;
        let v = hp * (0.8 + 0.2 * Math.sin(t * 31)) * 1.3;
        woos.forEach(([s, f0, f1], k) => { const u = (t - s) / 0.7; if (u > 0 && u < 1) { ph[k] += (f0 + (f1 - f0) * Math.sin(Math.PI * u)) / sr; v += Math.sin(2 * Math.PI * ph[k]) * Math.sin(Math.PI * u) * 0.16; } });
        d[i] = v * env * 0.6;
      }
    }) },
    boo: { name: 'Crowd boo', track: 'sfx', make: () => synth(2.6, 22050, (d, sr) => {
      const fs0 = [132, 148, 165, 176, 196, 208], ph = fs0.map(() => 0);
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr, env = Math.min(1, t * 4) * Math.min(1, (2.6 - t) * 1.5);
        let v = 0;
        fs0.forEach((f, k) => { ph[k] += f * (1 - 0.06 * t + 0.01 * Math.sin(t * (5 + k))) / sr; v += ((ph[k] % 1) * 2 - 1); });
        lp += 0.09 * (v / fs0.length + noise() * 0.25 - lp);
        d[i] = lp * env * 2.2;
      }
    }) },
    roomtone: { name: 'Room tone', track: 'music', make: () => synth(12, 22050, (d, sr) => {
      let brown = 0;
      for (let i = 0; i < d.length; i++) {
        brown = (brown + 0.02 * noise()) / 1.02;
        const edge = Math.min(1, i / sr, (d.length - i) / sr);
        d[i] = brown * 0.55 * edge;
      }
    }) },
  };

  // Returns the project's asset for a built-in sound, creating it on first use.
  function builtin(project, kind) {
    const id = 'builtin-' + kind;
    if (!project.assets[id]) {
      const { data, sr } = BUILTIN[kind].make();
      const asset = { id, name: BUILTIN[kind].name, kind: 'audio', dataUrl: 'data:audio/wav;base64,' + bytesToBase64(wavBytes([data], sr)) };
      const buffer = context().createBuffer(1, data.length, sr);
      buffer.copyToChannel(data, 0);
      register(asset, buffer);
      project.assets[id] = asset;
    }
    return project.assets[id];
  }

  function addClip(scene, asset, start, track, gain) {
    const clip = { id: U.uid('au'), assetId: asset.id, name: asset.name, track: track || 'sfx', start: Math.max(0, Math.round(start)), gain: gain ?? 1 };
    scene.audio.push(clip);
    return clip;
  }

  const duration = (assetId) => (buffers.has(assetId) ? buffers.get(assetId).duration : 0);

  // --- playback ----------------------------------------------------------------

  function schedule(ctxAudio, out, scene, fps, fromSec, atTime) {
    const made = [];
    for (const clip of scene.audio) {
      const buf = buffers.get(clip.assetId);
      if (!buf || clip.gain <= 0) continue;
      const st = clip.start / fps;
      if (st + buf.duration <= fromSec) continue;
      const src = ctxAudio.createBufferSource();
      const gain = ctxAudio.createGain();
      src.buffer = buf;
      gain.gain.value = clip.gain;
      src.connect(gain).connect(out);
      if (st >= fromSec) src.start(atTime + st - fromSec);
      else src.start(atTime, fromSec - st);
      made.push(src);
    }
    return made;
  }

  // Master bus: gentle compression into a limiter, so stacked effects never clip.
  function masterBus(ctxAudio) {
    const input = ctxAudio.createGain();
    const comp = ctxAudio.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const out = ctxAudio.createGain();
    input.gain.value = 0.8;
    out.gain.value = 0.9;
    input.connect(comp).connect(out);
    return { input, out };
  }

  // extraDest lets the video exporter record exactly what is heard
  function start(scene, fromFrame, fps, extraDest) {
    stop();
    const a = context();
    if (a.state === 'suspended') a.resume();
    const bus = masterBus(a);
    master = bus.out;
    master.connect(a.destination);
    if (extraDest) master.connect(extraDest);
    sources = schedule(a, bus.input, scene, fps, fromFrame / fps, a.currentTime + 0.02);
    if (scene.audio.length) setTimeout(() => { if (a.state !== 'running' && S.state.playing) S.toast('Sound is locked by the browser: click anywhere in this window once to turn it on.'); }, 400);
  }

  function stop() {
    for (const src of sources) { try { src.stop(); } catch (err) { /* already finished */ } }
    sources = [];
    if (master) { master.disconnect(); master = null; }
  }

  // Offline mix of a list of { scene, startSec } segments -> AudioBuffer
  async function mixdown(project, segments, totalSec) {
    const sr = 44100;
    const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(totalSec * sr)), sr);
    const bus = masterBus(off);
    bus.out.connect(off.destination);
    for (const seg of segments) schedule(off, bus.input, seg.scene, project.fps, 0, seg.startSec);
    const mix = await off.startRendering();
    // peak-safe: whatever is left above -1 dB is scaled down, never clipped
    let peak = 0;
    for (let ch = 0; ch < mix.numberOfChannels; ch++) { const d = mix.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
    if (peak > 0.89) { const k = 0.89 / peak; for (let ch = 0; ch < mix.numberOfChannels; ch++) { const d = mix.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= k; } }
    return mix;
  }

  // --- lip-sync assistant --------------------------------------------------------
  // Reads the loudness of a dialogue clip and keys mouth shapes on twos. It only
  // writes ordinary keys, so every guess can be dragged, swapped or deleted.

  function lipSync(scene, clip, obj, fps) {
    const buf = buffers.get(clip.assetId);
    if (!buf || obj.type !== 'character') return 0;
    const data = buf.getChannelData(0);
    const frames = Math.ceil(buf.duration * fps);
    const loud = [];
    let max = 1e-4;
    for (let f = 0; f < frames; f += 2) {
      const i0 = Math.floor((f / fps) * buf.sampleRate), i1 = Math.min(data.length, Math.floor(((f + 2) / fps) * buf.sampleRate));
      let sum = 0;
      for (let i = i0; i < i1; i += 2) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / Math.max(1, (i1 - i0) / 2));
      loud.push(rms);
      max = Math.max(max, rms);
    }
    const end = clip.start + frames;
    if (!obj.tracks.mouth) M.upsertKey(obj, 'mouth', 0, obj.props.mouth);
    obj.tracks.mouth = obj.tracks.mouth.filter((k) => k.t < clip.start || k.t > end);
    let last = null, count = 0;
    loud.forEach((v, i) => {
      const level = v / max;
      const rising = i > 0 && v > loud[i - 1];
      const shape = level < 0.07 ? 'closed' : level < 0.25 ? (rising ? 'small' : 'mm') : level < 0.55 ? (i % 3 === 0 ? 'o' : 'open') : 'wide';
      if (shape !== last) { M.upsertKey(obj, 'mouth', clip.start + i * 2, shape); last = shape; count++; }
    });
    M.upsertKey(obj, 'mouth', end + 1, 'auto');
    return count;
  }

  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => { if (ac && ac.state === 'suspended') ac.resume(); }, true);

  S.audio = {
    TRACKS, BUILTIN, PEAKS_PER_SEC,
    context, decodeAsset, loadAll, importFile, builtin, addClip, duration,
    peaksFor: (id) => peaks.get(id), start, stop, mixdown, bufferToWavBlob, lipSync,
  };
})(window.Studio);
