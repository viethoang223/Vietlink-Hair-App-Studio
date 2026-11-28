/* Vietlink video studio, CapCut check-and-fix. Runs in the browser on the CapCut project folder the user granted
   (File System Access), no server. checkCapcut() lists what it finds; with fix = true it also repairs what it safely
   can. It only edits projects whose name starts with "Vietlink" and CapCut's project list (root_meta_info.json),
   which it backs up first. Things outside the browser (CapCut settings, closing CapCut) come back as steps to follow.

   Each finding: {level: 'ok' | 'warn' | 'err' | 'fixed', text, fixable}. */
const VL_PREFIX = /^Vietlink /;
async function readText(dir, rel) {
  const parts = rel.split('/'), name = parts.pop();
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  return (await (await dir.getFileHandle(name)).getFile()).text();
}
async function exists(dir, rel, kind = 'file') {
  try { const parts = rel.split('/'), name = parts.pop(); for (const p of parts) dir = await dir.getDirectoryHandle(p); await (kind === 'dir' ? dir.getDirectoryHandle(name) : dir.getFileHandle(name)); return true; } catch (e) { return false; }
}
async function listDirs(dir) { const out = []; for await (const [name, h] of dir.entries()) if (h.kind === 'directory') out.push(name); return out.sort(); }
const norm = p => String(p || '').replace(/\\/g, '/');
/* ---------- how CapCut on THIS machine stores projects ----------
   CapCut differs by platform and version: Windows reads draft_content.json, the Mac app has used draft_info.json,
   newer builds add Timelines/, and some builds encrypt the file. Instead of guessing, look at a project CapCut itself
   made in the chosen folder and copy its layout. Only file names and a few top fields are read, never content. */
async function capcutProfile(dir, root) {
  const prof = {sample: '', files: [], contentName: 'draft_content.json', both: true, timelines: true, encrypted: false, app_version: '', newVersion: '', os: /Mac/i.test(navigator.platform || navigator.userAgent) ? 'mac' : 'windows'};
  const list = [...((root && root.all_draft_store) || [])].sort((a, b) => (b.tm_draft_modified || 0) - (a.tm_draft_modified || 0));
  for (const e of list) {
    const p = norm(e.draft_fold_path), name = p.slice(p.lastIndexOf('/') + 1);
    if (!name || VL_PREFIX.test(name)) continue;
    let d; try { d = await dir.getDirectoryHandle(name); } catch (x) { continue; }
    const files = []; for await (const [n, h] of d.entries()) files.push(h.kind === 'directory' ? n + '/' : n);
    const content = files.includes('draft_info.json') ? 'draft_info.json' : files.includes('draft_content.json') ? 'draft_content.json' : null;
    if (!content) continue;
    prof.sample = name; prof.files = files.sort(); prof.contentName = content; prof.timelines = files.includes('Timelines/');
    try {
      const head = (await readText(d, content)).trim();
      if (!head.startsWith('{')) prof.encrypted = true;
      else { const j = JSON.parse(head), pl = j.last_modified_platform || j.platform || {}; prof.app_version = pl.app_version || ''; prof.newVersion = j.new_version || ''; if (pl.os) prof.os = pl.os; }
    } catch (x) { prof.encrypted = true; }
    break;
  }
  return prof;
}

/* CapCut stores the format version it wrote (new_version: 3.9 → 110.0.0, 7.3 → 146.0.0, 9.6 → 189.0.0). A project
   claiming a newer format than the installed CapCut makes it ask for an update, so ours copy the machine's. */
const verNum = v => String(v || '').split('.').map(n => parseInt(n, 10) || 0).reduce((a, n) => a * 1000 + n, 0);
/** Rewrites a content file's version fields to the given ones when they claim something newer. Returns true if changed. */
function downgradeContent(text, newVersion, appVersion) {
  const j = JSON.parse(text);
  if (!newVersion || verNum(j.new_version) <= verNum(newVersion)) return null;
  j.new_version = newVersion;
  for (const k of ['platform', 'last_modified_platform']) if (j[k] && appVersion) j[k].app_version = appVersion;
  return JSON.stringify(j);
}
/** Every content file of a project folder: the root one(s) and each timeline's. */
async function contentFiles(d) {
  const out = [];
  for (const n of ['draft_content.json', 'draft_info.json']) if (await exists(d, n)) out.push([d, n]);
  if (await exists(d, 'Timelines', 'dir')) { const tl = await d.getDirectoryHandle('Timelines'); for (const id of await listDirs(tl)) { const t = await tl.getDirectoryHandle(id); for (const n of ['draft_content.json', 'draft_info.json']) if (await exists(t, n)) out.push([t, n]); } }
  return out;
}

