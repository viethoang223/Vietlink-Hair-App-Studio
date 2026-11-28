/* Vietlink video studio, media: opening clips, the live preview player, thumbnails and MP4 export (Mediabunny). */
let MB = null;
const MB_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.65.2/dist/bundles/mediabunny.min.mjs';
async function loadMB() { if (!MB) MB = await import(MB_URL); return MB; }

const ASSET_IMG = {};
async function loadAssets() {
  if (ASSET_IMG.logo) return;
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Không tải được logo')); i.src = src; });
  await Promise.all([document.fonts.load('800 76px BrandHeavy'), document.fonts.load('700 32px BrandBold')]);
  ASSET_IMG.brandLogo = await load(ASSETS.logo); ASSET_IMG.icon = await load(ASSETS.icon);
  let custom = null; try { custom = localStorage.getItem('vl_logo'); } catch (e) {}
  ASSET_IMG.logo = custom ? await load(custom).catch(() => ASSET_IMG.brandLogo) : ASSET_IMG.brandLogo;
  const c = document.createElement('canvas'), s = 96; c.width = c.height = s; const x = c.getContext('2d');
  x.drawImage(ASSET_IMG.icon, 0, 0, s, s); x.globalCompositeOperation = 'source-in'; x.fillStyle = BRAND.whatsappIcon; x.fillRect(0, 0, s, s);
  ASSET_IMG.iconGreen = c;
}


/* ---------- optional image AI for clip type (CLIP ViT-B/32 via transformers.js) ---------- */
/* Off until the user turns it on: the first use downloads about 85 MB, which the browser then keeps. The weights in
   CLASSIFIER were trained on labelled Vietlink clips by video/tools/train_classifier.py from the same model file. */
const AI = {on: false, T: null, proc: null, model: null, loading: null};
try { AI.on = localStorage.getItem('vl_ai') === '1'; } catch (e) {}
const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
async function loadAI(onProgress) {
  if (AI.model) return AI;
  if (!AI.loading) AI.loading = (async () => {
    const T = await import(TJS_URL); T.env.allowLocalModels = false;
    const files = {};
    const progress_callback = p => { if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; const done = Object.values(files).reduce((a, v) => a + v[0], 0), all = Object.values(files).reduce((a, v) => a + v[1], 0); if (onProgress) onProgress(done / all, all); } };
    const proc = await T.AutoProcessor.from_pretrained(CLASSIFIER.model, {progress_callback});
    const model = await T.CLIPVisionModelWithProjection.from_pretrained(CLASSIFIER.model, {dtype: CLASSIFIER.dtype, device: 'wasm', progress_callback});
    Object.assign(AI, {T, proc, model});
    return AI;
  })().catch(e => { AI.loading = null; throw e; });
  return AI.loading;
}
/** Mean CLIP embedding of frames at 25, 50 and 75% of the clip, L2-normalised, as in training. */
async function clipEmbedding(clip) {
  const {T, proc, model} = AI, sink = new MB.CanvasSink(clip.track, {width: 448}), imgs = [];
  for (const f of [.25, .5, .75]) { const w = await sink.getCanvas(clip.duration * f); if (w) imgs.push(T.RawImage.fromCanvas(w.canvas)); }
  const {image_embeds: E} = await model(await proc(imgs));
  const [n, D] = E.dims, v = new Float64Array(D);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < D; j++) s += E.data[i * D + j] ** 2; s = Math.sqrt(s); for (let j = 0; j < D; j++) v[j] += E.data[i * D + j] / s; }
  let nv = 0; for (let j = 0; j < D; j++) nv += v[j] * v[j]; nv = Math.sqrt(nv);
  return Array.from(v, x => x / nv);
}

