/* Vietlink photo app: the user uploads their own photos, picks a template, edits and downloads. Everything runs on the device. No AI and no stock images.
   Forked from vietlink-app-script/src/photo.js; this copy adds endless generated templates (gen.js) and drops the account log. */
const FORMATS = {'4:5': [1080, 1350], '1:1': [1080, 1080], '9:16': [1080, 1920]};
// Colours come only from BRAND.md section 3.
const THEMES = [
  {id:'dark', name:'Đen ấm', paper:'#140000', ink:'#FFFFFF', accent:'#FB923B'},
  {id:'brand', name:'Đỏ cam', paper:'#F04828', ink:'#FFFFFF', accent:'#FFF3EF'},
  {id:'orange', name:'Cam', paper:'#FB923B', ink:'#140000', accent:'#140000'},
  {id:'red', name:'Đỏ', paper:'#EB1C24', ink:'#FFFFFF', accent:'#FFF3EF'},
  {id:'blush', name:'Hồng kem', paper:'#FFF3EF', ink:'#231A16', accent:'#F04828'},
  {id:'ivory', name:'Trắng ngà', paper:'#FAF7F3', ink:'#231A16', accent:'#EB1C24'},
  {id:'stone', name:'Xám đá', paper:'#E7E5E0', ink:'#231A16', accent:'#F04828'},
  {id:'char', name:'Than', paper:'#231A16', ink:'#FFF3EF', accent:'#F04828'},
];
// Wording comes only from BRAND.md. Anything else is typed by a person.
const LINES = ['KING OF RAW HAIR', 'RAW VIETNAMESE HAIR', '100% RAW HUMAN HAIR', 'FACTORY DIRECT', 'WHOLESALE HAIR FACTORY', 'BUNDLES · CLOSURES · FRONTALS', 'WIGS · EXTENSIONS', 'VIETLINK HAIR', 'CHAT ON WHATSAPP'];
/* The WhatsApp number is the user's own: typed once, kept on this device, and drawn on every template (top right and
   wherever a template shows the number). It replaces BRAND.number, so changing templates never changes it. */
const WA_DEFAULT = BRAND.number;
try { const saved = localStorage.getItem('vl_wa'); if (saved) BRAND.number = saved; } catch (e) {}
const SUBS = ['vietlinkhair.com', 'Factory in Vietnam', 'Wholesale hair factory', BRAND.number];
function setWhatsApp(value) {
  const v = String(value || '').replace(/[^\d+()\-. ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || WA_DEFAULT, old = BRAND.number;
  if (v === old) return false;
  BRAND.number = v; SUBS[SUBS.indexOf(old)] = v;
  if (PS.spec && PS.spec.b2 === old) PS.spec.b2 = v;
  try { v === WA_DEFAULT ? localStorage.removeItem('vl_wa') : localStorage.setItem('vl_wa', v); } catch (e) {}
  return true;
}
function waField() {
  const input = el('input', {type:'tel', id:'waNumber', className:'txt', value:BRAND.number, maxLength:24, autocomplete:'tel', placeholder:WA_DEFAULT});
  const apply = () => { if (setWhatsApp(input.value)) photos(); else input.value = BRAND.number; };
  input.onchange = apply; input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } };
  return el('div', {className:'field'}, el('label', {htmlFor:'waNumber', textContent:'Số WhatsApp in trên ảnh (của bạn)'}), input,
    el('p', {className:'sub', style:'margin:4px 0 0', textContent:'Nhập một lần, máy này sẽ nhớ. Đổi mẫu bao nhiêu lần vẫn giữ số này. Để trống thì dùng số chung ' + WA_DEFAULT + '.'}));
}
const FILTERS = {
  'Gốc': {}, 'Sáng sạch': {gain:1.08, sat:.96, con:1.02}, 'Ấm': {warm:.035, sat:1.1, con:1.05}, 'Mượt': {gain:1.04, sat:.9, con:.94},
  'Tương phản': {con:1.18, sat:1.05}, 'Đậm màu': {sat:1.28, con:1.06}, 'Nhạt': {sat:.72, con:.96, gain:1.05}, 'Mát nhẹ': {warm:-.03, sat:.98},
  'Nắng': {gain:1.1, warm:.05, sat:1.08}, 'Cổ điển': {warm:.05, sat:.78, con:.95}, 'Bóng tóc': {con:1.12, sat:1.05, sharpen:.6}, 'Đen trắng': {sat:0, con:1.08},
};
const SAFE = 210; // Marks sit above this line, as in BRAND.md section 7.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const loadImage = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Không đọc được ảnh này. Hãy dùng ảnh JPG hoặc PNG.')); i.src = src; });

function fitImage(img, max) {
  const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = mkCanvas((img.naturalWidth || img.width) * k, (img.naturalHeight || img.height) * k), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function measure(src) {
  const w = 240, h = Math.max(1, Math.round(240 * src.height / src.width)), c = mkCanvas(w, h), x = c.getContext('2d', {willReadFrequently:true});
  x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < g.length; i++) { g[i] = .299 * d[i*4] + .587 * d[i*4+1] + .114 * d[i*4+2]; sum += g[i]; }
  const cell = 10, cw = Math.ceil(w / cell), ch = Math.ceil(h / cell), e = new Float32Array(cw * ch);
  for (let y = 1; y < h - 1; y++) for (let a = 1; a < w - 1; a++) { const p = y * w + a; e[((y / cell) | 0) * cw + ((a / cell) | 0)] += Math.abs(4 * g[p] - g[p-1] - g[p+1] - g[p-w] - g[p+w]); }
  let tx = 0, ty = 0, t = 0;
  for (let y = 0; y < ch; y++) for (let a = 0; a < cw; a++) { const s = e[y*cw+a] ** 2; tx += s * (a + .5) / cw; ty += s * (y + .5) / ch; t += s; }
  return {mean: sum / g.length, focus: t ? [tx / t, ty / t] : [.5, .5]};
}
function gradeCanvas(c, o) {
  const x = c.getContext('2d', {willReadFrequently:true}), w = c.width, h = c.height, im = x.getImageData(0, 0, w, h), d = im.data;
  const gain = o.gain, sat = o.sat, con = o.con, warm = o.warm;
  let total = 0;
  for (let i = 0; i < d.length; i += 16) total += .299 * d[i] + .587 * d[i+1] + .114 * d[i+2];
  const avg = gain * total / (d.length / 16);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * gain, g = d[i+1] * gain, b = d[i+2] * gain;
    const l = .299 * r + .587 * g + .114 * b;
    r = avg + (l + (r - l) * sat - avg) * con; g = avg + (l + (g - l) * sat - avg) * con; b = avg + (l + (b - l) * sat - avg) * con;
    d[i] = r * (1 + warm); d[i+1] = g * (1 + warm * .25); d[i+2] = b * (1 - warm);
  }
  if (o.sharpen > 0) {
    const s = new Uint8ClampedArray(d), k = o.sharpen;
    for (let y = 1; y < h - 1; y++) for (let a = 1; a < w - 1; a++) { const p = (y * w + a) * 4;
      for (let n = 0; n < 3; n++) d[p+n] = s[p+n] + k * (4 * s[p+n] - s[p+n-4] - s[p+n+4] - s[p+n-w*4] - s[p+n+w*4]) * .5; }
  }
  x.putImageData(im, 0, 0);
  return c;
}

