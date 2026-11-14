// Assertions for Buy Low / Sell High (DP.luck) and The Weekly (DP.weeklyData). Exits non-zero on failure.
//   node tools/test/check_weekly.js
const fs = require('fs'), path = require('path');
const load = require('./load.js');
const ROOT = path.join(__dirname, '..', '..');
global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return {}; }, head: { appendChild() {} } };
const opt = (f) => (fs.existsSync(path.join(ROOT, f)) ? [f] : []);
load(['data/league.js', 'data/prospects.js'].concat(opt('data/radar.js'), opt('data/draft.js'))
  .concat(['assets/js/util.js', 'assets/js/engine.js', 'assets/js/ui.js', 'assets/js/pages-radar.js', 'assets/js/pages-draft.js', 'assets/js/pages-luck.js', 'assets/js/pages-weekly.js']));
const E = DP.E; E.init();
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; if (fails <= 25) console.log('FAIL', msg); } };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-9);

// ---- Buy Low / Sell High
const L = DP.luck(), K = DP.LUCK, prev = DP.meta.seasonId - 10001, first = DP.meta.seasonId - 3 * 10001;
ok(L.rows.length > 100, `regression watch covers ${L.rows.length} players`);
ok(L.lg.F > 0.06 && L.lg.F < 0.2 && L.lg.D > 0.02 && L.lg.D < 0.12 && L.lg.G > 0.86 && L.lg.G < 0.94, 'league rates are plausible');
ok(new Set(L.rows.map((r) => r.p.id)).size === L.rows.length, 'one row per player');
L.rows.forEach((r) => {
  const p = r.p, hist = (p.h || []).filter((x) => x[0] >= first && x[0] <= prev);
  if (r.kind === 'S') {
    const G0 = hist.reduce((s, x) => s + x[2], 0), S0 = hist.reduce((s, x) => s + x[5], 0), lg = p.D ? L.lg.D : L.lg.F;
    ok(!p.G && r.S === p.ytd[5] && r.G === p.ytd[2] && r.S >= K.minSOG, `${p.n}: this season's goals and shots`);
    ok(near(r.base, (G0 + lg * K.shPrior) / (S0 + K.shPrior)) && r.S0 === S0, `${p.n}: normal Sh% = last three seasons shrunk to the league`);
    ok(near(r.d, r.G - r.S * r.base) && near(r.z, r.d / Math.sqrt(r.S * r.base * (1 - r.base))), `${p.n}: goals vs expected and its z`);
    ok(r.ros === null || (r.ros >= 0 && r.ros <= 1), `${p.n}: the projection's rest-of-season Sh% is a real rate or blank`);
    const want = r.d >= K.sk.goals && r.z >= K.sk.z ? 'sell' : r.d <= -K.sk.goals && r.z <= -K.sk.z ? 'buy' : null;
    ok(r.sig === want, `${p.n}: flag follows the thresholds`);
  } else {
    ok(p.G && r.gp >= K.minGP && r.sv > 0 && r.sv < 1 && r.sa > 0, `${p.n}: goalie sample`);
    ok(r.base > 0.85 && r.base < 0.95 && near(r.d, r.sa * (r.sv - r.base)), `${p.n}: goals saved vs his normal save %`);
    const want = r.d >= K.g.goals && r.z >= K.g.z ? 'sell' : r.d <= -K.g.goals && r.z <= -K.g.z ? 'buy' : null;
    ok(r.sig === want, `${p.n}: goalie flag follows the thresholds`);
  }
});
ok(L.rows.some((r) => r.sig === 'sell') && L.rows.some((r) => r.sig === 'buy'), 'there are both sell-high and buy-low flags');
ok(L.rows.filter((r) => r.sig).every((r) => /goals|save %/.test(DP.luckWhy(r))), 'every flag has a plain-language reason');

// ---- The Weekly
const H = E.history(), weeks = H.weeks.filter((w) => w.games && w.games.length), W = DP._weekly;
ok(weeks.length >= 1, `${weeks.length} finished weeks`);
weeks.forEach((w) => {
  const D = DP.weeklyData(w.n);
  ok(D && D.games.length === E.teams.length / 2, `week ${w.n}: one game per pair of teams`);
  ok(D.games.every((x) => ['sa', 'sb'].every((k) => x.g[k].W + x.g[k].L + x.g[k].T === E.NC)), `week ${w.n}: every side has ${E.NC} category results`);
  ok(D.games.every((x) => x.margin === Math.abs(x.g.sa.W - x.g.sb.W) && (x.win === null) === (x.margin === 0)), `week ${w.n}: winners and margins`);
  ok(D.blow.margin >= D.close.margin && D.sorted.every((x, i) => i === 0 || x.margin <= D.sorted[i - 1].margin), `week ${w.n}: results sorted by margin`);
  ok(D.after.list.map((r) => r.rank).join() === E.teams.map((_, i) => i + 1).join() && D.after.list.every((r, i) => i === 0 || r.W + r.T / 2 <= D.after.list[i - 1].W + D.after.list[i - 1].T / 2), `week ${w.n}: standings ranked by W + T/2`);
  ok(E.teams.every((t) => D.after.by[t].W + D.after.by[t].L + D.after.by[t].T === D.before.by[t].W + D.before.by[t].L + D.before.by[t].T + E.NC), `week ${w.n}: every team adds ${E.NC} decisions`);
  ok(!D.unlucky || D.unlucky.sl === W.strength(w, D.unlucky.lose), `week ${w.n}: hard luck uses the loser's all-play`);
  ok(D.best.every((t, i) => i === 0 || W.strength(w, t) <= W.strength(w, D.best[i - 1])), `week ${w.n}: team of the week has the best all-play`);
  const hi = new Date(new Date(w.to + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);   // the nightly sync logs a move the next morning
  ok(D.trades.every((t) => t.date >= w.from && t.date <= hi) && D.adds.every((x) => x.m.type === 'add' && x.m.d >= w.from && x.m.d <= hi), `week ${w.n}: moves fall in the week`);
});
const last = weeks[weeks.length - 1], fin = W.standingsAfter(H, last.n);
ok(E.teams.every((t) => fin.by[t].W === H.wl[t].W && fin.by[t].L === H.wl[t].L && fin.by[t].T === H.wl[t].T), 'standings after the last week = the season totals');
ok(weeks.length < 2 || DP.weeklyData(weeks[0].n).before.list.every((r) => r.W + r.L + r.T === 0), 'standings before week 1 are empty');
// players of the week, from the locked starters' lines of the latest week
const wf = path.join(ROOT, 'data', 'weeks', 'w' + String(last.n).padStart(2, '0') + '.js');
if (fs.existsSync(wf)) {
  load(['data/weeks/w' + String(last.n).padStart(2, '0') + '.js']);
  const WD = DP.weekDetail[last.n], st = W.stars(WD), all = [];
  Object.keys(WD.teams).forEach((t) => Object.keys(WD.teams[t].pl || {}).forEach((id) => { const p = E.byId[id]; if (p && !p.G) all.push(WD.teams[t].pl[id]); }));
  ok(st.skater && all.every((l) => l[1] + l[2] <= st.skater.l[1] + st.skater.l[2]), 'star of the week has the most points among locked starters');
  ok(!st.d || st.d.p.D, 'top defenseman is a defenseman');
  ok(!st.goalie || st.goalie.p.G, 'goalie of the week is a goalie');
}
const X = W.nowBits(last.n);
ok(!X.next || (X.next.n === last.n + 1 && X.next.marquee && near(X.next.marquee.ea + X.next.marquee.eb, E.NC, 1e-6)), 'next week: projected categories add up to 15');

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
