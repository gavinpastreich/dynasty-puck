#!/usr/bin/env python3
"""Prospect news for the Prospect Radar page.

Two public sources, read every night by the data-refresh job:
  1. NHL.com's own content API: stories tagged with a player's NHL id (league and team sites). One request per
     tracked prospect, so nothing is guessed from names.
  2. RSS feeds listed in tools/research/feeds.json (AHL, college, junior, prospect and fantasy sites). One request
     per feed; a headline is attached to a prospect when his full name appears in the title or summary.
Only the headline, source, date, link and a few tags (call-up, injury, signing ...) are kept, never article text.
Results are merged into raw/<season>/prospects/news.json (items older than 45 days drop off), so a headline stays
on the page after it scrolls out of a feed.

    python tools/research/scrape_news.py            (uses the published data/league.js for the player list)
"""
import datetime as dt
import email.utils
import html
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
UA = "Mozilla/5.0 (DynastyPuckHQ data build; github.com/gavinpastreich/dynasty-puck)"
FORGE = "https://forge-dapi.d3.nhle.com/v2/content/en-us/stories"
KEEP_DAYS, PER_PLAYER, NHL_LOOKBACK = 45, 12, 30

TAGS = [   # (tag, pattern on the lower-cased headline)
    ("call-up", r"\b(recall(ed|s)?|called up|call-up|summon(ed|s)?|promot(ed|es)|joins? (the )?(nhl|big) club|nhl debut|make[s]? (his )?(nhl )?debut)\b"),
    ("sent down", r"\b(assign(ed|s)?|sent down|reassign(ed|s)?|loan(ed|s)?|return(ed|s)? to (the )?(ahl|juniors?|ohl|whl|qmjhl|europe|sweden|finland))\b"),
    ("injury", r"\b(injur(y|ed|ies)|out (indefinitely|for|\d)|week-to-week|day-to-day|surgery|concussion|upper-body|lower-body|injured reserve|(on|to|from) (lt)?ir|sidelined|leaves game)\b"),
    ("contract", r"\b(sign(s|ed)?|entry-level|elc|contract|extension|agree(s|d)? to terms)\b"),
    ("trade", r"\b(trade(d|s)?|acquire(d|s)?|dealt)\b"),
    ("hot", r"\b(hat trick|player of the (week|month)|rookie of the (week|month)|point streak|first (nhl |career )?(goal|point|win|shutout)|two goals|\d+-point|scores twice|overtime winner|game-winner|shutout|star of the)\b"),
    ("honor", r"\b(world junior|wjc|all-star|award|named to|team canada|team usa|camp roster|top prospect|ranking|rankings)\b"),
]


