#!/usr/bin/env python3
"""Injury report + depth notes (lines, PP units, goalie tandems) for all 32 NHL teams from Daily Faceoff's public
line-combination pages (__NEXT_DATA__ JSON). Writes tools/research/injuries.json and tools/research/depth.json.

Re-run any time during the season: python tools/research/scrape_dfo.py  (pages cached ~12h in tools/cache/web)
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_web import fetch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://www.dailyfaceoff.com/teams/{}/line-combinations"
ABBR_FIX = {"UTAH": "UTA", "UTM": "UTA", "LA": "LAK", "NJ": "NJD", "SJ": "SJS", "TB": "TBL", "VEG": "VGK", "MON": "MTL", "WAS": "WSH", "CLB": "CBJ", "CAL": "CGY", "NAS": "NSH", "WIN": "WPG"}


def page(slug):
    h = fetch(BASE.format(slug), max_age_days=0.5)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    return json.loads(m.group(1))["props"]["pageProps"]


def injury_text(details, name):
    last = name.split()[-1]
    m = re.match(r"\s*" + re.escape(last) + r"\s*\(([^)]+)\)", details or "")
    return m.group(1) if m else ""


SEV = {"OUT": 4, "IR": 4, "Injured reserve": 4, "DTD": 2, "Game-time decision": 1}


def expected_return(details):
    d = (details or "").lower()
    for pat, label in [(r"out for the season|season-ending", "Season"), (r"not expected to be ready for .*opener|miss the season opener|miss the start of the (regular )?season", "Misses opener"),
                       (r"week-to-week", "Week-to-week"), (r"day-to-day", "Day-to-day"), (r"month", "Months"),
                       (r"(will not|won't|not expected to) participate in .*camp|will not be at training camp", "Not in camp"),
                       (r"will skate in .*training camp|participate in training camp|full participant", "In camp")]:
        if re.search(pat, d):
            return label
    return ""


def main():
    first = page("edmonton-oilers")
    teams = first["sortedTeams"]
    injuries, depth = [], {}
    for t in teams:
        slug = t["slug"]
        try:
            pp = first if slug == "edmonton-oilers" else page(slug)
        except Exception as e:
            print("  ! failed", slug, e)
            continue
        c = pp["combinations"]
        abbr = ABBR_FIX.get(c.get("teamAbbreviation"), c.get("teamAbbreviation"))
        url = BASE.format(slug)
        groups = {}
        for p in c["players"]:
            groups.setdefault(p["groupIdentifier"], []).append(p)
        def names(g):
            return [p["name"] for p in groups.get(g, [])]
        depth[abbr] = {"team": c.get("teamName"), "updated": (c.get("updatedAt") or "")[:10], "source": c.get("sourceName"),
                       "url": url, "pp1": names("pp1"), "pp2": names("pp2"), "pk1": names("pk1"), "pk2": names("pk2"),
                       "f1": names("f1"), "f2": names("f2"), "f3": names("f3"), "f4": names("f4"),
                       "d1": names("d1"), "d2": names("d2"), "d3": names("d3"), "goalies": names("g")}
        seen = {}
        for p in c["players"]:
            st = p.get("injuryStatus")
            onIR = p.get("groupIdentifier") in ("ir",) or p.get("categoryName") == "Off Ice"
            if not st and not onIR and not p.get("gameTimeDecision"):
                continue
            news = p.get("latestNews") or {}
            det = news.get("details") or ""
            inj = injury_text(det, p["name"])
            related = bool(inj) or bool(re.search(r"injur|surgery|week|day-to-day|practice|skate|camp|miss", det, re.I))
            status = (st.upper() if st and len(st) <= 3 else (st or ("Injured reserve" if onIR else "Game-time decision")).capitalize())
            rec = {"name": p["name"], "team": abbr, "status": status, "injury": inj,
                   "ret": expected_return(det + " " + (news.get("fantasyDetails") or "")) if related else "",
                   "detail": det.strip() if related else "Listed on Daily Faceoff's injury list; latest news isn't about the absence.",
                   "date": (news.get("createdAt") or "")[:10] if related else (c.get("updatedAt") or "")[:10],
                   "source": "Daily Faceoff", "url": url, "holdout": inj.lower() in ("contract", "holdout")}
            prev = seen.get(p["name"])
            if not prev or SEV.get(rec["status"], 0) > SEV.get(prev["status"], 0):
                seen[p["name"]] = rec
        injuries.extend(seen.values())
    today = dt.date.today().isoformat()
    with open(os.path.join(HERE, "injuries.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": today, "note": "Players listed injured / on injured reserve / game-time decisions on Daily Faceoff team pages (training-camp lines). Expected return is parsed from the latest news blurb when it says so.",
                   "items": sorted(injuries, key=lambda x: (x["team"], x["name"]))}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "depth.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": today, "note": "Projected lines, power-play units and goalie tandems from Daily Faceoff team pages (training camp, subject to change).", "teams": depth}, f, ensure_ascii=False, indent=1)
    print(len(depth), "teams,", len(injuries), "injury entries")


if __name__ == "__main__":
    main()