/* ---------- CapCut library items: what this machine's CapCut already uses ---------- */
const LIB_KINDS = ['transitions', 'video_effects', 'effects', 'material_animations'];
/** Resource ids of library items inside one content JSON. */
function libraryIds(c) {
  const out = new Set(), m = (c && c.materials) || {};
  for (const t of m.transitions || []) out.add(String(t.resource_id || t.effect_id));
  for (const e of m.video_effects || []) out.add(String(e.resource_id || e.effect_id));
  for (const e of m.effects || []) if (e.resource_id) out.add(String(e.resource_id));
  for (const a of m.material_animations || []) for (const x of a.animations || []) out.add(String(x.resource_id || x.id));
  out.delete(''); out.delete('undefined'); return out;
}
/** Items used by projects CapCut made on this machine (never newer than the machine's format), plus the platform block. */
async function machineLibrary(dirs, maxVersion) {
  const known = new Set(); let platform = null, n = 0;
  for (const d of dirs) {
    if (!d || VL_PREFIX.test(d.name)) continue;
    for (const [h, name] of await contentFiles(d)) {
      if (n++ > 120) break;
      try {
        const c = JSON.parse(await readText(h, name));
        if (maxVersion && verNum(c.new_version) > verNum(maxVersion)) continue;
        libraryIds(c).forEach(id => known.add(id));
        if (!platform && c.last_modified_platform && c.last_modified_platform.app_id) platform = c.last_modified_platform;
      } catch (e) {}
    }
  }
  return {known, platform};
}
/** Removes library items a CapCut may not have from a content JSON. Returns the count removed. */
function stripLibrary(c, allowed) {
  const m = c.materials || {}, ok = rid => allowed instanceof Set && allowed.has(String(rid));
  const gone = new Set(); let count = 0;
  for (const k of ['transitions', 'video_effects']) m[k] = (m[k] || []).filter(x => { const keep = ok(x.resource_id || x.effect_id); if (!keep) { gone.add(x.id); count++; } return keep; });
  m.effects = (m.effects || []).filter(x => { const keep = x.type !== 'filter' || ok(x.resource_id); if (!keep) { gone.add(x.id); count++; } return keep; });
  for (const a of m.material_animations || []) { const before = (a.animations || []).length; a.animations = (a.animations || []).filter(x => ok(x.resource_id || x.id)); count += before - a.animations.length; }
  for (const t of c.tracks || []) {
    for (const s of t.segments || []) s.extra_material_refs = (s.extra_material_refs || []).filter(r => !gone.has(r));
    if (t.type === 'effect' || t.type === 'filter') t.segments = (t.segments || []).filter(s => !gone.has(s.material_id));
  }
  c.tracks = (c.tracks || []).filter(t => t.segments && t.segments.length || t.type === 'video');
  return count;
}
const libraryMode = () => { try { return localStorage.getItem('vl_cclib') === '1' ? 'known' : 'none'; } catch (e) { return 'none'; } };
const profileText = p => p.sample ? 'Dự án mẫu do CapCut tạo: "' + p.sample + '" · file nội dung ' + p.contentName + ' · bản CapCut ' + (p.app_version || '?') + ' (định dạng ' + (p.newVersion || '?') + ') · ' + p.os + (p.encrypted ? ' · ĐÃ MÃ HÓA' : '') + ' · các file: ' + p.files.join(', ')
  : 'Chưa thấy dự án nào do CapCut tạo trong thư mục này (nên mở CapCut tạo 1 dự án trống rồi tắt).';


/**
 * dir: the CapCut project folder handle (may be null). fix: repair as well as check. clips: clips still open in the
 * studio (to copy back missing clip files). confirmDelete(text): asks before deleting a half-written project.
 */
