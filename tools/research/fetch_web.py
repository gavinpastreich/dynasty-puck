"""Cached fetcher for public web pages used in research (draft boards, injuries, depth charts).

Pages are cached in tools/cache/web/ so research can be re-run offline. Only public pages are fetched.
"""
import hashlib
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "..", "cache", "web")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def fetch(url, max_age_days=2):
    os.makedirs(CACHE, exist_ok=True)
    key = re.sub(r"[^A-Za-z0-9]+", "_", url)[:80] + "_" + hashlib.md5(url.encode()).hexdigest()[:8]
    path = os.path.join(CACHE, key + ".html")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_days * 86400:
        return open(path, encoding="utf-8", errors="replace").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        txt = r.read().decode("utf-8", errors="replace")
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)
    time.sleep(0.4)
    return txt


def text(html):
    import html as H
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", html, flags=re.S)
    s = re.sub(r"</(p|h\d|li|div|tr)>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = H.unescape(s)
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", s))


if __name__ == "__main__":
    print(text(fetch(sys.argv[1]))[:5000])
