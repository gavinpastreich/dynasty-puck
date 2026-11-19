// Assertions for the in-season tools: team colors, IR activation check, playoff math, hometown discount value, the
// opponent-tuned lineup, the season strip, World Juniors eligibility and the commissioner checks. Exits non-zero on failure.
//   node tools/test/check_season.js
const fs = require('fs'), path = require('path');
const load = require('./load.js');
const ROOT = path.join(__dirname, '..', '..');
global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { getContext() { return null; } }; }, head: { appendChild() {} }, documentElement: { dataset: {} } };
const opt = (f) => (fs.existsSync(path.join(ROOT, f)) ? [f] : []);
load(['data/league.js', 'data/prospects.js'].concat(opt('data/radar.js'), opt('data/draft.js'), opt('data/research.js'))
  .concat(['assets/js/util.js', 'assets/js/engine.js', 'assets/js/ui.js', 'assets/js/charts.js', 'assets/js/pages-overview.js', 'assets/js/pages-trade.js',
    'assets/js/pages-radar.js', 'assets/js/pages-weekly.js', 'assets/js/pages-season.js', 'assets/js/pages-scout.js']));
const E = DP.E, U = DP.U; E.init();
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; if (fails <= 25) console.log('FAIL', msg); } };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-9);

// ---- team colors and badges (config/league.json teams[].color / .abbr)
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cols = E.teams.map((t) => U.teamColor(t));
ok(new Set(cols).size === E.teams.length, 'every team has its own color');
E.teams.forEach((t) => {
  const c = U.teamColor(t);
  ok(/^#[0-9a-f]{6}$/i.test(c) && c !== '#6e7681', `${t}: color set in the config (${c})`);
  ok(1.05 / (lum(c) + 0.05) >= 4.5, `${t}: white badge letters readable on ${c}`);
  ok(U.teamAbbr(t).length >= 1 && U.teamAbbr(t).length <= 3 && U.teamBadge(t).indexOf('>' + U.teamAbbr(t) + '<') > 0, `${t}: badge shows its letters`);
  ok(U.teamLabel(t).indexOf('tdot') > 0 && U.teamChip(t, { link: 1 }).indexOf('#/team/') > 0, `${t}: label and chip`);
});

// ---- IR activation check
const lim = ((DP.league.fantrax || {}).roster || {}).maxTotalPlayers || 23;
E.teams.forEach((t) => {
  const X = DP.irCheck(t), ros = E.rosters[t], space = E.teamCap(t)[0].space;
  const ir = ros.filter((p) => p.fs === 'IR');
  ok(X.rows.length === ir.length && X.rows.every((r) => r.p.fs === 'IR'), `${t}: one row per IR-slot player`);
  ok(X.rows.every((r) => near(r.add, E.RULES.irCapExempt !== false ? r.p.sal26 || 0 : 0) && near(r.after, space - r.add)), `${t}: activating adds his salary back`);
  ok(near(X.all, space - E.sum(X.rows.map((r) => r.add))), `${t}: activating everyone`);
  ok(X.rows.every((r) => (r.st === 'healthy') === !r.p.inj), `${t}: "not on the injury report" = no Daily Faceoff entry`);
  ok(X.n === ros.filter((p) => p.fs === 'A' || p.fs === 'R').length && X.full === (X.n >= lim), `${t}: Active + Bench count`);
  ok(X.toIR.every((o) => (o.p.fs === 'A' || o.p.fs === 'R') && o.p.inj && /OUT|IR|Injured/i.test(o.p.inj[0])), `${t}: IR suggestions are injured players on the active roster`);
  ok(X.low.every((o) => near(o.drop, o.p.sal26 * (E.deadCapCounts(o.p) ? 1 - E.RULES.deadCapPct : 1)) && near(o.drop + o.dead, o.p.sal26)), `${t}: drop frees salary minus dead cap`);
  ok(X.low.every((o, i) => i === 0 || (o.p.DV || 0) >= (X.low[i - 1].p.DV || 0)), `${t}: cheapest to lose first`);
});
const use = DP.lineupUsage(E.teams[0]), lw = E.lockWeek();
ok(use._n === (lw === null ? 0 : Math.max(0, E.REG_WEEKS - lw)) && Object.keys(use).every((k) => k === '_n' || use[k] <= use._n), 'lineup usage counts the weeks left');

// ---- hometown discount value
E.P.filter((p) => p.gm && DP.pendingUFA(p)).slice(0, 60).forEach((p) => {
  const x = DP.htdValue(p), A = E.auctionPrice(p, 1);
  ok(x && near(x.price, A.mid) && near(x.total, A.mid * E.RULES.htdPct * A.term) && x.term >= 1 && x.term <= 6, `${p.n}: hometown discount = ${E.RULES.htdPct * 100}% of the price x term`);
  ok(p.yStatus[1] === 'UFA' && p.ct !== 'MNR', `${p.n}: pending free agent`);
});

// ---- playoff math: today (mid-season) and a finished season
const M = DP.playoffMath(), act = E.actual();
ok(M && E.teams.every((t) => M[t] && M[t].left === (E.REG_WEEKS - act.done) * E.NC), 'decisions left = weeks left x 15');
ok(E.teams.every((t) => near(M[t].pts, act.rec[t].W + act.rec[t].T / 2) && near(M[t].max, M[t].pts + M[t].left)), 'points = W + T/2');
ok(E.teams.filter((t) => M[t].st === 'in').length <= 8 && E.teams.filter((t) => M[t].st === 'out').length <= E.teams.length - 8, 'at most 8 clinched and 6 out');
const saveSt = DP.league.standings, saveLive = DP.live;
DP.live = {};
const divs = (DP.league.fantrax || {}).divisions || {};
const order = E.teams.slice(); // synthetic final standings: team i has 300 - 15 i category wins
DP.league.standings = order.map((t, i) => ({ t: t, W: 300 - 15 * i, L: 60 + 15 * i, T: 0 }));
const Mf = DP.playoffMath(), top8 = order.slice(0, 8);
const leaders = {}; order.forEach((t) => { const d = divs[t]; if (d && !leaders[d]) leaders[d] = t; });
const inSet = new Set(top8.concat(Object.values(leaders)));
ok(Mf[order[0]].left === 0, 'synthetic season is over');
// season over, no ties: the top 6 are in whatever the division titles do (2 division winners could pass them), so are
// the division winners; 7th-8th non-winners stay "not yet" (the rule is conservative); 9th and below non-winners are out
const want = (t) => { const rk = order.indexOf(t) + 1, lead = Object.values(leaders).indexOf(t) >= 0; return rk <= 6 || lead ? 'in' : rk <= 8 ? 'alive' : 'out'; };
order.forEach((t) => ok(Mf[t].st === want(t), `season over: ${t} (${order.indexOf(t) + 1}th) is ${want(t)} (got ${Mf[t].st})`));
ok(order.every((t) => Mf[t].st !== 'out' || !inSet.has(t)), 'nobody who finished in a playoff place (or won a division) is out');
ok(order.every((t) => Mf[t].st !== 'in' || inSet.has(t)), 'nobody outside a playoff place is clinched');
ok(Object.values(leaders).every((t) => Mf[t].st === 'in' && Mf[t].div === 'clinched'), 'division winners are in once the season is over');
DP.league.standings = saveSt; DP.live = saveLive;

// ---- opponent scouting: the tuned lineup never projects worse than the plain best lineup
if (lw !== null) E.teams.forEach((t) => {
  const X = DP.scoutData(t, lw); if (!X) return;
  ok(X.T.eTuned >= X.T.eBase - 1e-9, `${t}: tuned lineup is at least as good vs ${X.opp}`);
  const lu = X.T.tuned.lu, L = E.RULES.lineup;
  ok(lu.F.length <= L.F && lu.D.length <= L.D && lu.G.length <= L.G, `${t}: tuned lineup fits 12F / 6D / 2G`);
  ok(X.P.length === E.NC && X.P.every((x) => x.w >= 0 && x.w <= 1 && x.w + x.t <= 1 + 1e-9), `${t}: category odds are probabilities`);
  ok(X.odds.win >= 0 && X.odds.win <= 1 && near(X.odds.win + X.odds.loss + X.odds.tie, 1, 1e-9), `${t}: week odds add up`);
  ok(X.start.length === X.sit.length, `${t}: every start has a sit`);
});

// ---- season strip (Team Hub) = The Weekly's standings
const H = E.history(), fin = H.weeks.filter((w) => w.games && w.games.length);
E.teams.forEach((t) => {
  const R = DP.seasonRows(t);
  ok(R.length === fin.length, `${t}: one row per finished week`);
  ok(R.every((r) => r.W + r.L + r.T === E.NC && ['W', 'L', 'T'].indexOf(r.res) >= 0 && r.place >= 1 && r.place <= E.teams.length), `${t}: rows are complete`);
  if (R.length) ok(R[R.length - 1].place === DP._weekly.standingsAfter(H, fin[fin.length - 1].n).by[t].rank, `${t}: last place = standings after the last week`);
});

// ---- World Juniors
const WJ = DP.wjcRows();
if (WJ) {
  const born = WJ.W.born + '-01-01';
  ok(WJ.rows.length > 50 && WJ.rows.every((r) => r.p.dob >= born), `World Juniors: ${WJ.rows.length} eligible, all born ${WJ.W.born} or later`);
  ok(new Set(WJ.rows.map((r) => r.p.id)).size === WJ.rows.length, 'World Juniors: one row per player');
  ok(Object.keys(WJ.teams).length === 10 && WJ.rows.every((r) => (r.g !== null) === !!WJ.teams[r.nat]), 'World Juniors: 10 countries, grouped right');
  ok(!WJ.teams.RUS, 'World Juniors: Russia not in a group');
}

// ---- commissioner checks
const CK = DP.commishChecks();
ok(CK.teams.length === E.teams.length && CK.teams.every((r) => near(r.space, E.teamCap(r.t)[0].space)), 'checks: cap space per team');
ok(CK.gmiss.every((x) => { const w = DP.league.hist.find((h) => h.n === x.n); return w && (w.teams[x.t].GGP || 0) < CK.minGP; }), 'checks: goalie-minimum misses come from the weekly results');
ok(CK.irHealthy.every((x) => x.p.fs === 'IR' && !x.p.inj), 'checks: IR players not on the injury list');
ok(CK.grads.every((x) => x.p.ct === 'MNR' && x.p.cgp >= x.p.gradThr), 'checks: graduated MNR players');

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