async function checkCapcut(dir, {fix = false, clips = [], confirmDelete = () => false} = {}) {
  const out = [], say = (level, text, fixable = false) => { out.push({level, text, fixable}); };
  if (!canCapcut()) { say('err', 'Trình duyệt này không cho trang ghi vào thư mục trên máy. Hãy mở trang bằng Chrome hoặc Edge.'); return out; }
  say('ok', 'Trình duyệt hỗ trợ ghi thư mục.');
  say('warn', 'Nhớ tắt hẳn CapCut trước khi tạo hoặc sửa dự án (trang không tự kiểm tra được CapCut có đang mở không).');
  if (!dir) { say('err', 'Chưa chọn thư mục dự án của CapCut. Bấm "Mở trong CapCut" hoặc "Chọn lại thư mục".'); return out; }

  /* 1. the project list */
  let rootText = null, root = null;
  if (await exists(dir, 'root_meta_info.json')) {
    rootText = await readText(dir, 'root_meta_info.json');
    try { root = JSON.parse(rootText); } catch (e) { root = null; }
  }
  const backups = [];
  for await (const [name, h] of dir.entries()) if (h.kind === 'file' && /^root_meta_info\.json\.bak-vietlink/.test(name)) backups.push(name);
  backups.sort().reverse();
  if (!root) {
    const why = rootText === null ? 'Thư mục "' + dir.name + '" không có file danh sách dự án (root_meta_info.json)' : 'File danh sách dự án của CapCut bị hỏng, không đọc được';
    let restored = false;
    if (backups.length) {
      if (fix) {
        for (const b of backups) {
          try { const t = await readText(dir, b); JSON.parse(t); if (rootText !== null) await writeFile(dir, 'root_meta_info.json.broken-' + Date.now(), rootText); await writeFile(dir, 'root_meta_info.json', t); root = JSON.parse(t); rootText = t; restored = true; say('fixed', why + '. Đã khôi phục từ bản sao lưu ' + b + '.'); break; } catch (e) {}
        }
      } else { say('err', why + '. Có bản sao lưu để khôi phục.', true); return out; }
    }
    if (!restored) {
      if (rootText === null) say('err', why + '. Có thể đã chọn nhầm thư mục: hãy chọn thư mục "Save to" trong CapCut → Settings → Draft. Nếu đúng thư mục mà vẫn thiếu, mở CapCut, tạo 1 dự án trống rồi tắt CapCut.');
      else say('err', why + ' và không có bản sao lưu dùng được. Mở CapCut một lần (CapCut sẽ tự tạo lại danh sách) rồi tắt.');
      return out;
    }
  } else say('ok', 'Đọc được danh sách dự án của CapCut (' + (root.all_draft_store || []).length + ' dự án).');

  /* 2. the folder's real path */
  let real;
  try { real = await realRootPath(dir, root); } catch (e) { say('err', e.message); return out; }
  const prof = await capcutProfile(dir, root);
  say(prof.encrypted ? 'err' : prof.sample ? 'ok' : 'warn', profileText(prof) + (prof.encrypted ? ' — bản CapCut này mã hóa file dự án, trang chưa ghi được. Hãy gửi báo cáo này cho người hỗ trợ.' : ''));
  if (norm(root.root_path).replace(/\/+$/, '') !== real) say('warn', 'CapCut còn ghi đường dẫn gốc cũ (' + root.root_path + '). Trang dùng đường dẫn thật: ' + real + '.');
  else say('ok', 'Đường dẫn thư mục: ' + real + '.');

  /* 3. every Vietlink project in the folder */
  let rootChanged = false, lib = null;
  const entries = root.all_draft_store = root.all_draft_store || [];
  const names = (await listDirs(dir)).filter(n => VL_PREFIX.test(n));
  if (!names.length) say('ok', 'Chưa có dự án Vietlink nào trong thư mục này.');
  for (const name of names) {
    const draft = await dir.getDirectoryHandle(name), fold = real + '/' + name;
    if (!(await exists(draft, 'draft_content.json')) && (await exists(draft, 'draft_info.json'))) await writeFile(draft, 'draft_content.json', await readText(draft, 'draft_info.json'));
    if (!(await exists(draft, 'draft_content.json'))) {
      if (fix && await confirmDelete('Dự án "' + name + '" chỉ tạo được một nửa (thiếu draft_content.json). Xóa thư mục này?')) {
        await dir.removeEntry(name, {recursive: true});
        const k = entries.findIndex(e => e.draft_name === name); if (k >= 0) { entries.splice(k, 1); rootChanged = true; }
        say('fixed', '"' + name + '": dự án tạo dở đã được xóa.');
      } else say('err', '"' + name + '": dự án tạo dở (thiếu draft_content.json), nên xóa đi rồi tạo lại.', true);
      continue;
    }
    let content;
    try { content = JSON.parse(await readText(draft, 'draft_content.json')); } catch (e) { say('err', '"' + name + '": file dự án hỏng, hãy xóa dự án này rồi tạo lại.'); continue; }
    /* 3a. media paths must point into this project's materials folder */
    const want = fold + '/materials/', vids = (content.materials && content.materials.videos) || [];
    /* CapCut rewrites paths inside the project to "##_draftpath_placeholder_<id>_##/materials/…" once it opens it: also fine */
    const placeholder = p => /^##_draftpath_placeholder_[^#]+_##\/materials\//.test(p);
    const wrong = vids.filter(v => !placeholder(norm(v.path)) && norm(v.path) !== want + norm(v.path).split('/materials/').pop());
    if (wrong.length) {
      if (fix) {
        const fixText = text => { const c = JSON.parse(text); for (const v of (c.materials.videos || [])) { const f = norm(v.path).split('/materials/').pop(); if (f) v.path = want + f; } return JSON.stringify(c); };
        const fixed = fixText(JSON.stringify(content));
        await writeFile(draft, 'draft_content.json', fixed);
        if (await exists(draft, 'Timelines', 'dir')) {
          const tl = await draft.getDirectoryHandle('Timelines');
          for (const id of await listDirs(tl)) if (await exists(tl, id + '/draft_content.json')) await writeFile(tl, id + '/draft_content.json', fixText(await readText(tl, id + '/draft_content.json')));
        }
        content = JSON.parse(fixed);
        say('fixed', '"' + name + '": đã sửa ' + wrong.length + ' đường dẫn clip/logo/intro trỏ sai chỗ.');
      } else say('err', '"' + name + '": ' + wrong.length + ' đường dẫn clip/logo/intro trỏ sai chỗ, CapCut sẽ báo thiếu file.', true);
    }
    if (await exists(draft, 'draft_meta_info.json')) {
      try {
        const meta = JSON.parse(await readText(draft, 'draft_meta_info.json'));
        if (norm(meta.draft_fold_path) !== fold) {
          if (fix) { meta.draft_fold_path = fold; meta.draft_root_path = real.replace(/\//g, real.includes(':') ? '\\' : '/'); await writeFile(draft, 'draft_meta_info.json', JSON.stringify(meta)); say('fixed', '"' + name + '": đã sửa đường dẫn trong thông tin dự án.'); }
          else say('err', '"' + name + '": thông tin dự án ghi sai thư mục.', true);
        }
      } catch (e) {}
    }
    /* 3b. files in materials/ */
    const missing = [];
    for (const v of vids) { const f = norm(v.path).split('/materials/').pop(); if (f && !(await exists(draft, 'materials/' + f)) && !missing.includes(f)) missing.push(f); }
    if (missing.length) {
      const back = [];
      let sources = {}; try { sources = JSON.parse(await readText(draft, 'vietlink.json')).sources || {}; } catch (e) {}
      for (const f of missing) {
        const src = sources[f], c = src ? clips.find(x => x.name === src.name && (!src.size || x.file.size === src.size)) : clips.find(x => (x.name || '').toLowerCase() === f.toLowerCase());
        if (fix && c) { await writeFile(draft, 'materials/' + f, c.file); back.push(f); }
        /* logo and WhatsApp icon are built into the page, so they can always be written again */
        else if (fix && f === 'logo.png' && typeof ASSETS !== 'undefined') { await writeFile(draft, 'materials/logo.png', await (await fetch(ASSETS.logo)).blob()); back.push(f); }
        else if (fix && f === 'whatsapp.png' && typeof ASSET_IMG !== 'undefined' && ASSET_IMG.iconGreen) { await writeFile(draft, 'materials/whatsapp.png', await new Promise(ok => ASSET_IMG.iconGreen.toBlob(ok, 'image/png'))); back.push(f); }
      }
      if (back.length) say('fixed', '"' + name + '": đã chép lại ' + back.join(', ') + '.');
      const still = missing.filter(f => !back.includes(f));
      if (still.length) say('err', '"' + name + '": thiếu file ' + still.map(f => sources[f] ? f + ' (clip gốc ' + sources[f].name + ')' : f).join(', ') + ' trong thư mục materials. '
        + 'Nếu là clip: tải lại đúng clip gốc lên trang rồi bấm Tự sửa. Nếu không: xóa dự án này rồi bấm Mở trong CapCut lần nữa.');
    }
    /* 3a'. format version no newer than this machine's CapCut, or it asks to update */
    if (prof.newVersion) {
      let newer = 0;
      for (const [h, n] of await contentFiles(draft)) { const t = downgradeContent(await readText(h, n), prof.newVersion, prof.app_version); if (t) { newer++; if (fix) await writeFile(h, n, t); } }
      if (newer) say(fix ? 'fixed' : 'err', '"' + name + '": ' + (fix ? 'đã hạ định dạng về ' + prof.newVersion + ' (CapCut ' + prof.app_version + ' trên máy này), CapCut sẽ không đòi cập nhật nữa.' : 'ghi định dạng mới hơn CapCut ' + prof.app_version + ' trên máy này, nên CapCut đòi cập nhật khi mở.'), !fix);
    }
    /* 3a''. a draft_info.json on a machine whose CapCut reads draft_content.json makes CapCut ask for an update */
    if (prof.sample && prof.contentName === 'draft_content.json') {
      const stray = [];
      if (await exists(draft, 'draft_info.json') && await exists(draft, 'draft_content.json')) stray.push([draft, 'draft_info.json']);
      if (await exists(draft, 'Timelines', 'dir')) { const tl = await draft.getDirectoryHandle('Timelines'); for (const id of await listDirs(tl)) { const t = await tl.getDirectoryHandle(id); if (await exists(t, 'draft_info.json') && await exists(t, 'draft_content.json')) stray.push([t, 'draft_info.json']); } }
      if (stray.length) { if (fix) { for (const [h, n] of stray) await h.removeEntry(n); say('fixed', '"' + name + '": đã bỏ ' + stray.length + ' file draft_info.json thừa (làm CapCut đòi cập nhật).'); } else say('err', '"' + name + '": có file draft_info.json thừa nên CapCut ' + prof.app_version + ' đòi cập nhật lên bản mới hơn.', true); }
    }
    /* 3a'''. tabs layout must be readable JSON (a damaged one was seen as all zero bytes) */
    if (await exists(draft, 'timeline_layout.json') && !(await readLayout(draft))) {
      if (fix) { let proj = {timelines: []}; try { proj = JSON.parse(await readText(draft, 'Timelines/project.json')); } catch (e) {} await writeFile(draft, 'timeline_layout.json', JSON.stringify(dockWith(null, proj))); say('fixed', '"' + name + '": đã dựng lại file bố cục dòng thời gian bị hỏng.'); }
      else say('err', '"' + name + '": file bố cục dòng thời gian bị hỏng.', true);
    }
    /* 3a''''. library items this machine's CapCut may not have (they make it ask to update to a beta) */
    {
      const allowed = libraryMode() === 'known' ? (lib || (lib = await machineLibrary(await projectDirs(dir), prof.newVersion))).known : new Set();
      let n = 0;
      for (const [h, f] of await contentFiles(draft)) { const c = JSON.parse(await readText(h, f)), k = stripLibrary(c, allowed); if (k) { n += k; if (fix) await writeFile(h, f, JSON.stringify(c)); } }
      if (n) say(fix ? 'fixed' : 'err', '"' + name + '": ' + (fix ? 'đã gỡ ' + n + ' mục thư viện CapCut (chuyển cảnh/hiệu ứng/hoạt ảnh) để CapCut không đòi cập nhật. Thêm lại trong CapCut nếu cần.' : 'có ' + n + ' mục thư viện CapCut có thể làm CapCut đòi cập nhật.'), !fix);
    }
    /* 3b'. the file this machine's CapCut opens (draft_info.json on the Mac app) */
    if (prof.contentName !== 'draft_content.json' && !(await exists(draft, prof.contentName))) {
      if (fix) { await writeFile(draft, prof.contentName, JSON.stringify(content)); say('fixed', '"' + name + '": đã thêm file ' + prof.contentName + ' mà CapCut trên máy này cần để mở dự án.'); }
      else say('err', '"' + name + '": thiếu file ' + prof.contentName + ' nên CapCut trên máy này hiện dự án nhưng không mở được.', true);
    }
    /* 3c. it must be in CapCut's list, with the right folder */
    const entry = entries.find(e => e.draft_name === name);
    if (!entry) {
      if (fix) {
        let meta = {}; try { meta = JSON.parse(await readText(draft, 'draft_meta_info.json')); } catch (e) {}
        const now = Date.now() * 1000, sep = real.includes(':') ? '\\' : '/';
        entries.unshift(Object.assign(JSON.parse(JSON.stringify(CAPCUT_T.root_entry)), {draft_id: meta.draft_id || ccUuid(), draft_name: name, draft_fold_path: fold, draft_root_path: real.replace(/\//g, sep),
          draft_json_file: fold + sep + prof.contentName, draft_cover: '', tm_draft_create: meta.tm_draft_create || now, tm_draft_modified: now, tm_duration: content.duration || 0, tm_draft_removed: 0}));
        rootChanged = true; say('fixed', '"' + name + '": đã thêm lại vào danh sách CapCut (thường do CapCut đang mở lúc tạo dự án).');
      } else say('err', '"' + name + '": có trong thư mục nhưng không có trong danh sách CapCut, nên CapCut không hiện.', true);
    } else if (norm(entry.draft_fold_path) !== fold) {
      if (fix) { const sep = real.includes(':') ? '\\' : '/'; entry.draft_fold_path = fold; entry.draft_root_path = real.replace(/\//g, sep); entry.draft_json_file = fold + sep + prof.contentName; rootChanged = true; say('fixed', '"' + name + '": đã sửa đường dẫn trong danh sách CapCut.'); }
      else say('err', '"' + name + '": danh sách CapCut ghi sai thư mục của dự án này.', true);
    }
    const ent = entries.find(e => e.draft_name === name);
    if (ent && !norm(ent.draft_json_file).endsWith('/' + prof.contentName) && !String(ent.draft_json_file || '').endsWith(prof.contentName)) {
      if (fix) { const sep = real.includes(':') ? '\\' : '/'; ent.draft_json_file = fold + sep + prof.contentName; rootChanged = true; say('fixed', '"' + name + '": danh sách CapCut giờ trỏ vào ' + prof.contentName + '.'); }
      else say('err', '"' + name + '": danh sách CapCut trỏ vào file nội dung khác với file CapCut trên máy này dùng.', true);
    }
    if (!out.some(r => r.text.startsWith('"' + name + '"'))) say('ok', '"' + name + '": ổn.');
  }
  /* Vietlink timelines added to an existing project (mode 2): same format check against that project's own version */
  try {
    const t = await idb('readonly', st => st.get('capcutTarget'));
    if (t && await t.queryPermission({mode: fix ? 'readwrite' : 'read'}) === 'granted' && await exists(t, 'vietlink.json')) {
      const note = JSON.parse(await readText(t, 'vietlink.json')), main = JSON.parse(await readText(t, (await exists(t, 'draft_content.json')) ? 'draft_content.json' : 'draft_info.json'));
      const nv = main.new_version, av = (main.last_modified_platform || main.platform || {}).app_version;
      let newer = 0;
      const own = (await exists(t, 'draft_content.json')) ? 'draft_content.json' : 'draft_info.json';
      for (const tl of note.timelines || []) for (const n of ['draft_content.json', 'draft_info.json']) {
        const rel = 'Timelines/' + tl.id + '/' + n; if (!(await exists(t, rel))) continue;
        if (n !== own && await exists(t, 'Timelines/' + tl.id + '/' + own)) { newer++; if (fix) await (await (await t.getDirectoryHandle('Timelines')).getDirectoryHandle(tl.id)).removeEntry(n); continue; }
        const txt = downgradeContent(await readText(t, rel), nv, av); if (txt) { newer++; if (fix) await writeFile(t, rel, txt); }
      }
      { const allowed = libraryMode() === 'known' ? (await machineLibrary([t], nv)).known : new Set(); let k = 0;
        for (const tl of note.timelines || []) for (const n of ['draft_content.json', 'draft_info.json']) { const rel = 'Timelines/' + tl.id + '/' + n; if (!(await exists(t, rel))) continue; const c = JSON.parse(await readText(t, rel)), r = stripLibrary(c, allowed); if (r) { k += r; if (fix) await writeFile(t, rel, JSON.stringify(c)); } }
        if (k) say(fix ? 'fixed' : 'err', 'Dự án đích "' + t.name + '": ' + (fix ? 'đã gỡ ' + k + ' mục thư viện CapCut khỏi các dòng thời gian Vietlink (hết đòi cập nhật).' : 'dòng thời gian Vietlink có ' + k + ' mục thư viện CapCut có thể làm CapCut đòi cập nhật.'), !fix); }
      if (newer) say(fix ? 'fixed' : 'err', 'Dự án đích "' + t.name + '": ' + (fix ? 'đã hạ định dạng các dòng thời gian Vietlink về ' + nv + '.' : 'dòng thời gian Vietlink ghi định dạng mới hơn CapCut của dự án này (' + av + '), nên CapCut đòi cập nhật.'), !fix);

      else say('ok', 'Dự án đích "' + t.name + '": các dòng thời gian Vietlink ổn.');
      /* our timelines shown in a panel of their own (split view) → move them to the main panel */
      try {
        const proj = JSON.parse(await readText(t, 'Timelines/project.json')), lay = await readLayout(t), ids = (note.timelines || []).map(x => x.id).filter(id => (proj.timelines || []).some(p => p.id === id));
        const fixed = dockWith(lay, proj, ids, ids);
        if (JSON.stringify(fixed) !== JSON.stringify(lay)) {
          if (fix) { if (lay) await writeFile(t, 'timeline_layout.json.bak-vietlink', JSON.stringify(lay)); await writeFile(t, 'timeline_layout.json', JSON.stringify(fixed)); say('fixed', 'Dự án đích "' + t.name + '": đã đưa các dòng thời gian Vietlink về thành tab trong khung chính (hết chẻ đôi).'); }
          else say('err', 'Dự án đích "' + t.name + '": dòng thời gian Vietlink đang mở ở khung riêng (màn hình bị chẻ đôi).', true);
        }
      } catch (e) {}
    }
  } catch (e) {}
  /* entries for Vietlink projects whose folder is gone */
  const gone = entries.filter(e => VL_PREFIX.test(e.draft_name || '') && norm(e.draft_fold_path).startsWith(real + '/') && !names.includes(e.draft_name));
  if (gone.length) {
    if (fix) { root.all_draft_store = entries.filter(e => !gone.includes(e)); rootChanged = true; say('fixed', 'Đã bỏ ' + gone.length + ' dự án Vietlink không còn thư mục khỏi danh sách CapCut.'); }
    else say('warn', gone.length + ' dự án Vietlink trong danh sách CapCut không còn thư mục.', true);
  }
  if (rootChanged) {
    await writeFile(dir, 'root_meta_info.json.bak-vietlink-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, ''), rootText);
    await writeFile(dir, 'root_meta_info.json', JSON.stringify(root));
    say('ok', 'Đã lưu danh sách CapCut (bản cũ được sao lưu trong cùng thư mục).');
  }
  if (!out.some(r => r.level === 'err' || (r.fixable && r.level !== 'fixed'))) say('ok', fix ? 'Xong. Mở CapCut để xem.' : 'Không thấy lỗi nào.');
  return out;
}
/** Plain-text report to paste in a message when something is still wrong. */
function checkReport(list) {
  const icon = {ok: '✅', warn: '⚠️', err: '❌', fixed: '🔧'};
  return ['Báo cáo kiểm tra Vietlink → CapCut', new Date().toLocaleString('vi-VN'), navigator.userAgent, '', ...list.map(r => icon[r.level] + ' ' + r.text)].join('\n');
}

/** The CapCut folder chosen earlier (asks for permission again if the browser dropped it), or null. */
async function savedCapcutDir() {
  if (!canCapcut()) return null;
  const dir = await idb('readonly', st => st.get('capcutDir')).catch(() => null);
  if (!dir) return null;
  let perm = await dir.queryPermission({mode: 'readwrite'});
  if (perm !== 'granted') perm = await dir.requestPermission({mode: 'readwrite'});
  return perm === 'granted' ? dir : null;
}

/** Project folders CapCut made in the drafts folder (to learn which library items this machine uses). */
async function projectDirs(dir) { const out = []; for await (const [n, h] of dir.entries()) if (h.kind === 'directory' && !n.startsWith('.') && !VL_PREFIX.test(n)) out.push(h); return out.slice(0, 40); }
