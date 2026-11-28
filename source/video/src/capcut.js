/* Vietlink video studio → CapCut desktop draft. Pure functions (no DOM), so the same code runs in the page and in
   Node tests. CAPCUT_T holds example objects scrubbed from real CapCut 9.6 drafts (video/tools/extract_capcut_templates.py);
   buildCapcutDraft() fills copies of them from an edit list.

   CapCut facts this relies on (checked on real drafts, CapCut 9.6 for Windows):
   - times are microseconds; a draft is draft_content.json, mirrored in Timelines/<content id>/draft_content.json,
     with Timelines/project.json, draft_meta_info.json and an entry in ../root_meta_info.json (the project list);
   - media are referenced by absolute path, so clips are copied into the draft folder and referenced there;
   - a video segment points to 7 helper materials (speed, placeholder, canvas, animation, channel mapping, colour,
     vocal separation); a transition is attached to the segment before the cut;
   - video keyframe times are source start + time into the segment; text keyframes count from the segment start;
   - positions are -1..1 from the centre (y up), media are fitted inside the canvas before clip.scale applies.
   Effects, transitions, filters and text animations are CapCut library items, referenced by resource id; CapCut
   downloads any that are not on the machine yet. */

/* Our names → CapCut library items seen in real drafts. Where CapCut has no close match, the item is left out. */
const CC_TRANS = {
  fade: ['Mix', '6724845717472416269'], dip: ['Black Fade', '6724239388189921806'], wipe: ['Glitter Swipe', '7612026416875441415'],
  push: ['Pull Out', '6724226338418332167'], slide: ['Wash Right', '6858191483573375495'], iris: ['Spread Morph', '7548325465702845749'],
  zoom: ['Pull in', '6724226861666144779'], blinds: ['Shutter', '6885172292339372546'], whip: ['Pull In II', '7291211157254181377'],
  flash: ['Blanch', '6952697453275517442'], spin: ['Zoom Burn', '7497676149984628029'], glitch: ['Strobe', '7131930101599441410'],
};
const CC_FX = {punch: ['Throb', '7052996558211518977'], flashIn: ['White Flash', '6706773500792672781'], shake: ['Rebound Swing', '7174685191602967041']};
const CC_FILTER = {
  warm: ['Golden Autumn', '7291939256451207681'], golden: ['Golden Autumn', '7291939256451207681'], clean: ['Crystal Clear', '7234420486745100801'],
  bright: ['Crystal Clear', '7234420486745100801'], contrast: ['Oppenheimer', '7257829716885770754'], soft: ['Clear Transparency', '7146486658211254786'],
  faded: ['Film', '6706773528319906308'], cinema: ['Sea Blue', '7389156616957858320'], teal: ['Sea Blue', '7389156616957858320'], mono: ['Oppenheimer', '7257829716885770754'],
};
const CC_TEXT_IN = {
  fade: ['Fade In', '6724916044072227332', 500000], rise: ['Showing Up', '7149113228788765186', 500000], slide: ['Bounce Left', '7314651687149376001', 500000],
  pop: ['Pop Up', '7209405021744534018', 500000], bounce: ['Bounce In', '6887766069587481090', 500000], type: ['Typewriter', '7210980292243231233', 800000],
  words: ['Type 1', '6724920249654710791', 900000], wipe: ['Trail', '7231492571321602562', 500000], spread: ['Squeeze', '6779879712261935619', 500000],
};
const CC_TEXT_OUT = ['Fade Out', '6724919382104871427', 300000];

function ccUuid() {
  const h = () => Math.floor(Math.random() * 16).toString(16), b = n => Array.from({length: n}, h).join('');
  return (b(8) + '-' + b(4) + '-' + b(4) + '-' + b(4) + '-' + b(12)).toUpperCase();
}
const ccClone = o => JSON.parse(JSON.stringify(o));
const US = s => Math.round(s * 1e6);
const hexRgb = hex => { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };

/**
 * edl: the studio edit list. media: {clips: {[clipId]: {file, width, height, duration, hasAudio}}, logo: {file, width, height},
 * icon: {file, width, height}, intro: {file, duration} | null, outro: {file, duration} | null} where file is the file name
 * inside the draft's "materials" folder. opts: {rootPath, folder, name, os, waNumber, now (µs)}.
 * Returns {files: {relativePath: text}, entry} — entry goes into root_meta_info.json's all_draft_store.
 */