let clipSeq = 0;
/** Opens one file: reads its tracks, checks this browser can decode it, and prepares two <video> elements for preview. */
async function openClip(file) {
  await loadMB();
  const input = new MB.Input({formats: MB.ALL_FORMATS, source: new MB.BlobSource(file)});
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error(file.name + ': không có hình.');
  if (!(await track.canDecode())) throw new Error(file.name + ': trình duyệt này không đọc được định dạng video ' + (track.codec || '') + '. Hãy dùng Chrome hoặc Edge bản mới, hoặc iPhone iOS 17 trở lên.');
  const duration = await input.computeDuration(), audioTrack = await input.getPrimaryAudioTrack();
  const stats = await track.computePacketStats(60).catch(() => null);
  const url = URL.createObjectURL(file), els = [0, 1].map(() => { const v = document.createElement('video'); v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; return v; });
  return {id: 'c' + (++clipSeq), name: file.name, file, input, track, audioTrack: audioTrack && (await audioTrack.canDecode()) ? audioTrack : null,
    duration, fps: stats ? stats.averagePacketRate : 30, width: track.displayWidth, height: track.displayHeight, url, els, type: 'B', sure: false, motion: []};
}
function closeClip(c) { c.els.forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); URL.revokeObjectURL(c.url); }

/* ---------- live preview ---------- */
class Player {
  constructor(canvas, clips) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.clips = clips; this.t = 0; this.playing = false; this.onTime = null; this.loop = this.loop.bind(this);
    /* A paused preview is redrawn when a seek lands, otherwise it would show the frame from before the seek. */
    const redraw = () => { if (!this.playing && this.edl) this.draw(); };
    clips.forEach(c => c.els.forEach(v => { v.onseeked = redraw; v.onloadeddata = redraw; }));
  }
  set(edl) { this.edl = edl; this.L = layout(edl); this.t = Math.min(this.t, this.L.total); this.draw(); }
  clip(id) { return this.clips.find(c => c.id === id); }
  el(s) { const c = this.clip(s.clip); return c && c.els[s.i % 2]; }
  play() { if (this.playing) return; if (this.t >= this.L.total - .05) this.t = 0; this.playing = true; this.last = performance.now(); requestAnimationFrame(this.loop); }
  pause() { this.playing = false; this.clips.forEach(c => c.els.forEach(v => v.pause())); this.draw(); }
  seek(t) { this.t = clamp(t, 0, this.L.total); this.sync(true); this.draw(); }
  loop(now) {
    if (!this.playing) return;
    this.t += (now - this.last) / 1000; this.last = now;
    if (this.t >= this.L.total) { this.t = this.L.total; this.pause(); if (this.onTime) this.onTime(this.t); return; }
    this.sync(false); this.draw();
    requestAnimationFrame(this.loop);
  }
  /* Keeps each active segment's <video> at the right source time, and cues the next one a little early. */
  sync(scrub) {
    const t = this.t, L = this.L, act = activeAt(L, t), busy = new Set();
    for (const s of act) {
      const v = this.el(s); if (!v) continue; busy.add(v);
      const want = srcTime(s, t);
      if (v._seg !== s.i || Math.abs(v.currentTime - want) > (scrub || !this.playing ? .04 : .3)) { v.currentTime = want; v._seg = s.i; }
      v.playbackRate = s.speed; v.muted = !(this.edl.audio && s.speed === 1);
      if (this.playing && !scrub && !isFrozen(s, t)) { if (v.paused) v.play().catch(() => {}); } else v.pause();
    }
    for (const s of L.segs) {
      if (s.at > t && s.at - t < .9) { const v = this.el(s); if (v && !busy.has(v) && v._seg !== s.i) { v.pause(); v.currentTime = s.start; v._seg = s.i; busy.add(v); } }
    }
    this.clips.forEach(c => c.els.forEach(v => { if (!busy.has(v) && !v.paused) v.pause(); }));
    if (this.edl.intro && t < L.introEnd && L.segs[0]) { const v = this.el(L.segs[0]); if (v && v._seg !== 0) { v.currentTime = L.segs[0].start; v._seg = 0; } }
  }
  draw() {
    if (!this.edl) return;
    const x = this.x, k = this.c.width / OUT_W, L = this.L;
    x.setTransform(k, 0, 0, k, 0, 0);
    const first = L.segs[0], last = L.segs[L.segs.length - 1];
    renderFrame(x, this.edl, L, Math.min(this.t, L.total - 1e-3), s => { const v = this.el(s); return v && v.readyState >= 2 ? v : null; },
      {firstImg: first && this.el(first), lastImg: last && this.el(last)});
    if (this.onTime) this.onTime(this.t);
  }
}

