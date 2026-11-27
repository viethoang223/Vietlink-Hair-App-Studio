# Vietlink photo app

The photo maker from the Vietlink app, on its own: anyone with the link can use it, no PIN, nothing written to any sheet.
Photos never leave the viewer's device. Logo and WhatsApp number are always drawn, at the places locked in `brand.json`.
The WhatsApp number is typed by each user at the top of the page and kept on their device (`localStorage` key `vl_wa`);
it stays the same when templates change. Left empty, it falls back to the shared number from `brand.json`.

## Templates

- **Vô tận (endless), the default:** `src/gen.js` builds each design from one number (its seed): photo structure
  (13 kinds, each with variants) × text zone × type style × ornaments × colour tone × wording. Scrolling to the end of
  the gallery adds 12 new designs, and a design whose look was already shown in this visit is skipped. The same seed always
  draws the same design, so the gallery tile, the editor and the download match.
- **Hand-made groups:** the 45 layouts from the main app (Toàn ảnh, Dải chữ, Khung, Chia đôi, Hình khối, Ghép ảnh, Thông tin).
- **🎨 Trộn màu (mix):** each design brings its own tone; picking a tone applies it to all.

Brand rules kept by the generator: wording only from `LINES` and `SUBS` in `src/photo.js` (from BRAND.md), colours only
from `THEMES`, and the top band under the white logo is always a photo or the dark brand colour, never a light colour.
Text on a photo always gets a dark scrim, a plate or an outline.

## Files

- `src/photo.js`: forked from `vietlink-app-script/src/photo.js` (upload, HEIC, editor, export, hand-made layouts),
  without the account log. Fixes to shared parts must be copied by hand to the other repo.
- `src/gen.js`: the endless generator. Add a structure to `STRUCTS` and a `case` in `drawStruct`, a type style to
  `TYPOS`/`PHOTO_TYPOS` and `drawType`, or an ornament to `DECOR` and `drawDecor`.
- `src/Index.html`, `src/style.html`: the page (styles copied from the main app). `src/Code.gs`: only `doGet`.
- `build.py`: writes `dist/Code.gs` and `dist/Index.html`. Needs the sibling repos `vietlink-app-script` (image and font
  helpers) and `vietlink-wf-photo-variants` (logo, icon, fonts, colours). `pip install pillow fonttools`.
- `test/` (not committed): `python test/make_test.py [photos]` makes `test/photo-test.html` with sample photos preloaded.

## Put online / update (GitHub Pages)

`python build.py` writes `web/index.html`: the whole app in one file (fonts, logo and icon inside), no server needed.
Upload it as `index.html` at the root of a **public** GitHub repo (free GitHub Pages needs public), then Settings,
Pages, Source: Deploy from a branch, Branch: `main`, folder `/ (root)`, Save. The link is
`https://<account>.github.io/<repo>/`. To update: rebuild and upload the new `index.html` over the old one.

`dist/` holds the same page for Google Apps Script, unused for now.

## Video studio (`video/`, page `web/video/index.html`, link `/video/`)

Upload 1–6 clips → each is classified on the device (hair swing, close-up, wide pan, factory; the user can change it) →
choose how many versions (1–6), the intensity (0 rustic … 100 dense), intro/outro, original sound → Generate → pick one
→ edit (segments: trim, length, speed, camera move, transition; texts: wording, style, animation, position, timing;
look, overlays, intro/outro style) → Export MP4 (H.264 1080×1920 30 fps, AAC when sound is kept).

- `video/src/engine.js`: edit list, template generator (`generate(seed, clips, opts)`), timeline, drawing of frames,
  transitions, looks, texts, intro/outro cards and brand marks. Type detection uses motion features measured on
  labelled clips (`CENTROIDS`): 82% right on hair swing vs close-up; wide pan and factory are rules or the user's choice.
- `video/src/media.js`: Mediabunny 1.65.2 from jsDelivr (read MOV/MP4 incl. HEVC, decode, encode, MP4), live preview
  player (two `<video>` per clip), thumbnails, export and sound mix.
- `video/src/ui.js`: the three steps. `video/src/video.html`: the page.
- Needs WebCodecs and an https page (GitHub Pages is fine; a local `file://` or `data:` page is not).
  The WhatsApp number is shared with the photo page (`localStorage` key `vl_wa`).
### Phase 2 and 3 (27/11)

- Editor: timeline under the preview (scenes and texts; click to select and seek; drag a scene's right edge to change
  its length; drag a text bar to move it, its edges to change when it shows), inspector for the selected scene, text,
  intro or outro, "✂ Tách đoạn tại đây" (split at the playhead), "+ Chữ tại đây", duplicate, reorder.
- Shortcuts in the editor (like CapCut / Office): Delete or Backspace delete the selected scene, text, intro or outro; Ctrl+B split at the playhead; Ctrl+C / Ctrl+X / Ctrl+V copy, cut, paste; Ctrl+D duplicate; Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo (150 steps, a slider drag counts as one); Space play/pause; ←/→ one frame, Shift+←/→ one second; Home/End; Esc deselect. Ignored while typing in a text box.
- Per-scene effects (`SEG_FX`): zoom punch, flash in, shake, freeze last part, black and white, mirror.
- Template library: 13 transitions, 9 camera moves, 11 looks, 10 text styles, 10 text animations, 8 overlays,
  5 intros, 5 outros; each clip type has its own favourite moves, transitions and effects (`TYPES`).
- Image AI for clip type (opt-in switch on step 1): transformers.js 4.3.2 + Xenova/clip-vit-base-patch32 (q8, about
  85 MB, downloaded once by the browser from Hugging Face). `video/tools/train_classifier.py` trains the weights in
  `video/src/classifier.json` from vietlink-hair's labelled clips; build.py embeds them. Without the switch, the motion
  rule is used.
- Phones: lighter preview canvas, bigger timeline handles, screen kept awake during export, "Lưu vào máy / Chia sẻ"
  (share sheet, saves to Photos on iPhone), clear message on browsers without WebCodecs.
- Tested 27/11 on the live page with clips generated in the browser (H.264 with rotation, 60 and 30 fps, with and
  without sound): detection, 4 versions, preview, editor, export of a 21 s video in 11 s. Not yet tested with a real
  1080p HEVC iPhone clip in the page: this machine's browser reports HEVC decode support, but speed is unmeasured.
