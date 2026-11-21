"""Older NHL seasons for the aging curves. Per season: every skater's and goalie's totals from the NHL stats API bulk
reports (the same reports and fields the nightly build reads for its last four seasons), with birth date and position.
Past seasons don't change, so they are fetched once and committed as raw/nhl-history/<season>.json; the nightly build
(write_aging) adds them to its own four seasons. Safe to re-run (cached by tools/nhl_api.py).

    python tools/research/aging_history.py [first_year] [last_year]     (default 2016 2021 -> 2016-17 .. 2021-22)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import nhl_api as API  # noqa: E402
from scoreboard import skater_rows, goalie_rows  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "raw", "nhl-history")
SK_KEYS = ["gp", "pts", "g", "a", "pim", "sog", "stp", "hit", "blk", "tk", "toi", "team"]
G_KEYS = ["gp", "gs", "w", "ga", "sa", "sho", "toi", "team"]


def _row(x, keys):
    return [round(x.get(k) or 0, 2) if isinstance(x.get(k), float) else (x.get(k) if x.get(k) is not None else 0) for k in keys]


def fetch(season):
    reps = {rep: {r["playerId"]: r for r in API.stats_report("skater", rep, season)}
            for rep in ("summary", "realtime", "summaryshooting", "timeonice")}
    sk = skater_rows(reps["summary"], reps["realtime"], reps["summaryshooting"], reps["timeonice"])
    gk = goalie_rows(API.stats_report("goalie", "summary", season))
    bios = {}
    for r in API.stats_report("skater", "bios", season):
        bios[str(r["playerId"])] = [r.get("birthDate"), r.get("positionCode"), r.get("skaterFullName")]
    for r in API.stats_report("goalie", "bios", season):
        bios[str(r["playerId"])] = [r.get("birthDate"), "G", r.get("goalieFullName")]
    return {"season": season, "source": "NHL stats API bulk reports (skater summary, realtime, summaryshooting, timeonice, bios; goalie summary, bios)",
            "fields": {"sk": SK_KEYS, "g": G_KEYS, "bios": ["dob", "pos", "name"]},
            "sk": {str(pid): _row(x, SK_KEYS) for pid, x in sk.items() if x.get("gp")},
            "g": {str(pid): _row(x, G_KEYS) for pid, x in gk.items() if x.get("gp")},
            "bios": bios}


def main():
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 2016
    b = int(sys.argv[2]) if len(sys.argv) > 2 else 2021
    os.makedirs(OUT, exist_ok=True)
    for y in range(a, b + 1):
        season = y * 10000 + y + 1
        doc = fetch(season)
        if len(doc["sk"]) < 500 or len(doc["g"]) < 40:
            print(f"! {season}: only {len(doc['sk'])} skaters / {len(doc['g'])} goalies; not written")
            continue
        path = os.path.join(OUT, f"{season}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, separators=(",", ":"))
        print(f"{season}: {len(doc['sk'])} skaters, {len(doc['g'])} goalies, {len(doc['bios'])} bios -> {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
