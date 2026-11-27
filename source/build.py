"""Make web/index.html, the whole photo app in one file for GitHub Pages (or any static host).
Also writes dist/Code.gs and dist/Index.html in case it is ever put on Apps Script instead.
Run: python build.py   (needs pip install pillow fonttools)

Brand files (logo, WhatsApp icon, fonts, colours) come from vietlink-wf-photo-variants, and the image and font
helpers from vietlink-app-script/build.py, so both apps draw the same brand. Page styles start from the main app's.
"""
import importlib.util, json, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).parent
REPOS = ROOT.parent
MAIN = REPOS / "vietlink-app-script"
PHOTO = REPOS / "vietlink-wf-photo-variants"
DIST = ROOT / "dist"

spec = importlib.util.spec_from_file_location("main_build", MAIN / "build.py")
main_build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main_build)


def main():
    b = json.loads((PHOTO / "brand.json").read_text(encoding="utf-8"))
    p = b["placement"]
    brand = {"dark": b["colors"]["stroke"], "accent": b["colors"]["accent"], "whatsappIcon": b["colors"]["whatsapp_icon"], "number": b["brand"]["whatsapp"],
             "logo": {k: p["logo"][k] for k in ("left", "top", "width", "opacity")}, "whatsapp": {k: p["whatsapp"][k] for k in ("right", "top", "size", "opacity")}}
    assets = {"logo": main_build.png_uri(PHOTO / p["logo"]["file"], 440), "icon": main_build.png_uri(PHOTO / p["whatsapp"]["icon"], 96)}
    fonts = main_build.font_face(PHOTO / b["font"], "BrandHeavy", 800) + main_build.font_face(PHOTO / b["font_bold"], "BrandBold", 700)
    src = lambda n: (ROOT / "src" / n).read_text(encoding="utf-8")
    html = src("Index.html")
    parts = {"/*__STYLE__*/": src("style.html").replace("/*__FONTS__*/", fonts),
             "/*__ASSETS__*/": "const BRAND = " + json.dumps(brand, ensure_ascii=False) + ";\nconst ASSETS = " + json.dumps(assets) + ";",
             "/*__PHOTO__*/": src("photo.js"), "/*__GEN__*/": src("gen.js")}
    for marker, text in parts.items():
        assert html.count(marker) == 1, marker
        html = html.replace(marker, text)
    DIST.mkdir(exist_ok=True)
    (DIST / "Index.html").write_text(html, encoding="utf-8")
    (DIST / "Code.gs").write_text(src("Code.gs"), encoding="utf-8")
    web = ROOT / "web"
    web.mkdir(exist_ok=True)
    head = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Vietlink · Tạo ảnh</title>\n'
    page = html.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n' + head, 1)
    assert page != html
    (web / "index.html").write_text(page, encoding="utf-8", newline="\n")
    # Video studio: its own page at web/video/, same brand files and styles, sharing the WhatsApp number via the browser.
    vsrc = lambda n: (ROOT / "video" / "src" / n).read_text(encoding="utf-8")
    vhtml = vsrc("video.html")
    vparts = {"/*__STYLE__*/": parts["/*__STYLE__*/"], "/*__ASSETS__*/": parts["/*__ASSETS__*/"],
              "/*__ENGINE__*/": vsrc("engine.js").replace("/*__CLASSIFIER__*/", "const CLASSIFIER = " + vsrc("classifier.json") + ";"), "/*__CAPCUT__*/": "const CAPCUT_T = " + vsrc("capcut_templates.json") + ";\n" + vsrc("capcut.js"), "/*__MEDIA__*/": vsrc("media.js") + "\n" + vsrc("capcut_fix.js"), "/*__UI__*/": vsrc("ui.js")}
    for marker, text in vparts.items():
        assert vhtml.count(marker) == 1, marker
        vhtml = vhtml.replace(marker, text)
    (web / "video").mkdir(exist_ok=True)
    (web / "video" / "index.html").write_text(vhtml, encoding="utf-8", newline="\n")
    for f in [*sorted(DIST.iterdir()), web / "index.html", web / "video" / "index.html"]:
        print(f.relative_to(ROOT), round(f.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main()
