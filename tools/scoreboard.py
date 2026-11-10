#!/usr/bin/env python3
"""Weekly category results from Fantrax lineups x NHL stats.

  scoreboard()  the fantasy week being played: category totals so far for each team's locked (Active) lineup.
                Finished days come from the NHL stats API (exact); the game day in progress comes from the NHL
                live feeds (box score + play-by-play + shift charts), so the numbers move while games are on.
  history()     every finished week, saved to raw/<season>/weekly/week_NN.json so builds reproduce offline.

Lineups lock weekly, and Fantrax's public API returns the locked lineup of any period, so both are a straight
lookup: who was Active that week x what those players did in NHL games that week. Checked against the Fantrax
standings after six weeks: 99% of category decisions agree (the misses are near-ties in Cor, which is estimated).

Used by build_data.py (nightly). Run directly for the small live file, without a full data build:
    python tools/scoreboard.py --out score.json                 one pass
    python tools/scoreboard.py --session --out score.json --publish "bash tools/live_publish.sh score.json"
                                                    the GitHub Action "Live scoreboard": stays up for the game night
    DP_NOW=2026-11-05T02:30:00Z python tools/scoreboard.py --out /tmp/x.json    (pretend it is another time)
"""
import datetime as dt
import json
import os
import re
import sys
from collections import defaultdict

import nhl_api as API

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SK_REPORTS = ("summary", "realtime", "summaryshooting", "timeonice")
TOT_KEYS = ("PtD", "G", "A", "GA2", "PIM", "SOG", "STP", "Hit", "Blk", "Tk", "Cor", "W", "GA", "SA", "SHO", "GGP", "GTOI", "SGP")
STARTED = ("LIVE", "CRIT", "FINAL", "OFF")   # NHL gameState values for a game that has begun
DONE = ("FINAL", "OFF")
DAY_ROLLOVER_H = 4   # the "game day" runs until 4 AM Eastern, so late West-coast games stay on their own day
ET = dt.timezone(dt.timedelta(hours=-5))   # only used to pick calendar days; the hour of DST drift doesn't matter


def now_utc():
    s = os.environ.get("DP_NOW")
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")) if s else dt.datetime.now(dt.timezone.utc)


def game_day(now):
    """The NHL calendar day whose games are 'tonight' (Eastern, rolling over at 4 AM)."""
    return (now.astimezone(ET) - dt.timedelta(hours=DAY_ROLLOVER_H)).date()


# ----------------------------------------------------------------------------- NHL stats rows
def skater_rows(summ, real, shot, toi):
    out = {}
    for pid, r in summ.items():
        re_, sh, ti = real.get(pid, {}), shot.get(pid, {}), toi.get(pid, {})
        out[pid] = {
            "gp": r["gamesPlayed"], "g": r["goals"], "a": r["assists"], "pts": r["points"],
            "pim": r["penaltyMinutes"], "sog": r["shots"],
            "stp": (r.get("ppPoints") or 0) + (r.get("shPoints") or 0),
            "hit": re_.get("hits") or 0, "blk": re_.get("blockedShots") or 0, "tk": re_.get("takeaways") or 0,
            "gv": re_.get("giveaways") or 0,
            "sat": sh.get("satTotal") or 0, "satf": sh.get("satFor") or 0, "sata": sh.get("satAgainst") or 0,
            "pp": (ti.get("ppTimeOnIce") or 0) / 60.0, "shtoi": (ti.get("shTimeOnIce") or 0) / 60.0,
            "toi": (ti.get("timeOnIce") or 0) / 60.0, "team": r.get("teamAbbrevs"), "pos": r.get("positionCode"),
        }
    return out


def goalie_rows(gsum):
    return {r["playerId"]: {"gp": r["gamesPlayed"], "gs": r.get("gamesStarted"), "w": r["wins"],
                            "ga": r["goalsAgainst"], "sa": r["shotsAgainst"], "sho": r["shutouts"],
                            "gaa": r["goalsAgainstAverage"], "sv": r["savePct"], "toi": (r.get("timeOnIce") or 0) / 60.0,
                            "team": r.get("teamAbbrevs")} for r in gsum}