/* ---------- still frames for variant cards ---------- */
const thumbSinks = new Map();
async function frameAt(clip, time, width = 360) {
  const key = clip.id + ':' + width;
  if (!thumbSinks.has(key)) thumbSinks.set(key, new MB.CanvasSink(clip.track, {width}));
  const w = await thumbSinks.get(key).getCanvas(clamp(time, 0, clip.duration - .05));
  return w && w.canvas;
}
async function renderThumb(canvas, edl, clips, t) {
  const L = layout(edl), x = canvas.getContext('2d'), k = canvas.width / OUT_W;
  t = t == null ? L.bodyStart + (L.bodyEnd - L.bodyStart) * .35 : t;
  const act = activeAt(L, t), imgs = new Map();
  for (const s of act) imgs.set(s.i, await frameAt(clips.find(c => c.id === s.clip), srcTime(s, t)));
  x.setTransform(k, 0, 0, k, 0, 0);
  renderFrame(x, edl, L, t, s => imgs.get(s.i));
}

/* ---------- export ---------- */
/** Encodes the edit list to an MP4 (H.264 + AAC when sound is kept) and returns a Blob. */
/* range [from, to] in seconds exports only that part, silent (used for the intro/outro cards sent to CapCut). */
/* Encoder settings tried in order. Some Macs (VideoToolbox) refuse a constant bitrate or a profile, so the export
   tries the next one instead of failing. The last one used is remembered for this browser. */
