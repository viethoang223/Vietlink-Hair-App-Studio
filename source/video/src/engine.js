/* Vietlink video studio, engine. Everything runs on the viewer's device; videos are never uploaded.
   A video is described by an edit list (EDL): ordered segments of the user's clips, each with its trim, speed, camera
   move and incoming transition, plus texts, a colour look, overlays and optional intro/outro cards. The preview plays the
   EDL live on a canvas; only Export encodes it to MP4. The same draw code serves both, so what you see is what you get.
   Brand rules: wording only from LINES/SUBS, colours only from the brand palette, logo and WhatsApp drawn on every body
   frame at the places locked in brand.json, the WhatsApp number is the user's own (shared with the photo app). */

const OUT_W = 1080, OUT_H = 1920, FPS = 30;
const LINES = ['KING OF RAW HAIR', 'RAW VIETNAMESE HAIR', '100% RAW HUMAN HAIR', 'FACTORY DIRECT', 'WHOLESALE HAIR FACTORY', 'BUNDLES · CLOSURES · FRONTALS', 'WIGS · EXTENSIONS', 'VIETLINK HAIR', 'CHAT ON WHATSAPP'];
const SUBS = ['vietlinkhair.com', 'Factory in Vietnam', 'Wholesale hair factory'];
const PALETTE = {dark: '#140000', red: '#EB1C24', brand: '#F04828', orange: '#FB923B', blush: '#FFF3EF', ivory: '#FAF7F3', char: '#231A16', green: '#08B917'};
const WA_DEFAULT = BRAND.number;
try { const saved = localStorage.getItem('vl_wa'); if (saved) BRAND.number = saved; } catch (e) {}

/* Each clip type has its own template family: segment lengths, slow-motion chance, camera moves, transitions and
   per-segment effects it favours. The generator mixes these with intensity, so a hair-swing video and a factory video
   never feel like the same template with different footage. */
const TYPES = {
  C: {name: 'Lắc tóc', seg: [1.2, 3.2], slow: .55, moves: ['push', 'zoomIn', 'still', 'drift', 'tiltDown'], trans: ['whip', 'flash', 'zoom', 'slide', 'fade', 'spin', 'iris', 'push'], fx: ['punch', 'flashIn', 'shake', 'mirror', 'freeze']},
  B: {name: 'Cận sản phẩm', seg: [2.2, 5.5], slow: .15, moves: ['zoomIn', 'zoomOut', 'panL', 'panR', 'still', 'tiltUp', 'drift'], trans: ['fade', 'dip', 'slide', 'zoom', 'wipe', 'iris', 'blinds'], fx: ['freeze', 'bw', 'punch', 'flashIn']},
  A: {name: 'Lia toàn cảnh', seg: [2.5, 6], slow: .1, moves: ['still', 'zoomOut', 'panL', 'panR', 'tiltUp'], trans: ['fade', 'slide', 'dip', 'whip', 'wipe', 'push'], fx: ['bw', 'freeze']},
  D: {name: 'Xưởng, quy trình', seg: [1.6, 4.5], slow: .2, moves: ['still', 'zoomIn', 'panL', 'panR', 'push', 'tiltDown', 'drift'], trans: ['dip', 'fade', 'glitch', 'slide', 'flash', 'blinds', 'wipe'], fx: ['bw', 'shake', 'freeze', 'punch']},
};
const MOVES = {still: 'Đứng yên', zoomIn: 'Zoom vào chậm', zoomOut: 'Zoom ra chậm', panL: 'Trượt sang trái', panR: 'Trượt sang phải', tiltUp: 'Lia lên', tiltDown: 'Lia xuống', drift: 'Xoay nhẹ', push: 'Đẩy nhanh vào'};
const TRANS = {cut: 'Cắt thẳng', fade: 'Mờ chồng', dip: 'Tối rồi sáng', wipe: 'Quét chéo', push: 'Đẩy lên', slide: 'Trượt ngang', iris: 'Mở tròn', zoom: 'Zoom chuyển', blinds: 'Rèm sọc', whip: 'Lia nhanh', flash: 'Chớp sáng', spin: 'Xoay chuyển', glitch: 'Nhiễu sọc'};
/* Minimum intensity (0–100) at which each transition becomes available. */
const TRANS_MIN = {cut: 0, fade: 15, dip: 25, wipe: 35, push: 40, slide: 45, iris: 50, zoom: 55, blinds: 60, whip: 65, flash: 75, spin: 80, glitch: 85};
const SEG_FX = {none: 'Không', punch: 'Giật zoom đầu đoạn', flashIn: 'Lóe sáng đầu đoạn', shake: 'Rung máy', freeze: 'Dừng hình cuối đoạn', bw: 'Đen trắng', mirror: 'Lật gương'};
const FX_MIN = {none: 0, freeze: 30, bw: 35, punch: 45, flashIn: 55, mirror: 60, shake: 70};
const LOOKS = {none: 'Gốc', warm: 'Ấm', golden: 'Nắng vàng', clean: 'Sáng sạch', bright: 'Trong trẻo', contrast: 'Tương phản', soft: 'Mềm', faded: 'Phim cũ', cinema: 'Điện ảnh', teal: 'Xanh cam', mono: 'Trầm màu'};
const TEXT_STYLES = {title: 'Tiêu đề kiểu tóc (vàng)', account: 'Tên tài khoản', desc: 'Mô tả', watermark: 'Chữ chìm', plain: 'Chữ trơn', bar: 'Thanh nền', outline: 'Viền', pill: 'Viên thuốc', marker: 'Đánh dấu', stack: 'Chữ lớn xếp tầng', tag: 'Nhãn bên trái', box: 'Khung viền', band: 'Dải màu thương hiệu', duo: 'Hai màu xen kẽ'};
const TEXT_ANIMS = {none: 'Không', fade: 'Hiện dần', rise: 'Trồi lên', slide: 'Trượt từ trái', pop: 'Bật ra', bounce: 'Nảy', type: 'Gõ chữ', words: 'Từng chữ', wipe: 'Quét ngang', spread: 'Giãn chữ'};
const TEXT_POS = {low: 'Dưới', mid: 'Giữa', high: 'Trên'};
const INTROS = {dark: 'Logo nền tối', over: 'Logo trên cảnh đầu', wipe: 'Quét màu thương hiệu', stripes: 'Sọc thương hiệu', zoom: 'Logo phóng to dần'};
const OUTROS = {cta: 'Nút WhatsApp nền tối', split: 'Cảnh cuối + thông tin', red: 'Nền đỏ thương hiệu', stack: 'Chữ lớn + WhatsApp', site: 'Trang web + WhatsApp'};