RELEVANT = re.compile(r"prospect|roster moves?|recall|\b(re)?assign|call[- ]?ups?\b|transactions?|waivers?|\bnotes\b|\breport\b|rankings?|top \d+|rookie|world junior|injur|pipeline|stock (up|watch)|risers|fallers|entry-level|\bahl\b|\bncaa\b|\bjuniors?\b|\b(ohl|whl|qmjhl|ushl|khl|shl)\b|college hockey|farm (team|report)|development camp|three stars|\bdraft\b|draft-eligible|central scouting|big board|u18|hlinka", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


PERSONAL = {"call-up", "sent down", "injury", "contract", "trade"}   # tags that say something happened to one player
CLAUSE = re.compile(r";|,\s*(?=(?:and\s+)?(?:recall|assign|reassign|place|sign|re-sign|extend|activate|trade|waive|loan|send|call|acquire|claim)\w*\b)"
                    r"|\s(?:due to|after|as|while|amid)\s", re.I)


def tags_of(title, name=None):
    """Tags read from the words of a headline. A tag about one player (call-up, injury ...) counts only when his last
    name is in the same clause as the trigger word: 'Bruins place Hagens on IR, recall Eyssimont' is an injury for
    Hagens, not a call-up. Without his name in the headline there are no personal tags at all."""
    last = norm(name.split()[-1]) if name else None
    clauses = [c for c in CLAUSE.split(title) if c and c.strip()]
    out = []
    for k, pat in TAGS:
        if not last:
            hit = bool(re.search(pat, title.lower()))
        elif k in PERSONAL:
            hit = any(re.search(pat, c.lower()) and last in norm(c).split() for c in clauses)
        else:
            hit = bool(re.search(pat, title.lower())) and last in norm(title).split()
        if hit:
            out.append(k)
    return out


def tracked():
    """The Radar's prospect pool (same rule as E.prospectPool in assets/js/engine.js): every MNR-contract player on a
    league roster, unowned players aged 22 or under with fewer than 82 NHL games, and 2026 NHL draft picks that
    Fantrax hasn't added yet. Headlines are filed under 'n' + NHL id (the Fantrax id for the few without one), so
    they stay with a player when Fantrax adds him later."""
    with open(os.path.join(ROOT, "data", "league.js"), encoding="utf-8") as f:
        src = f.read()
    players = json.loads(re.search(r"DP\.players=(\[.*?\]);\n", src, re.S).group(1))
    out, seen = [], set()
    ref = dt.date(int(re.search(r'"seasonId":(\d{4})', src).group(1)), 9, 16)
    for p in players:
        age = p.get("fxage")
        if p.get("dob"):
            try:
                age = (ref - dt.date.fromisoformat(p["dob"])).days / 365.2425
            except ValueError:
                pass
        if (p.get("gm") and p.get("ct") == "MNR") or (not p.get("gm") and (age or 30) <= 22 and (p.get("cgp") or 0) < 82):
            out.append({"id": "n%s" % p["nhl"] if p.get("nhl") else p["id"], "n": p["n"], "nhl": p.get("nhl"), "gm": p.get("gm")})
            if p.get("nhl"):
                seen.add(p["nhl"])
    try:
        with open(os.path.join(ROOT, "data", "prospects.js"), encoding="utf-8") as f:
            pr = json.loads(re.search(r"DP\.prospects=(\{.*\})\s*;?\s*$", f.read(), re.S).group(1))
        for r in pr.get("draft2026") or []:
            if r.get("gm") or r.get("fid") or not r.get("nhl") or r["nhl"] in seen:
                continue
            out.append({"id": "n%s" % r["nhl"], "n": r["n"], "nhl": r["nhl"], "gm": None})
    except Exception as e:   # the news still works without the draft class
        print("  ! could not read the 2026 draft class:", e)
    # the Draft Center's classes: everyone on the 2027 tracker and the 2027-2029 boards (no NHL ids yet, so headlines
    # are filed under 'd27:<name key>'). A name the Radar already follows stays with the Radar.
    try:
        sys.path.insert(0, HERE)
        import draft_tracker as DT
        have = {norm(p["n"]) for p in out}
        for c in DT.classes():
            if norm(c["n"]) not in have:
                out.append({"id": c["id"], "n": c["n"], "nhl": None, "gm": None, "draft": c["year"]})
    except Exception as e:
        print("  ! could not read the draft classes:", e)
    return out


def nhl_stories(p, since):
    """Stories on NHL.com (league or team site) tagged with this player."""
    if not p.get("nhl"):
        return []
    url = FORGE + "?" + urllib.parse.urlencode({"tags.slug": f"playerid-{p['nhl']}", "$limit": 8})
    try:
        d = json.loads(fetch(url).decode("utf-8"))
    except Exception:
        return None
    out = []
    for it in d.get("items", []):
        when = (it.get("contentDate") or "")[:10]
        if not when or when < since or not it.get("slug") or not it.get("title"):
            continue
        n_players = sum(1 for t in it.get("tags", []) if str(t.get("slug", "")).startswith("playerid-"))
        title = html.unescape(it.get("headline") or it["title"]).strip()   # 'title' is often a search-style slug
        named = norm(p["n"].split()[-1]) in norm(title + " " + it["title"])
        if n_players > 6 and not named:   # round-ups that tag half the league say nothing about him
            continue
        ctx = (it.get("context") or {}).get("slug") or "nhl"
        out.append({"d": when, "t": title, "s": "NHL.com" if ctx == "nhl" else "NHL.com (team site)",
                    "u": "https://www.nhl.com/news/" + it["slug"], "w": 2 if named else 1})
    return out


def parse_feed(raw):
    """[(title, link, date iso, summary)] from RSS 2.0 or Atom."""
    strip = lambda tag: tag.split("}", 1)[-1]
    rows = []
    try:
        root = ET.fromstring(raw)
        for e in root.iter():
            if strip(e.tag) not in ("item", "entry"):
                continue
            f = {}
            for c in e:
                k = strip(c.tag)
                if k == "link" and not (c.text or "").strip():
                    f.setdefault("link", c.attrib.get("href", ""))
                elif k in ("title", "link", "pubDate", "published", "updated", "description", "summary", "date"):
                    f.setdefault(k, (c.text or "").strip())
            rows.append(f)
    except ET.ParseError:   # feeds with stray characters or undeclared entities: read the items with patterns instead
        text = raw.decode("utf-8", "ignore")
        cdata = lambda v: re.sub(r"^<!\[CDATA\[|\]\]>$", "", v.strip(), flags=re.S).strip()
        for block in re.findall(r"<(?:item|entry)\b.*?</(?:item|entry)>", text, re.S):
            f = {}
            for k in ("title", "link", "pubDate", "published", "updated", "description", "summary"):
                m = re.search(r"<%s\b[^>]*>(.*?)</%s>" % (k, k), block, re.S)
                if m:
                    f[k] = cdata(m.group(1))
            if not f.get("link"):
                m = re.search(r'<link\b[^>]*href="([^"]+)"', block)
                if m:
                    f["link"] = m.group(1)
            rows.append(f)
    out = []
    for f in rows:
        title = html.unescape(re.sub(r"<[^>]+>", "", f.get("title", ""))).strip()
        link = f.get("link", "").strip()
        when = f.get("pubDate") or f.get("published") or f.get("updated") or f.get("date") or ""
        iso = ""
        try:
            iso = email.utils.parsedate_to_datetime(when).date().isoformat()
        except Exception:
            m = re.match(r"(\d{4}-\d{2}-\d{2})", when)
            iso = m.group(1) if m else ""
        summ = html.unescape(re.sub(r"<[^>]+>", " ", f.get("description") or f.get("summary") or ""))
        if title and link.startswith("http") and iso:
            out.append((title, link, iso, summ[:1500]))
    return out


def main():
    people = tracked()
    since = (dt.date.today() - dt.timedelta(days=NHL_LOOKBACK)).isoformat()
    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    with open(os.path.join(ROOT, "config", "league.json"), encoding="utf-8") as f:
        raw_dir = os.path.join(ROOT, *json.load(f).get("rawFolder", "raw/2026-27").split("/"), "prospects")
    path = os.path.join(raw_dir, "news.json")
    old = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    items = {pid: [x for x in lst if x.get("d", "") >= cutoff] for pid, lst in (old.get("items") or {}).items()}
    sources = []

    def add(pid, it):
        lst = items.setdefault(pid, [])
        if any(x["u"] == it["u"] or norm(x["t"]) == norm(it["t"]) for x in lst):
            return False
        lst.append(it)
        return True

    # 1. NHL.com stories tagged with the player's id
    with_id = [p for p in people if p.get("nhl")]
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(lambda p: nhl_stories(p, since), with_id))
    failed = sum(1 for r in res if r is None)
    n_new = sum(add(p["id"], it) for p, r in zip(with_id, res) for it in (r or []))
    sources.append({"name": "NHL.com stories by player", "url": "https://www.nhl.com/news", "ok": failed < len(with_id) / 2,
                    "n": sum(len(r or []) for r in res), "note": f"{len(with_id)} players asked" + (f", {failed} failed" if failed else "")})

    # 2. RSS feeds, matched on full names (skip names shared by two tracked players)
    names = {}
    for p in people:
        names.setdefault(norm(p["n"]), []).append(p)
    pats = [(re.compile(r"(?<![a-z0-9])" + re.escape(k) + r"(?![a-z0-9])"), v[0]) for k, v in names.items() if len(v) == 1 and len(k.split()) >= 2]
    with open(os.path.join(HERE, "feeds.json"), encoding="utf-8") as f:
        feeds = json.load(f)["feeds"]

    def one(fd):
        try:
            return parse_feed(fetch(fd["url"]))
        except Exception as e:
            return str(e)

    with ThreadPoolExecutor(max_workers=6) as ex:
        got = list(ex.map(one, feeds))
    for fd, entries in zip(feeds, got):
        if isinstance(entries, str):
            sources.append({"name": fd["name"], "url": fd["url"], "ok": False, "n": 0, "note": entries[:80]})
            continue
        hits = 0
        for title, link, iso, summ in entries:
            if iso < cutoff:
                continue
            nt, ns = norm(title), norm(summ)
            about = bool(RELEVANT.search(title))
            for pat, p in pats:
                in_title = bool(pat.search(nt)) or (len(p["n"].split()[-1]) >= 5 and re.search(r"(?<![a-z0-9])" + re.escape(norm(p["n"].split()[-1])) + r"(?![a-z0-9])", nt) and pat.search(ns))
                # a name buried in a game recap or a lineup post isn't news: body-only matches count only under a
                # headline about roster moves, prospects, injuries and the like
                if in_title or (about and pat.search(ns)):
                    hits += add(p["id"], {"d": iso, "t": title, "s": fd["name"], "u": link, "w": 2 if in_title else 1})
        sources.append({"name": fd["name"], "url": fd["url"], "ok": True, "n": len(entries), "note": f"{hits} new matches"})
        n_new += hits

    name_of = {p["id"]: p["n"] for p in people}
    for pid in list(items):
        if pid not in name_of:   # no longer tracked (graduated, signed, or a corrected id)
            del items[pid]
            continue
        for it in items[pid]:    # tags are re-read every run, so a better rule fixes old headlines too
            it["k"] = tags_of(it["t"], name_of[pid])
        items[pid] = sorted(items[pid], key=lambda x: (x["d"], x.get("w", 1)), reverse=True)[:PER_PLAYER]
        if not items[pid]:
            del items[pid]
    out = {"fetched": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "tracked": len(people),
           "sources": sources, "items": items}
    os.makedirs(raw_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=0, sort_keys=True, ensure_ascii=False)
    total = sum(len(v) for v in items.values())
    n_draft = sum(1 for p in people if p.get("draft"))
    print(f"Prospect news: {len(people) - n_draft} prospects and {n_draft} draft prospects tracked, {n_new} new headlines, {total} kept for {len(items)} players "
          f"({sum(1 for s in sources if s['ok'])}/{len(sources)} sources reachable)")
    for s in sources:
        if not s["ok"]:
            print(f"  ! {s['name']}: {s['note']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