const VCFGS = [{bitrate: 12e6, bitrateMode: 'constant'}, {bitrate: 12e6, bitrateMode: 'variable'}, {bitrate: 10e6}, {bitrate: 6e6}, {quality: 'medium'}];
const EXPORT_LOG = [];
async function exportMp4(edl, clips, onProgress, isCancelled, range) {
  let start = 0; try { start = Math.max(0, VCFGS.findIndex(c => JSON.stringify(c) === localStorage.getItem('vl_vcfg'))); } catch (e) {}
  const order = [...VCFGS.slice(start), ...VCFGS.slice(0, start)], errors = [];
  for (const cfg of order) {
    try {
      const blob = await exportMp4Once(edl, clips, onProgress, isCancelled, range, cfg);
      try { localStorage.setItem('vl_vcfg', JSON.stringify(cfg)); } catch (e) {}
      if (errors.length) EXPORT_LOG.push('Dùng được cấu hình ' + JSON.stringify(cfg) + ' sau khi thử: ' + errors.join(' | '));
      return blob;
    } catch (e) {
      if (e.message === 'cancelled') throw e;
      errors.push(JSON.stringify(cfg) + ' → ' + (e && e.message || e));
      onProgress(0, 'Máy này không nhận một cấu hình mã hóa, đang thử cách khác...');
    }
  }
  const err = new Error('Máy này không mã hóa được video H.264 bằng trình duyệt. Hãy thử Chrome bản mới, hoặc dùng nút Mở trong CapCut để xuất từ CapCut.');
  err.details = errors; EXPORT_LOG.push(...errors); throw err;
}
async function exportMp4Once(edl, clips, onProgress, isCancelled, range, cfg) {
  await loadMB();
  const L = layout(edl), N = Math.ceil((range ? range[1] : L.total) * FPS), N0 = range ? Math.floor(range[0] * FPS) : 0, canvas = document.createElement('canvas');
  canvas.width = OUT_W; canvas.height = OUT_H;
  const x = canvas.getContext('2d', {alpha: false});
  const output = new MB.Output({format: new MB.Mp4OutputFormat({fastStart: 'in-memory'}), target: new MB.BufferTarget()});
  /* 12 Mbps cap: sharp at 1080x1920 for Reels/TikTok, and noise effects (film grain) cannot balloon the file. */
  const vcfg = {codec: 'avc', keyFrameInterval: 2};
  if (cfg.quality) vcfg.quality = cfg.quality === 'medium' ? MB.QUALITY_MEDIUM : MB.QUALITY_HIGH; else { vcfg.bitrate = cfg.bitrate; if (cfg.bitrateMode) vcfg.bitrateMode = cfg.bitrateMode; }
  const vsrc = new MB.CanvasSource(canvas, vcfg);
  output.addVideoTrack(vsrc, {frameRate: FPS});
  const clipOf = id => clips.find(c => c.id === id);
  const withSound = !range && edl.audio && L.segs.some(s => s.speed === 1 && clipOf(s.clip).audioTrack) && await MB.canEncodeAudio('aac');
  let asrc = null;
  if (withSound) { asrc = new MB.AudioBufferSource({codec: 'aac', quality: MB.QUALITY_HIGH}); output.addAudioTrack(asrc); }
  await output.start();
  if (asrc) { onProgress(0, 'Đang trộn tiếng...'); await asrc.add(await mixAudio(edl, L, clipOf)); }
  else if (edl.audio) onProgress(0, 'Máy này không tạo được tiếng AAC, video sẽ không có tiếng.');
  const copy = c => { if (!c) return null; const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); return k; };
  const first = L.segs[0], last = L.segs[L.segs.length - 1];
  const extra = {firstImg: edl.intro ? copy(await frameAt(clipOf(first.clip), first.start, 1080)) : null, lastImg: edl.outro ? copy(await frameAt(clipOf(last.clip), srcTime(last, last.end - 1 / FPS), 1080)) : null};
  const runs = new Map();
  const open = s => {
    const times = [];
    for (let n = Math.max(N0, Math.floor(s.at * FPS) - 1); n < N && n / FPS < s.end; n++) if (n / FPS >= s.at) times.push(srcTime(s, n / FPS));
    const sink = new MB.CanvasSink(clipOf(s.clip).track, {poolSize: 3});
    return {it: sink.canvasesAtTimestamps(times), img: null};
  };
  try {
    for (let n = N0; n < N; n++) {
      if (isCancelled()) throw new Error('cancelled');
      const t = n / FPS, act = activeAt(L, t);
      for (const s of act) {
        if (!runs.has(s.i)) runs.set(s.i, open(s));
        const r = runs.get(s.i), step = await r.it.next();
        if (!step.done && step.value) r.img = step.value.canvas;
      }
      for (const [i, r] of runs) if (!act.some(s => s.i === i)) { r.it.return(); runs.delete(i); }
      renderFrame(x, edl, L, t, s => runs.get(s.i) && runs.get(s.i).img, extra);
      await vsrc.add(t - N0 / FPS, 1 / FPS);
      if (n % 5 === 0) onProgress((n - N0) / (N - N0), 'Đang xuất video...');
    }
    await output.finalize();
  } catch (e) {
    for (const r of runs.values()) r.it.return();
    await output.cancel().catch(() => {});
    throw e;
  }
  onProgress(1, 'Xong');
  return new Blob([output.target.buffer], {type: 'video/mp4'});
}
/** Mixes the original sound of normal-speed segments onto the output clock, with short fades at every cut. */
async function mixAudio(edl, L, clipOf) {
  const rate = 48000, ctx = new OfflineAudioContext(2, Math.ceil(L.total * rate), rate);
  for (const s of L.segs) {
    const clip = clipOf(s.clip);
    if (s.speed !== 1 || !clip.audioTrack) continue;
    const sink = new MB.AudioBufferSink(clip.audioTrack), gain = ctx.createGain(), fade = .06;
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, s.at); gain.gain.linearRampToValueAtTime(1, s.at + Math.max(fade, s.tDur));
    gain.gain.setValueAtTime(1, Math.max(s.at + Math.max(fade, s.tDur), s.end - fade)); gain.gain.linearRampToValueAtTime(0, s.end);
    for await (const wb of sink.buffers(s.start, s.start + s.len)) {
      const src = ctx.createBufferSource(); src.buffer = wb.buffer; src.connect(gain);
      const offset = Math.max(0, s.start - wb.timestamp), when = s.at + Math.max(0, wb.timestamp - s.start), dur = Math.min(wb.buffer.duration - offset, s.end - when);
      if (dur > 0) src.start(when, offset, dur);
    }
  }
  return ctx.startRendering();
}

