#!/usr/bin/env python3
"""Build the league guide PDF (assets/Dynasty-Puck-HQ-Guide.pdf).

1. Screenshots:  PW_PATH=... node tools/guide/shoot.js <workdir>/shots        (the 'live' one needs a demo build, see shoot.js)
2. This script:  python3 tools/guide/build_guide.py <workdir> [--font path/to/Inter-latin.woff2]
   - downsizes the screenshots, draws the QR code, fills tools/guide/guide.html, prints it with Chromium (pdf.js)
Needs: Pillow, segno, Node + Playwright.
"""
import datetime as dt
import os
import shutil
import subprocess
import sys

import segno
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SITE = "https://gavinpastreich.github.io/dynasty-puck/"


def main():
    work = sys.argv[1]
    font = sys.argv[sys.argv.index("--font") + 1] if "--font" in sys.argv else None
    shots, out = os.path.join(work, "shots"), os.path.join(work, "pdf")
    os.makedirs(os.path.join(out, "img"), exist_ok=True)
    html = open(os.path.join(HERE, "guide.html"), encoding="utf-8").read()
    for fn in sorted(os.listdir(shots)):
        if not fn.endswith(".jpg"):
            continue
        name = fn[:-4]
        im = Image.open(os.path.join(shots, fn)).convert("RGB")
        w = 900 if name.startswith("phone") else 1700
        if im.width > w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(out, "img", fn), "JPEG", quality=80, optimize=True, progressive=True)
        html = html.replace("{{img:%s}}" % name, "img/" + fn)
    segno.make(SITE, error="m").save(os.path.join(out, "qr.svg"), scale=6, border=1, dark="#0d1117")
    html = html.replace("{{qr}}", "qr.svg").replace("{{site}}", SITE)
    html = html.replace("{{date}}", dt.date.today().strftime("%B %-d, %Y"))
    missing = [x for x in html.split("{{")[1:]]
    if missing:
        print("! unfilled placeholders:", [m.split("}}")[0] for m in missing])
    if font:
        shutil.copy(font, os.path.join(out, "Inter-latin.woff2"))
    with open(os.path.join(out, "guide.html"), "w", encoding="utf-8") as f:
        f.write(html)
    pdf = os.path.join(ROOT, "assets", "Dynasty-Puck-HQ-Guide.pdf")
    subprocess.run(["node", os.path.join(HERE, "pdf.js"), os.path.join(out, "guide.html"), pdf], check=True)
    print("wrote", pdf, f"{os.path.getsize(pdf) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
