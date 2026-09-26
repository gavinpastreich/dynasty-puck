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

// ---- league draft order for the mock draft
const picks27 = (DP.league.picks || []).filter((p) => p.year === 2027);
ok(picks27.length === E.teams.length * (DP.league.rounds || 3), `2027 has ${E.teams.length * 3} picks (got ${picks27.length})`);
ok(picks27.every((p) => E.rosters[p.owner] && E.rosters[p.orig]), 'every 2027 pick has a valid owner and original team');

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