function buildCapcutDraft(edl, media, opts) {
  const T = CAPCUT_T, W = 1080, H = 1920, now = opts.now || Date.now() * 1000;
  const draftDir = opts.rootPath.replace(/[\\/]+$/, '') + '/' + opts.folder, matPath = f => draftDir + '/materials/' + f;
  const c = ccClone(T.content);
  const contentId = ccUuid();
  Object.assign(c, {id: contentId, name: '', duration: 0, create_time: Math.floor(now / 1e6), update_time: Math.floor(now / 1e6), fps: 30.0});
  c.canvas_config = {ratio: '9:16', width: W, height: H, background: null};
  for (const k of Object.keys(c.materials)) c.materials[k] = [];
  c.tracks = [];
  const plat = {os: opts.os || 'windows', os_version: '', app_id: 359289, app_version: opts.appVersion || '9.6.0', app_source: 'cc', device_id: '', hard_disk_id: '', mac_address: ''};
  c.platform = ccClone(plat); c.last_modified_platform = ccClone(plat);
  const M = c.materials, add = (kind, obj) => { (M[kind] = M[kind] || []).push(obj); return obj.id; };

  /* helper materials every video/photo segment points to */
  const helpers = speed => {
    const ids = [];
    ids.push(add('speeds', Object.assign(ccClone(T['speeds:speed']), {id: ccUuid(), speed, mode: 0})));
    ids.push(add('placeholder_infos', Object.assign(ccClone(T['placeholder_infos:placeholder_info']), {id: ccUuid()})));
    ids.push(add('canvases', Object.assign(ccClone(T['canvases:canvas_color']), {id: ccUuid()})));
    ids.push(add('material_animations', Object.assign(ccClone(T['material_animations:sticker_animation']), {id: ccUuid(), animations: []})));
    ids.push(add('sound_channel_mappings', Object.assign(ccClone(T['sound_channel_mappings:']), {id: ccUuid()})));
    ids.push(add('material_colors', Object.assign(ccClone(T['material_colors:']), {id: ccUuid()})));
    ids.push(add('vocal_separations', Object.assign(ccClone(T['vocal_separations:vocal_separation']), {id: ccUuid()})));
    return ids;
  };
  const videoMaterial = (file, w, h, durUs, hasAudio, photo) => {
    const m = ccClone(T[photo ? 'videos:photo' : 'videos:video']);
    return add('videos', Object.assign(m, {id: ccUuid(), type: photo ? 'photo' : 'video', path: matPath(file), material_name: file, width: w, height: h,
      duration: photo ? 10800000000 : durUs, has_audio: !!hasAudio, local_material_id: ccUuid().toLowerCase(), unique_id: '', category_name: 'local'}));
  };
  const segment = (kind, materialId, startUs, durUs, extra = {}) => Object.assign(ccClone(T['segment:' + kind]), {
    id: ccUuid(), material_id: materialId, target_timerange: {start: startUs, duration: durUs}, extra_material_refs: [], common_keyframes: [], keyframe_refs: []}, extra);
  const track = (kind, segments, flag) => Object.assign(ccClone(T['track:' + kind]), {id: ccUuid(), segments, flag: flag || 0, attribute: 0, name: '', is_default_name: true});
  const keyframes = (prop, points) => Object.assign(ccClone(T.keyframe_group), {id: ccUuid(), material_id: '', property_type: prop,
    keyframe_list: points.map(([t, v]) => Object.assign(ccClone(T.keyframe), {id: ccUuid(), curveType: 'Line', time_offset: t, values: [v], left_control: {x: 0, y: 0}, right_control: {x: 0, y: 0}, string_value: '', graphID: ''}))});
  /* media are fitted inside the 9:16 canvas; this factor turns that into "cover" like the studio preview */
  const coverOf = (w, h) => Math.max(W / w, H / h) / Math.min(W / w, H / h);

  /* ---- main video track: intro card, the scenes, outro card ---- */
  const main = [];
  let t = 0;
  if (media.intro) {
    const id = videoMaterial(media.intro.file, W, H, US(media.intro.duration), false, false), d = US(media.intro.duration);
    main.push(segment('video', id, t, d, {source_timerange: {start: 0, duration: d}, speed: 1, volume: 0, last_nonzero_volume: 1, extra_material_refs: helpers(1)}));
    t += d;
  }
  const bodyStart = t, segStarts = [];
  edl.body.forEach((s, i) => {
    const info = media.clips[s.clip], durT = US(s.len), srcStart = US(s.start), srcDur = US(s.len * s.speed);
    const id = videoMaterial(info.file, info.width, info.height, US(info.duration), info.hasAudio, false);
    const cover = coverOf(info.width, info.height), vol = edl.audio && s.speed === 1 && info.hasAudio ? 1 : 0;
    const seg = segment('video', id, t, durT, {source_timerange: {start: srcStart, duration: srcDur}, speed: s.speed, volume: vol, last_nonzero_volume: 1, extra_material_refs: helpers(s.speed)});
    seg.clip = {scale: {x: cover, y: cover}, rotation: 0, transform: {x: 0, y: 0}, flip: {vertical: false, horizontal: s.fx === 'mirror'}, alpha: 1};
    /* camera move → keyframes at the start and end of the segment (video keyframes use source start + offset) */
    const a = s.amt || .1, k0 = srcStart, k1 = srcStart + durT;
    const kfs = [];
    if (s.move === 'zoomIn') kfs.push(['KFTypeScaleX', [[k0, cover], [k1, cover * (1 + a)]]], ['KFTypeScaleY', [[k0, cover], [k1, cover * (1 + a)]]]);
    if (s.move === 'zoomOut') kfs.push(['KFTypeScaleX', [[k0, cover * (1 + a)], [k1, cover]]], ['KFTypeScaleY', [[k0, cover * (1 + a)], [k1, cover]]]);
    if (s.move === 'push') kfs.push(['KFTypeScaleX', [[k0, cover], [k1, cover * (1 + 2 * a)]]], ['KFTypeScaleY', [[k0, cover], [k1, cover * (1 + 2 * a)]]]);
    if (s.move === 'panL' || s.move === 'panR') { const sc = cover * (1 + a * 1.2), d = (s.move === 'panL' ? 1 : -1) * a; seg.clip.scale = {x: sc, y: sc}; kfs.push(['KFTypePositionX', [[k0, -d], [k1, d]]]); }
    if (s.move === 'tiltUp' || s.move === 'tiltDown') { const sc = cover * (1 + a * 1.2), d = (s.move === 'tiltUp' ? 1 : -1) * a; seg.clip.scale = {x: sc, y: sc}; kfs.push(['KFTypePositionY', [[k0, d], [k1, -d]]]); }
    if (s.move === 'drift') { const sc = cover * (1.06 + a * .8); seg.clip.scale = {x: sc, y: sc}; kfs.push(['KFTypeRotation', [[k0, -a * 10], [k1, a * 10]]]); }
    seg.common_keyframes = kfs.map(([p, pts]) => keyframes(p, pts));
    /* transition into this scene sits on the previous segment */
    if (i && s.trans !== 'cut' && CC_TRANS[s.trans]) {
      const [name, rid] = CC_TRANS[s.trans], prev = main[main.length - 1];
      const dur = Math.min(US(Math.max(s.tDur, .2)), Math.floor(prev.target_timerange.duration / 2), Math.floor(durT / 2));
      const tr = Object.assign(ccClone(T['transitions:transition']), {id: ccUuid(), name, effect_id: rid, resource_id: rid, third_resource_id: rid, source_platform: 1, path: '', duration: dur, is_overlap: true, platform: 'all', request_id: ''});
      add('transitions', tr); prev.extra_material_refs.push(tr.id);
    }
    segStarts.push([t, durT, s]);
    main.push(seg); t += durT;
  });
  const bodyEnd = t;
  if (media.outro) {
    const id = videoMaterial(media.outro.file, W, H, US(media.outro.duration), false, false), d = US(media.outro.duration);
    main.push(segment('video', id, t, d, {source_timerange: {start: 0, duration: d}, speed: 1, volume: 0, last_nonzero_volume: 1, extra_material_refs: helpers(1)}));
    t += d;
  }
  const total = t;
  c.tracks.push(track('video', main, 0));

  /* ---- scene effects (punch, flash, shake) on an effect track ---- */
  const fxSegs = [];
  segStarts.forEach(([st, dur, s]) => {
    const fx = CC_FX[s.fx]; if (!fx) return;
    const e = Object.assign(ccClone(T['video_effects:video_effect']), {id: ccUuid(), name: fx[0], effect_id: fx[1], resource_id: fx[1], path: '', request_id: '', adjust_params: [], common_keyframes: []});
    add('video_effects', e);
    fxSegs.push(Object.assign(segment('effect', e.id, st, s.fx === 'flashIn' ? Math.min(dur, 400000) : dur), {clip: null, source_timerange: null}));
  });

  /* ---- look → one filter over the scenes ---- */
  const filterSegs = [];
  if (edl.look !== 'none' && CC_FILTER[edl.look] && bodyEnd > bodyStart) {
    const [name, rid] = CC_FILTER[edl.look];
    const f = Object.assign(ccClone(T['effects:filter']), {id: ccUuid(), name, effect_id: rid, resource_id: rid, third_resource_id: rid, path: '', request_id: '', value: Math.max(.2, Math.min(1, edl.lookAmt || .6)), adjust_params: []});
    add('effects', f);
    filterSegs.push(Object.assign(segment('filter', f.id, bodyStart, bodyEnd - bodyStart), {clip: null, source_timerange: null}));
  }

  /* ---- logo and WhatsApp icon as image layers over the scenes (positions from brand.json) ---- */
  const overlay = [], L = BRAND.logo, Q = BRAND.whatsapp;
  /* in the page: the user's logo/WhatsApp settings; in Node tests: brand.json places */
  const ML = typeof marksLayout === 'function' ? marksLayout() : {logo: {x: L.left, y: L.top, w: L.width, h: 0, opacity: L.opacity}, wa: {x: W - Q.right - Q.size * 1.3 - (opts.waNumber || '').length * Q.size * .56, y: Q.top, size: Q.size, gap: Q.size * .3, w: 0, opacity: Q.opacity}};
  if (media.logo && ML.logo && bodyEnd > bodyStart) {
    const lw = ML.logo.w, lh = media.logo.height * lw / media.logo.width, id = videoMaterial(media.logo.file, media.logo.width, media.logo.height, 0, false, true);
    const fit = Math.min(W / media.logo.width, H / media.logo.height), sc = lw / (media.logo.width * fit);
    const seg = segment('video', id, bodyStart, bodyEnd - bodyStart, {source_timerange: {start: 0, duration: bodyEnd - bodyStart}, speed: 1, volume: 0, extra_material_refs: helpers(1)});
    seg.clip = {scale: {x: sc, y: sc}, rotation: 0, transform: {x: (ML.logo.x + lw / 2 - W / 2) / (W / 2), y: -(ML.logo.y + lh / 2 - H / 2) / (H / 2)}, flip: {vertical: false, horizontal: false}, alpha: ML.logo.opacity};
    overlay.push(seg);
  }
  const iconTrack = [];
  if (media.icon && ML.wa && bodyEnd > bodyStart) {
    const id = videoMaterial(media.icon.file, media.icon.width, media.icon.height, 0, false, true);
    const fit = Math.min(W / media.icon.width, H / media.icon.height), sc = ML.wa.size / (media.icon.width * fit), left = ML.wa.x;
    const seg = segment('video', id, bodyStart, bodyEnd - bodyStart, {source_timerange: {start: 0, duration: bodyEnd - bodyStart}, speed: 1, volume: 0, extra_material_refs: helpers(1)});
    seg.clip = {scale: {x: sc, y: sc}, rotation: 0, transform: {x: (left + ML.wa.size / 2 - W / 2) / (W / 2), y: -(ML.wa.y + ML.wa.size / 2 - H / 2) / (H / 2)}, flip: {vertical: false, horizontal: false}, alpha: ML.wa.opacity};
    iconTrack.push(seg);
  }

  /* ---- texts ---- */
  const PX_PER_SIZE = 5.6;  /* CapCut text size 15 is about 84 px tall on a 1080-wide canvas */
  const textMaterial = (text, px, color, opt = {}) => {
    const m = ccClone(T['texts:text']), size = Math.round(px / PX_PER_SIZE * 10) / 10, rgb = hexRgb(color);
    const style = {fill: {content: {render_type: 'solid', solid: {color: rgb}}}, size, bold: true, range: [0, [...text].length]};
    if (opt.stroke) style.strokes = [{content: {render_type: 'solid', solid: {color: hexRgb(opt.stroke)}}, width: .08}];
    Object.assign(m, {id: ccUuid(), name: '', type: 'text', content: JSON.stringify({text, styles: [style]}), font_size: size, text_color: color.toLowerCase() + 'ff', alignment: opt.left ? 0 : 1,
      font_path: '', font_id: '', font_resource_id: '', font_name: '', font_title: 'none', fonts: [], words: {start_time: [], end_time: [], text: []}, current_words: {start_time: [], end_time: [], text: []},
      border_color: opt.stroke || '', border_width: opt.stroke ? .08 : 0, border_alpha: opt.stroke ? 1 : 0, has_shadow: !!opt.shadow, shadow_color: opt.shadow ? '#140000' : '', shadow_alpha: opt.shadow ? .6 : 0,
      background_color: opt.bg || '', background_alpha: opt.bg ? (opt.bgAlpha || 1) : 1, background_style: opt.bg ? 1 : 0, background_round_radius: opt.round || 0,
      line_max_width: .82, group_id: '', bold_width: .008, text_alpha: opt.alpha || 1, global_alpha: opt.alpha || 1});
    return add('texts', m);
  };
  const textAnim = (inAnim, durUs) => {
    const list = [], mk = ([name, rid, d], type) => Object.assign(ccClone(T.animation), {id: rid, type, start: type === 'out' ? Math.max(0, durUs - d) : 0, duration: Math.min(d, Math.floor(durUs / 2)),
      path: '', platform: 'all', resource_id: rid, third_resource_id: '0', source_platform: 1, name, category_id: type === 'in' ? 'ruchang' : 'chuchang', category_name: type === 'in' ? 'In' : 'Out', panel: '', material_type: 'sticker', request_id: ''});
    if (CC_TEXT_IN[inAnim]) list.push(mk(CC_TEXT_IN[inAnim], 'in'));
    list.push(mk(CC_TEXT_OUT, 'out'));
    return add('material_animations', Object.assign(ccClone(T['material_animations:sticker_animation']), {id: ccUuid(), animations: list}));
  };
  const textSeg = (matId, startUs, durUs, x, y, animId) => Object.assign(segment('text', matId, startUs, durUs, {source_timerange: null, extra_material_refs: animId ? [animId] : []}),
    {clip: {scale: {x: 1, y: 1}, rotation: 0, transform: {x, y}, flip: {vertical: false, horizontal: false}, alpha: 1}});
  const textTracks = [];
  const place = seg => {
    const a = seg.target_timerange.start, b = a + seg.target_timerange.duration;
    let tr = textTracks.find(list => list.every(o => o.target_timerange.start + o.target_timerange.duration <= a || o.target_timerange.start >= b));
    if (!tr) { tr = []; textTracks.push(tr); }
    tr.push(seg);
  };
  /* studio body time → CapCut body time (CapCut keeps scenes end to end, the studio overlaps them by the transition) */
  const studioBody = edl.body.reduce((p, s, i) => p + s.len - (i ? s.tDur : 0), 0), ccBody = (bodyEnd - bodyStart) / 1e6, scaleT = studioBody > 0 ? ccBody / studioBody : 1;
  const ACC = {brand: '#F04828', orange: '#FB923B', dark: '#140000', red: '#EB1C24'};
  edl.texts.forEach(tx => {
    if (!tx.text) return;
    const st = bodyStart + US(tx.start * scaleT), en = Math.min(bodyEnd, bodyStart + US(tx.end * scaleT)); if (en - st < 200000) return;
    const px = ({stack: 118, pill: 64, tag: 64, title: 96, account: 50, desc: 50, watermark: 46}[tx.style] || 84) * (tx.size || 1), acc = ACC[tx.color] || ACC.brand, plate = acc === ACC.dark ? ACC.brand : acc;
    const look = {plain: {stroke: '#140000', shadow: true}, outline: {stroke: '#140000'}, stack: {stroke: '#140000'}, box: {stroke: '#140000'}, duo: {stroke: '#140000'},
      title: {stroke: '#140000', shadow: true, color: '#FFE135'}, account: {stroke: '#140000'}, desc: {shadow: true}, watermark: {alpha: .32},
      bar: {bg: '#140000', bgAlpha: .72}, band: {bg: plate}, pill: {bg: plate, round: .5}, marker: {bg: plate}, tag: {bg: '#140000', bgAlpha: .78, left: true}}[tx.style] || {stroke: '#140000'};
    const id = textMaterial(tx.text, px, look.color || '#FFFFFF', look);
    const y = tx.y != null ? -(tx.y * H - H / 2) / (H / 2) : tx.pos === 'high' ? .52 : tx.pos === 'mid' ? 0 : -.44, x = look.left ? -.45 : 0;
    place(textSeg(id, st, en - st, x, y, textAnim(tx.anim, en - st)));
  });
  if (opts.waNumber && ML.wa && bodyEnd > bodyStart) {
    const id = textMaterial(opts.waNumber, ML.wa.size * 1.25, '#FFFFFF', {stroke: '#140000'});
    const textW = opts.waNumber.length * ML.wa.size * .56, cx = ML.wa.x + ML.wa.size + ML.wa.gap + textW / 2;
    place(textSeg(id, bodyStart, bodyEnd - bodyStart, (cx - W / 2) / (W / 2), -(ML.wa.y + ML.wa.size / 2 - H / 2) / (H / 2), null));
  }

  /* layer order, bottom to top: scenes, logo, icon, filter, effects, texts */
  if (overlay.length) c.tracks.push(track('video', overlay, 0));
  if (iconTrack.length) c.tracks.push(track('video', iconTrack, 0));
  if (filterSegs.length) c.tracks.push(track('filter', filterSegs, 0));
  if (fxSegs.length) c.tracks.push(track('effect', fxSegs, 0));
  textTracks.forEach(list => c.tracks.push(track('text', list.sort((p, q) => p.target_timerange.start - q.target_timerange.start), 1)));
  let render = 0;
  c.tracks.forEach((tr, ti) => tr.segments.forEach(s => { s.track_render_index = ti; s.render_index = tr.type === 'video' && ti === 0 ? 0 : 10000 + ti * 1000 + (render++); }));
  c.duration = total;

  /* ---- side files ---- */
  const draftId = ccUuid(), meta = ccClone(T.meta);
  Object.assign(meta, {draft_id: draftId, draft_name: opts.folder, draft_fold_path: draftDir, draft_root_path: opts.rootPath, draft_cover: '', tm_draft_create: now, tm_draft_modified: now, tm_duration: total,
    draft_timeline_materials_size_: 0, draft_materials: [{type: 0, value: []}, {type: 1, value: []}, {type: 2, value: []}, {type: 3, value: []}, {type: 6, value: []}, {type: 7, value: []}, {type: 8, value: []}]});
  const project = ccClone(T.project);
  Object.assign(project, {id: ccUuid(), main_timeline_id: contentId, create_time: now, update_time: now, timelines: [{create_time: now, id: contentId, is_marked_delete: false, name: 'Timeline 01', update_time: now}]});
  const layoutFile = ccClone(T['file:timeline_layout.json'] || {dockItems: [], layoutOrientation: 1});
  if (layoutFile.dockItems && layoutFile.dockItems[0]) Object.assign(layoutFile.dockItems[0], {timelineIds: [contentId], timelineNames: ['Timeline 01']});
  const contentText = JSON.stringify(c), secs = Math.floor(now / 1e6);
  const files = {
    'draft_content.json': contentText,
    'Timelines/project.json': JSON.stringify(project),
    'draft_meta_info.json': JSON.stringify(meta),
    'draft_settings': `[General]\ndraft_create_time=${secs}\ndraft_last_edit_time=${secs}\nreal_edit_seconds=0\nreal_edit_keys=0\n`,
    'timeline_layout.json': JSON.stringify(layoutFile),
  };
  for (const f of ['attachment_pc_common.json', 'draft_agency_config.json', 'performance_opt_info.json']) if (T['file:' + f]) files[f] = JSON.stringify(T['file:' + f]);
  /* the content file under the name this machine's CapCut reads (draft_info.json on the Mac app), and the Timelines
     copy only where CapCut uses Timelines */
  if (opts.contentName && opts.contentName !== 'draft_content.json') files[opts.contentName] = contentText;
  if (opts.timelines !== false) { files['Timelines/' + contentId + '/draft_content.json'] = contentText; if (opts.contentName && opts.contentName !== 'draft_content.json') files['Timelines/' + contentId + '/' + opts.contentName] = contentText; }
  else { delete files['Timelines/project.json']; delete files['timeline_layout.json']; }
  const entry = Object.assign(ccClone(T.root_entry), {draft_id: draftId, draft_name: opts.folder, draft_fold_path: draftDir, draft_root_path: opts.rootPath.replace(/\//g, opts.os === 'mac' ? '/' : '\\'),
    draft_json_file: draftDir + (opts.os === 'mac' ? '/' : '\\') + (opts.contentName || 'draft_content.json'), draft_cover: '', tm_draft_create: now, tm_draft_modified: now, tm_duration: total, tm_draft_removed: 0, draft_timeline_materials_size: contentText.length});
  return {files, entry, duration: total};
}
if (typeof module !== 'undefined') module.exports = {buildCapcutDraft};
