// Assertions for the trade / contention model and the cap rules. Exits non-zero on failure.
//   node tools/test/check_trade.js
const load = require('./load.js');
load(['data/league.js', 'data/prospects.js', 'assets/js/engine.js']);
const E = DP.E; E.init();
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);

// ---- contention
const C = E.contention();
ok(E.teams.every((t) => C[t] && C[t].k.length === E.YEARS.length), 'every team has a win-now weight per season');
E.YEARS.forEach((_, y) => {
  const m = E.teams.reduce((s, t) => s + C[t].k[y], 0) / E.teams.length;
  ok(near(m, 1, 1e-6), `win-now weights average 1 in season ${y} (got ${m})`);
});
ok(E.teams.every((t) => C[t].k[0] >= E.CONTEND.floor - 1e-9), 'win-now weight never below the floor');
const tiers = E.teams.map((t) => C[t].tier);
ok(tiers.filter((x) => x === 'contender').length >= 1, 'at least one contender');
ok(tiers.filter((x) => x === 'out').length >= tiers.filter((x) => x === 'contender').length, 'more teams out of it than contending');
// weight is increasing in title odds (below 50%)
const byChamp = E.teams.slice().sort((a, b) => C[a].champ - C[b].champ);
for (let i = 1; i < byChamp.length; i++) if (C[byChamp[i]].champ < 0.5) ok(C[byChamp[i]].k[0] >= C[byChamp[i - 1]].k[0] - 1e-9, `k0 monotone in title odds (${byChamp[i - 1]} → ${byChamp[i]})`);
ok(C._beta > 0 && C._beta < 0.5, 'fitted softmax slope in range');
// the cached sim is what the pages show
ok(E.baseSim() === E.baseSim(), 'base sim is cached');
ok(E.baseSim().every((r) => r.champ >= 0 && r.champ <= 1), 'title odds are probabilities');
ok(near(E.baseSim().reduce((s, r) => s + r.champ, 0), 1, 1e-9), 'title odds sum to 1');

// ---- use value
E.teams.forEach((t) => { const u = E.useValue(t, [], []); ok(near(u.total, 0), `no-op use value is 0 for ${t}`); });
const top = E.teams.slice().sort((a, b) => C[b].k[0] - C[a].k[0])[0];
const bottom = E.teams.slice().sort((a, b) => C[a].k[0] - C[b].k[0])[0];
const vet = E.rosters[bottom].filter((p) => p.yVal && p.yVal[0] > 1).sort((a, b) => b.yVal[0] - a.yVal[0])[0];
if (vet) {
  ok(E.valueGap(vet, top) > 0, `${vet.n} is worth more to contender ${top} than to ${bottom}`);
  const uTop = E.useValue(top, [vet], []), uBot = E.useValue(bottom, [], [vet]);
  ok(uTop.now > 0, `${top} gains this season from ${vet.n}`);
  ok(uBot.total < 0, `${bottom} loses value when ${vet.n} leaves`);
  // this-season value scales with the win-now weight: a contender's now-gain per cat win beats the rebuilder's
  ok(uTop.now / Math.max(1e-9, uTop.g0) > -uBot.now / Math.max(1e-9, -uBot.g0), 'contender weighs 2026-27 wins more');
}
// picks are zero-sum between the two teams
const pk = E.picksOf(bottom)[0];
if (pk) {
  const tu = E.tradeUse([{ asset: { kind: 'pick', pk }, from: bottom, to: top }]);
  ok(near(tu[top].picks + tu[bottom].picks, 0), 'pick value is zero-sum');
  ok(near(tu[top].picks, E.pickValue(pk)), 'pick counted at market value');
}
// a round trip is a no-op
if (vet) {
  const rt = E.tradeUse([{ asset: { kind: 'player', p: vet }, from: bottom, to: bottom }]);
  ok(near(rt[bottom].total, E.useValue(bottom, [vet], [vet]).total), 'self-trade consistent');
}

// ---- cap: IR players are off this season's cap only
E.teams.forEach((t) => {
  const c = E.teamCap(t), ir = E.rosters[t].filter((p) => p.fs === 'IR' && typeof p.cy[0] === 'number');
  const irSal = ir.reduce((s, p) => s + p.cy[0], 0);
  ok(near(c[0].ir, E.RULES.irCapExempt === false ? 0 : irSal, 1e-6), `IR relief matches IR salaries for ${t}`);
  const all0 = E.rosters[t].reduce((s, p) => s + (typeof p.cy[0] === 'number' ? p.cy[0] : 0), 0);
  const pen0 = E.penaltiesOf(t).reduce((s, d) => s + (d.amt[0] || 0), 0);
  ok(near(c[0].total, all0 - c[0].ir + pen0, 1e-6), `2026-27 cap total = salaries - IR + penalties for ${t}`);
  ok(near(c[0].space, c[0].cap - c[0].total, 1e-9), `space = cap - total for ${t}`);
});

