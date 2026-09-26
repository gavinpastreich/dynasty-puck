#!/usr/bin/env python3
"""Dynasty Puck HQ data pipeline.

raw/2026-27/*  +  NHL public APIs (cached in tools/cache/)  +  tools/research/*.json
    ->  data/league.js, data/prospects.js, data/research.js   (window.DP = {...})
    ->  tools/build_report.txt                                (sanity checks)

Run:  python tools/build_data.py            (uses cache, fetches what's missing)
      python tools/build_data.py --refresh  (re-fetch landing pages + schedules)
      DP_OFFLINE=1 python tools/build_data.py   (never touch the network)
"""
import csv
import datetime as dt
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

import nhl_api as API

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw", "2026-27")
OUT = os.path.join(ROOT, "data")
RESEARCH = os.path.join(ROOT, "tools", "research")
REPORT = []

SEASON_ID = 20262027
SEASON_LABEL = "2026-27"
YEARS = ["2026-27", "2027-28", "2028-29", "2029-30", "2030-31", "2031-32", "2032-33"]
CAP = 104_000_000
HIST_SEASONS = [20222023, 20232024, 20242025, 20252026]
NHL_GAMES = 84  # 2026-27 is the first 84-game NHL season (verified from the club schedules)

# GM code -> Fantrax team name (from the Fantrax H2H schedule; mapping confirmed by the commissioner)
GMS = [
    ("ROO", "Kalamazoo Kangaroo"), ("TommyG10", "TommyG1095"), ("Wags8210", "Wags8210"),
    ("BULLIES", "Bethesda Bullies"), ("nbracken", "Cake Eaters"), ("SPG", "South Philly Gravy"),
    ("BHHC", "Book Hockey HC"), ("nebsnave", "nebsnave"), ("M.M", "Milwaukee Musketeers"),
    ("mcianfra", "mcianfrani"), ("btsay45", "Worcester Gators"), ("PuckLuck", "Beginner's Luck"),
    ("CGN", "Colganites"), ("mertin", "Upper Darby Rats"),
]
SCHED_NAME_TO_GM = {name: code for code, name in GMS}
# Earlier Fantrax team names seen in the trade history -> current GM (inferred from roster continuity, 2026-09-25)
OLD_TEAM_NAMES = {"Cawlidge Hockey": "ROO", "Gavitron": "M.M", "Lsleeves": "BULLIES", "btsay45": "btsay45",
                  "mertin": "mertin", "nbracken": "nbracken"}
PICK_YEARS = [2026, 2027, 2028, 2029]   # league draft: 3 rounds; one new year is added after each draft
PICK_ROUNDS = 3


def team_code(name):
    name = (name or "").strip()
    if name in SCHED_NAME_TO_GM:
        return SCHED_NAME_TO_GM[name]
    if name in OLD_TEAM_NAMES:
        return OLD_TEAM_NAMES[name]
    for code, _ in GMS:
        if code.lower() == name.lower():
            return code
    return None

SK_CATS = ["GP", "Pt-D", "G", "A", "PIM", "SOG", "STP", "Hit", "Blk", "Tk", "Cor"]
G_CATS = ["GP", "W", "GAA", "SV%", "SHO"]


def log(msg):
    print(msg)
    REPORT.append(msg)


# ----------------------------------------------------------------------------- helpers
NICK = {
    "matt": "matthew", "mitch": "mitchell", "alex": "alexander", "zach": "zachary", "nick": "nicholas",
    "mike": "michael", "jake": "jacob", "josh": "joshua", "max": "maxim", "sam": "samuel", "tom": "thomas",
    "tim": "timothy", "will": "william", "cam": "cameron", "dan": "daniel", "danny": "daniel",
    "chris": "christopher", "jon": "jonathan", "joe": "joseph", "tony": "anthony", "andy": "andrew",
    "vince": "vincent", "nate": "nathan", "ben": "benjamin", "fred": "frederick", "pat": "patrick",
    "rob": "robert", "bob": "robert", "steve": "steven", "jt": "jt", "tj": "tj", "cj": "cj", "pj": "pj",
    "jj": "jj", "aj": "aj", "gabe": "gabriel", "zac": "zachary", "freddy": "frederick", "ollie": "oliver",
    "johnny": "john", "jonny": "john", "matty": "matthew", "maxime": "maxim", "evgenii": "evgeny",
    "evgeni": "evgeny", "yegor": "egor", "ilia": "ilya", "iliya": "ilya", "artem": "artyom",
    "alexandre": "alexander", "aleksandr": "alexander", "aleksander": "alexander", "alexei": "alexey",
    "aleksei": "alexey", "dmitri": "dmitry", "dmitrii": "dmitry", "nikolai": "nikolay", "vasili": "vasily",
    "vasily": "vasily", "vasiliy": "vasily", "andrei": "andrey", "sergei": "sergey", "arseni": "arseny",
    "arseniy": "arseny", "yaroslav": "yaroslav", "danil": "daniil", "mikhail": "mikhail", "pyotr": "petr",
    "pytor": "petr", "mathew": "matthew", "tommy": "thomas", "mikey": "michael", "jeff": "jeffrey",
    "timmy": "timothy", "charlie": "charles", "billy": "william", "bill": "william", "teddy": "theodore", "zachery": "zachary", "joshua": "joshua", "jacob": "jacob",
}