/* ---------- send to CapCut (Chrome/Edge: File System Access) ---------- */
/* The user picks CapCut's project folder (com.lveditor.draft) once; the browser remembers the folder handle in
   IndexedDB. A new project folder is written there with the clips, logo, icon and intro/outro cards copied into
   materials/, the draft files built by capcut.js, and an entry added to root_meta_info.json (backed up first). */
const canCapcut = () => 'showDirectoryPicker' in window;
const idb = (mode, fn) => new Promise((ok, no) => {
  const r = indexedDB.open('vietlink-studio', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onerror = () => no(r.error);
  r.onsuccess = () => { const tx = r.result.transaction('kv', mode), st = tx.objectStore('kv'), q = fn(st); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); };
});
async function capcutFolder(forcePick) {
  let dir = forcePick ? null : await idb('readonly', st => st.get('capcutDir')).catch(() => null);
  if (dir) {
    let perm = await dir.queryPermission({mode: 'readwrite'});
    if (perm !== 'granted') perm = await dir.requestPermission({mode: 'readwrite'});
    if (perm !== 'granted') dir = null;
  }
  if (!dir) { dir = await window.showDirectoryPicker({id: 'capcut-drafts', mode: 'readwrite', startIn: 'documents'}); await idb('readwrite', st => st.put(dir, 'capcutDir')).catch(() => {}); }
  try { await dir.getFileHandle('root_meta_info.json'); }
  catch (e) { const err = new Error('wrongdir'); err.dirName = dir.name; throw err; }
  await idb('readwrite', st => st.put(dir, 'capcutDir')).catch(() => {});
  return dir;
}
async function writeFile(dir, rel, data) {
  const parts = rel.split('/'), name = parts.pop();
  for (const p of parts) dir = await dir.getDirectoryHandle(p, {create: true});
  const fh = await dir.getFileHandle(name, {create: true}), w = await fh.createWritable();
  if (data instanceof Blob) await data.stream().pipeTo(w); else { await w.write(data); await w.close(); }
}
/** Writes the edit list as a new CapCut project. Returns the project name. */
/* The folder's real path on disk. root_meta_info.json's root_path can be stale (CapCut keeps the old one after the user
   moves "Save to" in Settings), so it is taken from a project CapCut made that sits in the chosen folder. */