/* ---------- the 9 Vietlink hair styles ----------
   title: the big yellow line (+ length in inches, e.g. Straight Hair 24"); desc: what the pattern looks like (only
   visible facts, no claims); caption: the post text. Hashtags requested by the sales team. */
const HAIR = {
  straight: {name: 'Straight', title: 'Straight Hair', desc: 'Sleek & silky, straight from root to tip', mood: 'Sleek, Silky & Timelessly Classic'},
  natural: {name: 'Natural Wave', title: 'Natural Wave', desc: 'Soft, natural S-waves full of movement', mood: 'Soft, Effortless & Full of Movement'},
  deep: {name: 'Deep Wave', title: 'Deep Wave', desc: 'Deep, defined waves with rich volume', mood: 'Bold, Defined & Voluminous'},
  wavycurls: {name: 'Wavy Curls', title: 'Wavy Curls', desc: 'Bouncy waves that curl at the ends', mood: 'Bouncy, Playful & Full of Life'},
  loosecurls: {name: 'Loose Curls', title: 'Loose Curls', desc: 'Soft, loose curls with natural bounce', mood: 'Soft, Romantic & Bouncy'},
  burmese: {name: 'Burmese Curls', title: 'Burmese Curls', desc: 'Tight, voluminous Burmese curl pattern', mood: 'Tight, Voluminous & Head-Turning'},
  kinkycurly: {name: 'Kinky Curly', title: 'Kinky Curly', desc: 'Tight curls with a natural afro texture', mood: 'Natural, Textured & Full'},
  kinkystraight: {name: 'Kinky Straight', title: 'Kinky Straight', desc: 'Straight with a natural blow-out texture', mood: 'Natural, Blown-Out & Easy to Blend'},
  kinkycoily: {name: 'Kinky Coily', title: 'Kinky Coily', desc: 'Small, springy coils with full texture', mood: 'Springy, Coily & Full of Texture'},
};
const HASHTAGS = ['#rawvietnamesehair', '#rawhairvendor', '#singledonorhair', '#rawhairdonor', '#vietlinkhair'];
const WATERMARK = 'Raw Vietnamese Donor Hair';
const hairTitle = (key, inches) => { const h = HAIR[key]; return h ? h.title + (inches ? ' ' + inches + '\u201D' : '') : ''; };
/** Caption for the post: style line, a short description and the hashtags (plus one for the style). */
function hairCaption(key, inches, account) {
  const h = HAIR[key], tags = [...HASHTAGS, h ? '#' + h.name.toLowerCase().replace(/[^a-z]/g, '') + 'hair' : '#rawhair'];
  const head = h ? h.title.toUpperCase() + (inches ? ' ' + inches + '\u201D' : '') + ' \u2013 ' + h.mood + ' \u2728' : 'RAW VIETNAMESE HAIR \u2013 Factory Direct \u2728';
  const body = h ? h.desc + '. Raw Vietnamese donor hair, straight from our factory.' : 'Raw Vietnamese donor hair, straight from our factory.';
  return [head, '', body, 'Chat on WhatsApp: ' + BRAND.number + (account ? ' \u00B7 ' + account : ''), '', tags.join(' ')].join('\n');
}

/* ---------- logo and WhatsApp settings (per device) ----------
   Default = the places in brand.json. The user can hide either, move it to a corner, resize it, change its opacity
   and upload their own logo. Saved in this browser; the video and the CapCut project both use marksLayout(). */
const MARKS_DEFAULT = {logo: {on: true, corner: 'tl', width: BRAND.logo.width, opacity: BRAND.logo.opacity}, wa: {on: true, corner: 'tr', size: BRAND.whatsapp.size, opacity: BRAND.whatsapp.opacity}};
let MARKS = JSON.parse(JSON.stringify(MARKS_DEFAULT));
try { const m = JSON.parse(localStorage.getItem('vl_marks') || 'null'); if (m && m.logo && m.wa) MARKS = {logo: {...MARKS.logo, ...m.logo}, wa: {...MARKS.wa, ...m.wa}}; } catch (e) {}
const saveMarks = () => { try { localStorage.setItem('vl_marks', JSON.stringify(MARKS)); } catch (e) {} };
const CORNERS = {tl: 'Trên trái', tc: 'Trên giữa', tr: 'Trên phải', bl: 'Dưới trái', bc: 'Dưới giữa', br: 'Dưới phải'};
/** Pixel boxes of the logo and the WhatsApp line on the 1080x1920 frame. */
function marksLayout(measure) {
  const L = MARKS.logo, Q = MARKS.wa, img = typeof ASSET_IMG !== 'undefined' ? ASSET_IMG.logo : null;
  const lw = L.width, lh = img ? Math.round(img.naturalHeight * lw / img.naturalWidth) : Math.round(lw * .42);
  const side = BRAND.logo.left, top = BRAND.logo.top, bottom = 300;
  const place = (corner, w, h) => ({x: corner[1] === 'l' ? side : corner[1] === 'r' ? OUT_W - side - w : (OUT_W - w) / 2, y: corner[0] === 't' ? top : OUT_H - bottom - h});
  const size = Q.size, gap = Math.round(size * .3), tw = measure ? measure(BRAND.number, size) : BRAND.number.length * size * .56, ww = size + gap + tw;
  const lo = place(L.corner, lw, lh), wo = place(Q.corner, ww, size);
  if (L.on && Q.on && L.corner === Q.corner) wo.y = L.corner[0] === 't' ? lo.y + lh + 18 : lo.y - size - 18;
  return {logo: L.on ? {...lo, w: lw, h: lh, opacity: L.opacity} : null, wa: Q.on ? {...wo, w: ww, size, gap, opacity: Q.opacity} : null};
}

/* ---------- random numbers that depend only on the seed ---------- */
function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {f, n: (x, y) => x + (y - x) * f(), i: (x, y) => x + Math.floor(f() * (y - x + 1)), pick: arr => arr[Math.floor(f() * arr.length)], yes: p => f() < p};
}
const newSeed = () => (Math.random() * 4294967296) >>> 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

/* ---------- clip analysis and type detection ---------- */
/* Reference values measured on 90+ labelled Vietlink clips (motion, centre/edge motion, burstiness, horizontal pan).
   Nearest centroid on standardised features was right 82% of the time for hair swing vs close-up. Wide pan has only a
   few labelled clips and factory none, so those come from rules and the user can always change the type. */