def strip_accents(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()


def name_keys(s):
    """All normalised keys for a name, e.g. 'Jeffrey (JP) Hurlbert' -> ['jeffrey hurlbert', 'jp hurlbert']."""
    keys = [norm_name(s)]
    m = re.match(r"\s*(\S+)\s*\((.+?)\)\s*(.+)", str(s))
    if m:
        keys.append(norm_name(m.group(2) + " " + m.group(3)))
    return keys


def norm_name(s):
    s = strip_accents(s).lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = s.replace(".", "").replace("'", "").replace("-", " ")
    parts = [p for p in re.split(r"[^a-z]+", s) if p and p not in ("jr", "sr", "ii", "iii")]
    if not parts:
        return ""
    parts[0] = NICK.get(parts[0], parts[0])
    return " ".join(parts)


def last_key(s):
    n = norm_name(s).split()
    return (n[-1] if n else "", n[0][:1] if n else "")


def first_ok(a, b):
    """True when two names plausibly share a first name (after nickname canonicalisation)."""
    fa, fb = norm_name(a).split()[:1], norm_name(b).split()[:1]
    if not fa or not fb:
        return False
    fa, fb = fa[0], fb[0]
    return fa == fb or (len(fa) >= 3 and len(fb) >= 3 and (fa.startswith(fb[:3]) and fb.startswith(fa[:3])))


def num(x, default=0.0):
    if x is None:
        return default
    if isinstance(x, (int, float)):
        return float(x) if not (isinstance(x, float) and math.isnan(x)) else default
    s = str(x).strip().replace(",", "").replace("%", "").replace("$", "")
    if s in ("", "-", "--", "nan"):
        return default
    try:
        return float(s)
    except ValueError:
        return default


def age_on(dob, on="2026-09-16"):
    if not dob:
        return None
    b = dt.date.fromisoformat(dob)
    d = dt.date.fromisoformat(on)
    return round((d - b).days / 365.2425, 2)


def pos_group(code):
    code = (code or "").upper()
    if code in ("G",):
        return "G"
    if code in ("D", "LD", "RD"):
        return "D"
    return "F"


# ----------------------------------------------------------------------------- raw loaders
def read_csv(name):
    with open(os.path.join(RAW, name), encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_fantrax():
    pre = "Fantrax-Players-Dynasty Puck_"
    so = read_csv(pre + "Skaters_Official2526.csv")
    sp = {r["ID"]: r for r in read_csv(pre + "Skaters_Projected2627.csv")}
    go = read_csv(pre + "Goalies_Official2526.csv")
    gp = {r["ID"]: r for r in read_csv(pre + "Goalies_Projected2627.csv")}
    players = {}
    for rows, proj, kind in ((so, sp, "S"), (go, gp, "G")):
        for r in rows:
            pid = r["ID"]
            if pid in players:  # a player listed as both skater and goalie (F,G) -> keep the first
                continue
            p = proj.get(pid, {})
            status = r["Status"].strip()
            waiver = "small" in status or status.startswith("W <")
            gm = None if (status == "FA" or waiver) else status
            pos = r["Prim Pos"].strip() or r["Position"].strip()
            if kind == "G":
                pos = "G"
            rec = {
                "id": pid, "n": r["Player"].strip(), "t": r["Team"].strip(), "pos": pos,
                "fd": 1 if r["Position"].strip() == "F,D" else 0, "gm": gm, "wv": 1 if waiver else 0,
                "ct": r["Contract"].strip(), "sal": int(num(r["Salary"])), "fxage": int(num(r["Age"])),
                "rk": 1 if r.get("Rookie", "").strip() == "R" else 0,
                "fx": [num(r["Score"]), int(num(r["RkOv"])), int(num(r["Ros"]))],
                "fxp": [num(p.get("Score")), int(num(p.get("RkOv"))), int(num(p.get("Ros")))],
                "kind": kind,
            }
            if kind == "S":
                rec["s25"] = [num(r[c]) for c in ("GP", "Pt-D", "G", "A", "PIM", "SOG", "STP", "Hit", "Blk", "Tk", "Cor")]
                rec["p26"] = [num(p.get(c)) for c in ("GP", "Pt-D", "G", "A", "PIM", "SOG", "STP", "Hit", "Blk", "Tk", "Cor")]
                # sanity: 2G+A column must equal 2*G + A
                if abs(num(r["2G+A"]) - (2 * num(r["G"]) + num(r["A"]))) > 0.5:
                    log(f"  ! 2G+A mismatch (2025-26) {rec['n']}")
                if p and abs(num(p.get("2G+A")) - (2 * num(p.get("G")) + num(p.get("A")))) > 1.01:
                    log(f"  ! 2G+A mismatch (proj) {rec['n']}")
            else:
                rec["s25"] = [num(r[c]) for c in ("GP", "W", "GAA", "SV%", "SHO")]
                rec["p26"] = [num(p.get(c)) for c in ("GP", "W", "GAA", "SV%", "SHO")]
            players[pid] = rec
    return players


def load_contracts():
    import openpyxl
    import warnings
    warnings.filterwarnings("ignore")
    wb = openpyxl.load_workbook(os.path.join(RAW, "Contract Sheet 2026-27.xlsx"), data_only=True)
    rows = [r for r in wb["Contract Sheet"].iter_rows(values_only=True)]
    hdr = [str(h) if h else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(hdr)}
    sheet = []
    for r in rows[1:]:
        if not r[0]:
            continue
        yrs = []
        for y in ["2025-26"] + YEARS:
            v = r[idx[y]] if y in idx else None
            if isinstance(v, (int, float)):
                yrs.append(round(float(v), 3))
            elif v:
                yrs.append(str(v).strip())
            else:
                yrs.append(None)
        sheet.append({
            "name": str(r[0]).strip(), "team": r[1], "pos": r[2], "gm": r[3], "age": r[4],
            "sal": r[5], "ct": r[6], "signed": r[7], "term": r[8], "act27": bool(r[9]),
            "y2526": yrs[0], "yrs": yrs[1:],
        })
    # 2027 offseason action (extension price table)
    act = []
    ws = wb["2027 Offseason Action"]
    ar = [r for r in ws.iter_rows(values_only=True)]
    h = [str(x) if x else "" for x in ar[1]]
    for r in ar[2:]:
        if not r[0]:
            continue
        d = dict(zip(h, r))
        act.append({
            "name": d["Player"], "team": d["Team"], "pos": d["Position"], "gm": d["GM"], "age": d["Age (9/16/26)"],
            "sal": d["Salary"], "ct": d["Contract"], "signed": d["Contract Signed"], "term": d["Term Length"],
            "y2728": d["2027-28"], "decision": d.get("Decision"),
            "ext": [d.get("1-Yr Extension Cap"), d.get("2-Yr"), d.get("3-Yr"), d.get("4-Yr"), d.get("5-Yr"), d.get("6-Yr")],
        })
    hist = []
    ws = wb["2026 Offseason Action"]
    ar = [r for r in ws.iter_rows(values_only=True)]
    h = [str(x) if x else "" for x in ar[1]]
    for r in ar[2:]:
        if not r[0]:
            continue
        d = dict(zip(h, r))
        hist.append({"name": d["Player"], "team": d["Team"], "pos": d["Position"], "gm": d["GM"],
                     "sal": d["Current Salary"], "ct": d["Current Contract"], "to": d["2026-27"],
                     "decision": d.get("Decision"),
                     "ext": [d.get("1-Yr Extension Cap"), d.get("2-Yr"), d.get("3-Yr"), d.get("4-Yr"), d.get("5-Yr"), d.get("6-Yr")]})
    return sheet, act, hist


def load_h2h():
    path = os.path.join(RAW, "h2h_schedule_fantrax.txt")
    weeks, games = [], []
    cur = None
    months = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

    def pdate(s):
        m = re.match(r"\w{3} (\w{3}) (\d+), (\d{4})", s.strip())
        return dt.date(int(m.group(3)), months[m.group(1)], int(m.group(2))).isoformat()

    for line in open(path, encoding="utf-8"):
        line = line.strip()
        m = re.match(r"Scoring Period (\d+)", line)
        m2 = re.match(r"Playoffs - Round (\d+)", line)
        if m or m2:
            n = int(m.group(1)) if m else 24 + int(m2.group(1))
            cur = {"n": n, "po": 0 if m else int(m2.group(1))}
            weeks.append(cur)
            continue
        m = re.match(r"\((.+?) - (.+?)\)", line)
        if m and cur is not None and "start" not in cur:
            cur["start"], cur["end"] = pdate(m.group(1)), pdate(m.group(2))
            continue
        if " vs " in line and cur and not cur["po"]:
            a, h = [x.strip() for x in line.split(" vs ")]
            games.append([cur["n"], SCHED_NAME_TO_GM[a], SCHED_NAME_TO_GM[h]])
    return weeks, games


# ----------------------------------------------------------------------------- NHL data
def nhl_history():
    """Per NHL player id: {season: row} for skaters and goalies from the bulk stats reports."""
    sk, gk, bios = defaultdict(dict), defaultdict(dict), {}
    for s in HIST_SEASONS:
        summ = {r["playerId"]: r for r in API.stats_report("skater", "summary", s)}
        real = {r["playerId"]: r for r in API.stats_report("skater", "realtime", s)}
        shot = {r["playerId"]: r for r in API.stats_report("skater", "summaryshooting", s)}
        toi = {r["playerId"]: r for r in API.stats_report("skater", "timeonice", s)}
        for r in API.stats_report("skater", "bios", s):
            bios[r["playerId"]] = {"name": r["skaterFullName"], "dob": r["birthDate"], "pos": r["positionCode"],
                                   "team": r.get("currentTeamAbbrev"), "sh": r.get("shootsCatches"),
                                   "ht": r.get("height"), "wt": r.get("weight"), "nat": r.get("nationalityCode"),
                                   "dr": [r.get("draftYear"), r.get("draftRound"), r.get("draftOverall")]}
        for pid, r in summ.items():
            re_, sh, ti = real.get(pid, {}), shot.get(pid, {}), toi.get(pid, {})
            sk[pid][s] = {
                "gp": r["gamesPlayed"], "g": r["goals"], "a": r["assists"], "pts": r["points"],
                "pim": r["penaltyMinutes"], "sog": r["shots"],
                "stp": (r.get("ppPoints") or 0) + (r.get("shPoints") or 0),
                "hit": re_.get("hits") or 0, "blk": re_.get("blockedShots") or 0, "tk": re_.get("takeaways") or 0,
                "gv": re_.get("giveaways") or 0,
                "sat": sh.get("satTotal") or 0, "satf": sh.get("satFor") or 0, "sata": sh.get("satAgainst") or 0,
                "pp": (ti.get("ppTimeOnIce") or 0) / 60.0, "shtoi": (ti.get("shTimeOnIce") or 0) / 60.0,
                "toi": (ti.get("timeOnIce") or 0) / 60.0, "team": r.get("teamAbbrevs"), "pos": r.get("positionCode"),
            }
        gsum = API.stats_report("goalie", "summary", s)
        for r in API.stats_report("goalie", "bios", s):
            bios[r["playerId"]] = {"name": r["goalieFullName"], "dob": r["birthDate"], "pos": "G",
                                   "team": r.get("currentTeamAbbrev"), "sh": r.get("shootsCatches"),
                                   "ht": r.get("height"), "wt": r.get("weight"), "nat": r.get("nationalityCode"),
                                   "dr": [r.get("draftYear"), r.get("draftRound"), r.get("draftOverall")]}
        for r in gsum:
            gk[r["playerId"]][s] = {"gp": r["gamesPlayed"], "gs": r.get("gamesStarted"), "w": r["wins"],
                                    "ga": r["goalsAgainst"], "sa": r["shotsAgainst"], "sho": r["shutouts"],
                                    "gaa": r["goalsAgainstAverage"], "sv": r["savePct"], "team": r.get("teamAbbrevs")}
    return sk, gk, bios


def name_index(bios):
    """Index every NHL player we know about: bulk bios + 2026-27 rosters + team prospect lists."""
    idx = defaultdict(list)
    known = {}

    def add(pid, name, pos, team, dob, src):
        pid = int(pid)
        if pid in known:
            if team and not known[pid].get("team26") and src != "bios":
                known[pid]["team26"] = team
            return
        known[pid] = {"id": pid, "name": name, "pos": pos_group(pos), "team": team, "dob": dob, "src": src,
                      "team26": team if src != "bios" else None}
        idx[norm_name(name)].append(pid)

    for t in API.NHL_TEAMS:
        for src, fn in (("roster", API.roster), ("prospects", API.prospects)):
            d = fn(t) or {}
            for grp in ("forwards", "defensemen", "goalies"):
                for r in d.get(grp, []):
                    add(r["id"], r["firstName"]["default"] + " " + r["lastName"]["default"], r.get("positionCode"),
                        t, r.get("birthDate"), src)
    for pid, b in bios.items():
        add(pid, b["name"], b["pos"], b.get("team"), b.get("dob"), "bios")
    return idx, known


def match_player(p, idx, known, used):
    key = norm_name(p["n"])
    grp = "G" if p["pos"] == "G" else ("D" if p["pos"] == "D" else "F")
    cands = [known[i] for i in idx.get(key, [])]
    if not cands:  # try last name + first initial
        ln, fi = last_key(p["n"])
        cands = [k for k in known.values() if last_key(k["name"]) == (ln, fi) and first_ok(k["name"], p["n"])]

    def score(k):
        s = 0
        if k["pos"] == grp or (p["fd"] and k["pos"] in ("F", "D")):
            s += 3
        if p["t"] and (k.get("team26") == p["t"] or k.get("team") == p["t"]):
            s += 3
        a = age_on(k.get("dob"), "2026-09-16") if k.get("dob") else None
        if a is not None and p["fxage"] and abs(a - p["fxage"]) <= 1.2:
            s += 2
        if k["id"] in used:
            s -= 5
        return s

    if cands:
        best = max(cands, key=score)
        if score(best) >= 3:
            return best["id"], "index"
    # fall back to the NHL search API
    def best_of(res):
        best, bs = None, -9
        for r in res:
            k = {"id": int(r["playerId"]), "name": r["name"], "pos": pos_group(r.get("positionCode")),
                 "team": r.get("teamAbbrev") or r.get("lastTeamAbbrev"), "team26": r.get("teamAbbrev"), "dob": None}
            s = score(k) + (2 if norm_name(r["name"]) == key else 0) + (1 if r.get("active") else 0)
            if s > bs:
                best, bs = k, s
        return best, bs

    best, bs = best_of(API.search_player(strip_accents(p["n"])) or [])
    if bs < 5:  # e.g. "Alexei" vs "Aleksei": search by last name, then compare canonical first names
        res = [r for r in API.search_player(norm_name(p["n"]).split()[-1]) or [] if first_ok(r["name"], p["n"])]
        best, bs = best_of(res)
    if best and bs >= 5:
        return best["id"], "search"
    return None, None


def season_str(s):
    s = int(s)
    return f"{s // 10000}-{str(s % 10000)[2:]}"


# ----------------------------------------------------------------------------- Tk / Cor model
def ols(X, y):
    """Least squares via normal equations (tiny problems only)."""
    n = len(X[0])
    A = [[0.0] * n for _ in range(n)]
    b = [0.0] * n
    for xi, yi in zip(X, y):
        for i in range(n):
            b[i] += xi[i] * yi
            for j in range(n):
                A[i][j] += xi[i] * xi[j]
    for i in range(n):  # ridge epsilon for stability
        A[i][i] += 1e-6
    # gaussian elimination
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c and M[c][c]:
                f = M[r][c] / M[c][c]
                for k in range(c, n + 1):
                    M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def r2(X, y, beta):
    pred = [sum(a * b for a, b in zip(x, beta)) for x in X]
    my = sum(y) / len(y)
    ss = sum((a - my) ** 2 for a in y)
    se = sum((a - b) ** 2 for a, b in zip(y, pred))
    return 1 - se / ss if ss else 0


def project_tk_cor(players, sk):
    """Project 2026-27 Tk and Cor (Fantrax gives 0 for both).

    1. Cor translation: Fantrax Cor (2025-26, actual) ~ a*5v5 SAT diff + b*PP min + c*SH min, fitted on 2025-26.
       Applied to 2022-23..2024-25 NHL data to estimate the Fantrax-equivalent Cor of earlier seasons.
    2. Role prior: per-GP Tk and Cor regressed on per-GP G, A, SOG, Hit, Blk, PIM, STP (by F/D) on 2025-26 actuals,
       then applied to each player's 2026-27 Fantrax projection.
    3. Marcel blend: weights 1.0/0.8/0.6 for 2025-26/2024-25/2023-24, shrunk toward the role prior with
       k=30 GP (Tk) and k=40 GP (Cor). Projection = blended per-GP rate x projected 2026-27 GP.
    """
    fit_rows = []
    for p in players.values():
        if p["kind"] != "S" or not p.get("nhl"):
            continue
        h = sk.get(p["nhl"], {}).get(20252026)
        if h and h["gp"] >= 10 and p["s25"][0] >= 10 and abs(h["gp"] - p["s25"][0]) <= 2:
            fit_rows.append((p, h))
    X = [[h["sat"], h["pp"], h["shtoi"], h["gp"]] for p, h in fit_rows]
    y = [p["s25"][10] for p, h in fit_rows]
    beta_cor = ols(X, y)
    log(f"Cor translation (n={len(X)}): Cor = {beta_cor[0]:.3f}*SAT5v5 + {beta_cor[1]:.3f}*PPmin + "
        f"{beta_cor[2]:.3f}*SHmin + {beta_cor[3]:.3f}*GP   R^2={r2(X, y, beta_cor):.3f}")
    tk_match = sum(1 for p, h in fit_rows if abs(h["tk"] - p["s25"][9]) <= 1)
    log(f"Tk check: Fantrax 2025-26 Tk equals NHL takeaways (+-1) for {tk_match}/{len(fit_rows)} matched skaters")

    def cor_est(h):
        return beta_cor[0] * h["sat"] + beta_cor[1] * h["pp"] + beta_cor[2] * h["shtoi"] + beta_cor[3] * h["gp"]

    # role prior per position group
    priors = {}
    for grp in ("F", "D"):
        rows = [p for p in players.values() if p["kind"] == "S" and p["pos"] == grp and p["s25"][0] >= 20]
        Xr = [[1, p["s25"][2] / p["s25"][0], p["s25"][3] / p["s25"][0], p["s25"][5] / p["s25"][0],
               p["s25"][7] / p["s25"][0], p["s25"][8] / p["s25"][0], p["s25"][4] / p["s25"][0],
               p["s25"][6] / p["s25"][0]] for p in rows]
        btk = ols(Xr, [p["s25"][9] / p["s25"][0] for p in rows])
        bco = ols(Xr, [p["s25"][10] / p["s25"][0] for p in rows])
        priors[grp] = (btk, bco)
        log(f"Role prior {grp} (n={len(rows)}): Tk/GP R^2={r2(Xr, [p['s25'][9] / p['s25'][0] for p in rows], btk):.2f}, "
            f"Cor/GP R^2={r2(Xr, [p['s25'][10] / p['s25'][0] for p in rows], bco):.2f}")

    W = {20252026: 1.0, 20242025: 0.8, 20232024: 0.6}
    K_TK, K_COR = 30.0, 40.0
    for p in players.values():
        if p["kind"] != "S":
            continue
        pr = p["p26"]
        gp = pr[0]
        grp = "D" if p["pos"] == "D" else "F"
        btk, bco = priors[grp]
        if gp > 0:
            x = [1, pr[2] / gp, pr[3] / gp, pr[5] / gp, pr[7] / gp, pr[8] / gp, pr[4] / gp, pr[6] / gp]
        else:
            s = p["s25"]
            x = [1] + ([s[2] / s[0], s[3] / s[0], s[5] / s[0], s[7] / s[0], s[8] / s[0], s[4] / s[0], s[6] / s[0]] if s[0] else [0] * 7)
        prior_tk = max(0.0, sum(a * b for a, b in zip(x, btk)))
        prior_cor = sum(a * b for a, b in zip(x, bco))
        num_tk = num_cor = den = 0.0
        hist = sk.get(p.get("nhl"), {}) if p.get("nhl") else {}
        for s, w in W.items():
            h = hist.get(s)
            if s == 20252026 and p["s25"][0] > 0:  # use Fantrax's own 2025-26 numbers
                num_tk += w * p["s25"][9]
                num_cor += w * p["s25"][10]
                den += w * p["s25"][0]
            elif h and h["gp"] > 0:
                num_tk += w * h["tk"]
                num_cor += w * cor_est(h)
                den += w * h["gp"]
        rate_tk = (num_tk + K_TK * prior_tk) / (den + K_TK)
        rate_cor = (num_cor + K_COR * prior_cor) / (den + K_COR)
        pr[9] = round(rate_tk * gp, 1)
        pr[10] = round(rate_cor * gp, 1)
        p["tkc"] = [round(rate_tk, 4), round(rate_cor, 3), round(prior_tk, 4), round(prior_cor, 3), round(den, 1)]
    return beta_cor, cor_est


# ----------------------------------------------------------------------------- NHLe
NHLE = {
    # Standard NHL-equivalency factors (points in league x factor = NHL points). Core values from the rebuild plan
    # (AHL .389 ... J20 .05); the rest are approximate values from public NHLe studies and are labelled as such.
    "NHL": 1.0, "AHL": 0.389, "KHL": 0.77, "SHL": 0.57, "Liiga": 0.44, "NL": 0.46, "DEL": 0.38,
    "Czechia": 0.43, "Czech": 0.43, "ELH": 0.43, "Slovakia": 0.26, "NCAA": 0.19, "OHL": 0.14, "WHL": 0.14,
    "QMJHL": 0.11, "USHL": 0.09, "J20 Nationell": 0.05, "J20": 0.05, "U20 SM-sarja": 0.05, "Allsvenskan": 0.31,
    "HockeyAllsvenskan": 0.31, "Mestis": 0.19, "VHL": 0.26, "MHL": 0.07, "NTDP": 0.08, "USDP": 0.08, "USNTDP": 0.08,
    "BCHL": 0.05, "AJHL": 0.04, "ECHL": 0.12, "ICEHL": 0.21, "EBEL": 0.21, "Norway": 0.19, "Denmark": 0.16,
    "SL": 0.21, "U18 SM-sarja": 0.03, "J18 Region": 0.02, "Extraliga": 0.43, "J20 SuperElit": 0.05,
    "NAHL": 0.03, "OJHL": 0.03, "H-East": 0.19, "WCHA": 0.19, "U20 SM-liiga": 0.05, "Swe-Jr.": 0.05,
}
NHLE_ALIASES = {
    "SM-liiga": "Liiga", "SM-l": "Liiga", "Liiga": "Liiga", "Czech2": "Slovakia", "Czech Extraliga": "Czechia",
    "Czechia": "Czechia", "CZE": "Czechia", "Swiss": "NL", "NLA": "NL", "Swiss-A": "NL", "National League": "NL",
    "SuperElit": "J20", "J20 SuperElit": "J20", "U20-SM-liiga": "U20 SM-sarja", "Jr. A SM-liiga": "U20 SM-sarja",
    "U20 SM-liiga": "U20 SM-sarja", "USNTDP Juniors": "NTDP", "U.S. National Development Team": "NTDP",
    "USDP": "NTDP", "USHS-Prep": None, "HS-MN": None, "Russia": "KHL", "Russia2": "VHL", "Russia-Jr.": "MHL",
    "Deutschland": "DEL", "GER": "DEL", "DEL2": None, "Sweden": "SHL", "Sweden-2": "Allsvenskan",
    "Sweden-Jr.": "J20", "Finland": "Liiga", "Finland-2": "Mestis", "Finland-Jr.": "U20 SM-sarja",
}


def nhle_factor(lg):
    if not lg:
        return None
    if lg in NHLE:
        return NHLE[lg]
    a = NHLE_ALIASES.get(lg)
    if a:
        return NHLE.get(a)
    for k, v in NHLE.items():
        if k.lower() == lg.lower():
            return v
    return None


# ----------------------------------------------------------------------------- league trades & draft picks
def load_trades(players):
    """Fantrax trade history -> trades (grouped) + current draft-pick ownership (replayed from pick trades)."""
    folder = os.path.join(RAW, "league")
    rows = []
    for fn in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if fn.startswith("trades") and fn.endswith(".csv"):
            with open(os.path.join(folder, fn), encoding="utf-8-sig") as f:
                rows += list(csv.DictReader(f))
    months = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
    by_name = {}
    for p in players.values():
        by_name.setdefault(norm_name(p["n"]), []).append(p)
    seen, uniq = set(), []
    for r in rows:
        key = tuple(r.get(k, "") for k in ("Player", "From", "To", "Date (EDT)"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    moves = []
    for r in uniq:
        m = re.match(r"\w{3} (\w{3}) (\d+), (\d{4}), (\d+):(\d+)(AM|PM)", r["Date (EDT)"].strip())
        date = dt.date(int(m.group(3)), months[m.group(1)], int(m.group(2))).isoformat() if m else r["Date (EDT)"]
        frm, to = team_code(r["From"]), team_code(r["To"])
        if not frm or not to:
            log(f"  ! trade row with unknown team: {r}")
        mv = {"date": date, "from": frm, "to": to, "fromName": r["From"], "toName": r["To"],
              "obj": int(num(r.get("# Obj"))), "period": int(num(r.get("Period")))}
        name = r["Player"].strip()
        pk = re.match(r"(\d{4}) Draft Pick, Round (\d) \((.+)\)", name)
        cap = re.match(r"Salary Cap: \$([\d,]+)", name)
        if pk:
            mv.update({"kind": "pick", "year": int(pk.group(1)), "round": int(pk.group(2)), "orig": team_code(pk.group(3)),
                       "origName": pk.group(3), "label": f"{pk.group(1)} R{pk.group(2)} ({pk.group(3)})"})
        elif cap:
            mv.update({"kind": "cap", "amt": num(cap.group(1)) / 1e6, "label": name})
        else:
            pos = re.sub(r"<[^>]+>", "", r.get("Position", ""))
            mv.update({"kind": "player", "label": name, "nhlTeam": r.get("Team", ""), "pos": pos})
            cands = by_name.get(norm_name(name), [])
            if len(cands) > 1:
                cands = [c for c in cands if (c["pos"] == pos or (pos == "F" and c["pos"] not in ("D", "G")))] or cands
            if cands:
                mv["id"] = cands[0]["id"]
        moves.append(mv)
    # group into trades: same date + connected teams
    trades = []
    by_date = defaultdict(list)
    for mv in moves:
        by_date[mv["date"]].append(mv)
    for date in sorted(by_date):
        mvs = by_date[date]
        parent = {}

        def find(x):
            parent.setdefault(x, x)
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for mv in mvs:
            parent[find(mv["from"])] = find(mv["to"])
        groups = defaultdict(list)
        for mv in mvs:
            groups[find(mv["from"])].append(mv)
        for g in groups.values():
            teams = sorted(set([m["from"] for m in g] + [m["to"] for m in g]))
            trades.append({"date": date, "period": g[0]["period"], "teams": teams, "moves": g,
                           "obj": max(m["obj"] for m in g),
                           "season": "2025-26" if date < "2026-07-01" else "2026 offseason"})
    trades.sort(key=lambda t: t["date"], reverse=True)
    for i, t in enumerate(trades):
        t["id"] = len(trades) - i
    # replay pick ownership chronologically
    owner = {}
    for y in PICK_YEARS:
        for rd in range(1, PICK_ROUNDS + 1):
            for code, _ in GMS:
                owner[(y, rd, code)] = code
    issues = 0
    for mv in sorted([m for m in moves if m["kind"] == "pick"], key=lambda m: m["date"]):
        k = (mv["year"], mv["round"], mv["orig"])
        if k not in owner:
            log(f"  ! pick outside tracked years: {mv['label']}")
            continue
        if owner[k] != mv["from"]:
            issues += 1
            log(f"  ~ pick chain: {mv['label']} moved {mv['from']}->{mv['to']} on {mv['date']} but tracked owner was {owner[k]}")
        owner[k] = mv["to"]
    picks = [{"year": y, "round": rd, "orig": o, "owner": owner[(y, rd, o)]} for (y, rd, o) in sorted(owner)]
    moved = [p for p in picks if p["owner"] != p["orig"] and p["year"] >= 2027]
    log(f"Trades: {len(trades)} trades ({len(moves)} rows); picks moved (2027+): {len(moved)}; chain issues: {issues}")
    unmatched = sorted(set(m["label"] for m in moves if m["kind"] == "player" and "id" not in m))
    if unmatched:
        log(f"  ~ traded players not in the current player file: {unmatched}")
    return {"trades": trades, "picks": picks, "aliases": OLD_TEAM_NAMES,
            "pickYears": PICK_YEARS, "rounds": PICK_ROUNDS,
            "note": "Pick ownership replayed from the Fantrax trade history (each team starts with its own picks)."}


# ----------------------------------------------------------------------------- league (minor-league) drafts
PEOPLE = {  # real owner names in the league draft sheets -> current GM code
    "Kevin Colgan": "CGN", "Ryan Lessman": "ROO", "Charlie Sayers": "PuckLuck", "Hayden Kennedy": "BULLIES",
    "Mike Cianfrani": "mcianfra", "Brian Sayers": "btsay45", "Gavin Pastreich": "M.M", "Josh Wagner": "Wags8210",
    "Martin McElhone": "mertin", "Ben Evans": "nebsnave", "Nick Algeo": "SPG", "Christian Breitenbach": "BHHC",
    "Nick Brackenridge": "nbracken", "Tommy G": "TommyG10", "Tommy Guerriero": "TommyG10",
    "Lauren Steeves": "BULLIES",  # 'Lsleeves' in the trade log; team now run by Hayden Kennedy
}


def load_drafts(players):
    import openpyxl
    import warnings
    warnings.filterwarnings("ignore")
    folder = os.path.join(RAW, "league")
    out = {}
    by_id = {p["id"]: p for p in players.values()}
    by_name = {}
    for p in players.values():
        by_name.setdefault(norm_name(p["n"]), p)

    def pid_of(name, idmap):
        k = norm_name(name)
        fid = idmap.get(k)
        if fid and fid in by_id:
            return fid
        p = by_name.get(k)
        return p["id"] if p else None

    # 2026 rookie draft (3 rounds, straight order by reverse 2025-26 standings)
    f26 = os.path.join(folder, "draft_2026_rookie.xlsx")
    if os.path.exists(f26):
        wb = openpyxl.load_workbook(f26, data_only=True)
        idmap = {}
        for r in list(wb["Rookies 2026"].iter_rows(values_only=True))[1:]:
            if r[0] and r[1]:
                idmap[norm_name(r[1])] = r[0]
        picks = []
        for r in list(wb["2026 Rookie Draft"].iter_rows(values_only=True))[1:]:
            if not r[1]:
                continue
            picks.append({"ov": int(r[1]), "rd": int(r[0]), "orig": PEOPLE.get(r[2]), "owner": PEOPLE.get(r[3]),
                          "n": r[5], "id": pid_of(r[5], idmap)})
        out["2026"] = {"name": "2026 Rookie Draft", "rounds": 3, "picks": picks, "snake": False}
        miss = [p["n"] for p in picks if not p["id"]]
        log(f"2026 rookie draft: {len(picks)} picks; unmatched players: {miss}")
        bad = [p for p in picks if not p["orig"] or not p["owner"]]
        if bad:
            log(f"  ! unknown owner names in {len(bad)} picks of the 2026 rookie draft")
    # 2025 initial rookie & minors draft (20-round snake)
    f25 = os.path.join(folder, "draft_2025_initial_minors.xlsx")
    if os.path.exists(f25):
        wb = openpyxl.load_workbook(f25, data_only=True)
        idmap = {}
        for r in list(wb["Rookie & Minor Players"].iter_rows(values_only=True))[1:]:
            if r[0] and r[1]:
                idmap[norm_name(r[1])] = r[0]
        rows = [r for r in list(wb["2025 Offline Draft"].iter_rows(values_only=True))[1:] if r[1]]
        # owners who have since left: infer today's team from where their draftees sit now (majority vote)
        people = {}
        for r in rows:
            nm = r[2]
            if nm in PEOPLE:
                people[nm] = PEOPLE[nm]
                continue
            votes = Counter()
            for r2 in rows:
                if r2[2] == nm:
                    fid = pid_of(r2[3], idmap)
                    if fid and by_id[fid]["gm"]:
                        votes[by_id[fid]["gm"]] += 1
            taken = set(PEOPLE[r3[2]] for r3 in rows if r3[2] in PEOPLE)  # teams still run by 2025 owners
            cand = [(k, v) for k, v in votes.most_common() if k not in taken]
            people[nm] = cand[0][0] if cand else None
        for nm, code in people.items():
            if nm not in PEOPLE:
                log(f"2025 draft: a departed owner's picks credited to {code} (inferred from where their picks are today)")
        picks = []
        for r in rows:
            picks.append({"ov": int(r[1]), "rd": int(r[0]), "orig": people.get(r[2]), "owner": people.get(r[2]),
                          "n": r[3], "id": pid_of(r[3], idmap)})
        out["2025"] = {"name": "2025 Initial Rookie & Minors Draft", "rounds": 20, "picks": picks, "snake": True}
        log(f"2025 initial draft: {len(picks)} picks; matched to current player file: {sum(1 for p in picks if p['id'])}")
    return out


# ----------------------------------------------------------------------------- main build
def main():
    if "--refresh" in sys.argv:
        API.REFRESH.update(["landing_", "sched_", "roster_", "prospects_"])
    os.makedirs(OUT, exist_ok=True)
    log(f"Dynasty Puck HQ build {dt.datetime.now().isoformat(timespec='seconds')}")

    players = load_fantrax()
    sheet, act27, hist26 = load_contracts()
    weeks, h2h = load_h2h()
    log(f"Fantrax: {len(players)} players; contract sheet: {len(sheet)} rows; H2H: {len(weeks)} periods, {len(h2h)} games")

    # ---- universe: rostered, waivers, contract-sheet names, and FAs with NHL games or projections
    sheet_names = {norm_name(r["name"]) for r in sheet}
    def relevant(p):
        return (p["gm"] or p["wv"] or p["s25"][0] > 0 or p["p26"][0] > 0 or norm_name(p["n"]) in sheet_names)
    players = {k: v for k, v in players.items() if relevant(v)}
    log(f"Universe: {len(players)} players ({sum(1 for p in players.values() if p['gm'])} rostered)")

    # ---- NHL ids
    sk, gk, bios = nhl_history()
    idx, known = name_index(bios)
    used, how = set(), Counter()
    # rostered first so they get first claim on ambiguous names
    for p in sorted(players.values(), key=lambda p: (p["gm"] is None, -p["p26"][0])):
        pid, src = match_player(p, idx, known, used)
        if pid:
            p["nhl"] = pid
            used.add(pid)
        how[src] += 1
    unmatched = [p for p in players.values() if not p.get("nhl")]
    log(f"NHL id match: {dict(how)}; unmatched {len(unmatched)} (rostered: {sum(1 for p in unmatched if p['gm'])})")
    for p in unmatched:
        if p["gm"]:
            log(f"  ! no NHL id for rostered {p['n']} ({p['t']}, {p['gm']}, {p['ct']})")
    dup = [k for k, v in Counter(p.get("nhl") for p in players.values() if p.get("nhl")).items() if v > 1]
    for d in dup:
        log(f"  ! NHL id {d} matched twice: {[p['n'] for p in players.values() if p.get('nhl') == d]}")

    # ---- landing pages (career GP, league-by-league history, draft, bio)
    need = [p for p in players.values() if p.get("nhl") and (p["gm"] or p["wv"] or p["s25"][0] > 0 or p["p26"][0] > 0)]
    lands = API.get_many([(f"{API.WEB}/player/{p['nhl']}/landing", f"landing_{p['nhl']}", 7) for p in need], workers=10)
    leagues = Counter()
    for p, d in zip(need, lands):
        if not d:
            continue
        ct = (d.get("careerTotals") or {}).get("regularSeason") or {}
        p["cgp"] = int(ct.get("gamesPlayed") or 0)
        p["dob"] = d.get("birthDate")
        p["sh"] = d.get("shootsCatches")
        p["ht"] = d.get("heightInInches")
        p["wt"] = d.get("weightInPounds")
        p["nat"] = d.get("birthCountry")
        p["hs"] = 1 if d.get("headshot") else 0
        p["nt"] = d.get("currentTeamAbbrev")
        p["npos"] = d.get("position")
        p["slug"] = d.get("playerSlug")
        dd = d.get("draftDetails")
        if dd:
            p["dr"] = [dd.get("year"), dd.get("round"), dd.get("overallPick"), dd.get("teamAbbrev")]
        car = []
        young = p["ct"] in ("MNR", "ELC1") or (p.get("dob") and age_on(p["dob"]) < 24)
        for s in d.get("seasonTotals", []):
            if s.get("gameTypeId") != 2:
                continue
            lg = s.get("leagueAbbrev")
            leagues[lg] += 1
            if not young and lg != "NHL":
                continue
            team = (s.get("teamName") or {}).get("default", "")
            if p["pos"] == "G":
                car.append([s["season"], lg, team, s.get("gamesPlayed", 0), s.get("wins") or 0,
                            round(s.get("goalsAgainstAvg") or 0, 2), round(s.get("savePctg") or 0, 3), s.get("shutouts") or 0])
            else:
                car.append([s["season"], lg, team, s.get("gamesPlayed", 0), s.get("goals") or 0, s.get("assists") or 0,
                            s.get("points") or 0, s.get("pim") or 0])
        p["car"] = car
    log(f"Landing pages: {sum(1 for d in lands if d)}/{len(need)}")
    missing_cgp = [p for p in need if "cgp" not in p]
    for p in missing_cgp:
        if p["gm"]:
            log(f"  ! no landing for rostered {p['n']}")
    # players that never reached a landing page: career GP = 0 unless they played in 2025-26
    for p in players.values():
        if "cgp" not in p:
            p["cgp"] = int(p["s25"][0])
            p["cgps"] = "est"

    # ---- NHL bulk history per player
    for p in players.values():
        nid = p.get("nhl")
        if not nid:
            continue
        b = bios.get(nid)
        if b:
            p.setdefault("dob", b["dob"])
            p.setdefault("sh", b.get("sh"))
            p.setdefault("ht", b.get("ht"))
            p.setdefault("wt", b.get("wt"))
            p.setdefault("nat", b.get("nat"))
            if b["dr"][0] and "dr" not in p:
                p["dr"] = [b["dr"][0], b["dr"][1], b["dr"][2], None]
        h = []
        if p["pos"] == "G":
            for s in HIST_SEASONS:
                r = gk.get(nid, {}).get(s)
                if r:
                    h.append([s, r["gp"], r["w"], round(r["gaa"] or 0, 2), round(r["sv"] or 0, 3), r["sho"], r["sa"], r["team"]])
        else:
            for s in HIST_SEASONS:
                r = sk.get(nid, {}).get(s)
                if r:
                    h.append([s, r["gp"], r["g"], r["a"], r["pim"], r["sog"], r["stp"], r["hit"], r["blk"], r["tk"],
                              r["sat"], round(r["pp"]), round(r["shtoi"]), r["team"]])
        p["h"] = h

    # ---- Tk / Cor projection
    beta_cor, cor_est = project_tk_cor(players, sk)
    for p in players.values():
        for row in p.get("h", []):
            if p["pos"] != "G":
                s = sk[p["nhl"]][row[0]]
                row.append(round(p["s25"][10]) if row[0] == 20252026 and p["s25"][0] > 0 else round(cor_est(s)))

    # ---- contracts: merge sheet terms onto Fantrax rosters
    by_name = defaultdict(list)
    for r in sheet:
        by_name[norm_name(r["name"])].append(r)
    act_names = {norm_name(a["name"]): a for a in act27}
    alias = {"matthew savoie": "matt savoie", "matt savoie": "matthew savoie"}
    no_term = []
    for p in players.values():
        key = norm_name(p["n"])
        rows = by_name.get(key) or by_name.get(alias.get(key, ""), [])
        if len(rows) > 1:  # e.g. the two Elias Petterssons: pick by position / GM
            rows = [r for r in rows if (r["gm"] == p["gm"]) or (r["pos"] == p["pos"])] or rows
        r = rows[0] if rows else None
        if r and r["ct"] != "FA" and (r["gm"] == p["gm"] or not p["gm"]):
            yrs = r["yrs"][:]
            # Fantrax is the source of truth for the current salary
            cur = p["sal"] / 1e6
            if p["gm"] and isinstance(yrs[0], (int, float)) and abs(yrs[0] - cur) > 0.001 and p["ct"] not in ("MNR",):
                log(f"  ~ salary differs {p['n']}: sheet {yrs[0]} vs Fantrax {cur}")
            p["c"] = {"y": yrs, "signed": r["signed"], "term": r["term"], "src": "sheet"}
            if r["act27"]:
                p["act27"] = 1
        elif p["gm"]:
            # not on the contract sheet (signed/claimed after the sheet was made): derive from Fantrax
            cur = round(p["sal"] / 1e6, 3)
            if p["ct"] == "MNR":
                yrs = [0.0] + [None] * 6
            elif p["ct"] == "ELC1":
                yrs = [1.5, 1.5, "RFA"] + [None] * 4
            elif p["ct"] == "FA":
                yrs = [cur, "UFA | BID"] + [None] * 5
            else:  # BID / RFA1 with no sheet row: term unknown, assume 1 year
                yrs = [cur, "UFA | BID" if p["ct"] == "BID" else "RFA"] + [None] * 5
                no_term.append(p)
            p["c"] = {"y": yrs, "signed": 2026, "term": 1 if p["ct"] not in ("ELC1",) else 2, "src": "fantrax"}
        else:
            p["c"] = None
        if p.get("c") and p["gm"] and p["ct"] != "MNR" and isinstance(p["c"]["y"][0], (int, float)):
            p["c"]["y"][0] = round(p["sal"] / 1e6, 3)
    for p in no_term:
        log(f"  ~ term unknown (not on contract sheet), assumed 1 year: {p['n']} {p['gm']} {p['ct']} ${p['sal'] / 1e6:.2f}M")

    # ---- sanity: payrolls, rosters
    log("Payroll check (2026-27): Fantrax salary vs contract sheet column")
    sheet_pay = defaultdict(float)
    for r in sheet:
        if r["gm"] and isinstance(r["yrs"][0], (int, float)):
            sheet_pay[r["gm"]] += r["yrs"][0]
    fx_pay = defaultdict(float)
    counts = defaultdict(Counter)
    for p in players.values():
        if p["gm"]:
            fx_pay[p["gm"]] += p["sal"] / 1e6
            counts[p["gm"]][p["ct"]] += 1
    for code, name in GMS:
        diff = fx_pay[code] - sheet_pay[code]
        flag = "" if abs(diff) < 0.01 else f"   <- differs by {diff:+.2f}M (Fantrax is current)"
        over = "  OVER CAP" if fx_pay[code] > CAP / 1e6 else ""
        log(f"  {code:9s} Fantrax ${fx_pay[code]:6.2f}M  sheet ${sheet_pay[code]:6.2f}M  "
            f"{dict(counts[code])}{flag}{over}")
    for r in sheet:
        if r["gm"] and not any(norm_name(p["n"]) == norm_name(r["name"]) or
                               alias.get(norm_name(p["n"])) == norm_name(r["name"]) for p in players.values() if p["gm"]):
            if not re.search(r"\((F|D)\)", r["name"]):
                log(f"  ~ on contract sheet ({r['gm']}) but not on a Fantrax roster: {r['name']}")

    # category reconciliation: 2G+A, Pt-D only for D
    bad_ptd = [p["n"] for p in players.values() if p["kind"] == "S" and p["pos"] == "F" and p["s25"][1] > 0]
    if bad_ptd:
        log(f"  ! forwards with Pt-D > 0 (dual F,D?): {bad_ptd[:10]}")
    bad = [p["n"] for p in players.values() if p["kind"] == "S" and p["pos"] == "D" and p["s25"][0] > 0 and
           abs(p["s25"][1] - (p["s25"][2] + p["s25"][3])) > 0.5]
    log(f"Category reconcile: D-men whose Pt-D != G+A (2025-26): {len(bad)} {bad[:8]}")
    ghist = [p for p in players.values() if p["kind"] == "G" and p.get("h") and p["s25"][0] > 0]
    g_ok = sum(1 for p in ghist if p["h"][-1][0] == 20252026 and p["h"][-1][1] == p["s25"][0] and p["h"][-1][2] == p["s25"][1])
    log(f"Goalie reconcile: 2025-26 GP & W match NHL for {g_ok}/{len(ghist)}")
    s_hist = [p for p in players.values() if p["kind"] == "S" and p.get("h") and p["s25"][0] > 0 and p["h"][-1][0] == 20252026]
    fields = [(2, 2, "G"), (3, 3, "A"), (4, 4, "PIM"), (5, 5, "SOG"), (6, 6, "STP"), (7, 7, "Hit"), (8, 8, "Blk"), (9, 9, "Tk")]
    for fi, hi, nm in fields:
        ok = sum(1 for p in s_hist if abs(p["s25"][fi] - p["h"][-1][hi]) <= 0.5)
        log(f"  {nm:4s} Fantrax 2025-26 == NHL: {ok}/{len(s_hist)}")

    # ---- NHL schedule -> fantasy weeks
    wk_of = {}
    for w in weeks:
        d = dt.date.fromisoformat(w["start"])
        while d <= dt.date.fromisoformat(w["end"]):
            wk_of[d.isoformat()] = w["n"]
            d += dt.timedelta(days=1)
    season_start = dt.date.fromisoformat(weeks[0]["start"])
    sched = {}
    team_games = {}
    for t in API.NHL_TEAMS:
        d = API.club_schedule(t) or {}
        gl = [g for g in d.get("games", []) if g.get("gameType") == 2]
        team_games[t] = len(gl)
        rows = []
        for g in gl:
            day = (dt.date.fromisoformat(g["gameDate"]) - season_start).days
            home = g["homeTeam"]["abbrev"] == t
            opp = g["awayTeam"]["abbrev"] if home else g["homeTeam"]["abbrev"]
            rows.append([day, opp, 1 if home else 0])
        sched[t] = rows
    log(f"NHL schedule: games per team {Counter(team_games.values())}")
    outside = sum(1 for t, rows in sched.items() for r in rows
                  if (season_start + dt.timedelta(days=r[0])).isoformat() not in wk_of)
    log(f"NHL games outside the fantasy calendar: {outside}")

    # ---- 2025-26 NHL team strength (for strength-of-schedule): goals for/against per game
    tstr = {}
    try:
        exp = "seasonId=20252026 and gameTypeId=2"
        import urllib.parse
        d = API.get(f"{API.STATS}/team/summary?limit=-1&cayenneExp={urllib.parse.quote(exp)}", "stats_team_summary_20252026")
        abbr = {}
        tl = API.get(f"{API.STATS}/team", "stats_team_list") or {}
        for t in tl.get("data", []):
            abbr[t["id"]] = t["triCode"]
        for r in (d or {}).get("data", []):
            tri = abbr.get(r["teamId"])
            if tri:
                tstr[tri] = [round(r["goalsForPerGame"], 2), round(r["goalsAgainstPerGame"], 2),
                             round(r.get("shotsForPerGame") or 0, 1), round(r.get("shotsAgainstPerGame") or 0, 1)]
        if "UTA" not in tstr and "ARI" in tstr:
            tstr["UTA"] = tstr["ARI"]
    except Exception as e:
        log(f"  ! team strength fetch failed: {e}")

    league = load_trades(players)
    league["drafts"] = load_drafts(players)
    build_prospects(players, act27, hist26, bios, leagues)
    write_league(players, weeks, h2h, sched, tstr, sheet, act27, hist26, beta_cor, league)
    with open(os.path.join(ROOT, "tools", "build_report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(REPORT) + "\n")
    print("wrote tools/build_report.txt")


# ----------------------------------------------------------------------------- prospects file
def build_prospects(players, act27, hist26, bios, leagues):
    log("Leagues seen in player histories (top 40): " + ", ".join(f"{k}:{v}" for k, v in leagues.most_common(40)))
    unmapped = [k for k, v in leagues.most_common(80) if nhle_factor(k) is None]
    log(f"Leagues without an NHLe factor (shown without NHLe): {unmapped}")

    # 2026 NHL draft (NHL API) + pre-draft scouting notes (prospect-app/draft_2026.csv)
    notes = {}
    with open(os.path.join(ROOT, "legacy", "prospect-app", "draft_2026.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            notes[norm_name(r["Player"])] = r
    d = API.draft_picks(2026) or {"picks": []}
    by_name = {norm_name(p["n"]): p for p in players.values()}
    picks = []
    jobs = []
    for pk in d["picks"]:
        if "firstName" not in pk:  # forfeited pick
            continue
        name = pk["firstName"]["default"] + " " + pk["lastName"]["default"]
        rec = {"ov": pk["overallPick"], "rd": pk["round"], "pr": pk["pickInRound"], "team": pk["teamAbbrev"],
               "n": name, "pos": pk.get("positionCode"), "nat": pk.get("countryCode"), "ht": pk.get("height"),
               "wt": pk.get("weight"), "lg": pk.get("amateurLeague"), "club": pk.get("amateurClubName")}
        fp = next((by_name[k] for k in name_keys(name) if k in by_name), None)
        if fp:
            rec["fid"] = fp["id"]
            rec["gm"] = fp["gm"]
            if fp.get("nhl"):
                rec["nhl"] = fp["nhl"]
        nt = next((notes[k] for k in name_keys(name) if k in notes), None)
        rec["n"] = re.sub(r"^(\S+)\s*\((.+?)\)\s*", r"\2 ", name) if "(" in name else name
        if nt:
            rec["pre"] = {"rank": int(num(nt["Rank"])), "lg": nt["League"], "gp": int(num(nt["GP"])), "g": int(num(nt["G"])),
                          "a": int(num(nt["A"])), "pts": int(num(nt["Pts"])), "nhle": num(nt["NHLe"]), "size": nt["Size"],
                          "tier": nt["Fantasy_Tier"], "style": nt["Style"], "cats": nt["Fantasy_Cats"],
                          "note": nt["Scouting_Note"], "trend": nt["Trend"], "stock": nt["Stock_Note"]}
        picks.append(rec)
    # find NHL ids for draftees not already known, then their landing pages (league histories)
    for rec in picks:
        if "nhl" in rec:
            continue
        res = API.search_player(strip_accents(rec["n"])) or API.search_player(norm_name(rec["n"]).split()[-1]) or []
        for r in res:
            if norm_name(r["name"]) == norm_name(rec["n"]):
                rec["nhl"] = int(r["playerId"])
                break
    lands = API.get_many([(f"{API.WEB}/player/{r['nhl']}/landing", f"landing_{r['nhl']}", 14) for r in picks if r.get("nhl")], workers=10)
    it = iter(lands)
    for rec in picks:
        if not rec.get("nhl"):
            continue
        dd = next(it)
        if not dd:
            continue
        rec["dob"] = dd.get("birthDate")
        rec["sh"] = dd.get("shootsCatches")
        car = []
        for s in dd.get("seasonTotals", []):
            if s.get("gameTypeId") != 2:
                continue
            if rec["pos"] == "G":
                car.append([s["season"], s.get("leagueAbbrev"), (s.get("teamName") or {}).get("default", ""),
                            s.get("gamesPlayed", 0), s.get("wins") or 0, round(s.get("goalsAgainstAvg") or 0, 2),
                            round(s.get("savePctg") or 0, 3), s.get("shutouts") or 0])
            else:
                car.append([s["season"], s.get("leagueAbbrev"), (s.get("teamName") or {}).get("default", ""),
                            s.get("gamesPlayed", 0), s.get("goals") or 0, s.get("assists") or 0, s.get("points") or 0,
                            s.get("pim") or 0])
        rec["car"] = car
    log(f"2026 draft: {len(picks)} picks, {sum(1 for r in picks if r.get('pre'))} with scouting notes, "
        f"{sum(1 for r in picks if r.get('gm'))} on league rosters, {sum(1 for r in picks if r.get('car'))} with histories")
    missing_notes = [n for n in notes if not any(n in name_keys(r["n"]) for r in picks)]
    if missing_notes:
        log(f"  ~ scouted pre-draft but not drafted / name mismatch: {missing_notes}")

    boards = {}
    for y in (2027, 2028, 2029):
        path = os.path.join(RESEARCH, f"board_{y}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                boards[y] = json.load(f)
            # flag any board prospect already owned in the league
            for b in boards[y].get("players", []):
                fp = by_name.get(norm_name(b["name"]))
                if fp and fp["gm"]:
                    b["gm"] = fp["gm"]
                    b["fid"] = fp["id"]
    extra = {}
    for nm in ("injuries", "depth", "notes"):
        path = os.path.join(RESEARCH, f"{nm}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                extra[nm] = json.load(f)

    out = {"nhle": NHLE, "nhleAlias": NHLE_ALIASES, "draft2026": picks, "boards": boards}
    with open(os.path.join(OUT, "prospects.js"), "w", encoding="utf-8") as f:
        f.write("/* generated by tools/build_data.py - do not edit */\nwindow.DP=window.DP||{};DP.prospects=")
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\n")
    with open(os.path.join(OUT, "research.js"), "w", encoding="utf-8") as f:
        f.write("/* generated by tools/build_data.py from tools/research/*.json */\nwindow.DP=window.DP||{};DP.research=")
        json.dump(extra, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\n")


# ----------------------------------------------------------------------------- league file
def write_league(players, weeks, h2h, sched, tstr, sheet, act27, hist26, beta_cor, league):
    plist = []
    for p in sorted(players.values(), key=lambda p: (p["gm"] is None, -(p["fxp"][0] or 0), p["n"])):
        o = {k: p[k] for k in ("id", "n", "t", "pos", "gm", "ct", "sal", "fxage", "s25", "p26", "fx", "fxp", "cgp") if k in p}
        for k in ("nhl", "fd", "wv", "rk", "dob", "sh", "ht", "wt", "nat", "hs", "nt", "slug", "dr", "car", "h", "tkc",
                  "c", "act27", "cgps"):
            if p.get(k) not in (None, 0, [], ""):
                o[k] = p[k]
        o["s25"] = [round(x, 3) for x in o["s25"]]
        o["p26"] = [round(x, 3) for x in o["p26"]]
        plist.append(o)
    meta = {
        "built": dt.datetime.now().isoformat(timespec="minutes"), "season": SEASON_LABEL, "seasonId": SEASON_ID,
        "cap": CAP, "years": YEARS, "nhlGames": NHL_GAMES,
        "gms": [{"code": c, "name": n} for c, n in GMS],
        "weeks": weeks, "h2h": h2h,
        "playoffs": {"teams": 8, "weeks": [25, 26, 27], "bracket": [[1, 8], [4, 5], [3, 6], [2, 7]],
                     "source": "Fantrax schedule pasted by the commissioner 2026-09-25"},
        "rules": {
            "goalieMinGP": 2, "goalieMinCats": ["W", "GAA", "SV%", "SHO"],
            "goalieMinNote": "Commissioner 2026-09-25: a team with fewer than 2 goalie GP in a week loses all four goalie categories.",
            "deadCapPct": 0.5, "deadCapNote": "Commissioner 2026-09-25: 50% salary retention on dropped contracts "
                                              "(applied here to every remaining contract year).",
            "gradSkater": 82, "gradGoalie": 41, "elcSalary": 1.5, "minSalary": 1.0,
            "lineup": {"F": 12, "D": 6, "G": 2, "bench": 3},
            "ext2027": {"base": [1.5, 1.5, 3, 4, 5, 6], "mult": [1, 1.5, 1.5, 1.5, 1.75, 1.75]},
            "ext2026": {"base": [1, 1, 2, 3, 4, 5], "mult": [1, 1.5, 1.5, 1.5, 1.75, 1.75]},
        },
        "corModel": [round(b, 4) for b in beta_cor],
        "sources": [
            {"name": "Fantrax exports (2025-26 official, 2026-27 projected)", "file": "raw/2026-27/*.csv"},
            {"name": "Contract Sheet 2026-27.xlsx", "file": "raw/2026-27/Contract Sheet 2026-27.xlsx"},
            {"name": "Fantrax H2H schedule", "file": "raw/2026-27/h2h_schedule_fantrax.txt"},
            {"name": "NHL stats API (bulk season reports 2022-23 to 2025-26)", "url": "https://api.nhle.com/stats/rest/en/"},
            {"name": "NHL web API (player landing, club schedules, rosters, prospects, draft)", "url": "https://api-web.nhle.com/v1/"},
        ],
    }
    offseason = {"act27": act27, "hist26": hist26}
    with open(os.path.join(OUT, "league.js"), "w", encoding="utf-8") as f:
        f.write("/* generated by tools/build_data.py - do not edit */\nwindow.DP=window.DP||{};\n")
        f.write("DP.meta=")
        json.dump(meta, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\nDP.nhl=")
        json.dump({"sched": sched, "str": tstr}, f, separators=(",", ":"))
        f.write(";\nDP.offseason=")
        json.dump(offseason, f, separators=(",", ":"), ensure_ascii=False, default=str)
        f.write(";\nDP.league=")
        json.dump(league, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\nDP.players=")
        json.dump(plist, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\n")
    log(f"wrote data/league.js ({os.path.getsize(os.path.join(OUT, 'league.js')) / 1e6:.2f} MB, {len(plist)} players)")


if __name__ == "__main__":
    main()
