/* Endless templates. A design is one number (its seed). recipe(seed) picks every choice up front, so the same seed always
   draws the same design in the gallery, the editor and the download. Pieces: photo structure × text zone × type style ×
   ornaments × colour tone × wording. Brand rules stay: wording only from LINES and SUBS, colours only from THEMES,
   logo and WhatsApp drawn last by renderSpec, and nothing light sits under the white logo. */
const GEN = 'Vô tận';
const genId = seed => 'g' + (seed >>> 0);
const isGen = id => /^g\d+$/.test(String(id));
const seedOf = id => Number(String(id).slice(1)) >>> 0;

function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { f: next, n: (a, b) => a + (b - a) * next(), i: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: arr => arr[Math.floor(next() * arr.length)], yes: p => next() < p };
}
const lum = hex => { const v = parseInt(String(hex).slice(1), 16); return (.299 * (v >> 16 & 255) + .587 * (v >> 8 & 255) + .114 * (v & 255)) / 255; };
const isLight = hex => lum(hex) > .5;

const STRUCTS = ['full', 'splitH', 'splitV', 'inset', 'shape', 'duo', 'trio', 'quad', 'strips', 'diagonal', 'band', 'window', 'polaroid'];
const TYPOS = ['center', 'leftRule', 'marker', 'pill', 'giant', 'kicker', 'boxed', 'underline'];
const PHOTO_TYPOS = ['center', 'leftRule', 'marker', 'outline', 'pill', 'giant', 'kicker', 'underline'];
const DECOR = ['none', 'frame', 'corners', 'ruleTop', 'dots', 'sideBar', 'square', 'double', 'ring'];

/** Every choice for one design. Numbers are fractions so one recipe fits all three formats. */
function recipe(seed) {
  const r = rng(seed), s = {seed, struct: r.pick(STRUCTS)};
  s.v = {
    zone: r.pick(['bottom', 'bottom', 'center', 'top', 'corner']), ratio: r.n(.52, .68), first: r.yes(.5), gap: r.pick([0, 14, 28]),
    margin: r.pick([48, 70, 100]), radius: r.pick([0, 0, 28, 64]), shadow: r.yes(.5), shape: r.pick(['circle', 'arch', 'diamond', 'hex', 'leaf', 'round']),
    count: r.pick([3, 4]), tilt: r.n(.05, .12) * (r.yes(.5) ? 1 : -1), bandAt: r.pick([.5, .6, .7, .78]), angle: r.n(2, 6) * (r.yes(.5) ? 1 : -1),
    seam: r.yes(.4), plate: r.pick(['circle', 'rect']), dim: r.n(.55, .75), vertical: r.yes(.5),
  };
  s.typo = r.pick(TYPOS); s.photoTypo = r.pick(PHOTO_TYPOS);
  s.decor = [r.pick(DECOR), r.yes(.35) ? r.pick(DECOR) : 'none'];
  s.theme = r.pick(THEMES).id;
  s.line = r.i(0, LINES.length - 1); s.sub = r.i(0, SUBS.length - 1); s.withSub = r.yes(.6);
  s.size = r.n(.9, 1.15);
  return s;
}
/** Two designs with the same signature look the same, so the gallery shows each signature once. */
const signature = s => [s.struct, s.v.zone, s.v.first, s.v.shape, s.v.count, s.v.vertical, s.v.plate, s.typo, s.photoTypo, s.decor.join('+'), s.theme, s.line].join('|');

/* Text: shrink until the block fits the zone's width and height. Sizes follow the user's text-size slider. */
function fitBlock(g, text, maxW, maxH, size, lines, bold) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  size *= g.ts;
  for (;;) {
    const rows = []; let row = '';
    for (const w of words) { const n = row ? row + ' ' + w : w; if (g.width(n, size, bold) > maxW && row) { rows.push(row); row = w; } else row = n; }
    if (row) rows.push(row);
    const fits = rows.length <= lines && rows.every(x => g.width(x, size, bold) <= maxW) && rows.length * size * 1.1 <= maxH;
    if (fits || size < 18) return {rows, size, lh: size * 1.1, h: rows.length * size * 1.1, w: Math.max(0, ...rows.map(x => g.width(x, size, bold)))};
    size -= 2;
  }
}
function drawRows(g, b, x, y, o) {
  const c = g.ctx;
  c.font = `${o.bold ? 700 : 800} ${b.size}px ${o.bold ? 'BrandBold' : 'BrandHeavy'}, Arial, sans-serif`;
  c.textAlign = o.align || 'center'; c.textBaseline = 'middle';
  b.rows.forEach((row, i) => {
    const yy = y + b.lh * (i + .5);
    if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = b.size * .1; c.lineJoin = 'round'; c.strokeText(row, x, yy); }
    c.fillStyle = o.color; c.fillText(row, x, yy);
  });
}

