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
  if (norm(root.root_path).replace(/\/+$/, '') !== real) say('warn', 'CapCut còn ghi đường dẫn gốc cũ (' + root.root_path + '). Trang dùng đường dẫn thật: ' + real + '.');
  else say('ok', 'Đường dẫn thư mục: ' + real + '.');

  /* 3. every Vietlink project in the folder */
  let rootChanged = false;
  const entries = root.all_draft_store = root.all_draft_store || [];
  const names = (await listDirs(dir)).filter(n => VL_PREFIX.test(n));
  if (!names.length) say('ok', 'Chưa có dự án Vietlink nào trong thư mục này.');
  for (const name of names) {
    const draft = await dir.getDirectoryHandle(name), fold = real + '/' + name;
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
    /* 3c. it must be in CapCut's list, with the right folder */
    const entry = entries.find(e => e.draft_name === name);
    if (!entry) {
      if (fix) {
        let meta = {}; try { meta = JSON.parse(await readText(draft, 'draft_meta_info.json')); } catch (e) {}
        const now = Date.now() * 1000, sep = real.includes(':') ? '\\' : '/';
        entries.unshift(Object.assign(JSON.parse(JSON.stringify(CAPCUT_T.root_entry)), {draft_id: meta.draft_id || ccUuid(), draft_name: name, draft_fold_path: fold, draft_root_path: real.replace(/\//g, sep),
          draft_json_file: fold + sep + 'draft_content.json', draft_cover: '', tm_draft_create: meta.tm_draft_create || now, tm_draft_modified: now, tm_duration: content.duration || 0, tm_draft_removed: 0}));
        rootChanged = true; say('fixed', '"' + name + '": đã thêm lại vào danh sách CapCut (thường do CapCut đang mở lúc tạo dự án).');
      } else say('err', '"' + name + '": có trong thư mục nhưng không có trong danh sách CapCut, nên CapCut không hiện.', true);
    } else if (norm(entry.draft_fold_path) !== fold) {
      if (fix) { const sep = real.includes(':') ? '\\' : '/'; entry.draft_fold_path = fold; entry.draft_root_path = real.replace(/\//g, sep); entry.draft_json_file = fold + sep + 'draft_content.json'; rootChanged = true; say('fixed', '"' + name + '": đã sửa đường dẫn trong danh sách CapCut.'); }
      else say('err', '"' + name + '": danh sách CapCut ghi sai thư mục của dự án này.', true);
    }
    if (!out.some(r => r.text.startsWith('"' + name + '"'))) say('ok', '"' + name + '": ổn.');
  }
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