/* One uploaded photo: a small copy for previews, a large one for export, and the edited versions in a small cache. */
class Photo {
  constructor(name, img) { this.name = name; this.lo = fitImage(img, 900); this.hi = fitImage(img, 2200); const m = measure(this.lo); this.mean = m.mean; this.focus = m.focus; this.cache = new Map(); }
  edited(spec, t, hi) {
    const key = [hi ? 'h' : 'l', spec.filter, spec.b, spec.c, spec.s, spec.w, spec.sh, t.rot, t.flip].join('|');
    if (this.cache.has(key)) return this.cache.get(key);
    const src = hi ? this.hi : this.lo, turned = t.rot % 180 !== 0, c = mkCanvas(turned ? src.height : src.width, turned ? src.width : src.height), x = c.getContext('2d', {willReadFrequently:true});
    x.translate(c.width / 2, c.height / 2); x.rotate(t.rot * Math.PI / 180); x.scale(t.flip ? -1 : 1, 1); x.drawImage(src, -src.width / 2, -src.height / 2);
    const f = FILTERS[spec.filter] || {};
    gradeCanvas(c, {gain: clamp(Math.pow(128 / Math.max(this.mean, 1), .4), .88, 1.25) * (f.gain || 1) * (1 + spec.b / 100), con: (f.con || 1) * (1 + spec.c / 100), sat: (f.sat == null ? 1 : f.sat) * (1 + spec.s / 100), warm: (f.warm || 0) + spec.w / 400, sharpen: (f.sharpen || 0) + spec.sh / 100});
    if (this.cache.size > 5) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, c);
    return c;
  }
}

/* Drawing tools given to each template. Sizes are for the full canvas; thumbnails scale everything. */
function tools(x, spec, W, H, s, photos, hi) {
  const t = THEMES.find(v => v.id === spec.theme) || THEMES[0], showText = spec.showText !== false;
  let slot = 0;
  const g = {W, H, t, a: spec.a, b: spec.b2, showText, ctx: x, ts: spec.ts / 100,
    fill(c, a, b, w, h) { x.fillStyle = c; x.fillRect(a, b, w, h); },
    grad(a, b, w, h, c1, c2) { const v = x.createLinearGradient(0, b, 0, b + h); v.addColorStop(0, c1); v.addColorStop(1, c2); x.fillStyle = v; x.fillRect(a, b, w, h); },
    head() { g.fill(BRAND.dark, 0, 0, W, SAFE); },
    path(fn) { x.beginPath(); fn(x); },
    /* Puts the next photo in a shape. With fewer photos than slots they repeat, each with a different crop. */
    pic(a, b, w, h, shape) {
      const n = slot++, i = (spec.main + n) % photos.length, p = photos[i], tr = spec.trans[i] || {zoom:1, px:0, py:0, rot:0, flip:false};
      const c = p.edited(spec, tr, hi), z = tr.zoom * (1 + (n >= photos.length ? .22 * ((n % 3) + 1) : 0));
      const k = Math.max(w / c.width, h / c.height) * z, sw = w / k, sh = h / k;
      const f = tr.rot === 0 && !tr.flip ? p.focus : [.5, .5], jog = n >= photos.length ? (n % 2 ? .12 : -.12) : 0;
      const sx = clamp(f[0] * c.width - sw / 2 + tr.px * c.width / 2 + jog * c.width, 0, c.width - sw), sy = clamp(f[1] * c.height - sh / 2 + tr.py * c.height / 2, 0, c.height - sh);
      x.save(); x.beginPath();
      if (shape === 'circle') x.ellipse(a + w / 2, b + h / 2, w / 2, h / 2, 0, 0, 7);
      else if (shape === 'arch') { x.moveTo(a, b + h); x.lineTo(a, b + w / 2); x.arc(a + w / 2, b + w / 2, w / 2, Math.PI, 0); x.lineTo(a + w, b + h); x.closePath(); }
      else if (typeof shape === 'number') x.roundRect(a, b, w, h, shape);
      else if (typeof shape === 'function') shape(x);
      else x.rect(a, b, w, h);
      x.clip(); x.imageSmoothingQuality = 'high';
      x.drawImage(c, sx, sy, sw, sh, a, b, w, h); x.restore();
    },
    poly(c, pts) { x.fillStyle = c; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); },
    box(c, a, b, w, h, lw) { x.strokeStyle = c; x.lineWidth = lw; x.strokeRect(a, b, w, h); },
    pill(c, a, b, w, h) { x.fillStyle = c; x.beginPath(); x.roundRect(a, b, w, h, h / 2); x.fill(); },
    width(text, size, bold) { x.font = `${bold ? '700' : '800'} ${size}px ${bold ? 'BrandBold' : 'BrandHeavy'}, Arial, sans-serif`; return x.measureText(text).width; },
    /* Centred on y; wraps and shrinks to stay inside maxW. */
    text(text, cx, y, o = {}) {
      if (!showText || !text) return;
      const lines = o.lines || 2, heavy = !o.bold; let size = (o.size || 76) * (spec.ts / 100), rows;
      for (;;) {
        rows = []; let row = '';
        for (const word of String(text).split(/\s+/)) { const next = row ? row + ' ' + word : word; if (g.width(next, size, !heavy) > o.maxW && row) { rows.push(row); row = word; } else row = next; }
        rows.push(row);
        rows = rows.map(r => r.replace(/^·\s*/, '').replace(/\s*·$/, ''));
        if ((rows.length <= lines && rows.every(r => g.width(r, size, !heavy) <= o.maxW)) || size < 16) break;
        size -= 2;
      }
      x.fillStyle = o.color || t.ink; x.textAlign = o.align || 'center'; x.textBaseline = 'middle';
      if (o.stroke) { x.strokeStyle = o.stroke; x.lineWidth = size * .09; x.lineJoin = 'round'; }
      const lh = size * 1.12;
      rows.forEach((r, i) => { const yy = y + (i - (rows.length - 1) / 2) * lh; if (o.stroke) x.strokeText(r, cx, yy); x.fillText(r, cx, yy); });
    },
    chip(text, a, y, o = {}) { if (!showText) return 0; const size = o.size || 34, w = g.width(text, size, true) + size * 1.4, h = size * 1.9; g.pill(o.bg || t.paper, a, y, w, h); g.text(text, a + w / 2, y + h / 2, {size, bold:true, maxW:w, lines:1, color:o.color || t.ink}); return w; },
  };
  return g;
}

