/* Vietlink video studio, interface: 1. clips and options, 2. pick one of the generated versions, 3. edit and export. */
const VS = {clips: [], opts: {count: 4, intensity: 20, intro: true, outro: true, audio: false}, variants: [], edl: null, step: 'setup', player: null, busy: false};
const view = document.getElementById('view');
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k !== null && k !== undefined && k !== false)); return e; };
const fmt = s => (Math.max(0, s)).toFixed(1).replace('.', ',') + ' giây';
const opt = (map, cur) => Object.entries(map).map(([v, t]) => el('option', {value: v, textContent: t, selected: v === cur}));
function select(map, cur, onPick, label) { const s = el('select', {ariaLabel: label}, ...opt(map, cur)); s.onchange = () => onPick(s.value); return s; }
function chips(items, cur, onPick, label) { const b = el('div', {className: 'bar', role: 'group'}); b.setAttribute('aria-label', label); items.forEach(([v, t]) => { const x = el('button', {type: 'button', textContent: t}); x.setAttribute('aria-pressed', v === cur); x.onclick = () => onPick(v); b.append(x); }); return b; }
function range(label, min, max, step, value, onInput, show = v => v) {
  const id = 'r' + Math.random().toString(36).slice(2), r = el('input', {type: 'range', id, min, max, step, value}), v = el('span', {className: 'val', textContent: show(+value)});
  r.oninput = () => { v.textContent = show(+r.value); onInput(+r.value); };
  return el('div', {className: 'range'}, el('label', {htmlFor: id, textContent: label}), r, v);
}
function toggle(label, on, onChange) { const c = el('input', {type: 'checkbox', checked: on}); c.onchange = () => onChange(c.checked); return el('label', {className: 'tog'}, c, label); }
const card = (title, ...kids) => el('section', {className: 'card'}, title ? el('h3', {textContent: title}) : null, ...kids);
const intensityName = v => v < 12 ? 'Mộc mạc' : v < 35 ? 'Nhẹ nhàng' : v < 60 ? 'Vừa' : v < 85 ? 'Sôi động' : 'Dày đặc';

function waField() {
  const input = el('input', {type: 'tel', className: 'txt', value: BRAND.number, maxLength: 24, placeholder: WA_DEFAULT});
  input.onchange = () => {
    const v = input.value.replace(/[^\d+()\-. ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || WA_DEFAULT;
    BRAND.number = v; input.value = v;
    try { v === WA_DEFAULT ? localStorage.removeItem('vl_wa') : localStorage.setItem('vl_wa', v); } catch (e) {}
    if (VS.player) VS.player.draw();
  };
  return el('div', {className: 'field'}, el('label', {textContent: 'Số WhatsApp in trên video (của bạn)'}), input,
    el('p', {className: 'sub', textContent: 'Dùng chung với phần Tạo ảnh. Để trống thì dùng số chung ' + WA_DEFAULT + '.'}));
}


/* ---------- hair style, account line, watermark (remembered in this browser) ---------- */
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const kept = (k, d = '') => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
Object.assign(VS.opts, {hair: kept('vl_hair'), inches: kept('vl_inches'), account: kept('vl_account'), watermark: kept('vl_wm', '1') !== '0'});
const HAIR_OPTS = {'': 'Không ghi kiểu tóc', ...Object.fromEntries(Object.entries(HAIR).map(([k, h]) => [k, h.name]))};
/** Fields for hair style, length, account name and watermark. onChange(o) runs after each change. */
function hairFields(o, onChange) {
  const inches = el('input', {type: 'text', inputMode: 'numeric', className: 'txt', value: o.inches, maxLength: 3, placeholder: 'vd 24', style: 'max-width:110px'});
  inches.oninput = () => { o.inches = inches.value.replace(/[^\d]/g, '').slice(0, 3); keep('vl_inches', o.inches); onChange(o); };
  const acc = el('input', {type: 'text', className: 'txt', value: o.account, maxLength: 40, placeholder: 'vd Jimmy Vietlink Hair'});
  acc.oninput = () => { o.account = acc.value; keep('vl_account', o.account); onChange(o); };
  const desc = el('p', {className: 'sub', textContent: HAIR[o.hair] ? 'Mô tả tự thêm: ' + HAIR[o.hair].desc : 'Chọn kiểu tóc để video có tiêu đề vàng (như "Straight Hair 24\u201D") và dòng mô tả đúng kiểu tóc.'});
  return el('div', {},
    el('div', {className: 'grid2'},
      el('div', {className: 'field'}, el('label', {textContent: 'Kiểu tóc trong video'}), select(HAIR_OPTS, o.hair, v => { o.hair = v; keep('vl_hair', v); desc.textContent = HAIR[v] ? 'Mô tả tự thêm: ' + HAIR[v].desc : ''; onChange(o); }, 'Kiểu tóc')),
      el('div', {className: 'field'}, el('label', {textContent: 'Độ dài (inch, không bắt buộc)'}), inches)),
    desc,
    el('div', {className: 'field'}, el('label', {textContent: 'Tên tài khoản (dòng nhỏ dưới tiêu đề)'}), acc,
      el('p', {className: 'sub', textContent: 'Gõ đúng tên tài khoản bạn đang làm content. Máy nhớ tên gõ lần trước.'})),
    toggle('Chữ chìm "' + WATERMARK + '"', o.watermark, v => { o.watermark = v; keep('vl_wm', v ? '1' : '0'); onChange(o); }));
}
/** Keeps the hair title, account line and watermark of an edit list in step with the fields. */
function applyHairTexts(e, o) {
  const L = layout(e), len = L.bodyEnd - L.bodyStart, find = st => e.texts.find(t => t.style === st);
  const set = (style, text, make) => { const t = find(style); if (!text) { if (t) e.texts.splice(e.texts.indexOf(t), 1); return; } if (t) t.text = text; else e.texts.push(make()); };
  set('title', hairTitle(o.hair, o.inches), () => ({text: hairTitle(o.hair, o.inches), start: .2, end: len - .1, style: 'title', anim: 'fade', pos: 'low', y: .6, size: 1, color: 'brand'}));
  set('account', (o.account || '').trim(), () => ({text: o.account.trim(), start: .35, end: len - .1, style: 'account', anim: 'fade', pos: 'low', y: HAIR[o.hair] ? .655 : .8, size: 1, color: 'brand'}));
  set('watermark', o.watermark ? WATERMARK : '', () => ({text: WATERMARK, start: 0, end: len, style: 'watermark', anim: 'none', pos: 'high', y: .2, size: 1, color: 'brand'}));
  Object.assign(e, {hair: o.hair, inches: o.inches, account: (o.account || '').trim()});
}
/** Logo and WhatsApp: show or hide, corner, size, opacity, own logo. Saved in this browser. */
function marksBox(onChange) {
  const M = MARKS, up = el('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp'}), note = el('p', {className: 'sub'});
  up.onchange = async () => {
    const f = up.files[0]; if (!f) return;
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(f); });
    const k = Math.min(1, 800 / img.naturalWidth), c = el('canvas', {width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k)});
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/png'); keep('vl_logo', url);
    ASSET_IMG.logo = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = url; });
    note.textContent = 'Đã dùng logo của bạn (máy này nhớ).'; onChange(true);
  };
  const reset = el('button', {type: 'button', className: 'btn line small', textContent: 'Dùng lại logo Vietlink', onclick: () => { try { localStorage.removeItem('vl_logo'); } catch (e) {} ASSET_IMG.logo = ASSET_IMG.brandLogo; onChange(true); }});
  const back = el('button', {type: 'button', className: 'btn line small', textContent: 'Về vị trí chuẩn', onclick: () => { MARKS = JSON.parse(JSON.stringify(MARKS_DEFAULT)); saveMarks(); onChange(true); }});
  const ch = (fn, redraw) => v => { fn(v); saveMarks(); onChange(redraw); };
  return card('Logo & WhatsApp',
    el('div', {className: 'grid2'},
      el('div', {className: 'field'}, toggle('Hiện logo', M.logo.on, ch(v => { M.logo.on = v; }, true)), select(CORNERS, M.logo.corner, ch(v => { M.logo.corner = v; }), 'Vị trí logo')),
      el('div', {className: 'field'}, toggle('Hiện số WhatsApp', M.wa.on, ch(v => { M.wa.on = v; }, true)), select(CORNERS, M.wa.corner, ch(v => { M.wa.corner = v; }), 'Vị trí WhatsApp'))),
    range('Cỡ logo', 100, 460, 2, M.logo.width, ch(v => { M.logo.width = v; }), v => v + ' px'),
    range('Độ đậm logo', 20, 100, 1, Math.round(M.logo.opacity * 100), ch(v => { M.logo.opacity = v / 100; }), v => v + '%'),
    range('Cỡ số WhatsApp', 20, 64, 1, M.wa.size, ch(v => { M.wa.size = v; }), v => v + ' px'),
    range('Độ đậm số WhatsApp', 20, 100, 1, Math.round(M.wa.opacity * 100), ch(v => { M.wa.opacity = v / 100; }), v => v + '%'),
    waField(),
    el('div', {className: 'field'}, el('label', {textContent: 'Logo riêng (PNG nền trong suốt là đẹp nhất)'}), up, note),
    el('div', {className: 'bar'}, reset, back));
}
/** Post caption for the chosen hair style, with hashtags, ready to copy. */
function captionBox(e) {
  const area = el('textarea', {className: 'txt', rows: 7, value: hairCaption(e.hair, e.inches, e.account), style: 'width:100%;font-size:14px'});
  const cp = el('button', {type: 'button', className: 'btn line small', textContent: '📋 Sao chép caption'});
  cp.onclick = async () => { try { await navigator.clipboard.writeText(area.value); cp.textContent = '✅ Đã chép'; } catch (x) { area.select(); document.execCommand('copy'); cp.textContent = '✅ Đã chép'; } };
  return card('Caption gợi ý', el('p', {className: 'sub', textContent: 'Theo kiểu tóc đã chọn, kèm hashtag raw hair. Sửa thoải mái trước khi chép.'}), area, cp);
}