def range_stats(start, end, max_age_days=0.02):
    """Per-player totals over start..end (inclusive) from the NHL stats API."""
    reps = {rep: {r["playerId"]: r for r in API.range_report("skater", rep, start, end, max_age_days=max_age_days)} for rep in SK_REPORTS}
    return (skater_rows(reps["summary"], reps["realtime"], reps["summaryshooting"], reps["timeonice"]),
            goalie_rows(API.range_report("goalie", "summary", start, end, max_age_days=max_age_days)))


# ----------------------------------------------------------------------------- Fantrax lineups
def period_lineups(period, teams, snap=None):
    """{team code: [(fantrax id, slot position F/D/G)]} for the Active slots of a Fantrax period (the locked lineup)."""
    import fantrax_api as FX
    code = lambda tid: (teams.get(tid) or {}).get("code") or tid
    if not API.OFFLINE:
        try:
            d = FX._fetch(f"getTeamRosters?leagueId={FX.LEAGUE_ID}&period={period}")
            out = {code(tid): [(it["id"], it.get("position")) for it in t.get("rosterItems", []) if it.get("status") == "ACTIVE"]
                   for tid, t in (d.get("rosters") or {}).items()}
            if out and any(out.values()):
                return out
        except Exception as e:
            print(f"  ! Fantrax lineups for period {period} failed: {e}")
    cur = (snap or {}).get("current") or {}
    if cur.get("period") == period and cur.get("active"):   # the nightly snapshot kept the ids (no slot positions)
        return {c: [(fid, None) for fid in ids] for c, ids in cur["active"].items()}
    return None


# ----------------------------------------------------------------------------- live game day
def _sec(t):
    try:
        m, s = str(t).split(":")
        return int(m) * 60 + int(s)
    except Exception:
        return 0


def _fresh(url, key):
    return API.get(url, key, max_age_days=0)


def live_game(gid, cor_k):
    """Per-player lines for one started game from the live feeds. Skaters: g a pim sog stp hit blk tk cor;
    goalies: w ga sa sho toi. Cor is the 5v5 on-ice shot-attempt differential rebuilt from play-by-play and shift
    charts (x the model's SAT coefficient): an estimate that the stats API replaces the next morning."""
    box = _fresh(f"{API.WEB}/gamecenter/{gid}/boxscore", f"live_box_{gid}")
    if not box or "playerByGameStats" not in box:
        return None
    pbp = _fresh(f"{API.WEB}/gamecenter/{gid}/play-by-play", f"live_pbp_{gid}") or {}
    final = box.get("gameState") in DONE
    away_id, home_id = (pbp.get("awayTeam") or box.get("awayTeam") or {}).get("id"), (pbp.get("homeTeam") or box.get("homeTeam") or {}).get("id")
    sk, gk, team_of = {}, {}, {}
    for side, tid in (("awayTeam", away_id), ("homeTeam", home_id)):
        st = box["playerByGameStats"].get(side) or {}
        for grp in ("forwards", "defense"):
            for r in st.get(grp, []):
                if _sec(r.get("toi")) <= 0:
                    continue
                team_of[r["playerId"]] = tid
                sk[r["playerId"]] = {"gp": 1, "g": r.get("goals") or 0, "a": r.get("assists") or 0, "pim": r.get("pim") or 0,
                                     "sog": r.get("sog") or 0, "stp": 0, "hit": r.get("hits") or 0, "blk": r.get("blockedShots") or 0,
                                     "tk": r.get("takeaways") or 0, "cor": None}
        played = [g for g in st.get("goalies", []) if _sec(g.get("toi")) > 0]
        for g in played:
            ga = g.get("goalsAgainst") or 0
            gk[g["playerId"]] = {"gp": 1, "w": 1 if g.get("decision") == "W" else 0, "ga": ga, "sa": g.get("shotsAgainst") or 0,
                                 "sho": 1 if final and ga == 0 and len(played) == 1 else 0, "toi": _sec(g.get("toi")) / 60.0}
    # special-teams points: a goal scored with more players on the ice than the other side is a PP goal, fewer = SH
    plays = pbp.get("plays") or []
    for e in plays:
        if e.get("typeDescKey") != "goal" or (e.get("periodDescriptor") or {}).get("periodType") == "SO":
            continue
        sc, d = str(e.get("situationCode") or ""), e.get("details") or {}
        if len(sc) != 4 or not sc.isdigit():
            continue
        away_n, home_n = int(sc[0]) + int(sc[1]), int(sc[2]) + int(sc[3])
        mine, theirs = (away_n, home_n) if d.get("eventOwnerTeamId") == away_id else (home_n, away_n)
        if mine == theirs:
            continue
        for k in ("scoringPlayerId", "assist1PlayerId", "assist2PlayerId"):
            if d.get(k) in sk:
                sk[d[k]]["stp"] += 1
    # Cor: 5v5 shot attempts for minus against while each skater is on the ice
    shifts = None
    try:
        sd = _fresh(f"{API.STATS}/shiftcharts?cayenneExp=gameId={gid}", f"live_shifts_{gid}")
        rows = [r for r in (sd or {}).get("data", []) if r.get("typeCode") == 517 and r.get("startTime") and r.get("endTime")]
        if len(rows) > 40:
            shifts = defaultdict(list)
            for r in rows:
                shifts[r["playerId"]].append((r["period"], _sec(r["startTime"]), _sec(r["endTime"])))
    except Exception:
        shifts = None
    if shifts:
        last = max((p, b) for lst in shifts.values() for p, a, b in lst)   # shift data can trail the play-by-play
        sat = defaultdict(int)
        for e in plays:
            if e.get("typeDescKey") not in ("shot-on-goal", "missed-shot", "blocked-shot", "goal") or e.get("situationCode") != "1551":
                continue
            pd = e.get("periodDescriptor") or {}
            if pd.get("periodType") == "SO":
                continue
            per, t, d = pd.get("number"), _sec(e.get("timeInPeriod")), e.get("details") or {}
            if (per, t) > last:
                continue
            st = team_of.get(d.get("shootingPlayerId") or d.get("scoringPlayerId")) or d.get("eventOwnerTeamId")
            for pid in sk:
                if any(pp == per and a < t <= b for pp, a, b in shifts.get(pid, ())):
                    sat[pid] += 1 if team_of[pid] == st else -1
        for pid in sk:
            sk[pid]["cor"] = cor_k * sat[pid]
    return {"sk": sk, "gk": gk, "cor": bool(shifts)}


