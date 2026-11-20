"""Checks for the line / power-play change log (tools/research/depth_log.py): what counts as a move, what is noise,
and how two runs on one day merge. Also sanity-checks the published log. Exits non-zero on failure.
    python tools/test/check_depthlog.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools", "research"))
import depth_log as D  # noqa: E402

n = fails = 0


def ok(cond, msg):
    global n, fails
    n += 1
    if not cond:
        fails += 1
        print("FAIL", msg)


def team(updated, **k):
    t = {"updated": updated}
    t.update(k)
    return t


A = ["A1", "A2", "A3"]
prev = {"teams": {"XXX": team("2026-11-01", f1=["Top", "Mid", "Low"], f2=["F2a", "F2b", "F2c"], f3=["Riser", "F3b", "F3c"], f4=["Scratch", "F4b", "F4c"],
                                 d1=["D1a", "D1b"], d2=["D2a", "D2b"], d3=["D3a", "Dee"], pp1=["Top", "Mid", "F2a", "D1a", "Low"], pp2=["Riser"], goalies=["Gone", "Backup"]),
                  "YYY": team("2026-11-01", f1=["Same"])}}
cur = {"teams": {"XXX": team("2026-11-02", f1=["Top", "Mid", "Riser"], f2=["F2a", "F2b", "F2c"], f3=["Low", "F3b", "F3c"], f4=["New", "F4b", "F4c"],
                                d1=["D1a", "D1b"], d2=["D2a", "Dee"], d3=["D3a", "D2b"], pp1=["Top", "Mid", "Riser", "D1a", "Low"], pp2=["F2a"], goalies=["Backup", "Gone"]),
                 "YYY": team("2026-11-01", f1=["Other"])}}
ev = D.diff(prev, cur, "2026-11-02")
get = lambda name, k: [e for e in ev if e["n"] == name and e["k"] == k]
ok(get("Riser", "line") and get("Riser", "line")[0]["to"] == "F1" and get("Riser", "line")[0]["up"], "F3 -> F1 is a promotion")
ok(get("Low", "line") and not get("Low", "line")[0]["up"], "F1 -> F3 is a demotion")
ok(not get("F2a", "line"), "no line change, no event")
ok(get("F2a", "pp") and get("F2a", "pp")[0]["from"] == "PP1" and get("F2a", "pp")[0]["to"] == "PP2", "PP1 -> PP2")
ok(get("Riser", "pp") and get("Riser", "pp")[0]["to"] == "PP1" and get("Riser", "pp")[0]["up"], "PP2 -> PP1 is a promotion")
ok(get("Scratch", "line") and get("Scratch", "line")[0]["to"] == "" and not get("Scratch", "line")[0]["up"], "out of the lineup")
ok(get("New", "line") and get("New", "line")[0]["from"] == "" and get("New", "line")[0]["up"], "into the lineup")
ok(get("Dee", "line") and get("Dee", "line")[0]["to"] == "D2", "D3 -> D2 crosses into the top four")
ok(get("Backup", "g") and get("Backup", "g")[0]["to"] == "G1" and get("Gone", "g")[0]["to"] == "G2", "goalie order swap")
ok(not [e for e in ev if e["t"] == "YYY"], "a team whose chart was not refreshed is skipped")
# inside the top six / bottom of the lineup: noise
p2 = {"teams": {"Z": team("1", f1=["S1"], f2=["S2"], f3=["S3"], f4=["S4"], d1=["E1"], d2=["E2"])}}
c2 = {"teams": {"Z": team("2", f1=["S2"], f2=["S1"], f3=["S4"], f4=["S3"], d1=["E2"], d2=["E1"])}}
ok(D.diff(p2, c2, "x") == [], "shuffles inside the top six, the bottom six and the top four are ignored")
p3 = {"teams": {"Z": team("1", f2=["Swing"])}}
c3 = {"teams": {"Z": team("2", d1=["Swing"])}}
ok(D.diff(p3, c3, "x") == [], "F <-> D listing quirk is ignored")
# two runs on one day merge; an undone move disappears
m = D.merge([{"d": "d", "t": "T", "n": "P", "k": "line", "from": "F3", "to": "F2", "up": True},
             {"d": "d", "t": "T", "n": "P", "k": "line", "from": "F2", "to": "F3", "up": False}])
ok(m == [], "a move undone the same day is dropped")
m = D.merge([{"d": "d", "t": "T", "n": "P", "k": "line", "from": "F4", "to": "F2", "up": True},
             {"d": "d", "t": "T", "n": "P", "k": "line", "from": "F2", "to": "", "up": False}])
ok(len(m) == 1 and m[0]["from"] == "F4" and m[0]["to"] == "" and not m[0]["up"], "same-day moves merge into start and end of the day")
# the published log
path = os.path.join(ROOT, "data", "depthlog.js")
if os.path.exists(path):
    txt = open(path, encoding="utf-8").read()
    L = json.loads(txt[txt.index("DP.depthLog=") + len("DP.depthLog="):].rstrip().rstrip(";"))
    evs = L["events"]
    ok(all(evs[i]["d"] <= evs[i + 1]["d"] for i in range(len(evs) - 1)), "published events are in date order")
    ok(all(e["k"] in ("line", "pp", "g") and e["from"] != e["to"] for e in evs), "every published event is a real change")
    ok(all(not (e["k"] == "line" and e["from"] and e["to"] and e["from"][0] != e["to"][0]) for e in evs), "no F <-> D events")
    ok(all(not (e["k"] == "line" and e["from"] and e["to"] and (e["from"] in D.TOP) == (e["to"] in D.TOP)) for e in evs), "no top-six / bottom shuffles")
    keys = [(e["d"], e["t"], e["n"], e["k"]) for e in evs]
    ok(len(keys) == len(set(keys)), "one event per player, kind and day")
    ok(all(e["up"] == (bool(e["to"]) and (not e["from"] or D.RANK.get(e["to"], 9) < D.RANK.get(e["from"], 9))) for e in evs), "up/down matches the move")
print(f"{n - fails}/{n} checks passed")
sys.exit(1 if fails else 0)