/* ---------- step 1 ---------- */
/** Switch for the image AI. Turning it on downloads the model once and re-checks the clips already added. */
function aiBox(msg) {
  return el('div', {className: 'field'}, toggle('Nhận loại bằng AI (chính xác hơn; lần đầu tải khoảng 85 MB, sau đó máy nhớ)', AI.on, async v => {
    AI.on = v; try { localStorage.setItem('vl_ai', v ? '1' : '0'); } catch (e) {}
    if (!v) return;
    try {
      await loadAI((p, all) => msg.replaceChildren(el('p', {textContent: 'Đang tải AI (' + Math.round(all / 1048576) + ' MB): ' + Math.round(p * 100) + '%'})));
      for (const c of VS.clips) { msg.replaceChildren(el('p', {textContent: 'AI đang xem lại ' + c.name + '...'})); if (!c.manual) Object.assign(c, await analyseClip(c)); }
      msg.replaceChildren(); setup();
    } catch (e) { AI.on = false; msg.replaceChildren(el('p', {className: 'err', textContent: 'Không tải được AI: ' + e.message + '. Vẫn dùng cách đoán theo chuyển động.'})); }
  }));
}
function setup() {
  VS.step = 'setup';
  const msg = el('div');
  const input = el('input', {type: 'file', multiple: true, accept: 'video/*,.mov,.mp4,.m4v'});
  input.onchange = async () => {
    const files = [...input.files]; input.value = '';
    if (VS.clips.length + files.length > 6) { msg.replaceChildren(el('p', {className: 'err', textContent: 'Tối đa 6 clip mỗi lần.'})); return; }
    for (const f of files) {
      msg.replaceChildren(el('p', {textContent: 'Đang đọc ' + f.name + '...'}));
      try {
        const c = await openClip(f);
        if (c.duration > 90) { closeClip(c); throw new Error(f.name + ' dài quá 90 giây. Hãy cắt ngắn trước.'); }
        if (AI.on) await loadAI((p, all) => msg.replaceChildren(el('p', {textContent: 'Đang tải AI nhận loại video (một lần, ' + Math.round(all / 1048576) + ' MB): ' + Math.round(p * 100) + '%'})));
        msg.replaceChildren(el('p', {textContent: 'Đang xem ' + f.name + ' để đoán loại video...'}));
        Object.assign(c, await analyseClip(c));
        VS.clips.push(c);
      } catch (e) { msg.replaceChildren(el('p', {className: 'err', textContent: e.message})); return; }
    }
    msg.replaceChildren(); setup();
  };
  const list = VS.clips.map((c, i) => el('div', {className: 'clip'},
    el('div', {}, el('strong', {textContent: c.name}), el('div', {className: 'sub', textContent: fmt(c.duration) + ' · ' + Math.round(c.fps) + ' hình/giây' + (c.audioTrack ? ' · có tiếng' : ' · không tiếng')})),
    el('div', {className: 'bar'}, select(Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.name])), c.type, v => { c.type = v; c.sure = true; c.manual = true; c.ai = false; setup(); }, 'Loại video'),
      el('span', {className: 'sub', textContent: (c.ai ? 'AI ' : '') + (c.sure ? '' : 'đoán, bạn kiểm tra lại')}),
      el('button', {type: 'button', className: 'btn line', textContent: 'Bỏ', onclick: () => { closeClip(c); VS.clips.splice(i, 1); setup(); }}))));
  const o = VS.opts;
  const go = el('button', {type: 'button', className: 'btn', textContent: '✨ Tạo ' + o.count + ' bản', disabled: !VS.clips.length});
  go.onclick = () => { VS.variants = Array.from({length: o.count}, () => newSeed()); pick(); };
  view.replaceChildren(
    el('h2', {textContent: 'Tạo video đăng bài'}),
    el('p', {className: 'sub', textContent: 'Đưa clip lên, app tự nhận loại và dựng sẵn nhiều bản. Chọn bản ưng nhất rồi chỉnh và xuất MP4. Video được xử lý ngay trên máy này, không gửi đi đâu.'}),
    waField(),
    card('1. Clip của bạn (tối đa 6)', el('div', {className: 'field'}, input), aiBox(msg), msg, ...list),
    card('2. Tùy chọn',
      el('div', {className: 'field'}, el('label', {textContent: 'Số bản muốn tạo'}), chips([1, 2, 3, 4, 5, 6].map(n => [n, String(n)]), o.count, v => { o.count = v; setup(); }, 'Số bản')),
      range('Cường độ', 0, 100, 1, o.intensity, v => { o.intensity = v; }, v => v + ' · ' + intensityName(v)),
      el('p', {className: 'sub', textContent: 'Kéo trái: cảnh dài, cắt thẳng, gần như không hiệu ứng. Kéo phải: nhiều nhát cắt, chuyển cảnh, chữ động, hiệu ứng.'}),
      el('div', {className: 'bar'}, toggle('Có intro (logo mở đầu)', o.intro, v => { o.intro = v; }), toggle('Có outro (WhatsApp cuối video)', o.outro, v => { o.outro = v; }), toggle('Giữ tiếng gốc', o.audio, v => { o.audio = v; }))),
    card('3. Kiểu tóc & tài khoản', hairFields(o, () => {})),
    el('div', {className: 'bar'}, go));
}