def live_day(day, cor_k, cache=None, now=None):
    """Everything started on one NHL game day: per-player lines plus the state of each game. `cache` (a dict kept by
    the long-running live job) holds finished games so they are not downloaded again every few minutes; a game is
    re-read for 20 minutes after it goes final, because the scorers still correct things."""
    d = _fresh(f"{API.WEB}/score/{day}", f"live_score_{day}")
    games, left, sk, gk, cor_ok = [], {}, {}, {}, True
    now = now or now_utc()
    for g in (d or {}).get("games", []):
        if g.get("gameType") not in (2, 3):
            continue
        a, h, st = g["awayTeam"]["abbrev"], g["homeTeam"]["abbrev"], g.get("gameState")
        if g.get("gameScheduleState") not in (None, "OK"):   # postponed / cancelled: not happening today
            continue
        row = {"id": g["id"], "a": a, "h": h, "as": g["awayTeam"].get("score"), "hs": g["homeTeam"].get("score"),
               "start": g.get("startTimeUTC"), "st": "final" if st in DONE else "live" if st in STARTED else "pre"}
        if st in STARTED:
            pd, ck = g.get("periodDescriptor") or {}, g.get("clock") or {}
            per = pd.get("number") or 1
            if st in DONE:
                frac = 0.0
                row["note"] = "Final" + ("/OT" if pd.get("periodType") == "OT" else "/SO" if pd.get("periodType") == "SO" else "")
            else:
                elapsed = min(60.0, (min(per, 3) - 1) * 20 + (20 - (ck.get("secondsRemaining") or 0) / 60.0)) if per <= 3 else 60.0
                frac = max(0.0, round(1 - elapsed / 60.0, 3))
                row["note"] = ("OT" if per == 4 else "SO" if per > 4 else f"P{per}") + (" int" if ck.get("inIntermission") else f" {ck.get('timeRemaining', '')}".rstrip())
            left[a] = left[h] = frac
            c = cache.get(g["id"]) if cache is not None else None
            if st in DONE and c and (now - c["final_at"]).total_seconds() > 1200 and (c["at"] - c["final_at"]).total_seconds() > 900:
                lg = c["lg"]
            else:
                lg = live_game(g["id"], cor_k)
                if cache is not None and lg and st in DONE:
                    cache[g["id"]] = {"lg": lg, "at": now, "final_at": c["final_at"] if c else now}
            if lg:
                sk.update(lg["sk"]); gk.update(lg["gk"]); cor_ok = cor_ok and lg["cor"]
                row["box"] = True
        games.append(row)
    return {"date": str(day), "games": games, "left": left, "sk": sk, "gk": gk, "cor": cor_ok}


