#!/usr/bin/env python3
"""Draft tracker: the 2027 NHL draft class followed through the season (Draft Center and Mock Draft).

Run by the nightly data refresh, in two steps around the news scrape:

    python tools/research/draft_tracker.py fetch     public rankings -> raw/<season>/draft/tracker.json
    python tools/research/scrape_news.py              (tracks every name on the 2027-2029 boards, see tracked())
    python tools/research/draft_tracker.py publish   tracker + boards + headlines -> data/draft.js

Sources (public pages, one request each per night):
  - Tankathon's 2027 big board (https://www.tankathon.com/nhl/big-board): rank, bio, this season's games, goals,
    assists, points and Tankathon's NHLe for every player on it. Tankathon re-ranks during the season; the page
    carries the date of its last update.
  - NHL Central Scouting (https://api-web.nhle.com/v1/draft/rankings/2027/<1-4>, the NHL's own API): North American
    and international skaters and goalies. Central Scouting publishes in January (midterm) and April (final); until
    then the API answers 404 and the site says so.

History: a player's Tankathon rank is stored whenever it changes and his stats whenever his games played change, by
date. The first entry is the Tankathon rank from the September consensus board (tools/research/board_2027.json), so
movement is measured from the start of the season. Nothing is estimated here: ranks and stats are the sources' own.
"""
import datetime as dt
import html as H
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
with open(os.path.join(ROOT, "config", "league.json"), encoding="utf-8") as _f:
    CFG = json.load(_f)
RAW = os.path.join(ROOT, *CFG.get("rawFolder", "raw/2026-27").split("/"), "draft")
TRACKER = os.path.join(RAW, "tracker.json")
NEWS = os.path.join(ROOT, *CFG.get("rawFolder", "raw/2026-27").split("/"), "prospects", "news.json")
OUT = os.path.join(ROOT, "data", "draft.js")
YEAR = 2027
TK_URL = "https://www.tankathon.com/nhl/big-board"
CSS_URL = "https://api-web.nhle.com/v1/draft/rankings/%d/%d"
CSS_CATS = {1: "NA skaters", 2: "Intl skaters", 3: "NA goalies", 4: "Intl goalies"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}
ALIAS = {"shaeffgordoncarroll": "shaeffergordoncarroll", "johnnymclaughlin": "johnmclaughlin"}  # spellings that differ between sources
STAT = {"GAMES": "gp", "GOALS": "g", "ASSISTS": "a", "POINTS": "pts", "NHLe": "nhle", "GAA": "gaa", "SV%": "svp", "WINS": "w"}


def key(name):
    """Name key shared with the site (assets/js/pages-draft.js keyOf): letters only, accents dropped."""
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z]", "", s)
    return ALIAS.get(s, s)