const CENTROIDS = {"mean": [14.6964, 2.0811, 0.4595, 0.7179], "std": [4.8672, 1.4511, 0.1566, 0.6747], "A": [13.007, 1.2616, 0.4298, 1.218], "B": [12.2703, 1.7354, 0.5548, 0.3649], "C": [17.2351, 2.4814, 0.3661, 1.0376], "ceA": 1.4, "panA": 0.5};
/*__CLASSIFIER__*/
async function analyseClip(clip) {
  const W = 64, H = 36, track = clip.track, end = Math.min(clip.duration, 20), times = [];
  for (let t = .1; t < end; t += .2) times.push(t);
  const sink = new MB.CanvasSink(track, {width: W, height: H, fit: 'fill', poolSize: 2});
  const frames = [];
  for await (const w of sink.canvasesAtTimestamps(times)) {
    if (!w) continue;
    const d = w.canvas.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0; i < g.length; i++) g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
    frames.push(g);
  }
  if (frames.length < 4) return {type: 'B', sure: false, motion: [], feats: null};
  const diffs = [], perStep = [];
  let cSum = 0, cN = 0, eSum = 0, eN = 0, all = 0, allN = 0;
  const shifts = [];
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1], b = frames[k]; let s = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = Math.abs(b[y * W + x] - a[y * W + x]); s += v;
      if (y >= 9 && y < 27 && x >= 16 && x < 48) { cSum += v; cN++; }
      if (x < 12 || x >= W - 12) { eSum += v; eN++; }
    }
    all += s; allN += W * H; perStep.push(s / (W * H));
    const pa = new Float32Array(W), pb = new Float32Array(W);
    for (let x = 0; x < W; x++) { let sa = 0, sb = 0; for (let y = 0; y < H; y++) { sa += a[y * W + x]; sb += b[y * W + x]; } pa[x] = sa / H; pb[x] = sb / H; }
    let best = 0, bestErr = Infinity;
    for (let sh = -6; sh <= 6; sh++) { let err = 0; for (let x = 8; x < W - 8; x++) err += Math.abs(pa[(x - sh + W) % W] - pb[x]); if (err < bestErr) { bestErr = err; best = sh; } }
    shifts.push(Math.abs(best));
  }
  const mean = all / allN, ce = (cSum / cN) / (eSum / eN + 1e-3);
  const mm = perStep.reduce((p, v) => p + v, 0) / perStep.length, sd = Math.sqrt(perStep.reduce((p, v) => p + (v - mm) ** 2, 0) / perStep.length);
  const pan = shifts.reduce((p, v) => p + v, 0) / shifts.length, f = [mean, Math.min(ce, 6), sd / (mm + 1e-3), pan];
  const z = v => v.map((x, i) => (x - CENTROIDS.mean[i]) / CENTROIDS.std[i]), zf = z(f), dist = c => Math.hypot(...z(c).map((x, i) => x - zf[i]));
  const dB = dist(CENTROIDS.B), dC = dist(CENTROIDS.C);
  let type = dB < dC ? 'B' : 'C', sure = Math.abs(dB - dC) > .6, ai = false;
  if (AI.on && AI.model) {
    /* Image AI on: logistic regression over the 4 motion numbers and the 512 CLIP numbers (see CLASSIFIER). */
    const x = [...f, ...(await clipEmbedding(clip))];
    let score = CLASSIFIER.b; for (let i = 0; i < x.length; i++) score += (x[i] - CLASSIFIER.mean[i]) / CLASSIFIER.std[i] * CLASSIFIER.w[i];
    type = score > 0 ? 'C' : 'B'; sure = Math.abs(score) > 2; ai = true;
  }
  if (ce < CENTROIDS.ceA && pan > CENTROIDS.panA) { type = 'A'; sure = false; }
  /* Almost no movement anywhere: a product held still or on a table. */
  if (!ai && mean < 3) { type = 'B'; sure = mean < 1.5; }
  /* Motion per half second, used to pick the liveliest or steadiest moments for each template. */
  const motion = [];
  for (let k = 0; k < perStep.length; k += 2.5) motion.push(perStep[Math.floor(k)] || 0);
  return {type, sure, motion, feats: f, ai};
}