# ----------------------------------------------------------------------------- team totals
def team_totals(lineup, lookup, sk, gk, cor_est, live=None):
    """lineup: [(fantrax id, slot position)]. lookup(fantrax id) -> (app id, NHL id, is_goalie, is_defense) or None.
    Adds the live game-day lines (if any) on top of the finished days."""
    lsk, lgk = (live or {}).get("sk") or {}, (live or {}).get("gk") or {}
    tot, pl, on = {k: 0.0 for k in TOT_KEYS}, {}, []
    for fid, slot in lineup:
        who = lookup(fid)
        if not who or not who[1]:
            continue
        pid, nhl, is_g, is_d = who
        if is_g:
            h, lv = gk.get(nhl), lgk.get(nhl)
            if not ((h and h["gp"]) or lv):
                continue
            line = [0, 0, 0, 0, 0, 0.0]
            for src in (h, lv):
                if src and src["gp"]:
                    for i, k in enumerate(("gp", "w", "ga", "sa", "sho", "toi")):
                        line[i] += src[k]
            tot["W"] += line[1]; tot["GA"] += line[2]; tot["SA"] += line[3]; tot["SHO"] += line[4]
            tot["GGP"] += line[0]; tot["GTOI"] += line[5]
            line[5] = round(line[5], 1)
        else:
            h, lv = sk.get(nhl), lsk.get(nhl)
            if not ((h and h["gp"]) or lv):
                continue
            line = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0]
            if h and h["gp"]:
                for i, k in enumerate(("gp", "g", "a", "pim", "sog", "stp", "hit", "blk", "tk")):
                    line[i] += h[k]
                line[9] += cor_est(h)
            if lv:
                for i, k in enumerate(("gp", "g", "a", "pim", "sog", "stp", "hit", "blk", "tk")):
                    line[i] += lv[k]
                line[9] += lv["cor"] or 0.0
            if slot == "D" or (slot is None and is_d):   # Pt-D counts points from the D slots
                tot["PtD"] += line[1] + line[2]
            for k, v in zip(("G", "A", "PIM", "SOG", "STP", "Hit", "Blk", "Tk", "Cor"), line[1:]):
                tot[k] += v
            tot["GA2"] += 2 * line[1] + line[2]; tot["SGP"] += line[0]
            line[9] = round(line[9], 1)
        if lv:
            on.append(pid)
        pl[pid] = line
    return {"tot": {k: round(v, 2) for k, v in tot.items()}, "pl": pl, "active": [lookup(f)[0] for f, _ in lineup if lookup(f)]}, on


# ----------------------------------------------------------------------------- the week in progress
def current_week(weeks, now):
    cur = [w for w in weeks if w.get("lock") and dt.datetime.fromisoformat(w["lock"]) <= now]
    return cur[-1] if cur else None