// ---- in-season proration: this season's value shrinks as weeks lock; later seasons don't
{
  const vet2 = E.P.filter((p) => p.gm && p.yVal && p.yVal[0] > 2).sort((a, b) => b.yVal[0] - a.yVal[0])[0];
  const dv0 = vet2.DV, later0 = vet2.yVal.slice(1).reduce((s, v, i) => s + Math.pow(E.DISCOUNT, i + 1) * v, 0);
  ok(near(E.remFrac(), 1, 1e-9) || E.lockWeek() !== 0, 'full season ahead before week 1 locks');
  DP.nowOverride = '2027-01-28T15:00:00Z'; E.init();
  const v2 = E.byId[vet2.id], rem = E.remFrac();
  ok(rem > 0.1 && rem < 0.5, `about a quarter of the season left at the deadline (${rem.toFixed(2)})`);
  ok(v2.DV < dv0, `${v2.n}: market value lower at the deadline (${dv0.toFixed(1)} → ${v2.DV.toFixed(1)})`);
  ok(near(v2.DV, later0 + v2.yVal[0] * rem, 1e-6), 'DV = remaining share of this season + later seasons');
  DP.nowOverride = '2027-05-01T15:00:00Z'; E.init();
  ok(near(E.remFrac(), 0), 'nothing left after the last lock');
  ok(E.teams.every((t) => near(E.gain(t, [E.rosters[t][0]], []).total, 0)), 'no this-season gain after the last lock');
  DP.nowOverride = null; E.init();
}

// ---- in-season calendar: injuries and graduation are counted from today, not from opening night
{
  const mid = '2026-11-10T15:00:00Z';
  DP.nowOverride = mid; E.init();
  const lw = E.lockWeek(), guy = E.P.find((p) => p.gm && p.r && !p.inj && p.projGP > 60);
  ok(lw > 3, `mid-November is past week 4 (lock week index ${lw})`);
  guy.inj = ['IR', 'test', 'Week-to-week', '2026-11-07', 0];
  ok(E.injuredOut(guy, lw - 1) && E.injuredOut(guy, lw) && E.injuredOut(guy, lw + 1) && !E.injuredOut(guy, lw + 2), 'week-to-week in November = out this week and the next two lineup weeks, back after');
  guy.inj = ['OUT', 'test', '', '2026-11-09', 0];
  ok(E.injuredOut(guy, lw) && !E.injuredOut(guy, lw + 1), 'out with no timeline = out for the week being set only');
  guy.inj = ['DTD', 'test', '', '2026-11-09', 0];
  ok(!E.injuredOut(guy, lw), 'day-to-day is not treated as out');
  guy.inj = ['IR', 'test', 'Season', '2026-11-09', 0];
  ok(E.injuredOut(guy, E.NW - 1), 'out for the season = out every week');
  delete guy.inj;
  E.teams.forEach((t) => {
    const c = E.lineupCheck(t, lw);
    if (c) ok(c.start.every((x) => !E.injuredOut(x.p, lw)) && c.opt.lu.F.concat(c.opt.lu.D, c.opt.lu.G).every((x) => !E.injuredOut(x.p, lw)), `lineup check never suggests an injured player (${t})`);
  });
  const d0 = E.dataDay();
  E.P.filter((p) => p.gm && p.ct === 'MNR').forEach((p) => {
    const g = E.graduation(p);
    if (g.week !== null) ok(g.week >= lw - 1 && g.date && E.dayIndex(g.date.toISOString().slice(0, 10)) >= d0, `${p.n}: projected graduation is not in the past (week ${g.week + 1})`);
    ok(g.prob >= 0 && g.prob <= 1, `${p.n}: graduation probability is a probability`);
  });
  // the contract model graduates a player this season only if the games still to come get him there
  E.P.filter((p) => p.gm && p.ct === 'MNR' && p.gradThr - (p.cgp || 0) > 0).forEach((p) => {
    const need = p.gradThr - (p.cgp || 0), rem = E.remGP(p);
    ok((p.grad === 0) === (rem >= need), `${p.n}: graduates this season exactly when remaining games (${rem.toFixed(1)}) cover the ${need} needed`);
    ok(rem <= p.projGP + 1e-9, `${p.n}: games left never exceed the season projection`);
  });
  DP.nowOverride = '2026-09-20T12:00:00Z'; E.init();
  ok(E.P.filter((p) => p.r && p.nt26).every((p) => near(E.remGP(p), p.projGP, 1e-6)), 'before the season, games left = the full projection');
  guy.inj = ['IR', 'test', 'Week-to-week', '2026-09-18', 0];
  ok(E.lockWeek() === 0 && E.injuredOut(guy, 0) && E.injuredOut(guy, 1) && !E.injuredOut(guy, 2), 'before the season the count starts at week 1');
  delete guy.inj;
  DP.nowOverride = null; E.init();
}