/* Structures draw the photos and backgrounds and return the text zone: where text goes and what is under it. */
function drawStruct(g, s, t) {
  const {W, H} = g, v = s.v, M = 70, paperTop = () => { if (isLight(t.paper)) g.head(); };
  const paper = (a, b, w, h) => g.fill(t.paper, a, b, w, h);
  const z = (x, y, w, h, photo, edge) => ({x, y, w, h, photo, edge});
  switch (s.struct) {
    case 'full': {
      g.pic(0, 0, W, H);
      if (v.zone === 'top') return z(M, SAFE + 20, W - 2 * M, H * .24, true, 'top');
      if (v.zone === 'center') return z(M, H * .36, W - 2 * M, H * .28, true, 'center');
      if (v.zone === 'corner') return z(M, H * .6, W * .64, H * .34, true, 'bottom');
      return z(M, H * .68, W - 2 * M, H * .28, true, 'bottom');
    }
    case 'splitH': {
      let r = v.ratio;
      if (v.first) { g.pic(0, 0, W, H * r); paper(0, H * r, W, H * (1 - r)); if (v.seam) g.fill(t.accent, 0, H * r - 5, W, 10); return z(M, H * r + 36, W - 2 * M, H * (1 - r) - 72, false); }
      r = Math.min(r, 1 - (SAFE + 280) / H);
      paper(0, 0, W, H * (1 - r)); paperTop(); g.pic(0, H * (1 - r), W, H * r); if (v.seam) g.fill(t.accent, 0, H * (1 - r) - 5, W, 10);
      return z(M, SAFE + 30, W - 2 * M, H * (1 - r) - SAFE - 60, false);
    }
    case 'splitV': {
      const pw = W * Math.min(v.ratio, .6), left = v.first, px = left ? 0 : W - pw, cx = left ? pw : 0, cw = W - pw;
      paper(cx, 0, cw, H); g.pic(px, 0, pw, H); paperTop();
      if (v.seam) g.fill(t.accent, left ? pw - 5 : cw - 5, SAFE, 10, H - SAFE);
      return z(cx + 44, SAFE + 50, cw - 88, H - SAFE - 110, false);
    }
    case 'inset': {
      const m = v.margin, th = Math.max(260, H * .24), top = v.zone === 'top';
      paper(0, 0, W, H); paperTop();
      const py = top ? SAFE + th : SAFE + m / 2, ph = H - SAFE - m / 2 - th - (top ? m / 2 : 0) - (top ? 0 : m / 4);
      if (v.shadow) g.fill(t.accent, m + 22, py + 22, W - 2 * m, ph);
      g.pic(m, py, W - 2 * m, ph, v.radius || undefined);
      return top ? z(M, SAFE + 20, W - 2 * M, th - 40, false) : z(M, py + ph + 24, W - 2 * M, H - py - ph - 60, false);
    }
    case 'shape': {
      paper(0, 0, W, H); paperTop();
      const th = Math.max(250, H * .23), d = Math.min(W * .74, H - SAFE - th - 60), a = (W - d) / 2, b = SAFE + 30 + (H - SAFE - th - 60 - d) / 2;
      const shp = {
        circle: 'circle', arch: 'arch', round: 72,
        diamond: x => { x.moveTo(a + d / 2, b); x.lineTo(a + d, b + d / 2); x.lineTo(a + d / 2, b + d); x.lineTo(a, b + d / 2); x.closePath(); },
        hex: x => { for (let k = 0; k < 6; k++) { const ang = Math.PI / 6 + k * Math.PI / 3, px = a + d / 2 + d / 2 * Math.cos(ang), py = b + d / 2 + d / 2 * Math.sin(ang); k ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); },
        leaf: x => x.roundRect(a, b, d, d, [d * .45, 0, d * .45, 0]),
      }[v.shape];
      if (v.shadow && v.shape === 'circle') { g.ctx.fillStyle = t.accent; g.ctx.beginPath(); g.ctx.arc(a + d / 2 + 26, b + d / 2 + 26, d / 2, 0, 7); g.ctx.fill(); }
      g.pic(a, b, d, d, shp);
      return z(M, b + d + 30, W - 2 * M, H - b - d - 60, false);
    }
    case 'duo': {
      const th = Math.max(240, H * .22), gp = v.gap;
      paper(0, 0, W, H);
      if (v.zone === 'center' && !v.vertical) {
        const ph = (H - th) / 2; g.pic(0, 0, W, ph - gp / 2); g.pic(0, ph + th + gp / 2, W, ph - gp / 2);
        return z(M, ph + 20, W - 2 * M, th - 40, false);
      }
      const ah = H - th;
      if (v.vertical) { g.pic(0, 0, (W - gp) / 2, ah); g.pic((W + gp) / 2, 0, (W - gp) / 2, ah); }
      else { g.pic(0, 0, W, (ah - gp) / 2); g.pic(0, (ah + gp) / 2, W, (ah - gp) / 2); }
      return z(M, ah + 24, W - 2 * M, th - 48, false);
    }
    case 'trio': {
      const th = Math.max(240, H * .22), gp = v.gap || 14, ah = H - th;
      paper(0, 0, W, H);
      if (v.vertical) { const bw = W * .62; g.pic(0, 0, bw - gp / 2, ah); g.pic(bw + gp / 2, 0, W - bw - gp / 2, (ah - gp) / 2); g.pic(bw + gp / 2, (ah + gp) / 2, W - bw - gp / 2, (ah - gp) / 2); }
      else { const bh = ah * .6; g.pic(0, 0, W, bh - gp / 2); g.pic(0, bh + gp / 2, (W - gp) / 2, ah - bh - gp / 2); g.pic((W + gp) / 2, bh + gp / 2, (W - gp) / 2, ah - bh - gp / 2); }
      return z(M, ah + 24, W - 2 * M, th - 48, false);
    }
    case 'quad': {
      const gp = v.gap || 14, w = (W - gp) / 2, h = (H - gp) / 2;
      g.fill(t.paper, 0, 0, W, H);
      g.pic(0, 0, w, h); g.pic(w + gp, 0, w, h); g.pic(0, h + gp, w, h); g.pic(w + gp, h + gp, w, h);
      if (!g.showText) return null;
      const pw = W * .62, ph = Math.max(220, H * .2);
      if (v.plate === 'circle') { const rr = Math.max(pw, ph) * .52; g.ctx.fillStyle = t.paper; g.ctx.beginPath(); g.ctx.arc(W / 2, H / 2, rr, 0, 7); g.ctx.fill(); return z(W / 2 - rr * .72, H / 2 - rr * .62, rr * 1.44, rr * 1.24, false); }
      g.fill(t.paper, (W - pw) / 2, (H - ph) / 2, pw, ph);
      return z((W - pw) / 2 + 30, (H - ph) / 2 + 20, pw - 60, ph - 40, false);
    }
    case 'strips': {
      const th = Math.max(240, H * .22), n = v.count, gp = v.gap || 12, ah = H - th, sw = (W - gp * (n - 1)) / n;
      paper(0, 0, W, H); g.fill(t.accent, 0, 0, W, ah);
      for (let k = 0; k < n; k++) g.pic(k * (sw + gp), 0, sw, ah);
      return z(M, ah + 24, W - 2 * M, th - 48, false);
    }
    case 'diagonal': {
      g.pic(0, 0, W, H);
      const base = Math.min(H * .7, H - 300), y1 = base - W * v.tilt * (v.first ? 1 : -1) / 2, y2 = base + W * v.tilt * (v.first ? 1 : -1) / 2;
      g.poly(t.paper, [[0, y1], [W, y2], [W, H], [0, H]]);
      const top = Math.max(y1, y2);
      return z(M, top + 20, W - 2 * M, H - top - 50, false);
    }
    case 'band': {
      g.pic(0, 0, W, H);
      const bh = Math.max(190, H * .17), by = Math.min(H * v.bandAt, H - bh - 40);
      g.fill(t.paper, 0, by, W, bh);
      if (v.seam) g.fill(t.accent, 0, by, W, 8);
      return z(M, by + 18, W - 2 * M, bh - 36, false);
    }
    case 'window': {
      g.pic(0, 0, W, H);
      g.ctx.save(); g.ctx.globalAlpha = v.dim; g.fill(t.paper, 0, 0, W, H); g.ctx.restore();
      if (isLight(t.paper)) g.head();
      const th = Math.max(250, H * .24), cw = W * .7, chh = H - SAFE - th - 60, cx = (W - cw) / 2, cy = SAFE + 30;
      g.fill('#FFFFFF', cx - 14, cy - 14, cw + 28, chh + 28);
      g.pic(cx, cy, cw, chh);
      return z(M, cy + chh + 34, W - 2 * M, th - 30, false);
    }
    case 'polaroid': {
      paper(0, 0, W, H); paperTop();
      const th = Math.max(250, H * .23), cw = W * .74, chh = H - SAFE - th - 70, cx = (W - cw) / 2, cy = SAFE + 40, c = g.ctx;
      c.save(); c.translate(W / 2, cy + chh / 2); c.rotate(v.angle * Math.PI / 180); c.translate(-W / 2, -(cy + chh / 2));
      c.shadowColor = 'rgba(20,0,0,.35)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
      g.fill('#FAF7F3', cx, cy, cw, chh); c.shadowColor = 'transparent';
      g.pic(cx + 26, cy + 26, cw - 52, chh - 110);
      c.restore();
      return z(M, cy + chh + 40, W - 2 * M, th - 50, false);
    }
  }
  g.pic(0, 0, W, H);
  return z(M, H * .68, W - 2 * M, H * .28, true, 'bottom');
}