def scoreboard(weeks, lookup, cor_model, teams, snap=None, now=None, log=print, cache=None):
    """Category totals so far in the fantasy week being played (None before the first lock). `cache` = a dict the
    long-running live job passes in to reuse lineups and finished games between passes."""
    now = now or now_utc()
    w = current_week(weeks, now)
    if not w:
        if weeks and not any(x.get("lock") for x in weeks):
            log("  ! Scoreboard: no lineup-lock times on the weeks (Fantrax periods missing), so no week can be scored")
        return None
    cor_est = lambda h: cor_model[0] * h["sat"] + cor_model[1] * h["pp"] + cor_model[2] * h["shtoi"] + cor_model[3] * h["gp"]
    day = game_day(now)
    last_done = min(dt.date.fromisoformat(w["end"]), day - dt.timedelta(days=1))   # finished days: exact stats
    start = dt.date.fromisoformat(w["start"])
    if cache is not None and cache.get("lineups", {}).get("n") == w["n"]:   # locked for the week: one download is enough
        lineups = cache["lineups"]["v"]
    else:
        lineups = period_lineups(w["n"], teams, snap)
        if cache is not None and lineups:
            cache["lineups"] = {"n": w["n"], "v": lineups}
    base = {"week": w["n"], "from": w["start"], "to": None, "asOf": now.isoformat(timespec="minutes"), "test": bool(os.environ.get("DP_NOW")),
            "period": w["n"], "final": day > dt.date.fromisoformat(w["end"]), "live": None, "teams": {},
            "corNote": "Cor estimated from NHL shot attempts (model, R² 0.975 vs Fantrax)"}
    if not lineups:
        log(f"  ! Scoreboard: no Fantrax lineups for period {w['n']}")
        return base
    sk, gk = {}, {}
    if last_done >= start:
        sk, gk = range_stats(w["start"], str(last_done), max_age_days=0.25 if base["final"] else 0.02)
        base["to"] = str(last_done)
    live = None
    if start <= day <= dt.date.fromisoformat(w["end"]) and not API.OFFLINE:
        try:
            live = live_day(day, cor_model[0], cache.setdefault("games", {}) if cache is not None else None, now)
        except Exception as e:   # the live feeds are a bonus: never lose the finished days over them
            log(f"  ! Scoreboard: live feeds failed ({e}); showing finished days only")
            live = None
        if live and not live["games"]:
            live = None
    on_all = []
    for code, lu in lineups.items():
        t, on = team_totals(lu, lookup, sk, gk, cor_est, live)
        base["teams"][code] = t
        on_all += on
    if live:
        base["live"] = {"date": live["date"], "games": live["games"], "left": live["left"], "on": sorted(set(on_all)),
                        "corEst": True, "corOk": live["cor"]}
        if live["games"] and all(g["st"] == "final" for g in live["games"]) and live["date"] == w["end"]:
            base["final"] = True
    n_live = sum(1 for g in (live or {}).get("games", []) if g["st"] == "live")
    log(f"Scoreboard: week {w['n']} {w['start']}..{base['to'] or '-'}" + (f" + live {live['date']} ({len(live['games'])} games, {n_live} in progress)" if live else "") +
        ": " + ", ".join(f"{c} {int(t['tot']['SGP'])} skater GP" for c, t in list(base["teams"].items())[:4]) + " …")
    return base


# ----------------------------------------------------------------------------- finished weeks
def history(weeks, lookup, cor_model, teams, snap=None, now=None, raw_dir=None, log=print):
    """[{n, from, to, final, teams: {code: totals}}] for every finished week. A week's file is recomputed until two
    days after it ends (stat corrections), then frozen."""
    now = now or now_utc()
    cur = current_week(weeks, now)
    if not cur:
        return []
    day = game_day(now)
    cor_est = lambda h: cor_model[0] * h["sat"] + cor_model[1] * h["pp"] + cor_model[2] * h["shtoi"] + cor_model[3] * h["gp"]
    if not raw_dir:
        with open(os.path.join(ROOT, "config", "league.json"), encoding="utf-8") as f:
            raw_dir = os.path.join(ROOT, *json.load(f).get("rawFolder", "raw/2026-27").split("/"), "weekly")
    out = []
    for w in weeks:
        end = dt.date.fromisoformat(w["end"])
        if not w.get("lock") or end >= day or w["n"] > cur["n"]:
            continue
        path = os.path.join(raw_dir, f"week_{w['n']:02d}.json")
        rec = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                rec = json.load(f)
        if not (rec and rec.get("final")) and not API.OFFLINE:
            lineups = period_lineups(w["n"], teams, snap)
            if lineups:
                sk, gk = range_stats(w["start"], w["end"], max_age_days=0.25)
                if sk:
                    rec = {"n": w["n"], "from": w["start"], "to": w["end"], "final": (day - end).days >= 3,
                           "computed": now.isoformat(timespec="minutes"),
                           "teams": {c: team_totals(lu, lookup, sk, gk, cor_est)[0] for c, lu in lineups.items()}}
                    os.makedirs(raw_dir, exist_ok=True)
                    with open(path, "w", encoding="utf-8") as f:
                        json.dump(rec, f, separators=(",", ":"), sort_keys=True)
        if rec:
            out.append({"n": rec["n"], "from": rec["from"], "to": rec["to"], "final": bool(rec.get("final")),
                        "teams": {c: t["tot"] for c, t in rec["teams"].items()}})
    if out:
        log(f"Weekly history: {len(out)} finished weeks ({sum(1 for x in out if x['final'])} frozen) in {os.path.relpath(raw_dir, ROOT)}")
    return out