/* The templates: [id, category, draw]. Each is a layout; the colour tone and format are chosen separately. */
const T = [];
const add = (id, cat, draw) => T.push({id, cat, draw});
const FULL = 'Toàn ảnh', BAND = 'Dải chữ', FRAME = 'Khung', SPLIT = 'Chia đôi', SHAPE = 'Hình khối', GRID = 'Ghép ảnh', SPEC = 'Thông tin';
add('full', FULL, g => g.pic(0, 0, g.W, g.H));
add('full-bottom', FULL, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.grad(0, g.H * .62, g.W, g.H * .38, 'rgba(20,0,0,0)', 'rgba(20,0,0,.86)'); g.text(g.a, g.W / 2, g.H - 170, {size:88, maxW:g.W - 140, color:'#fff'}); g.text(g.b, g.W / 2, g.H - 62, {size:34, bold:true, maxW:g.W - 140, lines:1, color:'#fff'}); });
add('full-under', FULL, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.grad(0, SAFE - 40, g.W, 300, 'rgba(20,0,0,.72)', 'rgba(20,0,0,0)'); g.text(g.a, g.W / 2, SAFE + 62, {size:72, maxW:g.W - 140, color:'#fff'}); });
add('full-center', FULL, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.fill('rgba(20,0,0,.42)', 0, 0, g.W, g.H); g.text(g.a, g.W / 2, g.H / 2, {size:112, maxW:g.W - 160, lines:3, color:'#fff'}); });
add('full-tag', FULL, g => { g.pic(0, 0, g.W, g.H); g.chip(g.a, 60, g.H - 140, {size:36, bg:g.t.paper, color:g.t.ink}); });
add('full-outline', FULL, g => { g.pic(0, 0, g.W, g.H); g.text(g.a, g.W / 2, g.H - 200, {size:104, maxW:g.W - 110, color:'#fff', stroke:BRAND.dark}); });
add('full-corner', FULL, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.poly(g.t.paper, [[g.W, g.H - 380], [g.W, g.H], [g.W - 380, g.H]]); g.text(g.a, g.W - 148, g.H - 92, {size:34, maxW:220, lines:3, color:g.t.ink}); });
add('full-rule', FULL, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.fill(g.t.accent, 70, g.H - 260, 8, 170); g.text(g.a, 104, g.H - 175, {size:62, maxW:g.W - 180, align:'left', color:'#fff', stroke:BRAND.dark}); });
add('band-bottom', BAND, g => { const h = 190; g.pic(0, 0, g.W, g.H - h); g.fill(g.t.paper, 0, g.H - h, g.W, h); g.fill(g.t.accent, 0, g.H - h, g.W, 8); g.text(g.a, g.W / 2, g.H - h / 2 + 4, {size:76, maxW:g.W - 140}); });
add('band-two', BAND, g => { const h = 240; g.pic(0, 0, g.W, g.H - h); g.fill(g.t.paper, 0, g.H - h, g.W, h); g.text(g.a, g.W / 2, g.H - 150, {size:72, maxW:g.W - 140, lines:1}); g.text(g.b, g.W / 2, g.H - 66, {size:36, bold:true, maxW:g.W - 140, lines:1, color:g.t.accent}); });
add('band-mid', BAND, g => { const h = 170; g.pic(0, 0, g.W, g.H); if (g.showText) g.fill(g.t.paper, 0, g.H * .62, g.W, h); g.text(g.a, g.W / 2, g.H * .62 + h / 2, {size:72, maxW:g.W - 120}); });
add('band-tilt', BAND, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.poly(g.t.paper, [[0, g.H - 150], [g.W, g.H - 300], [g.W, g.H], [0, g.H]]); g.text(g.a, g.W / 2, g.H - 110, {size:70, maxW:g.W - 150}); });
add('band-tab', BAND, g => { g.pic(0, 0, g.W, g.H); if (g.showText) { const w = Math.min(g.width(g.a, 50) + 110, g.W - 80); g.fill(g.t.paper, 0, g.H - 210, w, 110); g.fill(g.t.accent, w, g.H - 210, 12, 110); g.text(g.a, 44, g.H - 155, {size:50, maxW:w - 70, lines:1, align:'left'}); } });
add('band-double', BAND, g => { const h = 130; g.pic(0, 0, g.W, g.H); if (g.showText) { g.fill(g.t.paper, 0, g.H - h * 2 - 50, g.W, h); g.fill(g.t.accent, 0, g.H - h - 50, g.W, h); } g.text(g.a, g.W / 2, g.H - h * 1.5 - 50, {size:62, maxW:g.W - 120, lines:1}); g.text(g.b, g.W / 2, g.H - h / 2 - 50, {size:44, bold:true, maxW:g.W - 120, lines:1, color:g.t.paper}); });
add('band-pill', BAND, g => { g.pic(0, 0, g.W, g.H); if (g.showText) { const w = Math.min(g.width(g.a, 52) + 120, g.W - 80); g.pill(g.t.paper, (g.W - w) / 2, g.H - 200, w, 110); g.text(g.a, g.W / 2, g.H - 145, {size:52, maxW:w - 70, lines:1}); } });
add('band-side', BAND, g => { const w = 230; g.head(); g.pic(0, SAFE, g.W - w, g.H - SAFE); g.fill(g.t.paper, g.W - w, SAFE, w, g.H - SAFE); g.fill(g.t.accent, g.W - w, SAFE, 8, g.H - SAFE); g.text(g.a, g.W - w / 2 + 3, (SAFE + g.H) / 2, {size:44, maxW:w - 40, lines:6}); });
add('frame-thin', FRAME, g => { g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(30, SAFE, g.W - 60, g.H - SAFE - 30); });
add('frame-thick', FRAME, g => { g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(80, SAFE + 40, g.W - 160, g.H - SAFE - 220); g.text(g.a, g.W / 2, g.H - 90, {size:64, maxW:g.W - 160}); });
add('frame-polaroid', FRAME, g => { g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(70, SAFE + 40, g.W - 140, g.H - SAFE - 300); g.text(g.a, g.W / 2, g.H - 170, {size:66, maxW:g.W - 160, lines:1}); g.text(g.b, g.W / 2, g.H - 86, {size:34, bold:true, maxW:g.W - 160, lines:1, color:g.t.accent}); });
add('frame-line', FRAME, g => { g.pic(0, 0, g.W, g.H); g.box('#fff', 44, SAFE, g.W - 88, g.H - SAFE - 44, 4); g.text(g.a, g.W / 2, g.H - 130, {size:70, maxW:g.W - 170, color:'#fff', stroke:BRAND.dark}); });
add('frame-corners', FRAME, g => { g.pic(0, 0, g.W, g.H); const l = 120, m = 56, c = g.t.accent; [[m, SAFE, 1, 1], [g.W - m, SAFE, -1, 1], [m, g.H - m, 1, -1], [g.W - m, g.H - m, -1, -1]].forEach(([a, b, u, v]) => { g.fill(c, u > 0 ? a : a - l, v > 0 ? b : b - 10, l, 10); g.fill(c, u > 0 ? a : a - 10, v > 0 ? b : b - l, 10, l); }); g.text(g.a, g.W / 2, g.H - 150, {size:64, maxW:g.W - 240, color:'#fff', stroke:BRAND.dark}); });
add('frame-card', FRAME, g => { g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.fill(g.t.accent, 110, SAFE + 70, g.W - 160, g.H - SAFE - 300); g.pic(80, SAFE + 40, g.W - 160, g.H - SAFE - 300, 24); g.text(g.a, g.W / 2, g.H - 110, {size:64, maxW:g.W - 160}); });
add('split-left', SPLIT, g => { const w = g.W * .4; g.head(); g.fill(g.t.paper, 0, SAFE, w, g.H - SAFE); g.pic(w, SAFE, g.W - w, g.H - SAFE); g.text(g.a, w / 2, (SAFE + g.H) / 2, {size:62, maxW:w - 60, lines:5}); g.text(g.b, w / 2, g.H - 70, {size:24, bold:true, maxW:w - 40, lines:2, color:g.t.accent}); });
add('split-right', SPLIT, g => { const w = g.W * .4; g.head(); g.fill(g.t.paper, g.W - w, SAFE, w, g.H - SAFE); g.pic(0, SAFE, g.W - w, g.H - SAFE); g.text(g.a, g.W - w / 2, (SAFE + g.H) / 2, {size:62, maxW:w - 60, lines:5}); g.text(g.b, g.W - w / 2, g.H - 70, {size:24, bold:true, maxW:w - 40, lines:2, color:g.t.accent}); });
add('split-panel', SPLIT, g => { const h = g.H * .3; g.pic(0, 0, g.W, g.H - h); g.fill(g.t.paper, 0, g.H - h, g.W, h); g.text(g.a, g.W / 2, g.H - h * .58, {size:84, maxW:g.W - 140}); g.text(g.b, g.W / 2, g.H - 58, {size:32, bold:true, maxW:g.W - 140, lines:1, color:g.t.accent}); });
add('split-diag', SPLIT, g => { g.pic(0, 0, g.W, g.H); if (g.showText) g.poly(g.t.paper, [[0, g.H * .52], [g.W * .62, g.H], [0, g.H]]); g.text(g.a, g.W * .2, g.H - 170, {size:50, maxW:g.W * .32, lines:4}); });
add('split-slash', SPLIT, g => { g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(g.W * .28, SAFE, g.W * .72, g.H - SAFE, x => { x.moveTo(g.W * .45, SAFE); x.lineTo(g.W, SAFE); x.lineTo(g.W, g.H); x.lineTo(g.W * .28, g.H); x.closePath(); }); g.text(g.a, g.W * .19, (SAFE + g.H) / 2, {size:48, maxW:g.W * .3, lines:6}); });
add('shape-circle', SHAPE, g => { const d = Math.min(g.W - 140, g.H - SAFE - 280); g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic((g.W - d) / 2, SAFE + 30, d, d, 'circle'); g.text(g.a, g.W / 2, (SAFE + 30 + d + g.H) / 2, {size:68, maxW:g.W - 140}); });
add('shape-arch', SHAPE, g => { const w = g.W - 240; g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(120, SAFE + 30, w, g.H - SAFE - 230, 'arch'); g.text(g.a, g.W / 2, g.H - 100, {size:64, maxW:g.W - 140}); });
add('shape-round', SHAPE, g => { g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(60, SAFE + 20, g.W - 120, g.H - SAFE - 210, 48); g.text(g.a, g.W / 2, g.H - 96, {size:66, maxW:g.W - 140}); });
add('shape-pill', SHAPE, g => { const w = g.W * .52; g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(g.W - w - 50, SAFE + 30, w, g.H - SAFE - 80, w / 2); g.text(g.a, (g.W - w - 50) / 2, (SAFE + g.H) / 2, {size:50, maxW:g.W - w - 110, lines:5}); });
add('shape-dots', SHAPE, g => { const d = (g.W - 180) / 2, y = SAFE + 40; g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(60, y, d, d, 'circle'); g.pic(120 + d, y, d, d, 'circle'); g.text(g.a, g.W / 2, (y + d + g.H) / 2, {size:78, maxW:g.W - 140, lines:3}); });
add('grid-2col', GRID, g => { const w = (g.W - 12) / 2; g.fill(BRAND.dark, 0, 0, g.W, g.H); g.pic(0, 0, w, g.H); g.pic(w + 12, 0, w, g.H); });
add('grid-2row', GRID, g => { const h = (g.H - 12) / 2; g.fill(BRAND.dark, 0, 0, g.W, g.H); g.pic(0, 0, g.W, h); g.pic(0, h + 12, g.W, h); });
add('grid-1and2', GRID, g => { const h = g.H * .62, w = (g.W - 10) / 2; g.fill(g.t.paper, 0, 0, g.W, g.H); g.pic(0, 0, g.W, h); g.pic(0, h + 10, w, g.H - h - 10); g.pic(w + 10, h + 10, w, g.H - h - 10); });
add('grid-3col', GRID, g => { const w = (g.W - 20) / 3; g.fill(g.t.paper, 0, 0, g.W, g.H); g.pic(0, 0, w, g.H); g.pic(w + 10, 0, w, g.H); g.pic(2 * w + 20, 0, w, g.H); });
add('grid-4', GRID, g => { const w = (g.W - 10) / 2, h = (g.H - 10) / 2; g.fill(g.t.paper, 0, 0, g.W, g.H); g.pic(0, 0, w, h); g.pic(w + 10, 0, w, h); g.pic(0, h + 10, w, h); g.pic(w + 10, h + 10, w, h); });
add('grid-hero3', GRID, g => { const h = g.H * .7, w = (g.W - 20) / 3; g.fill(g.t.paper, 0, 0, g.W, g.H); g.pic(0, 0, g.W, h); [0, 1, 2].forEach(i => g.pic(i * (w + 10), h + 10, w, g.H - h - 10)); });
add('grid-2text', GRID, g => { const h = 200, w = (g.W - 10) / 2; g.fill(g.t.paper, 0, 0, g.W, g.H); g.pic(0, 0, w, g.H - h); g.pic(w + 10, 0, w, g.H - h); g.text(g.a, g.W / 2, g.H - h / 2, {size:72, maxW:g.W - 130}); });
add('grid-stagger', GRID, g => { const w = (g.W - 180) / 2; g.head(); g.fill(g.t.paper, 0, SAFE, g.W, g.H - SAFE); g.pic(60, SAFE + 30, w, g.H - SAFE - 260, 16); g.pic(120 + w, SAFE + 190, w, g.H - SAFE - 260, 16); g.text(g.a, 60 + w / 2, g.H - 110, {size:44, maxW:w, lines:3}); });
add('grid-6', GRID, g => { const w = (g.W - 10) / 2, h = (g.H - 20) / 3; g.fill(g.t.paper, 0, 0, g.W, g.H); for (let i = 0; i < 6; i++) g.pic((i % 2) * (w + 10), ((i / 2) | 0) * (h + 10), w, h); });
add('spec-chips', SPEC, g => { const h = 230; g.pic(0, 0, g.W, g.H - h); g.fill(g.t.paper, 0, g.H - h, g.W, h); g.text(g.a, g.W / 2, g.H - 165, {size:60, maxW:g.W - 120, lines:1}); if (g.showText) { const list = ['Bundles', 'Closures', 'Frontals', 'Wigs']; let total = list.reduce((n, v) => n + g.width(v, 30, true) + 42 + 12, -12), a = (g.W - total) / 2; list.forEach(v => { a += g.chip(v, a, g.H - 96, {size:30, bg:g.t.accent, color:g.t.paper}) + 12; }); } });
add('spec-list', SPEC, g => { const w = g.W * .42; g.head(); g.fill(g.t.paper, 0, SAFE, w, g.H - SAFE); g.pic(w, SAFE, g.W - w, g.H - SAFE); g.text('RAW HUMAN HAIR', w / 2, SAFE + 120, {size:52, maxW:w - 60, lines:3, color:g.t.accent}); ['Bundles', 'Closures', 'Frontals', 'Wigs', 'Extensions'].forEach((v, i) => g.text(v, w / 2, SAFE + 280 + i * 76, {size:36, bold:true, maxW:w - 50, lines:1})); });
add('spec-site', SPEC, g => { const h = 200; g.pic(0, 0, g.W, g.H - h); g.fill(g.t.paper, 0, g.H - h, g.W, h); g.text('vietlinkhair.com', g.W / 2, g.H - 130, {size:58, maxW:g.W - 140, lines:1}); g.text(BRAND.number, g.W / 2, g.H - 56, {size:38, bold:true, maxW:g.W - 140, lines:1, color:g.t.accent}); });
add('spec-cta', SPEC, g => { g.pic(0, 0, g.W, g.H); if (g.showText) { g.fill('rgba(20,0,0,.4)', 0, g.H - 320, g.W, 320); const w = 620; g.pill('#08B917', (g.W - w) / 2, g.H - 190, w, 104); } g.text('CHAT ON WHATSAPP', g.W / 2, g.H - 138, {size:44, maxW:560, lines:1, color:'#fff'}); if (g.a !== 'CHAT ON WHATSAPP') g.text(g.a, g.W / 2, g.H - 258, {size:56, maxW:g.W - 130, lines:1, color:'#fff'}); });
const CATS = [FULL, BAND, FRAME, SPLIT, SHAPE, GRID, SPEC];