def get(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def num(x):
    try:
        v = float(x)
        return int(v) if v == int(v) and "." not in str(x) else v
    except (TypeError, ValueError):
        return None


def tankathon():
    """Tankathon's 2027 board: [{rk, n, k, pos, nat, ht, wt, dob, lg, team, slug, s: {gp, g, a, pts, nhle}}], updated."""
    h = get(TK_URL)
    upd = re.search(r'<time datetime="([^"]+)"', h)
    rows = re.findall(r'<div class="mock-row nhl" data-pos="([^"]*)">(.*?)(?=<div class="mock-row nhl"|<div class="tier">|</body>)', h, re.S)
    out = {}
    for pos, body in rows:
        rk = re.search(r'mock-row-pick-number">(\d+)<', body)
        nm = re.search(r'mock-row-name">([^<]+)<', body)
        if not rk or not nm or int(rk.group(1)) in out:   # the page repeats some blocks: first one wins
            continue
        sp = re.search(r'mock-row-school-position">([^<]+)<', body)
        lg = re.search(r'league-name">([^<]+)<', body)
        nat = re.search(r'<img[^>]*class="flag-border"[^>]*alt="([^"]+)"|<img[^>]*alt="([^"]+)"[^>]*class="flag-border"', body)
        ht = re.search(r'class="height">([^<]+)<', body)
        wt = re.search(r'class="weight">([^<]+)<', body)
        born = "".join(re.findall(r'class="(?:year|month)">([^<]+)<', body))
        m = re.match(r"(\d{4})-([A-Z]{3})", born)
        href = re.search(r'href="/nhl/players/([^"]+)"', body)
        stats, season = {}, None
        for lab, val in re.findall(r'<div class="label">([^<]+)</div><div class="value total"[^>]*>([^<]*)<', body):
            lab = lab.strip()
            sm = re.match(r"^(\d\d)-(\d\d) GP$", lab)   # a player with no games yet this season: Tankathon shows last season's line
            if sm:
                season, lab = f"20{sm.group(1)}-{sm.group(2)}", "GAMES"
            k = STAT.get(lab)
            if k and num(val) is not None:
                stats[k] = num(val)
        cur_season = f"{YEAR - 1}-{str(YEAR)[2:]}"
        last = None
        if season and season != cur_season:
            last, stats = dict(stats, season=season), {}
        name = H.unescape(nm.group(1)).strip().replace("Shaeff. ", "Shaeffer ")
        out[int(rk.group(1))] = {
            "rk": int(rk.group(1)), "n": name, "k": key(name), "pos": pos or None,
            "nat": (nat.group(1) or nat.group(2)) if nat else None,
            "ht": H.unescape(ht.group(1)).strip() if ht else None, "wt": num(wt.group(1)) if wt else None,
            "dob": f"{m.group(1)}-{MONTHS[m.group(2)]:02d}" if m else None,
            "lg": lg.group(1).strip() if lg else None,
            "team": H.unescape(sp.group(1)).split("|")[-1].strip() if sp else None,
            "slug": href.group(1) if href else None, "s": stats or None, "ls": last}
    board = [out[r] for r in sorted(out)]
    if len(board) < 30 or board[0]["rk"] != 1:
        raise ValueError(f"Tankathon board looks wrong ({len(board)} players)")
    return board, (upd.group(1)[:10] if upd else None)


def central_scouting():
    """NHL Central Scouting's 2027 lists, when published: {key: {cat, rank, kind, club, league}}."""
    out, status = {}, []
    for cat, label in CSS_CATS.items():
        try:
            d = json.loads(get(CSS_URL % (YEAR, cat)))
        except urllib.error.HTTPError as e:
            status.append({"cat": label, "ok": e.code == 404, "n": 0, "note": "not published yet" if e.code == 404 else f"HTTP {e.code}"})
            continue
        except Exception as e:
            status.append({"cat": label, "ok": False, "n": 0, "note": str(e)[:80]})
            continue
        if d.get("draftYear") != YEAR:
            status.append({"cat": label, "ok": True, "n": 0, "note": "not published yet"})
            continue
        n = 0
        for r in d.get("rankings") or []:
            rank = r.get("finalRank") or r.get("midtermRank")
            if not rank:
                continue
            name = f"{r.get('firstName', '')} {r.get('lastName', '')}".strip()
            out[key(name)] = {"cat": cat, "rank": rank, "kind": "final" if r.get("finalRank") else "midterm",
                              "club": r.get("lastAmateurClub"), "league": r.get("lastAmateurLeague"), "n": name}
            n += 1
        status.append({"cat": label, "ok": True, "n": n, "note": ("final" if any(v["kind"] == "final" for v in out.values()) else "midterm") + f" list, {n} players"})
    return out, status


def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def board(year):
    return load(os.path.join(HERE, f"board_{year}.json"), {"players": []})


def seed(tr):
    """First run: the September consensus board's Tankathon ranks (dated to Tankathon's update then) start every history."""
    b = board(YEAR)
    src = next((s for s in b.get("sources", []) if "Tankathon" in s.get("name", "")), {})
    when = src.get("date") or b.get("updated") or "2026-09-10"
    for p in b["players"]:
        tk = next((s.get("rank") for s in p.get("sources", []) if s.get("name") == "Tankathon" and s.get("rank")), None)
        if tk:
            tr["p"].setdefault(key(p["name"]), {"n": p["name"], "r": [], "s": [], "c": []})["r"].append([when, tk])
    tr["seeded"] = when


def fetch():
    os.makedirs(RAW, exist_ok=True)
    tr = load(TRACKER, None)
    if not tr:
        tr = {"v": 1, "p": {}, "latest": [], "css": {}, "status": {}}
        seed(tr)
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    st = {}
    try:
        tk, upd = tankathon()
        st["tk"] = {"ok": True, "n": len(tk), "updated": upd, "url": TK_URL}
        on = set()
        for r in tk:
            h = tr["p"].setdefault(r["k"], {"n": r["n"], "r": [], "s": [], "c": []})
            h["n"] = r["n"]
            on.add(r["k"])
            if not h["r"] or h["r"][-1][1] != r["rk"]:
                h["r"].append([upd or today, r["rk"]])
            s = r.get("s") or {}
            row = [today, s.get("gp"), s.get("g"), s.get("a"), s.get("pts"), s.get("nhle")]
            if s.get("gp") is not None and (not h["s"] or h["s"][-1][1] != row[1]):
                h["s"].append(row)
        for k, h in tr["p"].items():   # dropped off the board: a None rank marks the date
            if k not in on and h["r"] and h["r"][-1][1] is not None:
                h["r"].append([upd or today, None])
        tr["latest"], tr["tkUpdated"] = tk, upd
    except Exception as e:     # Tankathon down or changed: keep yesterday's board
        st["tk"] = {"ok": False, "n": len(tr.get("latest") or []), "note": str(e)[:120], "url": TK_URL, "updated": tr.get("tkUpdated")}
    css, cst = central_scouting()
    if css:
        tr["css"] = css
        for k, c in css.items():
            h = tr["p"].setdefault(k, {"n": c["n"], "r": [], "s": [], "c": []})
            if not h["c"] or h["c"][-1][1:] != [c["cat"], c["rank"]]:
                h["c"].append([today, c["cat"], c["rank"]])
    st["css"] = cst
    tr["status"], tr["fetched"] = st, dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
    with open(TRACKER, "w", encoding="utf-8") as f:
        json.dump(tr, f, ensure_ascii=False, indent=0, sort_keys=True)
    t = st["tk"]
    print(f"Draft tracker: Tankathon {'ok' if t['ok'] else 'FAILED (' + t.get('note', '') + ')'} {t['n']} players, board updated {t.get('updated')}; "
          f"Central Scouting: {sum(c['n'] for c in cst)} ranked ({'; '.join(c['cat'] + ' ' + c['note'] for c in cst)})")
    return 0 if t["ok"] else 1


def classes():
    """Every name the Draft Center follows, for the news scrape: [{id, n, year}] (2027 = tracker + board, 2028-29 = boards)."""
    out, seen = [], set()
    tr = load(TRACKER, {})
    for r in (tr.get("latest") or []) + [{"n": p["name"]} for p in board(YEAR)["players"]]:
        k = key(r["n"])
        if k not in seen:
            seen.add(k)
            out.append({"id": f"d{YEAR % 100}:{k}", "n": r["n"], "year": YEAR})
    for y in (YEAR + 1, YEAR + 2):
        for p in board(y)["players"]:
            k = key(p["name"])
            if k not in seen:
                seen.add(k)
                out.append({"id": f"d{y % 100}:{k}", "n": p["name"], "year": y})
    return out


def league_players():
    try:
        with open(os.path.join(ROOT, "data", "league.js"), encoding="utf-8") as f:
            return json.loads(re.search(r"DP\.players=(\[.*?\]);\n", f.read(), re.S).group(1))
    except Exception:
        return []


def publish():
    tr = load(TRACKER, None)
    if not tr:
        print("Draft tracker: nothing fetched yet; run 'fetch' first")
        return 1
    news = load(NEWS, {"items": {}, "sources": []})
    owned = {}
    for p in league_players():   # a 2027 prospect already in Fantrax (and maybe on a roster): born 2008 or later
        if (p.get("dob") or "0")[:4] >= str(YEAR - 19):
            owned.setdefault(key(p["n"]), p)
    live = {r["k"]: r for r in tr.get("latest") or []}
    pre = {key(p["name"]): p.get("rank") for p in board(YEAR)["players"]}
    keys = list(live) + [k for k in pre if k not in live]
    rows = []
    for k in keys:
        r, h, fx = live.get(k), tr["p"].get(k, {}), owned.get(k)
        base = r or {"n": next((p["name"] for p in board(YEAR)["players"] if key(p["name"]) == k), k)}
        row = {"k": k, "n": base["n"], "rk": r["rk"] if r else None, "pre": pre.get(k), "r": h.get("r", []),
               "s": (r or {}).get("s"), "sh": h.get("s", [])[-12:], "css": tr.get("css", {}).get(k)}
        for f in ("pos", "nat", "ht", "wt", "dob", "lg", "team", "slug", "ls"):
            if r and r.get(f) is not None:
                row[f] = r[f]
        if fx:
            row["fid"], row["gm"] = fx["id"], fx.get("gm")
        rows.append(row)
    items = news.get("items") or {}
    feed = {}
    for c in classes():
        lst = items.get(c["id"])
        if lst:
            feed[c["id"]] = sorted(lst, key=lambda x: (x["d"], x.get("w", 1)), reverse=True)
    out = {"built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "year": YEAR, "fetched": tr.get("fetched"),
           "seeded": tr.get("seeded"), "tkUpdated": tr.get("tkUpdated"), "status": tr.get("status", {}), "rows": rows,
           "news": feed, "newsAsOf": news.get("fetched"), "sources": news.get("sources", [])}
    js = ("/* Draft tracker (tools/research/draft_tracker.py): the 2027 class on Tankathon's board and NHL Central Scouting, "
          "with headlines. Generated nightly; do not edit. */\nwindow.DP=window.DP||{};DP.draft="
          + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    strip = lambda t: re.sub(r'"(built|fetched)":"[^"]*"', "", t)
    old = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if strip(old) != strip(js):   # only the time stamps changed: leave the file alone (no nightly commit for nothing)
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(js)
    n_news = sum(len(v) for v in feed.values())
    print(f"Draft tracker: wrote data/draft.js ({len(rows)} players in the 2027 class, {n_news} headlines for {len(feed)} draft prospects)")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "fetch":
        sys.exit(fetch())
    if cmd == "publish":
        sys.exit(publish())
    rc = fetch()
    sys.exit(publish() or rc)