/* ---------- step 2 ---------- */
function makePlayer() {
  /* Phones get a lighter preview canvas; the export is always full 1080×1920. */
  const small = Math.min(innerWidth, screen.width || innerWidth) < 720, canvas = el('canvas', {className: 'stage', width: small ? 360 : 540, height: small ? 640 : 960});
  const p = new Player(canvas, VS.clips), btn = el('button', {type: 'button', className: 'btn', textContent: '▶ Phát'}), time = el('input', {type: 'range', min: 0, max: 1, step: .01, value: 0, className: 'scrub', ariaLabel: 'Thời điểm'}), lab = el('span', {className: 'sub'});
  btn.onclick = () => { p.playing ? p.pause() : p.play(); };
  time.oninput = () => { p.pause(); p.seek(+time.value); };
  canvas.onclick = () => btn.click();
  p.onTime = t => { time.max = p.L.total; time.value = t; btn.textContent = p.playing ? '❚❚ Dừng' : '▶ Phát'; lab.textContent = fmt(t) + ' / ' + fmt(p.L.total); };
  p._base = p.onTime; VS.player = p;
  return el('div', {className: 'player'}, canvas, el('div', {className: 'bar'}, btn, time, lab));
}
function edlFor(seed) { return generate(seed, VS.clips, VS.opts); }
async function pick() {
  VS.step = 'pick';
  if (VS.player) VS.player.pause();
  const stageWrap = makePlayer(), grid = el('div', {className: 'variants'}), cur = {i: 0};
  /* Opens on a moment with picture (just after the intro card has appeared), not on the blank first frame. */
  const show = i => { cur.i = i; VS.player.pause(); const e = edlFor(VS.variants[i]); VS.player.t = e.intro ? e.intro.dur * .8 : .4; VS.player.set(e); [...grid.children].forEach((c, k) => c.classList.toggle('on', k === i)); };
  const again = el('button', {type: 'button', className: 'btn line', textContent: '🎲 Tạo lại tất cả'});
  again.onclick = () => { VS.variants = VS.variants.map(() => newSeed()); pick(); };
  const choose = el('button', {type: 'button', className: 'btn', textContent: 'Chọn bản này để chỉnh →'});
  choose.onclick = () => { VS.edl = edlFor(VS.variants[cur.i]); edit(); };
  view.replaceChildren(el('div', {className: 'bar'}, el('button', {type: 'button', className: 'btn line', textContent: '← Quay lại', onclick: () => { VS.player.pause(); setup(); }}), again),
    el('h2', {textContent: 'Chọn bản ưng nhất'}), el('p', {className: 'sub', textContent: 'Bấm một bản để xem. Không ưng thì Tạo lại, mỗi lần ra bản khác.'}),
    el('div', {className: 'pickwrap'}, stageWrap, grid), el('div', {className: 'bar'}, choose));
  VS.variants.forEach((seed, i) => {
    const c = el('canvas', {width: 180, height: 320}), redo = el('button', {type: 'button', className: 'btn line small', textContent: 'Tạo lại'});
    const e = edlFor(seed), L = layout(e);
    const box = el('div', {className: 'variant'}, c, el('div', {className: 'sub', textContent: 'Bản ' + (i + 1) + ' · ' + fmt(L.total)}), redo);
    c.onclick = () => show(i);
    redo.onclick = ev => { ev.stopPropagation(); VS.variants[i] = newSeed(); pick().then(() => show(i)); };
    grid.append(box);
  });
  show(0);
  for (let i = 0; i < VS.variants.length; i++) { if (VS.step !== 'pick') return; await renderThumb(grid.children[i].querySelector('canvas'), edlFor(VS.variants[i]), VS.clips).catch(e => console.error(e)); }
}

/* ---------- step 3 ---------- */
/* The editor: preview on the left, a timeline under it (drag a segment's right edge to change its length, drag a text
   bar to move it or its edges to change when it shows), and an inspector for whatever is selected. */