function drawMarks(x, logo, icon, W) {
  const L = BRAND.logo, Q = BRAND.whatsapp, lh = Math.round(logo.naturalHeight * L.width / logo.naturalWidth);
  x.save(); x.globalAlpha = L.opacity; x.shadowColor = BRAND.dark; x.shadowBlur = 5; x.drawImage(logo, L.left, L.top, L.width, lh); x.restore();
  const size = Q.size, gap = Math.round(size * .3), tint = mkCanvas(size, size), t = tint.getContext('2d');
  t.drawImage(icon, 0, 0, size, size); t.globalCompositeOperation = 'source-in'; t.fillStyle = BRAND.whatsappIcon; t.fillRect(0, 0, size, size);
  x.save(); x.globalAlpha = Q.opacity; x.font = `700 ${size}px BrandBold, Arial, sans-serif`; x.textBaseline = 'middle'; x.textAlign = 'left';
  const tw = x.measureText(BRAND.number).width, left = W - Q.right - size - gap - tw, mid = Q.top + size / 2;
  x.drawImage(tint, left, Q.top); x.lineWidth = 4; x.strokeStyle = BRAND.dark; x.lineJoin = 'round';
  x.strokeText(BRAND.number, left + size + gap, mid); x.fillStyle = '#fff'; x.fillText(BRAND.number, left + size + gap, mid);
  x.restore();
}
/* Logo and WhatsApp are always drawn last and cannot be switched off. */
function renderSpec(spec, photos, assets, scale, hi) {
  const [W, H] = FORMATS[spec.format], c = mkCanvas(W * scale, H * scale), x = c.getContext('2d', {willReadFrequently:true});
  x.scale(scale, scale);
  x.fillStyle = BRAND.dark; x.fillRect(0, 0, W, H);
  layoutOf(spec.layout).draw(tools(x, spec, W, H, scale, photos, hi));
  drawMarks(x, assets.logo, assets.icon, W);
  return c;
}

