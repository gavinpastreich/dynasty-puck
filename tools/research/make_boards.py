#!/usr/bin/env python3
"""Build tools/research/board_2027.json, board_2028.json, board_2029.json.

2027: consensus of Tankathon (stats + bio, 77 players), Daily Faceoff top 32, The Hockey Writers top 32 and
The Hockey News tiers. Consensus score = mean of available ranks (THN tier -> representative rank); lists a
player is missing from count as 40 (Tankathon-only players count their Tankathon rank + 8).
2028/2029: curated from the cited articles and CHL draft results (boards_src.py), ordered as early tiers.
"""
import datetime as dt
import html as H
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_web import fetch  # noqa: E402
import boards_src as S  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("johnny", "john").replace("jr.", "jr").replace("shaeff. ", "shaeffer ")
    return re.sub(r"[^a-z]", "", s)


def pipes(h):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S)
    s = re.sub(r"<[^>]+>", "|", s)
    s = H.unescape(s)
    s = re.sub(r"\s+", " ", s)
    return re.sub(r"\|[ |]*", "|", s)


def tankathon():
    h = fetch("https://www.tankathon.com/nhl/big-board", max_age_days=7)
    upd = re.search(r'<time datetime="([^"]+)"', h)
    rows = re.findall(r'<div class="mock-row nhl" data-pos="([^"]*)">(.*?)(?=<div class="mock-row nhl"|<div class="tier">|$)', h, re.S)
    out = {}
    for pos, body in rows:
        rk = re.search(r'mock-row-pick-number">(\d+)<', body)
        nm = re.search(r'mock-row-name">([^<]+)<', body)
        if not rk or not nm:
            continue
        r = int(rk.group(1))
        if r in out:
            continue
        href = re.search(r'href="(/nhl/players/[^"]+)"', body)
        nat = re.search(r'<img[^>]*alt="([^"]+)"', body)
        ht = re.search(r'class="height">([^<]+)<', body)
        wt = re.search(r'class="weight">([^<]+)<', body)
        yr = re.findall(r'class="(?:year|month)">([^<]+)<', body)
        lg = re.search(r'league-name">([^<]+)<', body)
        sp = re.search(r'mock-row-school-position">([^<]+)<', body)
        born = "".join(yr)
        m = re.match(r"(\d{4})-([A-Z]{3})", born)
        nm_clean = H.unescape(nm.group(1)).strip().replace("Shaeff. ", "Shaeffer ")
        rec = {"tk": r, "name": nm_clean, "pos": pos, "nat": nat.group(1) if nat else None,
               "height": H.unescape(ht.group(1)) if ht else None, "weight": int(wt.group(1)) if wt and wt.group(1).isdigit() else None,
               "dob": f"{m.group(1)}-{MONTHS[m.group(2)]:02d}" if m else None, "league": lg.group(1) if lg else None,
               "school": H.unescape(sp.group(1)).split("|")[-1].strip() if sp else None, "seasons": [], "shoots": None}
        if href:
            try:
                ph = pipes(fetch("https://www.tankathon.com" + href.group(1), max_age_days=7))
                sh = re.search(r"\|(?:Shoots|Catches)\|([LR])\|", ph)
                rec["shoots"] = sh.group(1) if sh else None
                cm = re.search(r"CLUB STATISTICS\|(.*?)(International STATISTICS|\*\|- Very small|Determining the NHL)", ph)
                if cm:
                    toks = cm.group(1).split("|")
                    i = 0
                    while i < len(toks) and not re.match(r"^\d\d-\d\d$", toks[i]):
                        i += 1
                    cur, rws = [], []
                    for t in toks[i:]:
                        if re.match(r"^\d\d-\d\d$", t) and cur:
                            rws.append(cur)
                            cur = []
                        cur.append(t)
                    if cur:
                        rws.append(cur)
                    for rw in rws:
                        rw = [x for x in rw if x != "*"]
                        if len(rw) >= 10 and rec["pos"] != "G" and all(x.replace(".", "").isdigit() for x in (rw[4], rw[5], rw[7], rw[9])):
                            rec["seasons"].append({"season": "20" + rw[0], "team": rw[2], "league": rw[3], "gp": int(rw[4]),
                                                   "g": int(rw[5]), "a": int(rw[7]), "pts": int(rw[9])})
                        elif len(rw) >= 4:
                            rec["seasons"].append({"season": "20" + rw[0], "team": rw[2], "league": rw[3]})
            except Exception as e:  # keep the board even if a page fails
                print("  ! player page", rec["name"], e)
        out[r] = rec
    return [out[k] for k in sorted(out)], (upd.group(1)[:10] if upd else None)


def last_season(rec):
    done = [s for s in rec["seasons"] if s.get("gp") and s["season"] <= "2025-26"]
    if not done:
        return None
    s = done[-1]
    out = {"season": s["season"], "league": s["league"], "team": s["team"], "gp": s["gp"], "g": s["g"], "a": s["a"], "pts": s["pts"]}
    if s["gp"] < 10:
        out["small"] = True  # Tankathon shows one league per season; small samples are flagged in the app
    return out


def current_team(rec):
    cur = [s for s in rec["seasons"] if s["season"] == "2026-27"]
    if cur:
        return cur[-1]["team"], cur[-1]["league"]
    return rec.get("school"), rec.get("league")