// ---- league draft order for the mock draft
const picks27 = (DP.league.picks || []).filter((p) => p.year === 2027);
ok(picks27.length === E.teams.length * (DP.league.rounds || 3), `2027 has ${E.teams.length * 3} picks (got ${picks27.length})`);
ok(picks27.every((p) => E.rosters[p.owner] && E.rosters[p.orig]), 'every 2027 pick has a valid owner and original team');

// ---- traded cap space: each team's own cap (Fantrax), cap as a trade asset
{
  const adj = (t) => E.capAdj(t)[0] || 0;
  ok(near(E.teams.reduce((s, t) => s + adj(t), 0), 0, 1e-6), 'cap sent and cap received cancel out across the league');
  E.teams.forEach((t) => {
    const c = E.teamCap(t);
    ok(near(c[0].cap, E.capY(0) + adj(t), 1e-9) && near(c[0].cap, E.capOf(t, 0), 1e-9), `own cap = league cap + traded cap for ${t}`);
    ok(c.slice(1).every((y, i) => near(y.cap, E.capY(i + 1), 1e-9)), `later seasons are at the league cap for ${t}`);
    const logged = E.capMoves(t).reduce((s, m) => s + m.amt, 0);
    ok(near(logged, adj(t), 1e-6), `logged cap moves add up to Fantrax's cap for ${t} (${logged} vs ${adj(t)})`);
    // a what-if: cap coming in or going out moves this season's cap and space one for one, nothing else
    const up = E.teamCap(t, null, null, 2.5), dn = E.teamCap(t, null, null, -2.5);
    ok(near(up[0].space - c[0].space, 2.5, 1e-9) && near(dn[0].space - c[0].space, -2.5, 1e-9), `what-if cap moves space one for one (${t})`);
    ok(near(up[0].total, c[0].total, 1e-9) && near(up[1].cap, c[1].cap, 1e-9), `what-if cap leaves payroll and next season alone (${t})`);
  });
  // every cap move in the trade list is between two teams of that trade, and this season's add up to the caps
  const net = {}; E.teams.forEach((t) => { net[t] = 0; });
  (DP.league.trades || []).forEach((tr) => tr.moves.filter((m) => m.kind === 'cap').forEach((m) => {
    ok(tr.teams.indexOf(m.from) >= 0 && tr.teams.indexOf(m.to) >= 0 && m.amt > 0, `cap in the ${tr.date} trade moves between its teams`);
    if (tr.season === DP.meta.season) { net[m.to] += m.amt; net[m.from] -= m.amt; }
  }));
  E.teams.forEach((t) => ok(near(net[t], adj(t), 1e-6), `cap in this season's trades matches ${t}'s cap (${net[t]} vs ${adj(t)})`));
  // value: this season's cap space is weighted like this season's salary; nothing under a lens that ignores cap
  const L = E.LENS_MODEL, v1 = E.assetValue({ kind: 'cap', amt: 1, cur: true }, L), v4 = E.assetValue({ kind: 'cap', amt: 4, cur: true }, L);
  ok(near(v1, L.lam / E.dollarPerWAR * L.now * E.remFrac(), 1e-9) && near(v4, 4 * v1, 1e-9), 'cap space value is linear and prorated to the season left');
  ok(E.assetValue({ kind: 'cap', amt: 4, cur: true }, Object.assign({}, L, { lam: 0 })) === 0, 'cap space is worth nothing to a lens that ignores cap');
  const big = E.P.filter((p) => p.gm && p.ct === 'BID' && p.sal26 >= 4 && p.fs !== 'IR')[0];
  if (big) { // $X of cap space offsets $X of this season's salary in the lens (above the league minimum, which the model nets out)
    const noCost = Object.assign({}, L, { lam: 0 }), d0 = (E.dvWith(big, noCost) - E.dvWith(big, L));
    ok(d0 >= -1e-9, 'salary never adds value');
  }
  // use value: the receiver gains, the sender gives up, in proportion to each one's win-now weight
  const a = E.teams[0], b = E.teams[1], u = E.tradeUse([{ asset: { kind: 'cap', amt: 3, cur: true }, from: a, to: b }]);
  ok(u[b].cap > 0 && u[a].cap < 0 && near(u[b].capIn, 3) && near(u[a].capIn, -3), 'cap-only trade: receiver up, sender down');
  ok(near(u[b].cap / u[b].k[0], -u[a].cap / u[a].k[0], 1e-9), 'cap use value scales with the win-now weight');
  ok(near(u[b].total, u[b].cap, 1e-9) && near(u[a].total, u[a].cap, 1e-9), 'cap-only trade moves nothing else');
  const tv = E.tradeValue([{ asset: { kind: 'cap', amt: 3, cur: true }, from: a, to: b }]);
  ok(near(tv[a].net, -tv[b].net, 1e-9) && tv[b].net > 0, 'market value of cap is zero-sum');
}

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