# ----------------------------------------------------------------------------- standalone (live Action)
def _published():
    """Players, weeks and the Cor model from the published data file, so the live job needs no full build."""
    with open(os.path.join(ROOT, "data", "league.js"), encoding="utf-8") as f:
        src = f.read()
    meta = json.loads(re.search(r"DP\.meta=(\{.*?\});\n", src, re.S).group(1))
    players = json.loads(re.search(r"DP\.players=(\[.*?\]);\n", src, re.S).group(1))
    by_fid = {p["id"].strip("*"): (p["id"], p.get("nhl"), p.get("pos") == "G", p.get("pos") == "D") for p in players}
    with open(os.path.join(ROOT, "config", "league.json"), encoding="utf-8") as f:
        raw = json.load(f).get("rawFolder", "raw/2026-27")
    snap_path = os.path.join(ROOT, *raw.split("/"), "fantrax", "snapshot.json")
    snap = {}
    if os.path.exists(snap_path):
        with open(snap_path, encoding="utf-8") as f:
            snap = json.load(f)
    return meta, by_fid, snap


def _write_if_changed(sc, out):
    prev = None
    if os.path.exists(out):
        try:
            with open(out, encoding="utf-8") as f:
                prev = json.load(f)
        except Exception:
            prev = None
    if prev is not None and {k: v for k, v in prev.items() if k != "asOf"} == {k: v for k, v in sc.items() if k != "asOf"}:
        return False
    with open(out, "w", encoding="utf-8") as f:
        json.dump(sc, f, separators=(",", ":"))
    return True


def next_puck_drop(sc, now):
    """Start time of the next NHL game that hasn't begun: tonight's from the scoreboard, otherwise from the schedule."""
    starts = []
    for g in ((sc or {}).get("live") or {}).get("games") or []:
        if g["st"] == "pre" and g.get("start"):
            try:
                starts.append(dt.datetime.fromisoformat(g["start"].replace("Z", "+00:00")))
            except ValueError:
                pass
    if not starts:
        day = game_day(now)
        d = API.get(f"{API.WEB}/schedule/{day}", f"live_sched_{day}", max_age_days=0.02) or {}
        for wk in d.get("gameWeek", []):
            for g in wk.get("games", []):
                if g.get("gameType") in (2, 3) and g.get("gameScheduleState") in (None, "OK") and g.get("gameState") in ("FUT", "PRE") and g.get("startTimeUTC"):
                    try:
                        t = dt.datetime.fromisoformat(g["startTimeUTC"].replace("Z", "+00:00"))
                    except ValueError:
                        continue
                    if t > now - dt.timedelta(minutes=20):
                        starts.append(t)
    return min(starts) if starts else None


def plan(sc, now, horizon=9 * 3600):
    """What the live job should do after a pass: ('poll', 0) while games are on or about to start, ('wait', s) until
    the next puck drop if that is within `horizon` seconds, else ('done', 0)."""
    if any(g["st"] == "live" for g in ((sc or {}).get("live") or {}).get("games") or []):
        return "poll", 0
    nxt = next_puck_drop(sc, now)
    if nxt is None:
        return "done", 0
    wait = (nxt - now).total_seconds() - 240   # be there four minutes before the puck drops
    if wait <= 0:
        return "poll", 0   # about to start (or started and the feed hasn't flipped to LIVE yet)
    return ("wait", wait) if wait <= horizon else ("done", 0)