const thumbCache = new Map();
function segThumb(c, s) {
  const key = s.clip + ':' + s.start.toFixed(1), canvas = el('canvas', {width: 54, height: 96, className: 'tthumb'});
  const paint = img => { const x = canvas.getContext('2d'), k = Math.max(54 / img.width, 96 / img.height); x.drawImage(img, (54 - img.width * k) / 2, (96 - img.height * k) / 2, img.width * k, img.height * k); };
  if (thumbCache.has(key)) paint(thumbCache.get(key));
  else frameAt(c, s.start + .1, 120).then(img => { if (!img) return; const copy = el('canvas', {width: img.width, height: img.height}); copy.getContext('2d').drawImage(img, 0, 0); thumbCache.set(key, copy); paint(copy); }).catch(() => {});
  return canvas;
}
function edit() {
  VS.step = 'edit';
  if (VS.player) VS.player.pause();
  const e = VS.edl, stage = makePlayer(), side = el('div', {className: 'panels'}), tlBox = el('div', {className: 'tlbox'});
  VS.sel = VS.sel || null;
  const P = VS.player;
  /* Undo history: a snapshot of the edit list after every change. Slider drags inside half a second count as one step,
     so Ctrl+Z undoes a whole drag, not one pixel of it. */
  const snap = () => JSON.stringify(e);
  if (!VS.hist || VS.hist.edl !== e) VS.hist = {edl: e, undo: [], redo: [], last: snap(), at: 0};
  const H = VS.hist;
  const record = coalesce => {
    const now = snap(); if (now === H.last) return;
    if (!coalesce || performance.now() - H.at > 500) { H.undo.push(H.last); if (H.undo.length > 150) H.undo.shift(); }
    H.at = coalesce ? performance.now() : 0; H.redo = []; H.last = now;
  };
  const update = (full = true) => { P.set(e); record(!full); if (full) paint(); };
  const hairCard = () => card('Kiểu tóc & tài khoản', hairFields({hair: e.hair || '', inches: e.inches || '', account: e.account || '', watermark: e.texts.some(t => t.style === 'watermark')}, o => {
    Object.assign(VS.opts, {hair: o.hair, inches: o.inches, account: o.account, watermark: o.watermark}); applyHairTexts(e, o); P.set(e); clearTimeout(hairCard.t); hairCard.t = setTimeout(() => { record(true); tlBox.replaceChildren(timelineBar(), timeline()); }, 400);
  }));
  const paint = () => { tlBox.replaceChildren(timelineBar(), timeline()); side.replaceChildren(inspector(), hairCard(), marksBox(full => { P.draw(); if (full) paint(); }), overall(), captionBox(e), exporter()); };
  const bodyAt = t => layout(e).segs.find(s => t >= s.at && t < s.end);
  let note = el('span', {className: 'sub'});
  const say = text => { note.textContent = text; clearTimeout(say.t); say.t = setTimeout(() => { note.textContent = ''; }, 3000); };
  const restore = json => {
    const o = JSON.parse(json); Object.keys(e).forEach(k => delete e[k]); Object.assign(e, o); H.last = json;
    if (VS.sel && ((VS.sel.kind === 'seg' && !e.body[VS.sel.i]) || (VS.sel.kind === 'text' && !e.texts[VS.sel.i]) || (VS.sel.kind === 'intro' && !e.intro) || (VS.sel.kind === 'outro' && !e.outro))) VS.sel = null;
    P.set(e); paint();
  };
  const undo = () => { if (!H.undo.length) return say('Không còn gì để hoàn tác.'); H.redo.push(H.last); restore(H.undo.pop()); say('Đã hoàn tác'); };
  const redo = () => { if (!H.redo.length) return say('Không còn gì để làm lại.'); H.undo.push(H.last); restore(H.redo.pop()); say('Đã làm lại'); };
  const fixFirst = () => { if (e.body[0]) { e.body[0].trans = 'cut'; e.body[0].tDur = 0; } };

  /* Actions shared by buttons and keyboard shortcuts. They work on the selected item, like CapCut. */
  const splitAt = () => {
    const s = bodyAt(P.t); if (!s) return say('Đưa điểm phát vào giữa một đoạn cảnh để tách.');
    const local = P.t - s.at, orig = e.body[s.i];
    if (local < .4 || orig.len - local < .4) return say('Hai phần sau khi tách phải dài ít nhất 0,4 giây.');
    const second = {...orig, start: orig.start + local * orig.speed, len: orig.len - local, trans: 'cut', tDur: 0};
    orig.len = local; if (orig.fx === 'freeze') orig.fx = 'none';
    e.body.splice(s.i + 1, 0, second); VS.sel = {kind: 'seg', i: s.i + 1}; update(); say('Đã tách đoạn');
  };
  const remove = () => {
    const s = VS.sel; if (!s) return say('Chọn một đoạn cảnh hoặc dòng chữ trước khi xóa.');
    if (s.kind === 'seg') { if (e.body.length < 2) return say('Video cần ít nhất một đoạn cảnh.'); e.body.splice(s.i, 1); fixFirst(); }
    else if (s.kind === 'text') e.texts.splice(s.i, 1);
    else if (s.kind === 'intro') e.intro = null;
    else if (s.kind === 'outro') e.outro = null;
    VS.sel = null; update(); say('Đã xóa · Ctrl+Z để lấy lại');
  };
  const copy = () => {
    const s = VS.sel, item = s && (s.kind === 'seg' ? e.body[s.i] : s.kind === 'text' ? e.texts[s.i] : null);
    if (!item) { say('Chọn một đoạn cảnh hoặc dòng chữ để sao chép.'); return false; }
    VS.clipboard = {kind: s.kind, data: JSON.parse(JSON.stringify(item))}; say(s.kind === 'seg' ? 'Đã sao chép đoạn cảnh' : 'Đã sao chép dòng chữ'); return true;
  };
  const paste = (cb = VS.clipboard) => {
    if (!cb) return say('Chưa sao chép gì.');
    if (cb.kind === 'seg') {
      if (!VS.clips.some(c => c.id === cb.data.clip)) return say('Clip của đoạn này đã bị bỏ.');
      const at = VS.sel && VS.sel.kind === 'seg' ? VS.sel.i + 1 : (bodyAt(P.t) ? bodyAt(P.t).i + 1 : e.body.length);
      e.body.splice(at, 0, {...cb.data, trans: 'cut', tDur: 0}); fixFirst(); VS.sel = {kind: 'seg', i: at};
    } else {
      const L = layout(e), body = L.bodyEnd - L.bodyStart, len = cb.data.end - cb.data.start, start = clamp(P.t - L.bodyStart, 0, Math.max(0, body - len));
      e.texts.push({...cb.data, start, end: Math.min(start + len, body)}); VS.sel = {kind: 'text', i: e.texts.length - 1};
    }
    update(); say('Đã dán');
  };
  const duplicate = () => { const keep = VS.clipboard; if (copy()) { paste(); } VS.clipboard = keep; };
  const step = d => { P.pause(); P.seek(P.t + d); };

  /* Keyboard shortcuts while the editor is open. Typing in a text box keeps its own Ctrl+Z, Backspace and so on. */
  if (VS.keys) document.removeEventListener('keydown', VS.keys);
  VS.keys = ev => {
    if (VS.step !== 'edit') return;
    const tg = ev.target, typing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) && !(tg.type === 'range' || tg.type === 'checkbox');
    if (typing) return;
    const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
    const run = f => { ev.preventDefault(); f(); };
    if (mod && k === 'z' && !ev.shiftKey) return run(undo);
    if (mod && (k === 'y' || (k === 'z' && ev.shiftKey))) return run(redo);
    if (mod && k === 'b') return run(splitAt);
    if (mod && k === 'c') return run(copy);
    if (mod && k === 'x') return run(() => { if (copy()) remove(); });
    if (mod && k === 'v') return run(() => paste());
    if (mod && k === 'd') return run(duplicate);
    if (mod) return;
    if (k === 'delete' || k === 'backspace') return run(remove);
    if (k === ' ' || k === 'spacebar') return run(() => { P.playing ? P.pause() : P.play(); });
    if (k === 'arrowleft') return run(() => step(ev.shiftKey ? -1 : -1 / FPS));
    if (k === 'arrowright') return run(() => step(ev.shiftKey ? 1 : 1 / FPS));
    if (k === 'home') return run(() => { P.pause(); P.seek(0); });
    if (k === 'end') return run(() => { P.pause(); P.seek(P.L.total); });
    if (k === 'escape') return run(() => { VS.sel = null; paint(); });
  };
  document.addEventListener('keydown', VS.keys);

  const timelineBar = () => {
    const b = (label, title, f, disabled) => el('button', {type: 'button', className: 'btn line small', textContent: label, title, disabled, onclick: f});
    const addText = () => { const L = layout(e), t = clamp(P.t - L.bodyStart, 0, L.bodyEnd - L.bodyStart - .5); e.texts.push({text: LINES[0], start: t, end: Math.min(t + 3, L.bodyEnd - L.bodyStart), style: 'bar', anim: 'fade', pos: 'mid', size: 1, color: 'brand'}); VS.sel = {kind: 'text', i: e.texts.length - 1}; update(); };
    note = el('span', {className: 'sub'});
    return el('div', {},
      el('div', {className: 'bar'},
        b('↶', 'Hoàn tác (Ctrl+Z)', undo, !H.undo.length), b('↷', 'Làm lại (Ctrl+Y)', redo, !H.redo.length),
        b('✂ Tách', 'Tách đoạn tại điểm phát (Ctrl+B)', splitAt), b('🗑 Xóa', 'Xóa mục đang chọn (Delete)', remove, !VS.sel),
        b('⧉ Nhân đôi', 'Nhân đôi mục đang chọn (Ctrl+D)', duplicate, !VS.sel || !['seg', 'text'].includes(VS.sel.kind)),
        b('+ Chữ tại đây', 'Thêm dòng chữ tại điểm phát', addText), note),
      el('p', {className: 'sub keys', textContent: 'Phím tắt: Space phát/dừng · Ctrl+B tách · Delete/Backspace xóa · Ctrl+C sao chép · Ctrl+X cắt · Ctrl+V dán · Ctrl+D nhân đôi · Ctrl+Z hoàn tác · Ctrl+Y làm lại · ←/→ 1 khung (Shift: 1 giây) · Home/End · Esc bỏ chọn'}));
  };

  const timeline = () => {
    const L = layout(e), width = Math.max(320, view.clientWidth - 24), pps = clamp((width - 16) / L.total, 34, 160);
    const inner = el('div', {className: 'tlin', style: `width:${Math.ceil(L.total * pps) + 16}px`}), head = el('div', {className: 'tlhead'});
    const px = t => 8 + t * pps;
    const seekFrom = ev => { const r = inner.getBoundingClientRect(); P.pause(); P.seek((ev.clientX - r.left - 8) / pps); };
    const ruler = el('div', {className: 'tlruler'});
    for (let s = 0; s <= L.total; s += L.total > 30 ? 5 : L.total > 12 ? 2 : 1) ruler.append(el('span', {style: `left:${px(s)}px`, textContent: s + 's'}));
    ruler.onpointerdown = seekFrom;
    const block = (cls, a, b, label, onSel, selected) => { const d = el('div', {className: 'tlb ' + cls + (selected ? ' on' : ''), style: `left:${px(a)}px;width:${Math.max(6, (b - a) * pps - 2)}px`}, label); d.onclick = ev => { ev.stopPropagation(); onSel(); }; return d; };
    const rowScenes = el('div', {className: 'tlrow'}), rowTexts = el('div', {className: 'tlrow texts'});
    if (e.intro) rowScenes.append(block('card', 0, L.introEnd, el('span', {textContent: 'Intro'}), () => { VS.sel = {kind: 'intro'}; P.seek(.3); paint(); }, VS.sel && VS.sel.kind === 'intro'));
    L.segs.forEach(s => {
      const clip = VS.clips.find(c => c.id === s.clip), on = VS.sel && VS.sel.kind === 'seg' && VS.sel.i === s.i;
      const b = block('seg t' + clip.type, s.at, s.end, el('div', {className: 'tllab'}, segThumb(clip, s), el('span', {textContent: (s.i + 1) + (s.fx && s.fx !== 'none' ? ' ✦' : '') + (s.speed < 1 ? ' ½×' : '')})), () => { VS.sel = {kind: 'seg', i: s.i}; P.pause(); P.seek(s.at + .05); paint(); }, on);
      const h = el('div', {className: 'tlh', title: 'Kéo để đổi độ dài'});
      h.onpointerdown = ev => {
        ev.stopPropagation(); ev.preventDefault(); h.setPointerCapture(ev.pointerId);
        const seg = e.body[s.i], x0 = ev.clientX, len0 = seg.len, max = (clip.duration - seg.start) / seg.speed - .02;
        h.onpointermove = mv => { seg.len = clamp(len0 + (mv.clientX - x0) / pps, Math.max(.5, seg.tDur + .1), max); b.style.width = Math.max(6, seg.len * pps - 2) + 'px'; P.set(e); P.seek(s.at + seg.len - .05); };
        h.onpointerup = () => { h.onpointermove = h.onpointerup = null; VS.sel = {kind: 'seg', i: s.i}; update(); };
      };
      b.append(h); rowScenes.append(b);
    });
    if (e.outro) rowScenes.append(block('card', L.bodyEnd, L.total, el('span', {textContent: 'Outro'}), () => { VS.sel = {kind: 'outro'}; P.seek(L.bodyEnd + 1); paint(); }, VS.sel && VS.sel.kind === 'outro'));
    e.texts.forEach((tx, i) => {
      const on = VS.sel && VS.sel.kind === 'text' && VS.sel.i === i, body = L.bodyEnd - L.bodyStart;
      const b = block('txt', L.bodyStart + tx.start, L.bodyStart + Math.min(tx.end, body), el('span', {textContent: tx.text}), () => {}, on);
      const drag = (mode) => ev => {
        ev.stopPropagation(); ev.preventDefault(); ev.target.setPointerCapture(ev.pointerId);
        const x0 = ev.clientX, s0 = tx.start, e0 = tx.end; let moved = false;
        ev.target.onpointermove = mv => {
          const d = (mv.clientX - x0) / pps; if (Math.abs(mv.clientX - x0) > 3) moved = true;
          if (mode === 'move') { const len = e0 - s0; tx.start = clamp(s0 + d, 0, body - len); tx.end = tx.start + len; }
          if (mode === 'start') tx.start = clamp(s0 + d, 0, tx.end - .5);
          if (mode === 'end') tx.end = clamp(e0 + d, tx.start + .5, body);
          b.style.left = px(L.bodyStart + tx.start) + 'px'; b.style.width = Math.max(6, (tx.end - tx.start) * pps - 2) + 'px';
          P.set(e); P.seek(L.bodyStart + (mode === 'end' ? tx.end - .05 : tx.start + .3));
        };
        ev.target.onpointerup = () => { ev.target.onpointermove = ev.target.onpointerup = null; VS.sel = {kind: 'text', i}; if (!moved) P.seek(L.bodyStart + tx.start + .3); update(); };
      };
      b.onpointerdown = drag('move');
      const hl = el('div', {className: 'tlh left'}), hr = el('div', {className: 'tlh'});
      hl.onpointerdown = drag('start'); hr.onpointerdown = drag('end');
      b.append(hl, hr); rowTexts.append(b);
    });
    const playhead = el('div', {className: 'tlplay'});
    const place = t => { playhead.style.left = px(t) + 'px'; };
    place(P.t);
    const base = P._base; P.onTime = t => { base(t); place(t); };
    rowScenes.onpointerdown = rowTexts.onpointerdown = ev => { if (ev.target === rowScenes || ev.target === rowTexts) seekFrom(ev); };
    inner.append(ruler, el('div', {className: 'tlname', textContent: 'Cảnh'}), rowScenes, el('div', {className: 'tlname', textContent: 'Chữ'}), rowTexts, playhead);
    return el('div', {className: 'tl'}, inner);
  };

  const inspector = () => {
    const s = VS.sel;
    if (!s) return card('Chọn để chỉnh', el('p', {className: 'sub', textContent: 'Bấm một đoạn cảnh, một dòng chữ, intro hoặc outro trên thanh thời gian bên dưới video để chỉnh riêng nó. Kéo mép phải của đoạn cảnh để đổi độ dài, kéo thanh chữ để dời.'}));
    if (s.kind === 'intro' && e.intro) return card('Intro', el('div', {className: 'field'}, el('label', {textContent: 'Kiểu intro'}), select(INTROS, e.intro.style, v => { e.intro.style = v; update(false); }, 'Kiểu intro')),
      range('Độ dài', .8, 3, .1, e.intro.dur.toFixed(1), v => { e.intro.dur = v; update(false); }, v => v.toFixed(1) + ' s'));
    if (s.kind === 'outro' && e.outro) return card('Outro', el('div', {className: 'field'}, el('label', {textContent: 'Kiểu outro'}), select(OUTROS, e.outro.style, v => { e.outro.style = v; update(false); }, 'Kiểu outro')),
      range('Độ dài', 1.5, 5, .1, e.outro.dur.toFixed(1), v => { e.outro.dur = v; update(false); }, v => v.toFixed(1) + ' s'));
    if (s.kind === 'seg' && e.body[s.i]) {
      const i = s.i, seg = e.body[i], clip = VS.clips.find(c => c.id === seg.clip), maxStart = Math.max(0, clip.duration - seg.len * seg.speed - .05);
      const fixFirst = () => { e.body[0].trans = 'cut'; e.body[0].tDur = 0; };
      return card('Đoạn ' + (i + 1) + ' · ' + clip.name,
        el('div', {className: 'bar'},
          el('button', {type: 'button', className: 'btn line small', textContent: '← Lên trước', disabled: !i, onclick: () => { [e.body[i - 1], e.body[i]] = [e.body[i], e.body[i - 1]]; fixFirst(); VS.sel.i = i - 1; update(); }}),
          el('button', {type: 'button', className: 'btn line small', textContent: 'Ra sau →', disabled: i === e.body.length - 1, onclick: () => { [e.body[i + 1], e.body[i]] = [e.body[i], e.body[i + 1]]; fixFirst(); VS.sel.i = i + 1; update(); }}),
          el('button', {type: 'button', className: 'btn line small', textContent: 'Nhân đôi', onclick: () => { e.body.splice(i + 1, 0, {...seg, trans: 'cut', tDur: 0}); VS.sel.i = i + 1; update(); }}),
          el('button', {type: 'button', className: 'btn line small', textContent: 'Xóa', disabled: e.body.length < 2, onclick: () => { e.body.splice(i, 1); fixFirst(); VS.sel = null; update(); }})),
        range('Bắt đầu từ giây (trong clip)', 0, maxStart.toFixed(2), .05, Math.min(seg.start, maxStart).toFixed(2), v => { seg.start = v; thumbCache.clear(); update(false); P.seek(layout(e).segs[i].at + .05); }, v => v.toFixed(1)),
        range('Độ dài', .5, Math.max(.6, Math.min(15, (clip.duration - seg.start) / seg.speed)).toFixed(2), .05, seg.len.toFixed(2), v => { seg.len = v; update(false); }, v => v.toFixed(1) + ' s'),
        el('div', {className: 'grid2'},
          el('div', {className: 'field'}, el('label', {textContent: 'Chuyển động khung'}), select(MOVES, seg.move, v => { seg.move = v; if (v !== 'still' && !seg.amt) seg.amt = .1; update(false); }, 'Chuyển động')),
          el('div', {className: 'field'}, el('label', {textContent: 'Hiệu ứng đoạn'}), select(SEG_FX, seg.fx || 'none', v => { seg.fx = v; update(false); }, 'Hiệu ứng đoạn')),
          el('div', {className: 'field'}, el('label', {textContent: 'Chuyển cảnh vào đoạn này'}), i ? select(TRANS, seg.trans, v => { seg.trans = v; seg.tDur = v === 'cut' ? 0 : ['flash', 'whip', 'glitch'].includes(v) ? .25 : .5; update(false); }, 'Chuyển cảnh') : el('span', {className: 'sub', textContent: 'Đoạn đầu, không có'})),
          el('div', {className: 'field'}, el('label', {textContent: 'Tốc độ'}), select({'1': 'Bình thường', '0.5': 'Chậm 0,5x' + (clip.fps < 50 ? ' (clip 30 hình/giây, hơi giật)' : '')}, String(seg.speed), v => { seg.speed = +v; seg.len = Math.min(seg.len, (clip.duration - seg.start) / seg.speed); update(); }, 'Tốc độ'))),
        seg.move !== 'still' ? range('Mức chuyển động', 2, 25, 1, Math.round((seg.amt || .1) * 100), v => { seg.amt = v / 100; update(false); }, v => v + '%') : null,
        i && seg.trans !== 'cut' ? range('Độ dài chuyển cảnh', .15, 1.2, .05, seg.tDur.toFixed(2), v => { seg.tDur = Math.min(v, seg.len - .2, e.body[i - 1].len - .2); update(false); }, v => v.toFixed(2) + ' s') : null);
    }
    if (s.kind === 'text' && e.texts[s.i]) {
      const tx = e.texts[s.i], L = layout(e), body = L.bodyEnd - L.bodyStart;
      const input = el('input', {type: 'text', className: 'txt', value: tx.text, maxLength: 60}); input.oninput = () => { tx.text = input.value; update(false); };
      const preset = select({'': 'Chọn câu có sẵn...', ...Object.fromEntries([...LINES, ...SUBS].map(l => [l, l]))}, '', v => { if (v) { tx.text = input.value = v; update(); } }, 'Câu có sẵn');
      return card('Dòng chữ ' + (s.i + 1), el('div', {className: 'field'}, input, preset),
        el('div', {className: 'grid2'},
          el('div', {className: 'field'}, el('label', {textContent: 'Kiểu chữ'}), select(TEXT_STYLES, tx.style, v => { tx.style = v; update(false); }, 'Kiểu chữ')),
          el('div', {className: 'field'}, el('label', {textContent: 'Hiệu ứng chữ'}), select(TEXT_ANIMS, tx.anim, v => { tx.anim = v; update(false); P.seek(L.bodyStart + tx.start); P.play(); }, 'Hiệu ứng chữ')),
          el('div', {className: 'field'}, el('label', {textContent: 'Vị trí'}), select(TEXT_POS, tx.pos, v => { tx.pos = v; delete tx.y; update(false); }, 'Vị trí')),
          el('div', {className: 'field'}, el('label', {textContent: 'Màu nhấn'}), select({brand: 'Đỏ cam', orange: 'Cam', red: 'Đỏ', dark: 'Đen ấm'}, tx.color, v => { tx.color = v; update(false); }, 'Màu nhấn'))),
        range('Hiện từ', 0, Math.max(.1, body).toFixed(1), .1, Math.min(tx.start, body).toFixed(1), v => { tx.start = Math.min(v, tx.end - .5); update(false); }, v => v.toFixed(1) + ' s'),
        range('Đến', .5, Math.max(.6, body).toFixed(1), .1, Math.min(tx.end, body).toFixed(1), v => { tx.end = Math.max(v, tx.start + .5); update(false); }, v => v.toFixed(1) + ' s'),
        range('Cỡ chữ', 60, 140, 1, Math.round((tx.size || 1) * 100), v => { tx.size = v / 100; update(false); }, v => v + '%'),
        el('p', {className: 'sub', textContent: 'Chỉ ghi điều có thật, không tự thêm giá hay cam kết.'}),
        el('button', {type: 'button', className: 'btn line small', textContent: 'Xóa dòng chữ này', onclick: () => { e.texts.splice(s.i, 1); VS.sel = null; update(); }}));
    }
    VS.sel = null; return inspector();
  };

  const overall = () => card('Tổng thể',
    range('Cường độ', 0, 100, 1, e.intensity, v => { e.intensity = v; }, v => v + ' · ' + intensityName(v)),
    el('div', {className: 'bar'}, el('button', {type: 'button', className: 'btn line', textContent: '🎲 Dựng lại theo cường độ này (giữ chữ)', onclick: () => {
      const fresh = generate(newSeed(), VS.clips, {...VS.opts, intensity: e.intensity, intro: !!e.intro, outro: !!e.outro, audio: e.audio});
      Object.assign(e, {...fresh, texts: e.texts, intro: e.intro && fresh.intro ? {...fresh.intro, style: e.intro.style} : fresh.intro, outro: e.outro && fresh.outro ? {...fresh.outro, style: e.outro.style} : fresh.outro}); VS.sel = null; update();
    }})),
    el('div', {className: 'bar'}, toggle('Intro', !!e.intro, v => { e.intro = v ? {style: 'dark', dur: 1.4} : null; VS.sel = null; update(); }), toggle('Outro', !!e.outro, v => { e.outro = v ? {style: 'cta', dur: 2.6} : null; VS.sel = null; update(); }), toggle('Giữ tiếng gốc', e.audio, v => { e.audio = v; update(false); })),
    el('div', {className: 'grid2'},
      el('div', {className: 'field'}, el('label', {textContent: 'Tông màu'}), select(LOOKS, e.look, v => { e.look = v; if (v !== 'none' && !e.lookAmt) e.lookAmt = .5; update(); }, 'Tông màu')),
      e.look !== 'none' ? range('Độ đậm màu', 0, 100, 1, Math.round(e.lookAmt * 100), v => { e.lookAmt = v / 100; update(false); }) : el('div')),
    el('div', {className: 'bar'}, ...Object.entries(FX_NAMES).map(([k, t]) => toggle(t, !!e.fx[k], v => { e.fx[k] = v; update(false); }))));

  const exporter = () => {
    const out = el('div'), go = el('button', {type: 'button', className: 'btn', textContent: '⬇ Xuất MP4'}), stop = el('button', {type: 'button', className: 'btn line', textContent: 'Hủy', hidden: true});
    let cancel = false;
    stop.onclick = () => { cancel = true; };
    go.onclick = async () => {
      P.pause(); go.disabled = true; stop.hidden = false; cancel = false;
      const bar = el('progress', {max: 1, value: 0}), lab = el('span', {className: 'sub'}); out.replaceChildren(bar, lab);
      const t0 = performance.now(), lock = await keepAwake();
      try {
        const blob = await exportMp4(e, VS.clips, (p, m) => { bar.value = p; lab.textContent = ' ' + m + ' ' + Math.round(p * 100) + '%'; }, () => cancel);
        out.replaceChildren(...savePanel(blob, 'vietlink_' + e.seed + '.mp4', Math.round((performance.now() - t0) / 1000)));
      } catch (err) {
        if (err.message === 'cancelled') out.replaceChildren(el('p', {className: 'sub', textContent: 'Đã hủy.'}));
        else {
          const rep = el('button', {type: 'button', className: 'btn line small', textContent: '📋 Sao chép chi tiết lỗi'});
          rep.onclick = async () => { try { await navigator.clipboard.writeText(await exportReport(err)); rep.textContent = '✅ Đã chép, dán gửi người hỗ trợ'; } catch (x) { rep.textContent = 'Không chép được'; } };
          out.replaceChildren(el('p', {className: 'err', textContent: 'Không xuất được: ' + err.message}), rep);
        }
      }
      if (lock) lock.release().catch(() => {});
      go.disabled = false; stop.hidden = true;
    };
    /* Send to CapCut: writes a real CapCut project with every layer separate, to keep editing there. */
    const cc = el('button', {type: 'button', className: 'btn line', textContent: '🎬 Mở trong CapCut'}), ccOut = el('div');
    const runCapcut = async forcePick => {
      P.pause(); cc.disabled = true;
      const bar = el('progress', {max: 1, value: 0}), lab = el('span', {className: 'sub'}); ccOut.replaceChildren(bar, lab);
      try {
        const name = await sendToCapcut(e, VS.clips, (p, m) => { bar.value = p; lab.textContent = ' ' + m; }, forcePick);
        const b = el('b', {textContent: name});
        ccOut.replaceChildren(el('p', {}, '✅ Đã tạo dự án ', b, ' trong CapCut. Mở CapCut (nếu đang mở thì tắt hẳn rồi mở lại): dự án nằm đầu danh sách, mọi lớp tách rời để chỉnh tiếp.'),
          el('button', {type: 'button', className: 'btn line small', textContent: 'Chọn lại thư mục CapCut', onclick: () => runCapcut(true)}));
      } catch (err) {
        if (err.name === 'AbortError') ccOut.replaceChildren(el('p', {className: 'err', textContent: 'Chưa chọn được thư mục. Nếu Chrome báo thư mục chứa tệp hệ thống: Chrome không cho trang web mở thư mục trong AppData, nơi CapCut lưu dự án mặc định.'}), el('p', {textContent: 'Cách xử lý (làm một lần): tạo thư mục thường, ví dụ D:\\CapCut Drafts → mở CapCut, vào Cài đặt → Global settings → Draft location (Vị trí bản nháp), chọn thư mục đó → tắt CapCut, mở lại một lần rồi tắt → bấm lại Mở trong CapCut và chọn thư mục mới.'}), el('button', {type: 'button', className: 'btn line small', textContent: 'Chọn lại', onclick: () => runCapcut(true)}), fixBtn());
        else if (err.message === 'wrongdir') ccOut.replaceChildren(el('p', {className: 'err', textContent: 'Thư mục "' + err.dirName + '" không phải thư mục dự án của CapCut. Hãy chọn đúng thư mục "Save to" trong CapCut → Settings → Draft (xem hướng dẫn ở trên).'}), el('button', {type: 'button', className: 'btn line small', textContent: 'Chọn lại', onclick: () => runCapcut(true)}), fixBtn());
        else ccOut.replaceChildren(el('p', {className: 'err', textContent: 'Không tạo được dự án CapCut: ' + err.message}), fixBtn());
      }
      cc.disabled = false;
    };
    cc.onclick = () => runCapcut(false);
    /* Check and fix: looks through the CapCut folder and repairs what it can (see capcut_fix.js). */
    const icon = {ok: '✅', warn: '⚠️', err: '❌', fixed: '🔧'};
    const runCheck = async fix => {
      P.pause(); ccOut.replaceChildren(el('p', {className: 'sub', textContent: fix ? 'Đang kiểm tra và sửa...' : 'Đang kiểm tra...'}));
      let list;
      try { list = await checkCapcut(await savedCapcutDir(), {fix, clips: VS.clips, confirmDelete: t => window.confirm(t)}); }
      catch (err) { list = [{level: 'err', text: 'Lỗi khi kiểm tra: ' + err.message}]; }
      const copy = el('button', {type: 'button', className: 'btn line small', textContent: '📋 Sao chép báo cáo'});
      copy.onclick = async () => { try { await navigator.clipboard.writeText(checkReport(list)); copy.textContent = '✅ Đã chép, dán gửi người hỗ trợ'; } catch (x) { copy.textContent = 'Không chép được'; } };
      const canFix = !fix && list.some(r => r.fixable);
      ccOut.replaceChildren(el('ul', {className: 'checks'}, ...list.map(r => el('li', {className: r.level}, icon[r.level] + ' ' + r.text))),
        el('div', {className: 'bar'}, canFix ? el('button', {type: 'button', className: 'btn', textContent: '🔧 Tự sửa các lỗi trên', onclick: () => runCheck(true)}) : null,
          el('button', {type: 'button', className: 'btn line small', textContent: 'Chọn lại thư mục', onclick: () => runCapcut(true)}), copy));
    };
    const fixBtn = () => el('button', {type: 'button', className: 'btn small', textContent: '🔧 Tự sửa', onclick: () => runCheck(true)});
    const checkBtn = el('button', {type: 'button', className: 'btn line', textContent: '🩺 Kiểm tra', disabled: !canCapcut(), onclick: () => runCheck(false)});
    const ccHelp = canCapcut()
      ? el('details', {className: 'sub'}, el('summary', {textContent: 'Lần đầu: chọn thư mục dự án của CapCut'}),
          el('p', {textContent: 'Tắt CapCut trước khi bấm, rồi chọn thư mục dự án của CapCut (thư mục có file root_meta_info.json). Chrome không cho mở thư mục trong AppData, nơi CapCut lưu mặc định, nên lần đầu hãy đổi chỗ lưu: tạo thư mục thường, ví dụ D:\\CapCut Drafts → mở CapCut, vào Cài đặt → Global settings → Draft location (Vị trí bản nháp), chọn thư mục đó → tắt CapCut, mở lại một lần rồi tắt → bấm lại Mở trong CapCut và chọn thư mục mới.'}),
          el('p', {}, el('b', {textContent: 'Chỗ lưu mặc định của CapCut (để tìm dự án cũ), Windows: '}), '%LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft'),
          el('p', {}, el('b', {textContent: 'Mac: '}), 'trong hộp chọn bấm Cmd+Shift+G, dán ~/Movies/CapCut/User Data/Projects/com.lveditor.draft'),
          el('p', {textContent: 'Trình duyệt nhớ thư mục này cho các lần sau. Clip được chép vào dự án mới, file gốc của bạn và các dự án cũ không bị đụng tới.'}))
      : el('p', {className: 'sub', textContent: 'Mở trong CapCut cần Chrome hoặc Edge (Safari chưa cho trang web ghi vào thư mục trên máy).'});
    if (!canCapcut()) cc.disabled = true;
    return el('div', {}, card('Xuất video', el('p', {className: 'sub', textContent: 'MP4 1080×1920, 30 hình/giây, đúng chuẩn Reels và TikTok. Giữ trang này mở trong lúc xuất.'}), el('div', {className: 'bar'}, go, stop), out),
      card('Chỉnh tiếp trong CapCut', el('p', {className: 'sub', textContent: 'Tạo một dự án CapCut từ bản này: từng đoạn cảnh, chữ, logo, số WhatsApp, chuyển cảnh, hiệu ứng và bộ lọc là lớp riêng để bạn tự chỉnh.'}), el('div', {className: 'bar'}, cc, checkBtn), ccHelp, ccOut));
  };

  view.replaceChildren(el('div', {className: 'bar'}, el('button', {type: 'button', className: 'btn line', textContent: '← Chọn bản khác', onclick: () => { VS.sel = null; pick(); }})),
    el('h2', {textContent: 'Chỉnh sửa'}), el('div', {className: 'editwrap'}, el('div', {className: 'stickystage'}, stage), side), tlBox);
  P.set(e); paint();
}
/** Keeps a phone screen on while exporting, where the browser allows it. */
async function keepAwake() { try { return navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch (e) { return null; } }
/** Result of an export: preview, download link, and on phones the share sheet (which offers "Save video"). */
function savePanel(blob, name, secs) {
  const url = URL.createObjectURL(blob), file = new File([blob], name, {type: 'video/mp4'}), kids = [
    el('p', {textContent: 'Xong sau ' + secs + ' giây · ' + (blob.size / 1048576).toFixed(1) + ' MB'}),
    el('video', {src: url, controls: true, playsInline: true, className: 'result'}),
    el('a', {className: 'btn', href: url, download: name, textContent: '⬇ Tải về ' + name})];
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    const sh = el('button', {type: 'button', className: 'btn line', textContent: '📲 Lưu vào máy / Chia sẻ'});
    sh.onclick = () => navigator.share({files: [file]}).catch(() => {});
    kids.push(sh, el('p', {className: 'sub', textContent: 'Trên iPhone: bấm Lưu vào máy / Chia sẻ rồi chọn Lưu video để video vào Ảnh.'}));
  } else kids.push(el('p', {className: 'sub', textContent: 'Nếu không tải được: mở video, nhấn giữ rồi chọn Lưu.'}));
  return kids;
}

(async () => {
  if (!('VideoDecoder' in window && 'VideoEncoder' in window)) { view.replaceChildren(el('h2', {textContent: 'Trình duyệt này chưa dựng được video'}), el('p', {textContent: 'Hãy mở trang bằng Chrome hoặc Edge bản mới trên máy tính, hoặc Safari trên iPhone iOS 17 trở lên.'})); return; }
  try { await loadAssets(); await loadMB(); setup(); }
  catch (e) { view.replaceChildren(el('p', {className: 'err', textContent: 'Không khởi động được: ' + e.message})); }
})();