/* Ornaments: small, geometric, in the theme's colours, kept off the logo band. */
function drawDecor(g, kind, zn, t, col) {
  const {W, H} = g, c = g.ctx, a = col.accent;
  switch (kind) {
    case 'frame': c.save(); c.globalAlpha = .55; g.box(col.line, 28, SAFE + 10, W - 56, H - SAFE - 38, 3); c.restore(); break;
    case 'corners': if (!zn) break; { const L = 46, k = 6, x0 = zn.x - 16, y0 = zn.y - 12, x1 = zn.x + zn.w + 16, y1 = zn.y + zn.h + 12;
      g.fill(a, x0, y0, L, k); g.fill(a, x0, y0, k, L); g.fill(a, x1 - L, y1 - k, L, k); g.fill(a, x1 - k, y1 - L, k, L); } break;
    case 'ruleTop': if (zn) g.fill(a, zn.x + zn.w / 2 - 60, zn.y - 6, 120, 8); break;
    case 'dots': if (zn) { c.fillStyle = a; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(zn.x + zn.w / 2 + (k - 1) * 30, zn.y + zn.h + 4, 7, 0, 7); c.fill(); } } break;
    case 'sideBar': g.fill(a, 0, SAFE + 40, 14, H - SAFE - 80); break;
    case 'square': if (zn) g.fill(a, zn.x - 4, zn.y - 4, 26, 26); break;
    case 'double': c.save(); c.globalAlpha = .7; g.fill(a, 0, H - 22, W, 6); g.fill(a, 0, H - 10, W, 3); c.restore(); break;
    case 'ring': c.save(); c.globalAlpha = .5; c.strokeStyle = a; c.lineWidth = 10; c.beginPath(); c.arc(W - 40, H - 40, Math.min(W, H) * .22, 0, 7); c.stroke(); c.restore(); break;
  }
}