def build_2027():
    tk, upd = tankathon()
    by = {norm(r["name"]): r for r in tk}
    names = {norm(n): n for n in S.DFO + S.DFO_ALSO + S.THW}
    for k, n in names.items():
        if k not in by:
            by[k] = {"name": n, "tk": None, "seasons": []}
    thn = {}
    rep = {1: 1, 2: 3.5, 3: 8, 4: 14}
    for tier, lst in S.THN_TIERS.items():
        for n in lst:
            thn[norm(n)] = (tier, rep[tier])
    dfo = {norm(n): i + 1 for i, n in enumerate(S.DFO)}
    for n in S.DFO_ALSO:
        dfo.setdefault(norm(n), 36)
    thw = {norm(n): i + 1 for i, n in enumerate(S.THW)}
    ann = {norm(k): v for k, v in S.A27.items()}
    players = []
    for k, r in by.items():
        ranks, srcs = [], []
        if r.get("tk"):
            ranks.append(r["tk"]); srcs.append({"name": "Tankathon", "rank": r["tk"], "url": S.SRC["TK"]["url"]})
        if k in dfo:
            ranks.append(dfo[k]); srcs.append({"name": "Daily Faceoff", "rank": dfo[k] if dfo[k] <= 32 else None, "url": S.SRC["DFO"]["url"]})
        else:
            ranks.append(40 if not r.get("tk") or r["tk"] <= 40 else r["tk"] + 8)
        if k in thw:
            ranks.append(thw[k]); srcs.append({"name": "The Hockey Writers", "rank": thw[k], "url": S.SRC["THW"]["url"]})
        else:
            ranks.append(40 if not r.get("tk") or r["tk"] <= 40 else r["tk"] + 8)
        if k in thn:
            ranks.append(thn[k][1]); srcs.append({"name": "The Hockey News tier " + str(thn[k][0]), "url": S.SRC["THN"]["url"]})
        score = sum(ranks) / len(ranks)
        a = ann.get(k)
        team, league = current_team(r) if r.get("seasons") else (None, None)
        p = {"name": r["name"], "pos": r.get("pos"), "shoots": r.get("shoots"), "dob": r.get("dob"), "nat": r.get("nat"),
             "height": r.get("height"), "weight": r.get("weight"), "team": team, "league": league,
             "last_season": last_season(r) if r.get("seasons") else None, "score": round(score, 2), "sources": srcs}
        if a:
            p.update({"style": a[0], "cats": a[1], "ceiling": a[2], "comp": a[3], "note": a[4], "tags": a[5]})
        else:
            ls = p["last_season"]
            prof = []
            if ls and ls["gp"]:
                ppg = ls["pts"] / ls["gp"]
                prof.append(f"{ls['pts']} pts in {ls['gp']} {ls['league']} GP ({ppg:.2f}/gm) in {ls['season']}")
            d = (p["pos"] or "") in ("LD", "RD", "D")
            p.update({"style": "Offensive D" if d else ("Goalie" if p["pos"] == "G" else "Forward"),
                      "cats": ["Pt-D", "A"] if d else (["SV%", "W"] if p["pos"] == "G" else ["G", "A"]),
                      "ceiling": "TBD", "comp": "",
                      "note": "Tankathon-ranked; no scouting write-up collected yet. " + ("; ".join(prof) + "." if prof else ""),
                      "tags": ["stats-only"]})
        players.append(p)
    players.sort(key=lambda p: (p["score"], p["sources"][0].get("rank") or 99))
    for i, p in enumerate(players):
        p["rank"] = i + 1
    players = players[:72]
    return {"year": 2027, "updated": dt.date.today().isoformat(),
            "note": "Consensus of four public boards: Tankathon (updated " + (upd or "2026-09") + "), Daily Faceoff (July), The Hockey Writers (Sep 7) and The Hockey News tiers (Sep 18). Score = average rank across sources; missing lists count as 40. EliteProspects blocks automated access, so its lists aren't included.",
            "sources": [S.SRC[k] for k in ("TK", "DFO", "THW", "THN", "THN10", "THWH")], "players": players}


def build_fixed(year, rows, sources, note):
    out = []
    for r in rows:
        rank, name, pos, team, stats, style, cats, ceil, comp, notex, srcs, tags = r
        ls = None
        if stats:
            ls = dict(stats)
        m = re.match(r"(.+) \((.+)\)$", team)
        out.append({"rank": rank, "name": name, "pos": pos, "team": m.group(1) if m else team, "league": m.group(2) if m else None,
                    "last_season": ls, "style": style, "cats": cats, "ceiling": ceil, "comp": comp, "note": notex,
                    "tags": tags, "sources": [{"name": s} for s in srcs]})
    return {"year": year, "updated": dt.date.today().isoformat(), "note": note, "sources": sources, "players": out}


def main():
    b27 = build_2027()
    b28 = build_fixed(2028, S.B28, S.B28_SOURCES,
                      "Early 2028 tiers (two years out). Built from Daily Faceoff's 15 players to know, NHL.com and THW coverage of Maddox Schultz, and the first rounds of the 2025 WHL (2010-born), 2026 OHL and 2026 QMJHL drafts. Order past the top ~15 is approximate.")
    b29 = build_fixed(2029, S.B29, S.B29_SOURCES,
                      "Very early 2029 watch list (three years out). Led by 2026 WHL first-overall pick Madden Daneault and OHL exceptional-status D Kade O'Rourke, then the 2026 WHL Prospects Draft first round (2011-born). The OHL's 2011-born draft happens in spring 2027.")
    for y, b in ((2027, b27), (2028, b28), (2029, b29)):
        with open(os.path.join(HERE, f"board_{y}.json"), "w", encoding="utf-8") as f:
            json.dump(b, f, ensure_ascii=False, indent=1)
        print(y, len(b["players"]), "players")
    for p in b27["players"][:40]:
        print(p["rank"], p["name"], p["score"], [s.get("rank") for s in p["sources"]], p.get("last_season"))


if __name__ == "__main__":
    main()