/* ---------- template generator ---------- */
/** Builds one edit list from a seed. intensity 0 = rustic (long takes, hard cuts, no effects); 100 = dense. */
function generate(seed, clips, opts) {
  const r = rng(seed), k = clamp(opts.intensity / 100, 0, 1), body = [];
  const usable = clips.filter(c => c.duration > .8);
  if (!usable.length) throw new Error('Chưa có clip nào dùng được.');
  const order = usable.map((c, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = r.i(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const target = lerp(r.n(14, 20), r.n(10, 15), k), used = usable.map(() => []);
  let total = 0, n = 0;
  while (total < target && n < 24) {
    const ci = order[n % order.length], clip = usable[ci], T = TYPES[clip.type] || TYPES.B;
    const minL = lerp(Math.max(T.seg[1], 4), T.seg[0] * .6, k), maxL = lerp(Math.max(T.seg[1] * 1.5, 7), T.seg[0] * 1.2, k);
    const slow = clip.fps >= 50 && r.yes(T.slow * k * 1.3), speed = slow ? .5 : 1;
    let len = Math.min(r.n(minL, maxL), clip.duration - .4);
    const srcLen = len * speed;
    if (srcLen < .5) { n++; if (n > order.length * 3 && !body.length) break; continue; }
    const start = pickWindow(r, clip, srcLen, used[ci], clip.type);
    used[ci].push([start, start + srcLen]);
    const moves = k < .12 ? ['still'] : T.moves, move = r.pick(moves), amt = lerp(.04, .16, k) * r.n(.7, 1.3);
    const pool = T.trans.filter(t => k * 100 >= TRANS_MIN[t]);
    const trans = body.length === 0 ? 'cut' : (pool.length && r.yes(lerp(.2, .9, k)) ? r.pick(pool) : 'cut');
    const tDur = trans === 'cut' ? 0 : trans === 'flash' || trans === 'whip' || trans === 'glitch' ? .25 : lerp(.6, .35, k);
    const fxPool = (T.fx || []).filter(f => k * 100 >= FX_MIN[f]), sfx = fxPool.length && r.yes(lerp(0, .45, k)) ? r.pick(fxPool) : 'none';
    body.push({clip: clip.id, start, len, speed, move, amt, trans, tDur, fx: sfx});
    total += len - tDur; n++;
  }
  const look = k < .1 ? 'none' : r.pick(Object.keys(LOOKS)), lookAmt = k < .1 ? 0 : lerp(.25, .85, k) * r.n(.7, 1.1);
  const head = r.pick(LINES), sub = r.pick(SUBS);
  const styles = k < .2 ? ['plain'] : k < .5 ? ['plain', 'bar', 'pill', 'outline', 'tag', 'box'] : Object.keys(TEXT_STYLES);
  const anims = k < .2 ? ['fade', 'none'] : k < .5 ? ['fade', 'rise', 'wipe', 'slide', 'spread'] : Object.keys(TEXT_ANIMS).filter(a => a !== 'none');
  const texts = [];
  const len = totalLength(body), hair = HAIR[opts.hair], account = (opts.account || '').trim();
  if (hair) {
    texts.push({text: hairTitle(opts.hair, opts.inches), start: .2, end: len - .1, style: 'title', anim: k < .2 ? 'fade' : r.pick(['fade', 'pop', 'rise', 'slide', 'spread']), pos: 'low', y: .6, size: 1, color: 'brand'});
    if (account) texts.push({text: account, start: .35, end: len - .1, style: 'account', anim: 'fade', pos: 'low', y: .655, size: 1, color: 'brand'});
    if (len > 5) texts.push({hairDesc: true, text: hair.desc, start: Math.min(len * .3, 3), end: Math.min(len - .5, len * .3 + r.n(3, 4.5)), style: k < .3 ? 'desc' : r.pick(['desc', 'bar', 'pill', 'tag']), anim: r.pick(anims), pos: 'high', y: .27, size: r.n(.95, 1.1), color: r.pick(['brand', 'orange', 'red'])});
  } else if (account) texts.push({text: account, start: .35, end: len - .1, style: 'account', anim: 'fade', pos: 'low', y: .8, size: 1, color: 'brand'});
  if (opts.watermark !== false) texts.push({text: WATERMARK, start: 0, end: len, style: 'watermark', anim: 'none', pos: 'high', y: .2, size: 1, color: 'brand'});
  if (!hair && r.yes(lerp(.75, 1, k))) texts.push({text: head, start: r.n(.3, 1), end: Math.min(len - .2, r.n(3.5, 6)), style: r.pick(styles), anim: r.pick(anims), pos: r.pick(['low', 'low', 'mid', 'high']), size: r.n(.9, 1.15), color: r.pick(['brand', 'orange', 'dark', 'red'])});
  if (!hair && k >= .35 && len > 8) texts.push({text: r.yes(.5) ? sub : r.pick(LINES), start: len * r.n(.45, .6), end: len * r.n(.75, .9), style: r.pick(styles), anim: r.pick(anims), pos: r.pick(['low', 'mid', 'high']), size: r.n(.75, 1), color: r.pick(['brand', 'orange', 'dark', 'red'])});
  if (k >= .7 && len > 12 && r.yes(.6)) texts.push({text: r.pick(LINES), start: len * .2, end: len * .38, style: r.pick(styles), anim: r.pick(anims), pos: r.pick(['mid', 'high']), size: r.n(.8, 1.05), color: r.pick(['brand', 'orange', 'dark', 'red'])});
  const fx = {vignette: k >= .3 && r.yes(.7), grain: k >= .6 && r.yes(.6), progress: k >= .5 && r.yes(.4), frame: k >= .4 && r.yes(.25), corners: k >= .45 && r.yes(.25), stripe: k >= .35 && r.yes(.3), letterbox: k >= .55 && r.yes(.2), leak: k >= .75 && r.yes(.5)};
  if (fx.frame && fx.corners) fx.corners = false;
  return {
    seed, intensity: opts.intensity, body, texts, look, lookAmt, fx, audio: !!opts.audio, hair: opts.hair || '', inches: opts.inches || '', account,
    intro: opts.intro ? {style: r.pick(Object.keys(INTROS)), dur: lerp(1.6, 1.1, k)} : null,
    outro: opts.outro ? {style: r.pick(Object.keys(OUTROS)), dur: 2.6} : null,
    leakSeed: r.i(0, 1e6),
  };
}
/** Chooses where a segment starts in its clip: lively moments for hair swing, steady ones for close-ups, never reused. */
function pickWindow(r, clip, srcLen, used, type) {
  const maxStart = Math.max(0, clip.duration - srcLen - .15), cands = [];
  for (let s = .15; s <= maxStart; s += .25) {
    if (used.some(([a, b]) => s < b && s + srcLen > a)) continue;
    const m = clip.motion.slice(Math.floor(s * 2), Math.ceil((s + srcLen) * 2)), avg = m.length ? m.reduce((p, v) => p + v, 0) / m.length : 0;
    cands.push([s, type === 'C' || type === 'D' ? avg : -avg]);
  }
  if (!cands.length) return clamp(r.n(.1, maxStart), 0, maxStart);
  cands.sort((a, b) => b[1] - a[1]);
  return cands[Math.min(cands.length - 1, Math.floor(r.f() * Math.min(5, cands.length)))][0];
}

/* ---------- timeline ---------- */
function totalLength(body) { return body.reduce((p, s, i) => p + s.len - (i ? s.tDur : 0), 0); }
/** Places intro, body segments (overlapping by their transitions) and outro on one clock. */
function layout(edl) {
  const intro = edl.intro ? edl.intro.dur : 0, segs = [];
  let t = intro;
  edl.body.forEach((s, i) => { const at = i ? t - s.tDur : t; segs.push({...s, i, at, end: at + s.len}); t = at + s.len; });
  const bodyEnd = t, outro = edl.outro ? edl.outro.dur : 0;
  return {segs, introEnd: intro, bodyStart: intro, bodyEnd, total: bodyEnd + outro};
}
const activeAt = (L, t) => L.segs.filter(s => t >= s.at && t < s.end);
const FREEZE_AT = .65;
/** Source time shown at output time t. A "freeze" segment holds its frame for the last 35% of its length. */
const srcTime = (s, t) => { let d = clamp(t - s.at, 0, s.len); if (s.fx === 'freeze') d = Math.min(d, s.len * FREEZE_AT); return s.start + d * s.speed; };
const isFrozen = (s, t) => s.fx === 'freeze' && t - s.at > s.len * FREEZE_AT;

/* ---------- drawing ---------- */
let NOISE = null;
function noise() {
  if (NOISE) return NOISE;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); return (NOISE = c);
}
/** Draws a source frame to cover the 9:16 frame with a camera move at progress p (0–1).
    o: alpha, dx, dy (offsets), zoom (extra scale), rot (radians, about the centre), mirror. */
function drawCover(x, img, move, amt, p, o = {}) {
  if (!img) return;
  const iw = img.videoWidth || img.width, ih = img.videoHeight || img.height;
  if (!iw || !ih) return;
  const e = ease(clamp(p, 0, 1));
  let s = 1, ox = 0, oy = 0, rot = o.rot || 0;
  if (move === 'zoomIn') s = 1 + amt * e;
  else if (move === 'zoomOut') s = 1 + amt * (1 - e);
  else if (move === 'push') s = 1 + amt * 2 * Math.pow(clamp(p, 0, 1), 1.6);
  else if (move === 'panL' || move === 'panR') { s = 1 + amt * 1.2; ox = (move === 'panL' ? 1 : -1) * (e - .5) * amt * OUT_W; }
  else if (move === 'tiltUp' || move === 'tiltDown') { s = 1 + amt * 1.2; oy = (move === 'tiltUp' ? 1 : -1) * (e - .5) * amt * OUT_H; }
  else if (move === 'drift') { s = 1 + amt * .8 + .06; rot += (e - .5) * amt * .35; }
  s *= o.zoom || 1;
  const k = Math.max(OUT_W / iw, OUT_H / ih) * s, w = iw * k, h = ih * k;
  x.save(); x.globalAlpha = o.alpha == null ? 1 : o.alpha;
  x.translate(OUT_W / 2 + ox + (o.dx || 0), OUT_H / 2 + oy + (o.dy || 0));
  if (rot) x.rotate(rot);
  if (o.mirror) x.scale(-1, 1);
  x.drawImage(img, -w / 2, -h / 2, w, h);
  x.restore();
}
/** Draws one segment at output time t with its move and its own effect (punch, shake, mirror). */
function drawSeg(x, s, img, t, o = {}) {
  const local = t - s.at, z = s.fx === 'punch' ? 1 + .2 * Math.max(0, 1 - local / .28) : 1;
  const jit = s.fx === 'shake' ? 1 : 0;
  drawCover(x, img, s.move, s.amt, local / s.len, {...o, zoom: (o.zoom || 1) * z * (jit ? 1.04 : 1), mirror: s.fx === 'mirror',
    dx: (o.dx || 0) + jit * (Math.sin(t * 47) * 9 + Math.sin(t * 23) * 6), dy: (o.dy || 0) + jit * Math.cos(t * 41) * 8});
}
/** Effects that colour the whole frame while a segment is on screen (black and white, flash at its start). */
function segOverlay(x, s, t) {
  const local = t - s.at;
  if (s.fx === 'bw') { x.save(); x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, OUT_W, OUT_H); x.restore(); }
  if (s.fx === 'flashIn' && local < .3) { x.fillStyle = `rgba(255,255,255,${.85 * (1 - local / .3)})`; x.fillRect(0, 0, OUT_W, OUT_H); }
}
function drawLook(x, look, amt) {
  if (look === 'none' || amt <= 0) return;
  const f = (op, color, a) => { x.save(); x.globalCompositeOperation = op; x.globalAlpha = clamp(a * amt, 0, 1); x.fillStyle = color; x.fillRect(0, 0, OUT_W, OUT_H); x.restore(); };
  if (look === 'warm') { f('soft-light', '#FB923B', .5); f('multiply', '#FFF1E0', .5); }
  else if (look === 'golden') { f('soft-light', '#FFB347', .55); f('screen', '#FFE8B0', .1); }
  else if (look === 'clean') { f('screen', '#FFFFFF', .12); f('soft-light', '#E8F0FF', .3); }
  else if (look === 'bright') { f('screen', '#FFFFFF', .2); f('soft-light', '#FFFFFF', .25); }
  else if (look === 'contrast') { f('soft-light', '#000000', .35); f('soft-light', '#FFFFFF', .2); }
  else if (look === 'soft') { f('screen', '#FFE7DC', .2); f('saturation', '#9A9A9A', .2); }
  else if (look === 'faded') { f('screen', '#3A2A20', .35); f('soft-light', '#E8D8C0', .35); f('saturation', '#909090', .25); }
  else if (look === 'cinema') { f('soft-light', '#1E5B66', .45); f('soft-light', '#FB923B', .3); }
  else if (look === 'teal') { f('soft-light', '#008C95', .4); f('soft-light', '#FF9A4A', .3); }
  else if (look === 'mono') { f('saturation', '#808080', .75); f('soft-light', '#F04828', .25); }
}
function drawFx(x, edl, t, L, frame) {
  const fx = edl.fx;
  if (fx.letterbox) { x.fillStyle = PALETTE.dark; x.fillRect(0, 0, OUT_W, 150); x.fillRect(0, OUT_H - 150, OUT_W, 150); }
  if (fx.vignette) { const g = x.createRadialGradient(OUT_W / 2, OUT_H / 2, OUT_H * .25, OUT_W / 2, OUT_H / 2, OUT_H * .75); g.addColorStop(0, 'rgba(20,0,0,0)'); g.addColorStop(1, 'rgba(20,0,0,.55)'); x.fillStyle = g; x.fillRect(0, 0, OUT_W, OUT_H); }
  if (fx.leak) { const ph = (t * .35 + edl.leakSeed % 7) % 3; if (ph < 1) { const g = x.createLinearGradient(-OUT_W + ph * 2 * OUT_W, 0, ph * 2 * OUT_W, OUT_H); g.addColorStop(0, 'rgba(251,146,59,0)'); g.addColorStop(.5, 'rgba(251,146,59,.28)'); g.addColorStop(1, 'rgba(240,72,40,0)'); x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = g; x.fillRect(0, 0, OUT_W, OUT_H); x.restore(); } }
  if (fx.grain) { x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = .18; const n = noise(), ox = (frame * 37) % 256, oy = (frame * 91) % 256; x.translate(-ox, -oy); x.fillStyle = x.createPattern(n, 'repeat'); x.fillRect(0, 0, OUT_W + 256, OUT_H + 256); x.restore(); }
  if (fx.frame) { x.save(); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 4; x.strokeRect(34, 250, OUT_W - 68, OUT_H - 300); x.restore(); }
  if (fx.corners) { x.save(); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 7; const m = 46, L2 = 90, top = 270, bot = OUT_H - 60; [[m, top, 1, 1], [OUT_W - m, top, -1, 1], [m, bot, 1, -1], [OUT_W - m, bot, -1, -1]].forEach(([a, b, sx, sy]) => { x.beginPath(); x.moveTo(a, b + sy * L2); x.lineTo(a, b); x.lineTo(a + sx * L2, b); x.stroke(); }); x.restore(); }
  if (fx.stripe) { x.fillStyle = PALETTE.brand; x.fillRect(0, OUT_H - 28, OUT_W, 10); x.fillStyle = PALETTE.orange; x.fillRect(0, OUT_H - 14, OUT_W, 6); }
  if (fx.progress && t >= L.bodyStart && t < L.bodyEnd) { const p = (t - L.bodyStart) / (L.bodyEnd - L.bodyStart); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, OUT_H - 12, OUT_W, 12); x.fillStyle = PALETTE.brand; x.fillRect(0, OUT_H - 12, OUT_W * p, 12); }
}
const FX_NAMES = {vignette: 'Tối viền', grain: 'Hạt phim', progress: 'Thanh tiến trình', frame: 'Khung viền', corners: 'Góc khung', stripe: 'Sọc thương hiệu', letterbox: 'Viền điện ảnh', leak: 'Vệt sáng'};
const font = (size, bold) => `${bold ? 700 : 800} ${size}px ${bold ? 'BrandBold' : 'BrandHeavy'}, Arial, sans-serif`;
const SERIF = new Set(['title', 'account', 'watermark']);
const fontFor = (style, size) => SERIF.has(style) ? `${style === 'title' ? 900 : 700} ${size}px Georgia, 'Times New Roman', serif` : font(size, false);
const TITLE_YELLOW = '#FFE135';
function wrap(x, text, size, maxW, maxLines, bold, style) {
  for (let s = size; ; s -= 2) {
    x.font = style ? fontFor(style, s) : font(s, bold); const rows = []; let row = '';
    for (const w of String(text).split(/\s+/).filter(Boolean)) { const nx = row ? row + ' ' + w : w; if (x.measureText(nx).width > maxW && row) { rows.push(row); row = w; } else row = nx; }
    if (row) rows.push(row);
    if ((rows.length <= maxLines && rows.every(r => x.measureText(r).width <= maxW)) || s < 24) return {rows, size: s};
  }
}
const ACCENTS = {brand: PALETTE.brand, orange: PALETTE.orange, dark: PALETTE.dark, red: PALETTE.red};
/* Texts are white on the footage, always with a stroke, shadow, plate or band so they stay readable on any frame. */
function drawText(x, tx, t) {
  if (t < tx.start || t > tx.end || !tx.text) return;
  const inP = clamp((t - tx.start) / .45, 0, 1), outP = clamp((tx.end - t) / .3, 0, 1), a = Math.min(inP, outP), ea = ease(inP);
  const style = tx.style, left = style === 'tag';
  const big = {stack: 118, pill: 64, tag: 64, title: 96, account: 50, desc: 50, watermark: 46}[style] || 84, size0 = big * (tx.size || 1);
  const w = wrap(x, tx.text, size0, left ? OUT_W - 260 : OUT_W - 160, style === 'stack' ? 4 : style === 'pill' || style === 'account' || style === 'watermark' ? 1 : 3, false, style);
  const lh = w.size * 1.12, blockH = w.rows.length * lh, cy = tx.y != null ? tx.y * OUT_H : tx.pos === 'high' ? 420 + blockH / 2 : tx.pos === 'mid' ? OUT_H / 2 : OUT_H * .72;
  const acc = ACCENTS[tx.color] || PALETTE.brand, plate = acc === PALETTE.dark ? PALETTE.brand : acc;
  const ax = left ? 110 : OUT_W / 2;
  x.save();
  let alpha = a, dx = 0, dy = 0, sc = 1, sx = 1, clipW = 1, chars = Infinity, words = Infinity;
  if (tx.anim === 'none') alpha = 1;
  if (tx.anim === 'rise') dy = (1 - ea) * 60;
  if (tx.anim === 'slide') { dx = -(1 - ea) * OUT_W * .6; alpha = outP; }
  if (tx.anim === 'pop') sc = .6 + .4 * ease(clamp(inP * 1.3, 0, 1)) + Math.sin(clamp(inP, 0, 1) * Math.PI) * .08;
  if (tx.anim === 'bounce') { const q = clamp((t - tx.start) / .8, 0, 1); dy = -Math.abs(Math.sin(q * Math.PI * 2.5)) * 70 * (1 - q); alpha = Math.min(outP, clamp(q * 4, 0, 1)); }
  if (tx.anim === 'spread') sx = 1 + .35 * (1 - ea);
  if (tx.anim === 'wipe') { clipW = ea; alpha = outP; }
  if (tx.anim === 'type') { chars = Math.floor(clamp((t - tx.start) / .9, 0, 1) * String(tx.text).length); alpha = outP; }
  if (tx.anim === 'words') { words = Math.floor(clamp((t - tx.start) / .25, 0, 99)) + 1; alpha = outP; }
  x.globalAlpha = clamp(alpha, 0, 1);
  x.translate(OUT_W / 2 + dx, cy + dy); x.scale(sc * sx, sc); x.translate(-OUT_W / 2, -cy);
  if (clipW < 1) { x.beginPath(); x.rect(0, 0, OUT_W * clipW, OUT_H); x.clip(); }
  x.font = fontFor(style, w.size); x.textAlign = left ? 'left' : 'center'; x.textBaseline = 'middle';
  if (style === 'watermark') x.globalAlpha *= .32;
  const top = cy - blockH / 2, widest = Math.max(...w.rows.map(r => x.measureText(r).width));
  if (style === 'bar') { x.fillStyle = 'rgba(20,0,0,.72)'; x.fillRect(0, top - 26, OUT_W, blockH + 52); x.fillStyle = acc; x.fillRect(0, top - 26, 14, blockH + 52); }
  if (style === 'band') { const g = x.createLinearGradient(0, 0, OUT_W, 0); g.addColorStop(0, PALETTE.red); g.addColorStop(1, PALETTE.orange); x.fillStyle = g; x.fillRect(0, top - 30, OUT_W, blockH + 60); }
  if (style === 'tag') { x.fillStyle = 'rgba(20,0,0,.78)'; x.fillRect(ax - 40, top - 24, widest + 80, blockH + 48); x.fillStyle = plate; x.fillRect(ax - 40, top - 24, 16, blockH + 48); }
  if (style === 'box') { x.save(); x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(ax - widest / 2 - 44, top - 34, widest + 88, blockH + 68); x.strokeStyle = plate; x.lineWidth = 4; x.strokeRect(ax - widest / 2 - 30, top - 20, widest + 60, blockH + 40); x.restore(); }
  let shown = 0, wordN = 0;
  w.rows.forEach((row, i) => {
    let text = row;
    if (chars !== Infinity) { const leftN = chars - shown; text = row.slice(0, Math.max(0, leftN)); shown += row.length + 1; }
    if (words !== Infinity) { const parts = row.split(' '), take = Math.max(0, words - wordN); text = parts.slice(0, take).join(' '); wordN += parts.length; }
    const y = top + lh * (i + .5), tw = x.measureText(row).width;
    if (style === 'pill') { const pw = tw + w.size * 1.6, ph = w.size * 1.7; x.fillStyle = plate; x.beginPath(); x.roundRect((OUT_W - pw) / 2, y - ph / 2, pw, ph, ph / 2); x.fill(); }
    if (style === 'marker') { x.fillStyle = plate; x.fillRect((OUT_W - tw) / 2 - 22, y - lh * .46, tw + 44, lh * .92); }
    if (!text) return;
    if (['outline', 'stack', 'plain', 'box', 'duo', 'title', 'account'].includes(style)) { x.strokeStyle = PALETTE.dark; x.lineWidth = w.size * (style === 'plain' ? .08 : style === 'title' ? .1 : style === 'account' ? .14 : .12); x.lineJoin = 'round'; x.strokeText(text, ax, y); }
    if (style === 'plain' || style === 'desc' || style === 'title') { x.shadowColor = 'rgba(20,0,0,.55)'; x.shadowBlur = style === 'title' ? 18 : 12; x.shadowOffsetY = style === 'title' ? 4 : 0; }
    if (style === 'duo') {
      /* Words alternate white and orange, laid out left to right around the centre. */
      const parts = text.split(' '), space = x.measureText(' ').width, full = x.measureText(text).width; let cx = ax - full / 2;
      x.textAlign = 'left'; parts.forEach((p, j) => { x.fillStyle = j % 2 ? PALETTE.orange : '#FFFFFF'; x.fillText(p, cx, y); cx += x.measureText(p).width + space; }); x.textAlign = 'center';
    } else { x.fillStyle = style === 'title' ? TITLE_YELLOW : '#FFFFFF'; x.fillText(text, ax, y); }
    x.shadowBlur = 0; x.shadowOffsetY = 0;
  });
  x.restore();
}
/** Logo and the user's WhatsApp number, where the user put them (default: brand.json places). */
function drawMarks(x) {
  const logo = ASSET_IMG.logo; if (!logo || !ASSET_IMG.iconGreen) return;
  const M = marksLayout((t, size) => { x.save(); x.font = font(size, true); const w = x.measureText(t).width; x.restore(); return w; });
  if (M.logo) { x.save(); x.globalAlpha = M.logo.opacity; x.shadowColor = BRAND.dark; x.shadowBlur = 5; x.drawImage(logo, M.logo.x, M.logo.y, M.logo.w, M.logo.h); x.restore(); }
  if (M.wa) {
    const q = M.wa, mid = q.y + q.size / 2;
    x.save(); x.globalAlpha = q.opacity; x.font = font(q.size, true); x.textBaseline = 'middle'; x.textAlign = 'left';
    x.drawImage(ASSET_IMG.iconGreen, q.x, q.y, q.size, q.size); x.lineWidth = Math.max(3, q.size / 8); x.strokeStyle = BRAND.dark; x.lineJoin = 'round';
    x.strokeText(BRAND.number, q.x + q.size + q.gap, mid); x.fillStyle = '#fff'; x.fillText(BRAND.number, q.x + q.size + q.gap, mid);
    x.restore();
  }
}
function drawLogoCenter(x, y, width, alpha) { const logo = ASSET_IMG.logo; if (!logo) return; const h = logo.naturalHeight * width / logo.naturalWidth; x.save(); x.globalAlpha = alpha; x.drawImage(logo, (OUT_W - width) / 2, y - h / 2, width, h); x.restore(); }
function drawIntro(x, edl, t, firstImg) {
  const p = clamp(t / edl.intro.dur, 0, 1), st = edl.intro.style, e = ease(clamp(p * 1.6, 0, 1));
  let logoW = lerp(420, 620, e), logoA = e, tagColor = PALETTE.orange;
  if ((st === 'over' || st === 'zoom') && firstImg) { drawCover(x, firstImg, 'zoomIn', .08, p); x.fillStyle = `rgba(20,0,0,${st === 'zoom' ? .45 : .62})`; x.fillRect(0, 0, OUT_W, OUT_H); }
  else if (st === 'wipe') { x.fillStyle = PALETTE.dark; x.fillRect(0, 0, OUT_W, OUT_H); x.fillStyle = PALETTE.brand; x.fillRect(0, 0, OUT_W * ease(clamp(p * 2, 0, 1)), OUT_H); tagColor = '#fff'; }
  else if (st === 'stripes') {
    x.fillStyle = PALETTE.dark; x.fillRect(0, 0, OUT_W, OUT_H);
    const cols = [PALETTE.red, PALETTE.brand, PALETTE.orange];
    for (let k = 0; k < 6; k++) { const q = ease(clamp(p * 2.2 - k * .12, 0, 1)); x.fillStyle = cols[k % 3]; x.save(); x.translate(OUT_W / 2, OUT_H / 2); x.rotate(-.35); x.fillRect(-OUT_W * 1.2 + q * OUT_W * 2.4 - OUT_W, -OUT_H + k * 330, OUT_W * 1.2, 150); x.restore(); }
  } else { x.fillStyle = PALETTE.dark; x.fillRect(0, 0, OUT_W, OUT_H); }
  if (st === 'zoom') { logoW = lerp(1500, 600, ease(clamp(p * 1.3, 0, 1))); logoA = clamp(p * 3, 0, 1); }
  drawLogoCenter(x, OUT_H / 2 - 40, logoW, logoA);
  x.save(); x.globalAlpha = clamp((p - .35) * 3, 0, 1); x.font = font(44, true); x.textAlign = 'center'; x.fillStyle = tagColor; x.fillText('KING OF RAW HAIR', OUT_W / 2, OUT_H / 2 + 170); x.restore();
}
function waButton(x, y, w = 760, h = 130) {
  x.fillStyle = PALETTE.green; x.beginPath(); x.roundRect((OUT_W - w) / 2, y, w, h, h / 2); x.fill();
  x.font = font(54, false); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.fillText('CHAT ON WHATSAPP', OUT_W / 2, y + h / 2);
}
function drawOutro(x, edl, t0, lastImg) {
  const p = clamp(t0 / edl.outro.dur, 0, 1), st = edl.outro.style, e = ease(clamp(p * 2, 0, 1));
  if (st === 'split' && lastImg) { drawCover(x, lastImg, 'still', 0, 0); x.fillStyle = PALETTE.dark; x.fillRect(0, OUT_H * (1 - .5 * e), OUT_W, OUT_H * .5); }
  else if (st === 'site' && lastImg) { drawCover(x, lastImg, 'zoomIn', .1, p); x.fillStyle = `rgba(20,0,0,${.75 * e})`; x.fillRect(0, 0, OUT_W, OUT_H); }
  else { x.fillStyle = st === 'red' ? PALETTE.red : PALETTE.dark; x.fillRect(0, 0, OUT_W, OUT_H); }
  x.save(); x.globalAlpha = e; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (st === 'stack') {
    ['RAW', 'VIETNAMESE', 'HAIR'].forEach((w, i) => { const q = ease(clamp(p * 3 - i * .25, 0, 1)); x.globalAlpha = q; x.font = font(150, false); x.fillStyle = i === 1 ? PALETTE.orange : '#fff'; x.fillText(w, OUT_W / 2 - (1 - q) * 200, 560 + i * 170); });
    x.globalAlpha = e; waButton(x, 1120); x.font = font(64, true); x.fillStyle = '#fff'; x.fillText(BRAND.number, OUT_W / 2, 1360);
  } else if (st === 'site') {
    drawLogoCenter(x, 620, 420, 1);
    x.font = font(86, false); x.fillStyle = '#fff'; x.fillText('vietlinkhair.com', OUT_W / 2, 900);
    waButton(x, 1060); x.font = font(64, true); x.fillStyle = PALETTE.orange; x.fillText(BRAND.number, OUT_W / 2, 1300);
  } else {
    const base = st === 'split' ? OUT_H * .5 + 120 : OUT_H * .36;
    drawLogoCenter(x, base, 460, 1);
    const py = base + 260; waButton(x, py);
    x.font = font(64, true); x.fillStyle = '#fff'; x.fillText(BRAND.number, OUT_W / 2, py + 130 + 110);
    x.font = font(40, true); x.fillStyle = st === 'red' ? '#FFF3EF' : PALETTE.orange; x.fillText('vietlinkhair.com', OUT_W / 2, py + 130 + 200);
  }
  x.restore();
}
/** Draws output time t. frameOf(seg) returns the source image for an active segment (a <video> in preview, a decoded
    canvas in export). firstImg/lastImg are used by intro/outro styles that show a scene behind the card. */