def redispatch(log=print, wf=None):
    """Start a run of a workflow in this repository (GitHub allows that with the job's own token): this job's
    successor on nights that outlast one run, or the alerts job as an hourly heartbeat."""
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GH_TOKEN")
    if not (repo and token):
        return False
    import urllib.request
    wf = wf or os.environ.get("DP_LIVE_WORKFLOW", "live-score.yml")
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/actions/workflows/{wf}/dispatches",
                                 data=json.dumps({"ref": os.environ.get("DP_LIVE_REF", "main")}).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "User-Agent": API.UA})
    try:
        urllib.request.urlopen(req, timeout=30).read()
        log(f"Started a run of {wf}.")
        return True
    except Exception as e:
        log(f"  ! could not start the next run: {e}")
        return False


def session(out, publish=None, every=180, budget=5.3 * 3600, horizon=9 * 3600, log=print):
    """Stay up for the game night: score, publish when something changed, sleep, repeat. GitHub's scheduler fires
    this repository's jobs hours apart, so one run has to cover the evening instead of counting on the next one."""
    import subprocess
    import time
    meta, by_fid, snap = _published()
    t0, cache, passes, pushes, beat = time.time(), {}, 0, 0, time.time()
    while True:
        now = now_utc()
        if time.time() - beat > 55 * 60:   # while this run is up, it is the clock GitHub's scheduler isn't: nudge the
            beat = time.time()             # alerts job about once an hour so lock reminders go out on time
            redispatch(log, "alerts.yml")
        try:
            sc = scoreboard(meta["weeks"], by_fid.get, meta["corModel"], snap.get("teams") or {}, snap, now=now, log=lambda m: None, cache=cache)
        except Exception as e:   # one bad download must not end the night
            log(f"  ! pass failed: {e}")
            sc = None
        passes += 1
        if sc is not None and out and _write_if_changed(sc, out):
            games = ((sc.get("live") or {}).get("games")) or []
            log(f"{now:%H:%M:%S}Z week {sc['week']}: {sum(1 for g in games if g['st'] == 'live')} live, {sum(1 for g in games if g['st'] == 'final')} final, {sum(1 for g in games if g['st'] == 'pre')} to start -> changed")
            if publish:
                r = subprocess.run(publish, shell=True)
                pushes += r.returncode == 0
                if r.returncode != 0:
                    log("  ! publish failed (will retry on the next change)")
                    try:
                        os.remove(out)   # so the next pass counts as a change and publishes again
                    except OSError:
                        pass
        try:
            what, wait = plan(sc, now, horizon)
        except Exception as e:
            log(f"  ! schedule lookup failed: {e}")
            what, wait = "poll", 0
        left = budget - (time.time() - t0)
        if what == "done":
            log(f"No game on, and none starting within {horizon / 3600:.0f} hours ({passes} passes, {pushes} published).")
            return 0
        if left <= 60:
            log(f"Out of time for this run ({passes} passes, {pushes} published).")
            redispatch(log)
            return 0
        nap = every if what == "poll" else min(wait, 1800)   # long waits in half-hour steps, re-checking the schedule
        if what == "wait" and (passes == 1 or wait < 1900):
            log(f"{now:%H:%M}Z next puck drop in {wait / 60 + 4:.0f} min: waiting.")
        time.sleep(max(5, min(nap, left - 30)))


def main(argv):
    out = argv[argv.index("--out") + 1] if "--out" in argv else None
    if "--session" in argv:
        pub = argv[argv.index("--publish") + 1] if "--publish" in argv else None
        with open(os.path.join(ROOT, "config", "league.json"), encoding="utf-8") as f:
            cfg = json.load(f).get("live") or {}
        return session(out, pub, every=float(os.environ.get("DP_LIVE_EVERY", cfg.get("everySeconds", 180))),
                       budget=float(os.environ.get("DP_LIVE_BUDGET", 5.3 * 3600)), horizon=float(cfg.get("waitHours", 9)) * 3600)
    meta, by_fid, snap = _published()
    sc = scoreboard(meta["weeks"], by_fid.get, meta["corModel"], snap.get("teams") or {}, snap)
    if sc is None:
        print("No week has locked yet: nothing to score.")
        return 0
    if out:
        if not _write_if_changed(sc, out):
            print("No change since the last run.")
            return 0
        print(f"wrote {out} ({os.path.getsize(out) / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
