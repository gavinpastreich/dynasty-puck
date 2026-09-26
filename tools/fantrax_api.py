"""Fantrax sync for Dynasty Puck (league cbufqc8umo5xrjzu) via Fantrax's public read-only API.

Endpoints (no login needed for this league; verified 2026-09-26):
  /fxea/general/getLeagueInfo?leagueId=    teams + divisions, H2H matchups by period, lock times, roster rules
  /fxea/general/getTeamRosters?leagueId=   every rostered player: Fantrax id, slot, contract type, salary
  /fxea/general/getDraftPicks?leagueId=    future league draft picks: current + original owner
  /fxea/general/getStandings?leagueId=     category W-L-T, rank, games back
  /fxea/general/getPlayerIds?sport=NHL     Fantrax id -> name, NHL team, position (for players added after the CSV exports)

sync() writes a committed snapshot to raw/2026-27/fantrax/snapshot.json (so offline builds reproduce the
same data) and appends roster changes versus the previous snapshot to raw/2026-27/fantrax/moves.json.
"""
import datetime as dt
import json
import os
import urllib.request

import nhl_api as API

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(os.path.dirname(HERE), "config", "league.json"), encoding="utf-8") as _f:
    _CFG = json.load(_f)
LEAGUE_ID = _CFG.get("fantraxLeagueId", "cbufqc8umo5xrjzu")
BASE = "https://www.fantrax.com/fxea/general/"
LEAGUE_URL = f"https://www.fantrax.com/fantasy/league/{LEAGUE_ID}/home"
DIR = os.path.join(os.path.dirname(HERE), *_CFG.get("rawFolder", "raw/2026-27").split("/"), "fantrax")
SNAP = os.path.join(DIR, "snapshot.json")
MOVES = os.path.join(DIR, "moves.json")
SLOT = {"ACTIVE": "A", "RESERVE": "R", "MINORS": "M", "INJURED_RESERVE": "IR"}