const PS = {photos: [], assets: null, spec: null, cat: GEN, format: '4:5', theme: 'mix'};
const layoutOf = id => isGen(id) ? {id, cat: GEN, draw: g => genDraw(seedOf(id), g)} : (T.find(v => v.id === id) || T[0]);
/* "Trộn màu" (mix) lets each design bring its own tone; picking a tone applies it to every design. */
function newSpec(id) {
  const r = isGen(id) ? recipe(seedOf(id)) : null, i = Math.max(0, T.findIndex(v => v.id === id));
  const theme = PS.theme === 'mix' ? (r ? r.theme : THEMES[(i * 3) % THEMES.length].id) : PS.theme;
  return {layout:id, format:PS.format, theme, filter:'Gốc', b:0, c:0, s:0, w:0, sh:0, a: r ? LINES[r.line] : LINES[i % LINES.length], b2: r ? SUBS[r.sub] : SUBS[0], ts:100, showText:true, main:0, trans:PS.photos.map(() => ({zoom:1, px:0, py:0, rot:0, flip:false}))};
}
/* Each new design gets a fresh seed whose look has not been shown yet in this visit. */
const SEEN = new Set();
function freshSeed() {
  for (let k = 0; k < 400; k++) {
    const seed = (Math.random() * 4294967296) >>> 0, sig = signature(recipe(seed)) + '|' + PS.theme;
    if (!SEEN.has(sig)) { SEEN.add(sig); return seed; }
  }
  return (Math.random() * 4294967296) >>> 0;
}