async function realRootPath(dir, root) {
  const list = [...(root.all_draft_store || [])].sort((a, b) => (b.tm_draft_modified || 0) - (a.tm_draft_modified || 0));
  for (const e of list) {
    const p = String(e.draft_fold_path || '').replace(/\\/g, '/'), i = p.lastIndexOf('/');
    if (i < 1 || /^Vietlink /.test(p.slice(i + 1))) continue;
    try { await dir.getDirectoryHandle(p.slice(i + 1)); return p.slice(0, i); } catch (x) {}
  }
  const rp = String(root.root_path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (rp && rp.split('/').pop() === dir.name) return rp;
  throw new Error('Không xác định được đường dẫn thư mục CapCut. Hãy mở CapCut, tạo một dự án trống (để CapCut ghi danh sách ở chỗ lưu mới), tắt CapCut rồi bấm lại.');
}
async function sendToCapcut(edl, clips, onProgress, forcePick) {
  const dir = await capcutFolder(forcePick);
  const rootFile = await (await dir.getFileHandle('root_meta_info.json')).getFile(), rootText = await rootFile.text(), root = JSON.parse(rootText);
  const stamp = new Date(), pad = n => String(n).padStart(2, '0');
  const base = 'Vietlink ' + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + ' ' + pad(stamp.getHours()) + pad(stamp.getMinutes());
  let folder = base;
  for (let k = 2; ; k++) { try { await dir.getDirectoryHandle(folder); folder = base + ' (' + k + ')'; } catch (e) { break; } }
  const rootPath = await realRootPath(dir, root), prof = await capcutProfile(dir, root);
  if (prof.encrypted) throw new Error('CapCut bản ' + (prof.app_version || 'này') + ' trên máy này mã hóa file dự án, trang chưa ghi được. Bấm 🩺 Kiểm tra → 📋 Sao chép báo cáo và gửi người hỗ trợ.');
  const draft = await dir.getDirectoryHandle(folder, {create: true});
  const media = {clips: {}, logo: null, icon: null, intro: null, outro: null}, used = [...new Set(edl.body.map(s => s.clip))], sources = {};
  for (let i = 0; i < used.length; i++) {
    const c = clips.find(x => x.id === used[i]), ext = (c.name.match(/\.[a-z0-9]+$/i) || ['.mp4'])[0].toLowerCase(), file = 'clip' + (i + 1) + ext;
    onProgress(i / (used.length + 3), 'Đang chép ' + c.name + ' vào CapCut...');
    await writeFile(draft, 'materials/' + file, c.file);
    media.clips[c.id] = {file, width: c.width, height: c.height, duration: c.duration, hasAudio: !!c.audioTrack};
    sources[file] = {name: c.name, size: c.file.size};
  }
  await writeFile(draft, 'materials/logo.png', await (await fetch(ASSET_IMG.logo.src)).blob());
  media.logo = {file: 'logo.png', width: ASSET_IMG.logo.naturalWidth, height: ASSET_IMG.logo.naturalHeight};
  await writeFile(draft, 'materials/whatsapp.png', await new Promise(ok => ASSET_IMG.iconGreen.toBlob(ok, 'image/png')));
  media.icon = {file: 'whatsapp.png', width: ASSET_IMG.iconGreen.width, height: ASSET_IMG.iconGreen.height};
  const L = layout(edl);
  if (edl.intro) { onProgress((used.length + 1) / (used.length + 3), 'Đang dựng intro...'); await writeFile(draft, 'materials/intro.mp4', await exportMp4(edl, clips, () => {}, () => false, [0, L.introEnd])); media.intro = {file: 'intro.mp4', duration: L.introEnd}; }
  if (edl.outro) { onProgress((used.length + 2) / (used.length + 3), 'Đang dựng outro...'); await writeFile(draft, 'materials/outro.mp4', await exportMp4(edl, clips, () => {}, () => false, [L.bodyEnd, L.total])); media.outro = {file: 'outro.mp4', duration: L.total - L.bodyEnd}; }
  const out = buildCapcutDraft(edl, media, {rootPath: rootPath, folder, os: prof.os === 'mac' ? 'mac' : 'windows', appVersion: prof.app_version, contentName: prof.contentName, timelines: prof.timelines, waNumber: BRAND.number});
  for (const [rel, text] of Object.entries(out.files)) await writeFile(draft, rel, text);
  /* lets the check-and-fix tool copy a clip back if materials/ loses it */
  await writeFile(draft, 'vietlink.json', JSON.stringify({made: new Date().toISOString(), seed: edl.seed, sources}));
  await writeFile(dir, 'root_meta_info.json.bak-vietlink', rootText);
  root.all_draft_store = [out.entry, ...(root.all_draft_store || [])]; root.draft_ids = (root.draft_ids || 0) + 1;
  await writeFile(dir, 'root_meta_info.json', JSON.stringify(root));
  onProgress(1, 'Xong');
  return folder;
}

/** Text for support when an export fails: browser, what its encoders accept, and each attempt. */
async function exportReport(err) {
  const lines = ['Báo lỗi xuất video Vietlink', new Date().toLocaleString('vi-VN'), navigator.userAgent, 'Lỗi: ' + (err && err.message)];
  for (const d of (err && err.details) || []) lines.push('  ' + d);
  const test = async (codec, extra = {}) => { try { return (await VideoEncoder.isConfigSupported({codec, width: 1080, height: 1920, framerate: 30, bitrate: 8e6, ...extra})).supported; } catch (e) { return 'lỗi'; } };
  if (typeof VideoEncoder === 'function') {
    lines.push('H.264 high: ' + await test('avc1.640028'), 'H.264 main: ' + await test('avc1.4d0028'), 'H.264 baseline: ' + await test('avc1.42e028'),
      'CBR: ' + await test('avc1.640028', {bitrateMode: 'constant'}), 'VBR: ' + await test('avc1.640028', {bitrateMode: 'variable'}));
  } else lines.push('Không có VideoEncoder');
  try { lines.push('AAC: ' + (await AudioEncoder.isConfigSupported({codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000})).supported); } catch (e) { lines.push('AAC: không'); }
  lines.push(...EXPORT_LOG.slice(-10));
  return lines.join('\n');
}
