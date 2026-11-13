"""Assertions for the Fantrax sync's change detection (cap space changing hands). Exits non-zero on failure.
    python tools/test/check_fantrax.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import fantrax_api as FX  # noqa: E402

fails = n = 0


def ok(cond, msg):
    global fails, n
    n += 1
    if not cond:
        fails += 1
        print("FAIL", msg)


T = ["A", "B", "C", "D", "E"]
base = {t: 104_000_000 for t in T}


def caps(**kw):
    c = dict(base)
    for t, v in kw.items():
        c[t] = 104_000_000 + int(v * 1e6)
    return c


def pairs(ev):
    return sorted((e["from"], e["to"], e["amt"]) for e in ev)


ok(FX.cap_base(base) == 104_000_000, "league cap = the figure most teams have")
ok(FX.cap_base(caps(A=4, B=-4)) == 104_000_000, "league cap unchanged by two teams trading cap")
ok(FX.cap_moves(base, base, "2026-11-13") == [], "no change, no events")
# one trade
ev = FX.cap_moves(base, caps(A=-4, B=4), "2026-11-13")
ok(pairs(ev) == [("A", "B", 4_000_000)], "sender's cap down, receiver's up -> one move A to B")
ok(ev[0]["type"] == "cap" and ev[0]["d"] == "2026-11-13" and ev[0]["id"] == "cap-2026-11-13-A-B", "event shape")
# two trades the same night: equal amounts pair up
ev = FX.cap_moves(base, caps(A=-4, B=4, C=-3.5, D=3.5), "d")
ok(pairs(ev) == [("A", "B", 4_000_000), ("C", "D", 3_500_000)], "two trades in one night are paired by amount")
# on top of earlier cap trades: only the change is logged
ev = FX.cap_moves(caps(A=-4, B=4), caps(A=-4, B=2.5, C=1.5), "d")
ok(pairs(ev) == [("B", "C", 1_500_000)], "only the change since the last snapshot is logged")
# one sender, two receivers
ev = FX.cap_moves(base, caps(A=-5, B=3, C=2), "d")
ok(pairs(ev) == [("A", "B", 3_000_000), ("A", "C", 2_000_000)], "one sender split across two receivers")
# a team sending cap back the other way
ev = FX.cap_moves(caps(A=-4, B=4), base, "d")
ok(pairs(ev) == [("B", "A", 4_000_000)], "cap handed back is a move the other way")
# the whole league's cap changing (new season) is not a trade
ev = FX.cap_moves(base, {t: 113_500_000 for t in T}, "d")
ok(ev == [], "a league-wide cap change logs nothing")
ev = FX.cap_moves(caps(A=-4, B=4), {t: 113_500_000 for t in T}, "d")
ok(pairs(ev) == [("B", "A", 4_000_000)], "new season: last season's traded cap unwinds")
# one-sided change (commissioner adjustment): logged without a partner
ev = FX.cap_moves(base, caps(A=2), "d")
ok(len(ev) == 1 and ev[0]["from"] is None and ev[0]["to"] == "A" and ev[0]["amt"] == 2_000_000, "one-sided increase is logged with no sender")
ev = FX.cap_moves(base, caps(A=-2), "d")
ok(len(ev) == 1 and ev[0]["to"] is None and ev[0]["from"] == "A", "one-sided decrease is logged with no receiver")
# every dollar is accounted for
old, new = caps(A=-1, B=1), caps(A=-6, B=2.5, C=3, D=0.5)
ev = FX.cap_moves(old, new, "d")
net = {t: 0 for t in T}
for e in ev:
    if e["to"]:
        net[e["to"]] += e["amt"]
    if e["from"]:
        net[e["from"]] -= e["amt"]
ok(all(net[t] == new[t] - old[t] for t in T), "moves add up to each team's change")
# diff_moves only compares caps when the older snapshot has them
ok(FX.diff_moves({"rosters": {}, "picks": []}, {"rosters": {}, "picks": [], "caps": caps(A=-4, B=4)}, "d") == [],
   "first snapshot with caps logs nothing (no earlier caps to compare)")
ok(pairs(FX.diff_moves({"rosters": {}, "picks": [], "caps": base}, {"rosters": {}, "picks": [], "caps": caps(A=-4, B=4)}, "d")) ==
   [("A", "B", 4_000_000)], "diff_moves includes cap moves")

print(f"{n - fails}/{n} checks passed")
sys.exit(1 if fails else 0)