function renderFrame(x, edl, L, t, frameOf, extra = {}) {
  x.fillStyle = '#000'; x.fillRect(0, 0, OUT_W, OUT_H);
  const frame = Math.round(t * FPS);
  if (edl.intro && t < L.introEnd) { drawIntro(x, edl, t, extra.firstImg); return; }
  if (t >= L.bodyEnd && edl.outro) { drawOutro(x, edl, t - L.bodyEnd, extra.lastImg); return; }
  const act = activeAt(L, t);
  let lead = act[0];
  if (act.length === 1) drawSeg(x, lead, frameOf(lead), t);
  else if (act.length >= 2) {
    const a = act[0], b = act[1], p = clamp((t - b.at) / Math.max(b.tDur, 1e-3), 0, 1), ia = frameOf(a), ib = frameOf(b), e = ease(p);
    lead = p < .5 ? a : b;
    const A = (o = {}) => drawSeg(x, a, ia, t, o), B = (o = {}) => drawSeg(x, b, ib, t, o);
    const clipB = path => { A(); x.save(); x.beginPath(); path(); x.clip(); B(); x.restore(); };
    switch (b.trans) {
      case 'fade': A(); B({alpha: p}); break;
      case 'dip': if (p < .5) { A(); x.fillStyle = `rgba(0,0,0,${p * 2})`; } else { B(); x.fillStyle = `rgba(0,0,0,${(1 - p) * 2})`; } x.fillRect(0, 0, OUT_W, OUT_H); break;
      case 'slide': A({dx: -e * OUT_W}); B({dx: (1 - e) * OUT_W}); break;
      case 'push': A({dy: -e * OUT_H}); B({dy: (1 - e) * OUT_H}); break;
      case 'zoom': A({alpha: 1 - e, zoom: 1 + .25 * e}); B({alpha: e, zoom: 1.3 - .3 * e}); break;
      case 'spin': A({alpha: 1 - e, zoom: 1 + .5 * e, rot: e * .6}); B({alpha: e, zoom: 1.5 - .5 * e, rot: (e - 1) * .6}); break;
      case 'wipe': clipB(() => {
        /* Everything above the diagonal line x + y = d, clipped to the frame. */
        const d = e * (OUT_W + OUT_H), pts = [[0, 0], [Math.min(d, OUT_W), 0]];
        if (d > OUT_W) pts.push([OUT_W, Math.min(d - OUT_W, OUT_H)]);
        if (d > OUT_H) pts.push([Math.min(d - OUT_H, OUT_W), OUT_H]);
        pts.push([0, Math.min(d, OUT_H)]);
        pts.forEach(([px, py], k) => k ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath();
      }); break;
      case 'iris': clipB(() => x.arc(OUT_W / 2, OUT_H / 2, e * Math.hypot(OUT_W, OUT_H) / 2, 0, 7)); break;
      case 'blinds': clipB(() => { const n = 8, sw = OUT_W / n; for (let k = 0; k < n; k++) x.rect(k * sw, 0, sw * e, OUT_H); }); break;
      case 'whip': { const dir = (b.i % 2 ? 1 : -1); for (let g = 0; g < 4; g++) { const lag = g * .06, o = {alpha: g ? .25 : 1, dx: dir * (e < .5 ? -(e - lag) * 2 : (1 - e + lag) * 2) * OUT_W * .5}; e < .5 ? A(o) : B(o); } break; }
      case 'flash': p < .5 ? A() : B(); x.fillStyle = `rgba(255,255,255,${1 - Math.abs(p - .5) * 2})`; x.fillRect(0, 0, OUT_W, OUT_H); break;
      case 'glitch': {
        p < .5 ? A() : B();
        const r = rng(frame * 7919 + b.i); for (let k = 0; k < 9; k++) { const y = r.n(0, OUT_H), h = r.n(20, 120), off = r.n(-80, 80); x.drawImage(x.canvas, 0, y * (x.canvas.width / OUT_W), x.canvas.width, h * (x.canvas.width / OUT_W), off, y, OUT_W, h); }
        x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = 'rgba(240,72,40,.18)'; x.fillRect(0, 0, OUT_W, OUT_H); x.restore(); break;
      }
      default: B();
    }
  }
  if (lead) segOverlay(x, lead, t);
  drawLook(x, edl.look, edl.lookAmt);
  drawFx(x, edl, t, L, frame);
  const bt = t - L.bodyStart;
  edl.texts.forEach(tx => drawText(x, tx, bt));
  drawMarks(x);
}