def _fetch(ep):
    req = urllib.request.Request(BASE + ep, headers={"User-Agent": API.UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def _load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def _ts(s):
    s = s.replace(".0-", "-").replace(".0+", "+")
    return dt.datetime.strptime(s, "%Y-%m-%dT%H:%M:%S%z")


def next_lock_period(periods, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    for p in periods:
        if _ts(p["startDate"]) > now:
            return p["number"]
    return periods[-1]["number"] if periods else None


def current_period(periods, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    cur = None
    for p in periods:
        if _ts(p["startDate"]) <= now:
            cur = p["number"]
    return cur


def fetch_snapshot():
    """Pull the live league state from Fantrax and reduce it to what the build needs."""
    info = _fetch(f"getLeagueInfo?leagueId={LEAGUE_ID}")
    period = next_lock_period(info.get("rosterPeriods", []))
    # the roster for the next lineup lock = the lineups teams have set and can still change
    rosters = _fetch(f"getTeamRosters?leagueId={LEAGUE_ID}" + (f"&period={period}" if period else ""))
    # the period being played right now (weekly lock): whoever is Active there is scoring this week
    cur = current_period(info.get("rosterPeriods", []))
    cur_rosters = _fetch(f"getTeamRosters?leagueId={LEAGUE_ID}&period={cur}") if cur and cur != period else None
    picks = _fetch(f"getDraftPicks?leagueId={LEAGUE_ID}")
    standings = _fetch(f"getStandings?leagueId={LEAGUE_ID}")
    ids = API.get(BASE + "getPlayerIds?sport=NHL", "fantrax_player_ids", max_age_days=1)
    short = {}  # Fantrax team id -> shortName (= the GM code used everywhere in the app)
    for per in info.get("matchups", []):
        for m in per.get("matchupList", []):
            for side in ("away", "home"):
                t = m.get(side) or {}
                if t.get("id") and t.get("shortName"):
                    short[t["id"]] = t["shortName"]
    teams = {tid: {"code": short.get(tid), "name": t.get("name"), "div": t.get("division")}
             for tid, t in (info.get("teamInfo") or {}).items()}
    code = lambda tid: (teams.get(tid) or {}).get("code") or tid
    ros, names = {}, {}
    for tid, t in (rosters.get("rosters") or {}).items():
        for it in t.get("rosterItems", []):
            ros[it["id"]] = {"gm": code(tid), "ct": (it.get("contract") or {}).get("name") or "",
                             "sal": int(round(float(it.get("salary") or 0))), "slot": SLOT.get(it.get("status"), it.get("status")),
                             "pos": it.get("position")}
            meta = (ids or {}).get(it["id"])
            if meta:
                names[it["id"]] = {"n": meta.get("name"), "t": meta.get("team"), "pos": meta.get("position")}
    pinfo = info.get("playerInfo") or {}
    elig = {pid: v["eligiblePos"] for pid, v in pinfo.items() if "," in (v.get("eligiblePos") or "")}  # multi-position only
    waivers = sorted(pid for pid, v in pinfo.items() if v.get("status") == "WW")
    st = []
    for r in standings if isinstance(standings, list) else []:
        w, l, t = ([int(x) for x in str(r.get("points", "0-0-0")).split("-")] + [0, 0, 0])[:3]
        st.append({"t": code(r.get("teamId")), "rank": r.get("rank"), "W": w, "L": l, "T": t,
                   "gb": r.get("gamesBack"), "pct": r.get("winPercentage")})
    periods = [{"n": p["number"], "start": p["startDate"], "end": p["endDate"]} for p in info.get("rosterPeriods", [])]
    fut = [{"year": p["year"], "round": p["round"], "orig": code(p["originalOwnerTeamId"]), "owner": code(p["currentOwnerTeamId"])}
           for p in picks.get("futureDraftPicks", [])]
    current = None
    if cur_rosters:
        current = {"period": cur, "active": {}}
        for tid, t in (cur_rosters.get("rosters") or {}).items():
            current["active"][code(tid)] = sorted(it["id"] for it in t.get("rosterItems", []) if it.get("status") == "ACTIVE")
    return {
        "fetched": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "period": rosters.get("period"), "current": current,
        "league": {"id": LEAGUE_ID, "name": info.get("leagueName"), "url": LEAGUE_URL, "season": info.get("seasonYear"),
                   "start": info.get("startDate"), "end": info.get("endDate"), "playoffs": info.get("playoffs"),
                   "roster": info.get("rosterInfo")},
        "teams": teams, "periods": periods, "rosters": ros, "names": names, "elig": elig, "waivers": waivers,
        "picks": sorted(fut, key=lambda p: (p["year"], p["round"], p["orig"])), "standings": st,
    }


def diff_moves(old, new, when):
    """Roster events between two snapshots: add / drop / trade-or-claim move / contract or salary change."""
    ev = []
    a, b = (old or {}).get("rosters", {}), new.get("rosters", {})
    for pid in sorted(set(a) | set(b)):
        x, y = a.get(pid), b.get(pid)
        if x and not y:
            ev.append({"d": when, "id": pid, "type": "drop", "from": x["gm"], "ct": x["ct"], "sal": x["sal"]})
        elif y and not x:
            ev.append({"d": when, "id": pid, "type": "add", "to": y["gm"], "ct": y["ct"], "sal": y["sal"]})
        elif x["gm"] != y["gm"]:
            ev.append({"d": when, "id": pid, "type": "move", "from": x["gm"], "to": y["gm"], "ct": y["ct"], "sal": y["sal"]})
        elif x["ct"] != y["ct"] or x["sal"] != y["sal"]:
            ev.append({"d": when, "id": pid, "type": "contract", "to": y["gm"], "ct": y["ct"], "sal": y["sal"],
                       "was": [x["ct"], x["sal"]]})
    # draft picks changing hands (only happens in trades)
    op = {(p["year"], p["round"], p["orig"]): p["owner"] for p in (old or {}).get("picks", [])}
    for p in new.get("picks", []):
        k = (p["year"], p["round"], p["orig"])
        if k in op and op[k] != p["owner"]:
            ev.append({"d": when, "id": f"pick-{k[0]}-{k[1]}-{k[2]}", "type": "pick", "year": k[0], "round": k[1],
                       "orig": k[2], "from": op[k], "to": p["owner"]})
    return ev


def sync(offline=False, log=print):
    """Return the league snapshot (live if reachable, else the committed one) and the moves log."""
    prev = _load(SNAP, None)
    moves = _load(MOVES, [])
    if offline or API.OFFLINE:
        if prev:
            log(f"Fantrax: offline, using snapshot from {prev['fetched']}")
        return prev, moves
    try:
        snap = fetch_snapshot()
    except Exception as e:  # Fantrax down or the league went private: keep the last good snapshot
        log(f"  ! Fantrax sync failed ({e}); using snapshot from {prev['fetched'] if prev else 'never'}")
        return prev, moves
    if prev:
        new = diff_moves(prev, snap, snap["fetched"][:10])
        # carry names for players who left the league so the log can still show them
        for e in new:
            if e["type"] != "pick" and e["id"] not in snap["names"] and e["id"] in prev.get("names", {}):
                e["n"] = prev["names"][e["id"]]["n"]
        if new:
            log(f"Fantrax: {len(new)} roster changes since {prev['fetched']}")
            moves.extend(new)
    os.makedirs(DIR, exist_ok=True)
    with open(SNAP, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=0, sort_keys=True)
    with open(MOVES, "w", encoding="utf-8") as f:
        json.dump(moves, f, indent=0)
    log(f"Fantrax: synced {len(snap['rosters'])} rostered players, {len(snap['picks'])} future picks, "
        f"{len(snap['standings'])} teams in standings")
    return snap, moves