/* Type styles. On a photo, text is white over a dark scrim or on a plate; on paper it uses the theme's ink and accent. */
function drawType(g, s, zn, t, col) {
  if (!g.showText || !zn) return;
  const head = g.a, sub = s.withSub ? g.b : '';
  const style = zn.photo ? s.photoTypo : s.typo, big = Math.min(124, Math.max(46, zn.h * .34)) * s.size, subSize = Math.max(28, Math.min(40, zn.h * .12));
  const c = g.ctx, ink = col.ink, acc = col.accent;
  const hasSub = !!sub && zn.h > 150;
  const subH = hasSub ? subSize * 1.6 : 0;
  if (zn.photo && !['marker', 'pill', 'outline'].includes(style)) {
    if (zn.edge === 'top') g.grad(0, SAFE - 40, g.W, zn.y + zn.h - SAFE + 120, 'rgba(20,0,0,.78)', 'rgba(20,0,0,0)');
    else if (zn.edge === 'center') g.fill('rgba(20,0,0,.42)', 0, 0, g.W, g.H);
    else g.grad(0, zn.y - 140, g.W, g.H - zn.y + 140, 'rgba(20,0,0,0)', 'rgba(20,0,0,.86)');
  }
  const left = ['leftRule', 'giant', 'kicker'].includes(style), ax = left ? zn.x + (style === 'leftRule' ? 30 : 0) : zn.x + zn.w / 2, al = left ? 'left' : 'center';
  const maxW = zn.w - (style === 'leftRule' ? 30 : 0) - (style === 'boxed' ? 60 : 0);
  const lines = style === 'giant' ? 4 : zn.w < 560 ? 5 : 3;
  const b = fitBlock(g, style === 'pill' ? head : head, style === 'pill' ? maxW - 80 : maxW, zn.h - subH - (style === 'boxed' ? 50 : 0) - (style === 'underline' ? 30 : 0), style === 'giant' ? big * 1.2 : style === 'pill' ? Math.min(big, 64) : big, style === 'pill' ? 1 : lines, false);
  const sb = hasSub ? fitBlock(g, sub, maxW, subSize * 1.3, subSize, 1, true) : null;
  const blockH = b.h + (sb ? sb.h + subSize * .5 : 0) + (style === 'underline' ? 30 : 0);
  let y = zn.y + (zn.h - blockH) / 2;
  if (zn.photo && zn.edge === 'bottom') y = zn.y + zn.h - blockH;
  const subFirst = style === 'kicker' && sb;
  const putSub = () => { drawRows(g, sb, ax, y, {bold: true, color: style === 'kicker' ? acc : zn.photo ? '#FFFFFF' : acc, align: al}); y += sb.h + subSize * .5; };
  if (subFirst) putSub();
  if (style === 'marker') {
    const padX = b.size * .3, plate = zn.photo ? t.paper : acc, txt = zn.photo ? t.ink : t.paper;
    b.rows.forEach((row, i) => { const w = g.width(row, b.size, false) + padX * 2, x0 = al === 'left' ? ax - padX : ax - w / 2; g.fill(plate, x0, y + i * b.lh + b.lh * .06, w, b.lh * .92); });
    drawRows(g, b, ax, y, {color: txt, align: al});
  } else if (style === 'pill') {
    const w = Math.min(zn.w, b.w + b.size * 1.6), h = b.size * 1.7, x0 = zn.x + (zn.w - w) / 2;
    g.pill(zn.photo ? t.paper : acc, x0, y - (h - b.h) / 2, w, h);
    drawRows(g, b, zn.x + zn.w / 2, y, {color: zn.photo ? t.ink : t.paper});
    y += (h - b.h) / 2;
  } else if (style === 'outline') {
    drawRows(g, b, ax, y, {color: '#FFFFFF', stroke: BRAND.dark, align: al});
  } else if (style === 'boxed') {
    c.save(); c.strokeStyle = acc; c.lineWidth = 5; c.strokeRect(ax - b.w / 2 - 30, y - 18, b.w + 60, b.h + 36); c.restore();
    drawRows(g, b, ax, y, {color: ink, align: al}); y += 25;
  } else {
    if (style === 'leftRule') g.fill(acc, zn.x, y + 6, 10, b.h - 12);
    drawRows(g, b, ax, y, {color: ink, align: al});
  }
  y += b.h;
  if (style === 'underline') { const w = Math.min(b.w, 220); g.fill(acc, al === 'left' ? ax : ax - w / 2, y + 8, w, 12); y += 30; }
  if (sb && !subFirst) { y += subSize * .5; putSub(); }
}

/** Draws one generated design. Called by renderSpec through layoutOf. */
function genDraw(seed, g) {
  const s = recipe(seed), t = g.t;
  const zn = drawStruct(g, s, t);
  const col = zn && zn.photo
    ? {ink: '#FFFFFF', accent: [t.accent, t.paper, BRAND.accent].find(isLight) || '#FFFFFF', line: '#FFFFFF'}
    : {ink: t.ink, accent: t.accent, line: t.ink};
  s.decor.forEach(k => { if (k !== 'none' && (g.showText || !['ruleTop', 'dots', 'square', 'corners'].includes(k))) drawDecor(g, k, zn, t, col); });
  drawType(g, s, zn, t, col);
}