async function loadAssets() {
  if (PS.assets) return PS.assets;
  await Promise.all([document.fonts.load('800 76px BrandHeavy'), document.fonts.load('700 32px BrandBold')]);
  PS.assets = {logo: await loadImage(ASSETS.logo), icon: await loadImage(ASSETS.icon)};
  return PS.assets;
}
/* iPhone photos are often HEIC. Safari opens them; Chrome and Edge on PC cannot, so those are turned into JPEG on this device
   with heic2any, loaded from the CDN only the first time a HEIC file is picked. */
const isHeic = f => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
let heicLib = null;
const loadHeic = () => heicLib || (heicLib = new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
  s.onload = () => window.heic2any ? ok(window.heic2any) : no(new Error('x'));
  s.onerror = () => no(new Error('x'));
  document.head.append(s);
}).catch(() => { heicLib = null; throw new Error('Không tải được bộ đọc ảnh HEIC. Kiểm tra mạng rồi thử lại.'); }));
async function readPhoto(f) {
  const open = async blob => { const u = URL.createObjectURL(blob); try { return await loadImage(u); } finally { URL.revokeObjectURL(u); } };
  if (!isHeic(f)) return open(f);
  try { return await open(f); } catch (e) {}
  const conv = await loadHeic();
  let out;
  try { out = await conv({blob: f, toType: 'image/jpeg', quality: 0.92}); }
  catch (e) { throw new Error('Không đọc được ảnh HEIC ' + f.name + '. Hãy thử ảnh khác hoặc đổi sang JPG.'); }
  return open(Array.isArray(out) ? out[0] : out);
}
async function addPhotos(files, onStep) {
  for (const f of files) {
    if (onStep && isHeic(f)) onStep('Đang đổi ảnh HEIC ' + f.name + ' sang JPG...');
    PS.photos.push(new Photo(f.name, await readPhoto(f)));
  }
}
function slider(label, min, max, value, onInput, step = 1) {
  const id = 'r' + Math.random().toString(36).slice(2), r = el('input', {type:'range', id, min, max, step, value}), v = el('span', {className:'val', textContent:value});
  r.oninput = () => { v.textContent = r.value; onInput(+r.value); };
  return el('div', {className:'range'}, el('label', {htmlFor:id, textContent:label}), r, v);
}
function chips(items, current, onPick, label) {
  const bar = el('div', {className:'bar', role:'group'}); bar.setAttribute('aria-label', label);
  items.forEach(([v, t]) => { const b = el('button', {type:'button', textContent:t}); b.setAttribute('aria-pressed', v === current); b.onclick = () => onPick(v); bar.append(b); });
  return bar;
}
const groupBox = (title, open, ...kids) => { const d = el('details', {className:'card', open}); d.append(el('summary', {textContent:title}), ...kids); return d; };

async function photos() {
  const input = el('input', {type:'file', id:'files', multiple:true, accept:'image/\x2a,.heic,.heif'}), msg = el('div');
  input.onchange = async () => {
    const list = [...input.files];
    if (!list.length) return;
    if (PS.photos.length + list.length > 12) { msg.replaceChildren(el('p', {className:'err', role:'alert', textContent:'Tối đa 12 ảnh mỗi lần.'})); return; }
    msg.replaceChildren(el('p', {textContent:'Đang đọc ảnh...'}));
    try { await addPhotos(list, t => msg.replaceChildren(el('p', {textContent:t}))); PS.spec = null; photos(); } catch (e) { msg.replaceChildren(el('p', {className:'err', role:'alert', textContent:e.message})); }
  };
  const head = [el('h2', {textContent:'Tạo ảnh đăng bài'}), el('p', {className:'sub', textContent:'Tải ảnh của bạn lên, chọn mẫu, chỉnh rồi tải về. Ảnh được xử lý ngay trên máy này, không gửi đi đâu. Logo và số WhatsApp luôn có trên ảnh.'}), waField()];
  const upload = el('div', {className:'field'}, el('label', {htmlFor:'files', textContent:PS.photos.length ? 'Thêm ảnh' : 'Bước 1: chọn ảnh của bạn (bắt buộc)'}), input);
  if (!PS.photos.length) { view.replaceChildren(...head, upload, msg); return; }
  await loadAssets();
  const strip = el('div', {className:'strip'}, ...PS.photos.map((p, i) => { const d = el('div', {className:'mini'}), c = mkCanvas(90, 90); const k = Math.max(90 / p.lo.width, 90 / p.lo.height); c.getContext('2d').drawImage(p.lo, (90 - p.lo.width * k) / 2, (90 - p.lo.height * k) / 2, p.lo.width * k, p.lo.height * k); const x = el('button', {type:'button', className:'x', textContent:'×', ariaLabel:'Bỏ ảnh ' + p.name}); x.onclick = () => { PS.photos.splice(i, 1); PS.spec = null; photos(); }; d.append(c, x); return d; }));
  view.replaceChildren(...head, upload, msg, strip);
  if (PS.spec) editor(); else gallery();
}
let thumbRun = 0, randomBag = [];
/* Goes through every layout and colour tone once, in random order, before repeating. It only changes the preview: nothing is exported. */
function nextLayout() {
  if (Math.random() < .85) return genId(freshSeed());
  if (!randomBag.length) { randomBag = T.map(t => t.id); for (let i = randomBag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [randomBag[i], randomBag[j]] = [randomBag[j], randomBag[i]]; } }
  return randomBag.pop();
}
function randomize() {
  const old = PS.spec, layout = nextLayout(), fresh = newSpec(layout);
  // Keep the user's edits and any text they typed themselves.
  PS.spec = old ? {...old, layout, theme: fresh.theme, a: LINES.includes(old.a) ? fresh.a : old.a, b2: SUBS.includes(old.b2) ? fresh.b2 : old.b2} : fresh;
  photos().then(() => { const p = view.querySelector('.previewBox'); if (p) p.scrollIntoView({block:'nearest'}); });
}
const randomButton = label => { const b = el('button', {type:'button', className:'btn', id:'randomBtn', textContent:label}); b.onclick = randomize; return b; };
function gallery() {
  const run = ++thumbRun, grid = el('div', {className:'tpl'}), gen = PS.cat === GEN, ids = gen ? [] : T.filter(t => t.cat === PS.cat);
  const box = el('div', {},
    el('div', {className:'bar'}, randomButton('🎲 Ngẫu nhiên')),
    el('h3', {textContent: gen ? 'Bước 2: chọn mẫu. Kéo xuống là có thêm mẫu mới, không bao giờ hết.' : `Bước 2: chọn mẫu (${ids.length} mẫu làm sẵn trong nhóm này)`}),
    chips(Object.keys(FORMATS).map(k => [k, k === '4:5' ? '4:5 Bài đăng' : k === '1:1' ? '1:1 Vuông' : '9:16 Story']), PS.format, v => { PS.format = v; photos(); }, 'Khổ ảnh'),
    chips([['mix', '🎨 Trộn màu'], ...THEMES.map(t => [t.id, t.name])], PS.theme, v => { PS.theme = v; photos(); }, 'Tông màu'),
    chips([[GEN, '✨ ' + GEN], ...CATS.map(c => [c, `${c} (${T.filter(t => t.cat === c).length})`])], PS.cat, v => { PS.cat = v; photos(); }, 'Nhóm mẫu'),
    grid);
  view.append(box);
  const [W] = FORMATS[PS.format], scale = 220 / W, queue = [];
  const addTile = id => { const spec = newSpec(id), b = el('button', {type:'button', className:'tile', ariaLabel:'Mẫu ' + id}); b.onclick = () => { PS.spec = spec; photos(); }; grid.append(b); queue.push([spec, b]); };
  let near = () => false;
  const next = () => {
    if (run !== thumbRun) return;
    if (!queue.length) { if (near()) batch(); return; }
    const [spec, b] = queue.shift();
    try { b.append(renderSpec(spec, PS.photos, PS.assets, scale, false)); } catch (e) { console.error(spec.layout, e); }
    setTimeout(next);
  };
  if (!gen) { ids.forEach(t => addTile(t.id)); next(); return; }
  const more = el('button', {type:'button', className:'btn line', textContent:'Xem thêm 12 mẫu mới'}), sentinel = el('div', {style:'height:1px'});
  function batch() { if (run !== thumbRun) return; const idle = !queue.length; for (let k = 0; k < 12; k++) addTile(genId(freshSeed())); if (idle) next(); }
  more.onclick = batch;
  box.append(el('div', {className:'bar', style:'margin-top:12px'}, more), sentinel);
  /* Scrolling near the end adds 12 more, so the list never runs out. */
  near = () => sentinel.isConnected && sentinel.getBoundingClientRect().top < innerHeight + 600;
  const onScroll = () => { if (run !== thumbRun || !sentinel.isConnected) { removeEventListener('scroll', onScroll); return; } if (!queue.length && near()) batch(); };
  addEventListener('scroll', onScroll, {passive: true});
  batch();
}
function editor() {
  thumbRun++;
  const s = PS.spec, preview = el('canvas', {className:'preview'}), out = el('div');
  const draw = () => { const c = renderSpec(s, PS.photos, PS.assets, .5, false); preview.width = c.width; preview.height = c.height; preview.getContext('2d').drawImage(c, 0, 0); };
  let timer; const redraw = () => { clearTimeout(timer); timer = setTimeout(draw, 40); };
  const tr = () => s.trans[s.main];
  let drag = null;
  preview.onpointerdown = e => { drag = [e.clientX, e.clientY, tr().px, tr().py]; preview.setPointerCapture(e.pointerId); };
  preview.onpointermove = e => { if (!drag) return; const r = preview.getBoundingClientRect(); tr().px = clamp(drag[2] - (e.clientX - drag[0]) / r.width, -1, 1); tr().py = clamp(drag[3] - (e.clientY - drag[1]) / r.height, -1, 1); redraw(); };
  preview.onpointerup = preview.onpointercancel = () => { drag = null; };
  const main = PS.photos.length > 1 ? el('div', {className:'field'}, chips(PS.photos.map((_, i) => [i, 'Ảnh ' + (i + 1)]), s.main, v => { s.main = v; photos(); }, 'Ảnh chính')) : '';
  const btn = (t, f) => { const b = el('button', {type:'button', className:'btn line', textContent:t}); b.onclick = f; return b; };
  const zoom = slider('Phóng to', 100, 300, Math.round(tr().zoom * 100), v => { tr().zoom = v / 100; redraw(); });
  const imgBox = groupBox('Cắt, xoay, lật', true, main, zoom, el('p', {className:'sub', textContent:'Kéo trực tiếp trên ảnh để đổi vị trí.'}),
    el('div', {className:'bar'}, btn('Xoay 90°', () => { tr().rot = (tr().rot + 90) % 360; redraw(); }), btn('Lật ngang', () => { tr().flip = !tr().flip; redraw(); }), btn('Đặt lại', () => { Object.assign(tr(), {zoom:1, px:0, py:0, rot:0, flip:false}); photos(); })));
  const filter = el('select', {id:'filter'}, ...Object.keys(FILTERS).map(f => el('option', {value:f, textContent:f}))); filter.value = s.filter; filter.onchange = () => { s.filter = filter.value; redraw(); };
  const colorBox = groupBox('Màu và ánh sáng', false, el('div', {className:'field'}, el('label', {htmlFor:'filter', textContent:'Bộ lọc'}), filter),
    ...[['Độ sáng', 'b'], ['Tương phản', 'c'], ['Bão hòa', 's'], ['Ấm lạnh', 'w']].map(([t, k]) => slider(t, -50, 50, s[k], v => { s[k] = v; redraw(); })), slider('Độ nét', 0, 100, s.sh, v => { s.sh = v; redraw(); }),
    btn('Đặt lại màu', () => { Object.assign(s, {filter:'Gốc', b:0, c:0, s:0, w:0, sh:0}); photos(); }));
  const show = el('input', {type:'checkbox', id:'showText', checked:s.showText}); show.onchange = () => { s.showText = show.checked; redraw(); };
  const a = el('input', {type:'text', id:'lineA', value:s.a, className:'txt', maxLength:80}); a.oninput = () => { s.a = a.value; redraw(); };
  const b2 = el('input', {type:'text', id:'lineB', value:s.b2, className:'txt', maxLength:60}); b2.oninput = () => { s.b2 = b2.value; redraw(); };
  const pick = el('select', {id:'linePick', ariaLabel:'Chọn câu có sẵn'}, el('option', {value:'', textContent:'Chọn câu có sẵn...'}), ...LINES.map(l => el('option', {value:l, textContent:l}))); pick.onchange = () => { if (pick.value) { a.value = s.a = pick.value; redraw(); } };
  const textBox = groupBox('Chữ', true, el('div', {className:'ticks'}, el('label', {}, show, 'Hiện chữ')), el('div', {className:'field'}, el('label', {htmlFor:'lineA', textContent:'Dòng chính'}), a, pick), el('div', {className:'field'}, el('label', {htmlFor:'lineB', textContent:'Dòng phụ (mẫu có dòng phụ)'}), b2), slider('Cỡ chữ', 60, 140, s.ts, v => { s.ts = v; redraw(); }), el('p', {className:'sub', textContent:'Chỉ ghi điều có thật, không tự thêm giá hay cam kết.'}));
  const look = groupBox('Khổ và tông màu', false, chips(Object.keys(FORMATS).map(k => [k, k]), s.format, v => { s.format = v; photos(); }, 'Khổ ảnh'), chips(THEMES.map(t => [t.id, t.name]), s.theme, v => { s.theme = v; photos(); }, 'Tông màu'));
  const save = el('button', {type:'button', className:'btn', textContent:'Tải ảnh này'}); save.onclick = () => exportMany([s], out);
  const all = PS.photos.length > 1 ? el('button', {type:'button', className:'btn line', style:'min-height:44px', textContent:`Áp dụng cho cả ${PS.photos.length} ảnh`}) : '';
  if (all) all.onclick = () => exportMany(PS.photos.map((_, i) => ({...s, main:i})), out);
  const back = btn('← Chọn mẫu khác', () => { PS.spec = null; photos(); });
  view.append(el('div', {className:'bar'}, back), el('div', {className:'previewBox'}, preview), el('div', {className:'bar', style:'margin-top:12px'}, randomButton('🎲 Mẫu khác'), save, all), out, imgBox, colorBox, textBox, look);
  draw();
}
async function exportMany(specs, out) {
  out.replaceChildren(el('p', {textContent:'Đang tạo ảnh...'}));
  const items = [];
  try {
    for (const s of specs) {
      const c = renderSpec(s, PS.photos, PS.assets, 1, true);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .93)); c.width = c.height = 0;
      const src = PS.photos[s.main].name, name = `${src.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_')}_${s.layout}_${s.theme}.jpg`, url = URL.createObjectURL(blob);
      items.push(el('div', {}, el('img', {src:url, alt:'Ảnh đã tạo theo mẫu ' + s.layout}), el('a', {className:'btn line', style:'margin-top:6px', href:url, download:name, textContent:'Tải về'})));
      await new Promise(r => setTimeout(r));
    }
    out.replaceChildren(el('h3', {textContent:`Đã tạo ${items.length} ảnh`}), el('p', {className:'sub', textContent:'Bấm Tải về. Nếu điện thoại không tải được, nhấn giữ ảnh rồi chọn Lưu ảnh.'}), el('div', {className:'grid'}, ...items));
  } catch (e) { out.replaceChildren(el('p', {className:'err', role:'alert', textContent:'Không tạo được ảnh: ' + e.message})); }
}
