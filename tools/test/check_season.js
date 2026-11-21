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
    'assets/js/pages-radar.js', 'assets/js/pages-weekly.js', 'assets/js/pages-season.js', 'assets/js/pages-scout.js',
    'assets/js/pages-pickup.js', 'assets/js/pages-form.js', 'assets/js/pages-rivals.js', 'assets/js/pages-records.js', 'assets/js/pages-me.js',
    'assets/js/pages-movers.js', 'assets/js/pages-lines.js', 'assets/js/pages-tape.js', 'assets/js/pages-tour.js', 'assets/js/pages-flow.js', 'assets/js/pages-wire.js', 'assets/js/pages-power.js', 'assets/js/player.js', 'assets/js/pages-regret.js', 'assets/js/pages-warroom.js', 'assets/js/pages-grades.js', 'assets/js/pages-scorecard.js', 'assets/js/pages-network.js', 'assets/js/pages-mypage.js', 'assets/js/pages-path.js', 'assets/js/pages-stacks.js', 'assets/js/pages-feed.js', 'assets/js/pages-mywidgets.js', 'assets/js/pages-trophies.js', 'assets/js/pages-carriers.js']).concat(opt('data/sim.js')).concat(opt('data/values.js'), opt('data/depthlog.js')));
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

// ---- Pickup Planner
if (lw !== null) ['M.M', 'ROO', 'SPG'].forEach((t) => {
  const X = DP.pickupData(t, lw); if (!X) return;
  const ros = E.rosters[t], B = X.B, exp = (P) => E.sum(P.map((x) => x.w + x.t / 2));
  ok(X.rows.every((r) => !r.p.gm && r.p.r && r.g > 0 && !E.injuredOut(r.p, lw)), `${t}: pickups are healthy free agents with games that week`);
  ok(X.rows.every((r, i) => i === 0 || r.gain <= X.rows[i - 1].gain), `${t}: best gain first`);
  X.rows.slice(0, 3).forEach((r) => ok(near(r.gain, exp(E.matchupProbs(E.teamWeek(ros.concat([r.p]), lw, { injuries: true }), B)) - X.e0, 1e-9), `${t}: ${r.p.n} gain = expected cats with him − without`));
  ok(X.drops.every((d) => !(d.p.ct === 'MNR' && d.p.cgp >= d.p.gradThr) || d.how === 'IR'), `${t}: never suggests sending a graduated player down`);
  ok(X.drops.every((d) => near(d.free + d.dead, d.how === 'drop' ? d.p.sal26 || 0 : d.free)), `${t}: drop frees salary minus dead cap`);
});

// ---- Hot & Cold (last 14 days, published nightly as p.l14)
if (DP.league.form) {
  const withL = E.P.filter((p) => p.l14);
  ok(withL.length > 100 && withL.length === DP.league.form.n, `hot & cold: ${withL.length} players with recent games`);
  ok(withL.every((p) => p.l14[0] >= 1 && p.l14[0] <= 9), 'hot & cold: at most 9 games in 14 days');
  ok(withL.every((p) => !p.ytd || p.l14[0] <= p.ytd[0]), 'hot & cold: 14-day games never exceed the season\'s');
  ok(withL.filter((p) => !p.G && p.ytd).every((p) => [2, 3, 5, 7, 8].every((i) => p.l14[i] <= p.ytd[i])), 'hot & cold: 14-day goals/assists/shots/hits/blocks within the season totals');
  withL.slice(0, 200).forEach((p) => {
    const f = DP.formOf(p); if (!f) return;
    if (f.kind === 'S') ok(f.pct === null || near(f.pct, f.v14 / f.vP - 1, 1e-9), `${p.n}: form % = 14-day value / projected value − 1`);
    else ok(near(f.gsax, f.sa * (f.sv - f.svP), 1e-9) && f.svP > 0.8 && f.svP < 1, `${p.n}: goals saved vs a real save %`);
  });
}

// ---- standings race and the all-play matrix
const race = DP.raceData(), A2 = DP.allPlayH2H();
ok(race.weeks.length === fin.length && race.weeks.every((wn, i) => E.teams.map((t) => race.place[t][i]).sort((a, b) => a - b).join() === E.teams.map((_, k) => k + 1).join()), 'race: every week is a full 1..14 order');
if (fin.length) ok(E.teams.every((t) => race.place[t][race.weeks.length - 1] === DP._weekly.standingsAfter(H, fin[fin.length - 1].n).by[t].rank), 'race: last week = the standings');
E.teams.forEach((a) => E.teams.forEach((b) => {
  if (a === b) return;
  const x = A2.M[a][b], y = A2.M[b][a];
  ok(x.W + x.L + x.T === A2.weeks * E.NC && x.T === y.T && x.W <= y.L && x.wk[0] === y.wk[1] && x.wk[0] + x.wk[1] + x.wk[2] === A2.weeks, `all-play ${a} v ${b}: consistent`);
}));
ok(A2.real.length === fin.length * E.teams.length / 2, 'rivalries: every real meeting listed');

// ---- Record Book
const RB = DP.recordData();
const gi = E.CATS.findIndex((c) => c.k === 'G');
const maxG = Math.max(...fin.flatMap((w) => E.teams.map((t) => w.vec[t][gi])));
ok(RB.cats[gi].best && RB.cats[gi].best.v === maxG, 'records: most goals in a week is the real maximum');
ok(RB.cats.filter((x) => E.CATS[x.c].grp === 'G' && x.best).every((x) => { const w = fin.find((q) => q.n === x.best.n); return (w.tot[x.best.t].GGP || 0) >= (E.RULES.goalieMinGP || 2); }), 'records: goalie records only from weeks that met the minimum');
ok(RB.streaks.every((x) => { const R = DP.seasonRows(x.t); let run = 0, best = 0; R.forEach((r) => { run = r.res === 'W' ? run + 1 : 0; best = Math.max(best, run); }); return best === x.bestW; }), 'records: winning streaks');
const wfiles = fs.readdirSync(path.join(ROOT, 'data', 'weeks')).filter((f) => /^w\d+\.js$/.test(f));
wfiles.forEach((f) => load(['data/weeks/' + f]));
const PR = DP.playerRecords(Object.values(DP.weekDetail || {}));
const goals = PR.sk.find((r) => r.l === 'Goals');
let mx = 0; Object.values(DP.weekDetail || {}).forEach((d) => Object.values(d.teams).forEach((T) => (T.active || []).forEach((id) => { const l = T.pl[id], p = E.byId[id]; if (l && p && !p.G) mx = Math.max(mx, l[1]); })));
ok(!wfiles.length || (goals.top.length && goals.top[0].v === mx), `records: most goals by a starter in a week = ${mx}`);

// ---- since your last visit (league-wide parts)
const SD = DP.sinceData(null, Date.now() - 7 * 864e5);
ok(SD.items.every((it) => it.html && it.ic), 'since: items render');
ok((DP.league.trades || []).filter((t) => t.date >= SD.d0).length === 0 || SD.items.some((it) => it.ic === '🔁'), 'since: recent trades are listed');

// ---- Market Movers (data/values.js from tools/value_history.js)
const V = DP.values;
if (V) {
  const nD = V.dates.length - 1, lastT = Date.parse(V.dates[nD] + 'T12:00:00Z');
  ok(V.ref[0] === nD && V.ref[V.ref.length - 1] === 0, 'movers: comparison dates run from tonight back to the first night');
  V.windows.forEach((d, k) => ok(Date.parse(V.dates[V.ref[k + 1]] + 'T12:00:00Z') <= lastT - d * 864e5 || V.ref[k + 1] === 0, `movers: the ${d}-day comparison is at least ${d} days back`));
  ok(V.dates.every((d, i) => !i || d > V.dates[i - 1]), 'movers: dates in order');
  const same = V.dates[nD] === String(DP.meta.built).slice(0, 10);
  let close = 0, tot = 0;
  Object.keys(V.p).forEach((id) => {
    const o = V.p[id], p = E.byId[id];
    ok(o.v.length === V.dates.length && o.m.length === V.ref.length, `movers ${id}: series aligned with the dates`);
    if (same && p && o.v[nD] !== null) { tot++; if (Math.abs(o.v[nD] - p.DV) < 0.011 && (o.m[0][1] || '') === (p.gm || '')) close++; }
  });
  ok(!same || close >= tot * 0.98, `movers: tonight's value and owner match the app's own (${close}/${tot})`);
  [1, 2, 3, 4].forEach((j) => {
    const R = Object.keys(V.p).map((id) => DP.moverRow(id, j)).filter(Boolean);
    ok(R.every((r) => near(r.d, r.v1 - r.v0, 1e-9) && (r.pct === null || near(r.pct, r.v1 / r.v0 - 1, 1e-9))), `movers window ${j}: change = now - then`);
    ok(R.every((r) => !r.own0 || !r.own1 || r.own0 === r.own1 || r.why.some((w) => /moved|picked up|dropped/.test(w))), `movers window ${j}: an owner change is named`);
    const TV = DP.teamValueMoves(j);
    ok(TV.every((x) => near(x.d, x.held + x.moves, 1e-6)), `movers window ${j}: team change = held players + moves`);
    ok(TV.every((x) => near(x.now, E.sum(Object.keys(V.p).filter((id) => V.p[id].m[0] && V.p[id].m[0][1] === x.t && V.p[id].v[nD] !== null).map((id) => V.p[id].v[nD])), 1e-6)), `movers window ${j}: team value now = its players tonight`);
  });
}

// ---- Line & PP changes (data/depthlog.js)
const LG = DP.depthLog;
const syn = [{ d: '2026-11-01', t: 'T', n: 'A', k: 'line', from: 'F3', to: 'F2', up: true }, { d: '2026-11-02', t: 'T', n: 'A', k: 'line', from: 'F2', to: 'F3', up: false },
  { d: '2026-11-01', t: 'T', n: 'B', k: 'pp', from: '', to: 'PP2', up: true }, { d: '2026-11-03', t: 'T', n: 'B', k: 'pp', from: 'PP2', to: 'PP1', up: true },
  { d: '2026-11-01', t: 'T', n: 'C', k: 'line', from: 'F2', to: 'F3', up: false }, { d: '2026-11-02', t: 'T', n: 'C', k: 'line', from: 'F3', to: 'F1', up: true },
  { d: '2026-11-02', t: 'T', n: 'D', k: 'g', from: 'G1', to: 'G2', up: false }];
const NET = DP.lineNet(syn), net = (nm) => NET.filter((e) => e.n === nm);
ok(!net('A').length, 'line net: a move undone in the window nets out');
ok(net('B').length === 1 && net('B')[0].from === '' && net('B')[0].to === 'PP1' && net('B')[0].up && net('B')[0].n0 === 2, 'line net: two promotions = none -> PP1');
ok(!net('C').length, 'line net: F2 -> F1 over the window is a shuffle inside the top six');
ok(net('D').length === 1 && !net('D')[0].up, 'line net: G1 -> G2 is a demotion');
if (LG && LG.events.length) {
  [3, 7, 30].forEach((d) => {
    const ev = DP.lineEvents(LG, d), last = LG.events[LG.events.length - 1].d;
    ok(ev.every((e) => (Date.parse(last) - Date.parse(e.d)) / 864e5 < d), `lines: the ${d}-day window`);
    ok(ev.filter((e) => e.p).every((e) => U.esc(e.p.n).length && (e.p.nt || e.p.t || e.t)), `lines ${d}d: matched players`);
    const nt = DP.lineNet(ev.filter((e) => e.p));
    ok(nt.every((e) => e.from !== e.to), `lines ${d}d: every net row is a real move`);
  });
  const m7 = DP.lineEvents(LG, 7), hit = m7.filter((e) => e.p).length;
  ok(hit >= m7.length * 0.5, `lines: most names match a player in the pool (${hit}/${m7.length})`);
}

// ---- Tale of the Tape
const TS = DP.teamSummary();
for (let i = 0; i < 4; i++) {
  const a = E.teams[i], b = E.teams[E.teams.length - 1 - i], X = DP.tapeData(a, b), Y = DP.tapeData(b, a);
  ok(X.edge.a === Y.edge.b && X.edge.b === Y.edge.a, `tape ${a}-${b}: edges are the same from either side`);
  ok(X.edge.a + X.edge.b === X.rows.filter((r) => r.win).length, `tape ${a}-${b}: edge count = highlighted lines`);
  ok(X.rows.filter((r) => r.win).every((r) => (r.better === 'hi') === (r.win === 'a' ? r.a > r.b : r.b > r.a)), `tape ${a}-${b}: the highlighted side is the better one`);
  const dv = X.rows.find((r) => /Dynasty value/.test(r.l || ''));
  ok(dv && near(dv.a, TS[a].dv) && near(dv.b, TS[b].dv), `tape ${a}-${b}: dynasty value = Team Hub's`);
  const pk = X.rows.find((r) => /Draft picks/.test(r.l || ''));
  ok(pk && X.A.picks === E.picksOf(a).length, `tape ${a}-${b}: picks owned`);
  const M = DP.tapeMeetings(a, b);
  ok(!M.sim || near(M.sim.win + M.sim.loss + M.sim.tie, 1, 1e-9), `tape ${a}-${b}: next-meeting odds add to 100%`);
  ok(M.real.every((g) => g.s.W + g.s.L + g.s.T <= E.NC), `tape ${a}-${b}: real meetings`);
  const sched = DP.meta.h2h.filter((g) => (g[1] === a && g[2] === b) || (g[1] === b && g[2] === a)).length;
  ok(M.real.length + M.next.length <= sched, `tape ${a}-${b}: meetings come from the schedule`);
}

// ---- day-by-day matchup flow (data/weeks/dNN.js): the days add up to the week, and the last point is the real result
const dfiles = fs.readdirSync(path.join(ROOT, 'data', 'weeks')).filter((f) => /^d\d+\.js$/.test(f));
dfiles.forEach((f) => load(['data/weeks/' + f]));
const HW = E.history().weeks;
HW.forEach((w) => {
  if (!DP.weekDays[w.n]) return;
  const nd = DP.weekDays[w.n].days.length, wk = E.weeks[w.n - 1];
  ok(nd >= 1 && nd <= wk.days && DP.weekDays[w.n].days.every((x) => x.d >= wk.start && x.d <= wk.end), `flow week ${w.n}: ${nd} days inside the week`);
  w.games.forEach((g) => {
    const F = DP.matchFlow(w.n, g.a, g.b, 300);
    ok(F && F.ok, `flow week ${w.n} ${g.a}-${g.b}: the days add up to the week's totals`);
    if (!F) return;
    const last = F.pts[F.pts.length - 1];
    ok(F.done && last.ls[0] === g.sa.W && last.ls[1] === g.sb.W, `flow week ${w.n} ${g.a}-${g.b}: last day = the real ${g.sa.W}-${g.sb.W}`);
    ok(near(last.win, g.sa.W > g.sb.W ? 1 : 0) && near(last.loss, g.sb.W > g.sa.W ? 1 : 0), `flow week ${w.n} ${g.a}-${g.b}: odds end at the result`);
    ok(F.pts.every((p) => p.win >= 0 && p.loss >= 0 && near(p.win + p.loss + p.tie, 1, 1e-9)), `flow week ${w.n} ${g.a}-${g.b}: odds are probabilities`);
    const sw = DP.flowSwing(F);
    ok(!sw || (sw.t === (g.sa.W > g.sb.W ? g.a : g.b) && sw.low.p <= (sw.t === g.a ? F.pts[0].win : F.pts[0].loss)), `flow week ${w.n} ${g.a}-${g.b}: the winner's low point`);
  });
});
ok(!HW.length || dfiles.length >= HW.length, 'flow: a day file for every week played');

// ---- best single days (Record Book) = the real maximum over every day file
const DR = DP.dayRecords(Object.values(DP.weekDays));
DR.forEach((r) => {
  let mxv = -Infinity; Object.values(DP.weekDays).forEach((W) => W.days.forEach((x) => Object.values(x.teams).forEach((T) => { mxv = Math.max(mxv, T[r.k] || 0); })));
  ok(r.best && r.best.v === mxv && r.best.v >= r.avg && r.ties >= 1, `day records ${r.k}: best single day = ${mxv}`);
});

// ---- Transactions
const details = Object.values(DP.weekDetail || {});
const TX = DP.transactions(details), MV = DP.league.moves || [];
ok(TX.adds.length === MV.filter((m) => m.type === 'add').length && TX.drops.length === MV.filter((m) => m.type === 'drop').length, 'transactions: every add and drop');
ok(E.sum(TX.act.map((a) => a.add)) === MV.filter((m) => m.type === 'add' && E.rosters[m.to]).length, 'transactions: adds per GM add up');
ok(Math.abs(E.sum(TX.act.map((a) => a.cap))) < 1e-9, 'transactions: cap space sent = cap space received');
TX.adds.forEach((a) => {
  ok(a.st.wk === details.filter((W) => E.weeks[W.n - 1].end >= a.m.d && W.teams[a.m.to] && (W.teams[a.m.to].active || []).indexOf(a.m.id) >= 0).length, `transactions ${a.m.n}: weeks started for ${a.m.to} since the add`);
  ok(!a.st.line || a.st.line[0] <= a.st.wk * 5, `transactions ${a.m.n}: games in those weeks`);
  ok(a.v0 === null || a.v1 === null || near(a.d, a.v1 - a.v0), `transactions ${a.m.n}: value change`);
});
if (V) {
  const id0 = Object.keys(V.p)[0];
  ok(DP.valueAt(id0, '2000-01-01') === V.p[id0].v[0] && DP.valueAt(id0, '2999-01-01') === V.p[id0].v[V.dates.length - 1] && DP.valueAt(id0, V.dates[2]) === V.p[id0].v[2], 'valueAt: first night on or after a date');
}

// ---- Power Rankings
HW.filter((w) => w.games && w.games.length).forEach((w) => {
  const P = DP.powerAfter(w.n);
  ok(P && P.rows.length === E.teams.length && P.rows.map((r) => r.rank).join() === E.teams.map((_, i) => i + 1).join(), `power week ${w.n}: every team ranked once`);
  ok(P.rows.every((r, i) => !i || P.rows[i - 1].score >= r.score), `power week ${w.n}: sorted by score`);
  ok(P.rows.every((r) => near(r.score, 0.45 * r.season + 0.25 * r.recent + 0.30 * r.proj, 1e-12) && r.season >= 0 && r.season <= 1 && r.recent >= 0 && r.recent <= 1), `power week ${w.n}: score = 45/25/30`);
  const t0 = E.teams[0], aps = HW.filter((x) => x.n <= w.n && x.ap && x.ap[t0]).map((x) => E.sum(x.ap[t0]) / x.ap[t0].length);
  ok(near(P.by[t0].season, E.sum(aps) / aps.length, 1e-12) && near(P.by[t0].recent, E.sum(aps.slice(-3)) / aps.slice(-3).length, 1e-12), `power week ${w.n}: all-play averages`);
  ok(E.teams.every((t) => DP.powerBlurb(t, w.n, P, null, DP.weekDetail[w.n]).length > 10), `power week ${w.n}: every team gets a line`);
});

// ---- closest calls and the player season log
HW.filter((w) => w.games && w.games.length).forEach((w) => {
  const CC = DP.closeCalls(w);
  ok(CC.every((x, i) => (!i || CC[i - 1].z <= x.z) && x.z >= 0), `close calls week ${w.n}: sorted by margin`);
  ok(CC.every((x) => { const low = E.CATS[x.c].low; return low ? x.vw < x.vl : x.vw > x.vl; }), `close calls week ${w.n}: the winner has the better number`);
  ok(CC.every((x) => w.games.some((g) => (g.a === x.win && g.b === x.lose) || (g.b === x.win && g.a === x.lose))), `close calls week ${w.n}: real matchups`);
});
['G', 'S'].forEach((kind) => {
  const pl = E.P.filter((p) => p.gm && (kind === 'G') === !!p.G).sort((a, b) => b.DV - a.DV).slice(0, 5);
  pl.forEach((p) => {
    const R = DP.playerSeasonLog(p, details).filter((r) => !r.live);
    let n0 = 0, gp = 0; details.forEach((W) => Object.values(W.teams).forEach((T) => { if ((T.active || []).indexOf(p.id) >= 0) { n0++; gp += ((T.pl || {})[p.id] || [0])[0]; } }));
    ok(R.length === n0 && E.sum(R.map((r) => (r.l || [0])[0])) === gp, `season log ${p.n}: ${n0} weeks, ${gp} GP`);
  });
});

// ---- similar players: same position group, sorted by distance, never the player himself
E.P.filter((p) => p.r && p.gm).slice(0, 40).forEach((p) => {
  const L = DP.similarPlayers(p, 8), g = (q) => (q.G ? 'G' : q.slot === 'D' ? 'D' : 'F');
  ok(L.length === 8 && L.every((x, i) => x.p.id !== p.id && g(x.p) === g(p) && (!i || L[i - 1].d <= x.d)), `similar ${p.n}: 8 of the same group, closest first`);
});
const sim0 = E.P.filter((p) => p.r && !p.G && p.p26[0] >= 20)[0];
ok(DP.similarPlayers(sim0, 1000).length === E.P.filter((q) => q.r && !q.G && (q.slot === 'D') === (sim0.slot === 'D') && q.p26 && q.p26[0] >= 20).length - 1, 'similar: compares against every regular in the group');

// ---- MVP race
const MVP = DP.mvpRace(HW, details);
ok(MVP.sk.length > 100 && MVP.gk.length > 10 && MVP.sk.every((o, i) => !o.p.G && (!i || MVP.sk[i - 1].v >= o.v)) && MVP.gk.every((o) => o.p.G), 'mvp: skaters and goalies, sorted');
MVP.sk.slice(0, 5).concat(MVP.gk.slice(0, 3)).forEach((o) => {
  const R = DP.playerSeasonLog(o.p, details).filter((r) => !r.live && r.l);
  ok(o.wk === R.length && o.gp === E.sum(R.map((r) => r.l[0])) && near(o.per, o.v / o.wk), `mvp ${o.p.n}: weeks, games and per-week match the season log`);
});
// one skater-week by hand
(function () {
  const W = details[0], w = HW.find((x) => x.n === W.n), t = Object.keys(W.teams)[0], id = W.teams[t].active.find((x) => E.byId[x] && !E.byId[x].G && W.teams[t].pl[x]);
  const l = W.teams[t].pl[id], sd = (k) => { const v = E.teams.map((u) => w.tot[u][k] || 0), m = E.sum(v) / v.length; return Math.sqrt(E.sum(v.map((x) => (x - m) * (x - m))) / v.length) || 1; };
  let v = l[1] / sd('G') + l[2] / sd('A') + (2 * l[1] + l[2]) / sd('GA2') + l[3] / sd('PIM') + l[4] / sd('SOG') + l[5] / sd('STP') + l[6] / sd('Hit') + l[7] / sd('Blk') + l[8] / sd('Tk') + l[9] / sd('Cor');
  if (E.byId[id].pos === 'D') v += (l[1] + l[2]) / sd('PtD');
  const one = DP.mvpRace(HW, [{ n: W.n, teams: { [t]: { active: [id], pl: { [id]: l } } } }]).sk[0];
  ok(one && near(one.v, v, 1e-9), 'mvp: one skater-week by hand');
})();

// ---- since your last visit: the Power Rankings item after a finished week
const SD2 = DP.sinceData(E.teams[0], Date.parse(HW[HW.length - 1].to + 'T00:00:00Z') - 864e5);
ok(!HW.length || SD2.items.some((it) => it.ic === '⚡' && new RegExp(U.ord(DP.powerAfter(HW[HW.length - 1].n).by[E.teams[0]].rank)).test(it.html)), 'since: newest power ranking');

// ---- next 7 days on the player card, games left in the live matchups
E.P.filter((p) => p.gm && p.nt26).slice(0, 30).forEach((p) => {
  const html = DP.nextGames(p), n = (html.match(/class="pc-g/g) || []).length;
  const today = E.dayIndex(E.now().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  ok(n === DP.nhl.sched[p.nt26].filter((r) => r[0] >= today && r[0] < today + 7).length && n <= 7, `next games ${p.n}: ${n} in the next 7 days`);
});
const SCW = DP.league.score;
if (SCW && SCW.week && SCW.teams && !SCW.final) {
  DP.meta.h2h.filter((m) => m[0] === SCW.week).forEach((m) => {
    const o = E.liveOdds(m[1], m[2], SCW, 300);
    ok(o.left && o.left.every((x) => x.sk >= 0 && x.sk <= 18 * 7 && x.g >= 0 && x.g <= 2 * 7), `live ${m[1]}-${m[2]}: games left in range`);
    ok(near(o.left[0].g, o.restA.m.GGP) && near(o.left[1].g, o.restB.m.GGP), `live ${m[1]}-${m[2]}: goalie starts = the simulation's`);
  });
}

// ---- this week's stakes (conditional odds counted in the season sim)
const SIM = E.baseSim(), ST = DP.stakes(SIM);
if (ST) {
  ok(ST.games.length === DP.meta.h2h.filter((m) => m[0] === ST.n).length, `stakes: every matchup of week ${ST.n}`);
  ST.games.forEach((g) => [g.a, g.b].forEach((x) => {
    ok(x.poW >= 0 && x.poW <= 1 && x.poL >= 0 && x.poL <= 1 && near(x.sw, x.poW - x.poL), `stakes ${x.t}: probabilities`);
    const r = SIM.find((y) => y.t === x.t), s0 = r.stakes;
    // the overall odds are the mix of the two conditional ones (ties are rare and sit outside both)
    ok(Math.abs(r.po - (s0.pW * s0.poW + (1 - s0.pW) * s0.poL)) < 0.03, `stakes ${x.t}: playoffs = P(win) x if-win + P(lose) x if-lose`);
  }));
  ok(ST.games.every((g, i) => !i || ST.games[i - 1].sw >= g.sw), 'stakes: sorted by what is riding on it');
  const ST2 = DP.stakes(SIM, ST.n + 1);
  if (ST2) {
    ok(ST2.n === ST.n + 1 && ST2.games.length === DP.meta.h2h.filter((m) => m[0] === ST2.n).length, `stakes: next week (${ST2.n}) too`);
    SIM.forEach((r) => { const x = r.stakesNext; if (x) ok(Math.abs(r.po - (x.pW * x.poW + (1 - x.pW) * x.poL)) < 0.03, `stakes next ${r.t}: playoffs = the win/lose mix`); });
  }
  ok(DP.stakes(SIM, ST.n + 5) === null, 'stakes: weeks the sim did not split come back empty');
}

// ---- playoff odds through the season (nightly season sim in the value history)
if (V && V.odds) {
  ok(Object.keys(V.odds).length === E.teams.length && Object.values(V.odds).every((o) => o.po.length === V.dates.length && o.ch.length === V.dates.length), 'odds history: every team, aligned with the dates');
  ok(Object.values(V.odds).every((o) => o.po.concat(o.ch).every((x) => x === null || (x >= 0 && x <= 1))), 'odds history: probabilities');
  const nD = V.dates.length - 1;
  ok(Object.values(V.odds).every((o) => o.ch.every((x, i) => x === null || o.po[i] === null || x <= o.po[i] + 1e-9)), 'odds history: title odds never above playoff odds');
  if (V.dates[nD] === String(DP.meta.built).slice(0, 10) && V.engine && !V.stale) {
    const now = {}; E.baseSim().forEach((r) => { now[r.t] = r; });
    ok(E.teams.every((t) => Math.abs(V.odds[t].po[nD] - now[t].po) < 0.0015), "odds history: tonight's point = the app's own playoff odds");
  }
  ok((DP.oddsChart('ROO').match(/<g class="bl/g) || []).length === E.teams.length, 'odds chart: one line per team');
  const OB = DP.oddsBetween(V.dates[1], V.dates[V.dates.length - 1]);
  ok(OB && OB._from <= V.dates[1] && OB._to === V.dates[V.dates.length - 1] && E.teams.every((t) => !OB[t] || near(OB[t].d, OB[t].b - OB[t].a)), 'odds between two dates');
  ok(DP.oddsBetween('2099-01-01', '2099-01-02') === null || true, 'odds between: dates past the history do not throw');
}

// ---- lineup regrets: the starters' lines add up to the week, so swapping lines is the same as rebuilding the week
let nReg = 0;
HW.forEach((w) => {
  const W = DP.weekDetail[w.n]; if (!W || !w.games || !w.games.length) return;
  E.teams.forEach((t) => {
    const T = W.teams[t]; if (!T || !T.bench) return;
    const s = { G: 0, A: 0, SOG: 0, Hit: 0, GGP: 0, SA: 0 };
    (T.active || []).forEach((id) => { const l = (T.pl || {})[id], p = E.byId[id]; if (!l || !p) return; if (p.G) { s.GGP += l[0]; s.SA += l[3]; } else { s.G += l[1]; s.A += l[2]; s.SOG += l[4]; s.Hit += l[6]; } });
    ok(Object.keys(s).every((k) => s[k] === (w.tot[t][k] || 0)), `regrets week ${w.n} ${t}: the starters' lines add up to the week's totals`);
  });
  const RG = DP.lineupRegrets(w.n) || [];
  nReg += RG.length;
  RG.forEach((r) => {
    const T = W.teams[r.t], g = (p) => (p.G ? 'G' : p.pos === 'D' ? 'D' : 'F');
    ok(r.gain > 0 && r.s1[0] + r.s1[1] + r.s1[2] === E.NC && g(r.inP) === g(r.outP), `regret week ${w.n} ${r.t}: a better result at the same position`);
    ok(T.active.indexOf(r.outP.id) >= 0 && T.active.indexOf(r.inP.id) < 0 && (T[r.from] || {})[r.inP.id] && r.inL[0] > 0, `regret week ${w.n} ${r.t}: a starter out, a ${r.from} player who played in`);
    ok(r.flip === (r.s0[0] <= r.s0[1] && r.s1[0] > r.s1[1]), `regret week ${w.n} ${r.t}: flip flag`);
    ok(DP.regretText(r).indexOf('instead of') > 0, `regret week ${w.n} ${r.t}: text`);
  });
  ok(RG.every((r, i) => !i || RG[i - 1].flip > r.flip || (RG[i - 1].flip === r.flip && RG[i - 1].gain >= r.gain)), `regrets week ${w.n}: flips first, then by gain`);
});
ok(nReg > 0, `lineup regrets found (${nReg})`);

// ---- GM report cards: each grade from the documented numbers
if (DP.values) {
  const details = Object.values(DP.weekDetail || {}), G = DP.gmReport(details), LET = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D'];
  ok(G.rows.length === E.teams.length && new Set(G.rows.map((r) => r.t)).size === E.teams.length, 'report cards: one per team');
  DP.GRADE_KEYS.forEach(([k]) => {
    const has = G.rows.filter((r) => r[k] !== null && r[k] !== undefined), low = k === 'lin';
    ok(has.every((r) => r.g[k] && LET.includes(r.g[k].l)) && G.rows.filter((r) => r[k] === null || r[k] === undefined).every((r) => !r.g[k]), `report cards ${k}: a letter for every team with a number, none without`);
    ok(has.every((a) => has.every((b) => !(low ? a[k] < b[k] - 1e-9 : a[k] > b[k] + 1e-9) || a.g[k].pts >= b.g[k].pts)), `report cards ${k}: a better number never gets a worse grade`);
    ok(!has.length || has.some((r) => r.g[k].l === 'A'), `report cards ${k}: the best gets an A`);
  });
  let nw = 0; const lt = {};
  HW.forEach((w) => { const R = DP.lineupRegrets(w.n); if (!R) return; nw++; R.forEach((x) => { lt[x.t] = (lt[x.t] || 0) + x.gain / 2; }); });
  ok(G.rows.every((r) => (nw ? near(r.lin, (lt[r.t] || 0) / nw) : r.lin === null)), 'report cards: lineup calls = category points the regrets would have added, per week');
  const tr = G.rows.filter((r) => r.trd !== null);
  ok(tr.length > 0 && near(E.sum(tr.map((r) => r.trd)), 0, 1e-6), 'report cards: trade value nets to zero across the league');
  ok(G.rows.every((r) => { const v = DP.values.teams[r.t]; return near(r.val, v[v.length - 1] - v[0]); }), 'report cards: roster value = change since the first night');
  const X = DP.transactions(details), wv = {}; E.teams.forEach((t) => { wv[t] = 0; });
  X.adds.forEach((a) => { if (a.m.to in wv) wv[a.m.to] += (a.kept && a.v1 !== null ? a.v1 : 0) + 0.6 * (a.st ? a.st.wk : 0); });
  X.drops.forEach((d) => { if (d.m.from in wv && d.d !== null && d.d > 0 && d.gm !== d.m.from) wv[d.m.from] -= d.d; });
  ok(G.rows.every((r) => near(r.wav, wv[r.t])), 'report cards: waiver wire score');
  ok(G.rows.every((r) => { const gs = DP.GRADE_KEYS.map((k) => r.g[k[0]]).filter(Boolean); return near(r.gpa, E.sum(gs.map((g) => g.pts)) / gs.length) && r.overall === DP.letterFromGpa(r.gpa); }), 'report cards: overall = the average grade');
  ok(G.rows.every((r, i) => !i || G.rows[i - 1].gpa >= r.gpa), 'report cards: ordered by overall grade');
  ok(G.rows.every((r) => r.notes.every((x) => typeof x === 'string' && x.length > 10)), 'report cards: notes');
}

// ---- a player's moves in the league: every add and every trade shows up once, newest first
(DP.league.moves || []).filter((m) => m.type === 'add' || m.type === 'drop').forEach((m) => {
  const p = E.byId[m.id]; if (!p) return;
  const M = DP.playerMoves(p);
  ok(M.some((x) => x.k === m.type && x.d === m.d && (x.to || x.from) === (m.to || m.from)), `player moves ${p.n}: ${m.type} on ${m.d}`);
  ok(M.every((x, i) => !i || M[i - 1].d >= x.d), `player moves ${p.n}: newest first`);
});
(DP.league.trades || []).forEach((t) => t.moves.filter((m) => m.kind === 'player' && E.byId[m.id]).forEach((m) => {
  const M = DP.playerMoves(E.byId[m.id]).filter((x) => x.k === 'trade' && x.d === t.date && x.from === m.from && x.to === m.to);
  ok(M.length === 1, `player moves: ${m.label} traded ${t.date} (once)`);
}));

// ---- category streaks: recount from the weekly results
{
  const CS = DP.catStreaks(), FW = HW.filter((w) => w.games && w.games.length);
  const res = (t, c) => FW.map((w) => { const g = w.games.find((x) => x.a === t || x.b === t); if (!g) return null; const o = g.a === t ? g.b : g.a, r = E.catResults(w.vec[t], w.vec[o])[c]; return r === 1 ? 'W' : r === 0 ? 'T' : 'L'; }).filter((x) => x);
  CS.cur.forEach((x) => { const a = res(x.t, x.c); let n = 0; for (let i = a.length - 1; i >= 0 && a[i] === x.k; i--) n++; ok(n === x.n && x.k !== 'T' && (a.length === n || a[a.length - n - 1] !== x.k), `category streak ${x.t} ${E.CATS[x.c].k}: ${x.k} ${x.n} running`); });
  CS.best.forEach((x) => { const a = res(x.t, x.c); let run = 0, b = 0; a.forEach((r) => { run = r === 'W' ? run + 1 : 0; b = Math.max(b, run); }); ok(b === x.n && x.to - x.from + 1 === x.n, `category streak ${x.t} ${E.CATS[x.c].k}: best run ${x.n}`); });
  ok(CS.best.every((x, i) => !i || CS.best[i - 1].n >= x.n) && CS.cur.every((x, i) => !i || CS.cur[i - 1].n >= x.n), 'category streaks: longest first');
}

// ---- Model Scorecard: every finished matchup with a recorded call, scored against the real result
if (DP.values && DP.values.calls) {
  const M = DP.modelCalls(), S = DP.modelScore(M), C = DP.values.calls;
  const withCall = HW.filter((w) => w.games && w.games.length && C[w.n]);
  ok(M.length === E.sum(withCall.map((w) => w.games.length)), `scorecard: every matchup of the ${withCall.length} called weeks is scored (${M.length})`);
  Object.keys(C).forEach((n) => {
    const c = C[n], w = E.weeks[n - 1], lt = E.lockTime(n - 1);
    ok(c.g.length === DP.meta.h2h.filter((g) => g[0] === +n).length && c.g.every((g) => g[2] >= 0 && g[3] >= 0 && g[2] + g[3] <= 1 + 1e-9 && g[4] >= 0 && g[4] <= 15), `scorecard week ${n}: one call per scheduled matchup, valid odds`);
    ok(!lt || new Date(c.t + ':00Z').getTime() < lt.getTime(), `scorecard week ${n}: recorded before the lock (${c.t} UTC)`);
    ok(c.g.every((g) => DP.meta.h2h.some((h) => h[0] === +n && ((h[1] === g[0] && h[2] === g[1]) || (h[1] === g[1] && h[2] === g[0])))), `scorecard week ${n}: the scheduled pairs`);
  });
  M.forEach((m) => {
    const w = HW.find((x) => x.n === m.n), g = w.games.find((x) => (x.a === m.fav && x.b === m.dog) || (x.b === m.fav && x.a === m.dog)), sf = g.a === m.fav ? g.sa : g.sb;
    ok(m.pf >= m.pd && near(m.p, m.pf + m.pt / 2) && m.res === (sf.W > sf.L ? 1 : sf.W < sf.L ? 0 : 0.5) && near(m.actF, sf.W + sf.T / 2), `scorecard week ${m.n} ${m.fav}: favorite, chance and result`);
  });
  if (S) {
    ok(near(S.brier, E.sum(M.map((m) => (m.p - m.res) ** 2)) / M.length) && near(S.skill, 1 - S.brier / 0.25), 'scorecard: Brier score');
    ok(S.bins.reduce((a, b) => a + b.n, 0) === M.length && S.bins.every((b) => !b.n || (b.pred >= b.lo - 1e-9 && b.pred < b.hi + 1e-9)), 'scorecard: calibration bins hold every matchup');
    ok(S.favW + (S.dec - S.favW) + S.ties === S.n && S.upsets.length === S.dec - S.favW, 'scorecard: wins, losses, ties');
  }
}

// ---- trade network: pairs and per-team counts from the trade log
{
  const N = DP.tradePairs(), T = DP.league.trades || [];
  ok(N.trades === T.length && E.teams.every((t) => N.per[t] === T.filter((tr) => tr.teams.includes(t)).length), 'trade network: trades per team');
  ok(N.pairs.every((p) => p.n === T.filter((tr) => tr.teams.includes(p.a) && tr.teams.includes(p.b)).length && p.a < p.b), 'trade network: trades per pair');
  ok(E.sum(N.pairs.map((p) => p.n)) === E.sum(T.map((tr) => tr.teams.length * (tr.teams.length - 1) / 2)), 'trade network: every pair of every trade counted once');
  E.teams.forEach((t) => { const P = DP.tradePartners(t); ok(P.with.length + P.never.length === E.teams.length - 1 && P.total === N.per[t], `trade network ${t}: partners + never = everyone else`); });
  ok(/<svg/.test(DP.tradeNetworkSvg('ROO')) && (DP.tradeNetworkSvg('ROO').match(/<circle/g) || []).length === E.teams.length, 'trade network: one node per team');
}

// ---- My Page: share links carry the whole layout; junk and unknown widgets are dropped
{
  const L = { w: [{ k: 'matchup', s: 2, o: {} }, { k: 'standings', s: 1, o: { n: 5 } }, { k: 'movers', s: 1, o: { team: '*', n: 10 } }, { k: 'note', s: 1, o: { text: 'Trade ideas: ask M.M about \u00e9\u00e8 & "quotes"\nline 2' } }, { k: 'tracker', s: 2, o: { ids: E.P.slice(0, 3).map((p) => p.id) } }, { k: 'links', s: 1, o: { pages: ['live', 'trade'] } }, { k: 'lineup', s: 1, o: { team: 'M.M' } }] };
  const R = DP.decodeLayout(DP.encodeLayout(L));
  ok(R && JSON.stringify(R.w) === JSON.stringify(L.w), 'my page: share link round trip (team, count, text, players, pages)');
  ok(/^[A-Za-z0-9_-]+$/.test(DP.encodeLayout(L)), 'my page: the link is URL-safe');
  ok(DP.decodeLayout('not-a-layout') === null, 'my page: a broken link is ignored');
  ok(DP.decodeLayout(DP.encodeLayout({ w: [{ k: 'nope', s: 1, o: {} }, { k: 'odds', s: 3, o: {} }] })).w.map((x) => x.k + x.s).join() === 'odds1', 'my page: unknown widgets dropped, sizes clamped');
  Object.keys(DP.MYPAGE_PRESETS).forEach((k) => ok(DP.MYPAGE_PRESETS[k].w.every((x) => DP.WIDGETS[x[0]]), `my page preset ${k}: every widget exists`));
  ok(Object.keys(DP.WIDGETS).every((k) => { const w = DP.WIDGETS[k]; return w.name && w.ic && w.desc && w.cat && typeof w.render === 'function'; }), `my page: ${Object.keys(DP.WIDGETS).length} widgets, each with a name, icon, description and category`);
}

// ---- NHL Team Stacks: every active-roster player counted once, under his club and his team
{
  const S = DP.stacksData(false), act = E.P.filter((p) => p.gm && p.nt && (p.fs === 'A' || p.fs === 'R'));
  ok(E.sum(S.clubs.map((c) => c.n)) === act.length && E.sum(E.teams.map((t) => S.team[t].n)) === act.length, `stacks: ${act.length} active-roster players, each counted once`);
  ok(S.clubs.every((c) => E.sum(Object.values(c.by).map((x) => x.n)) === c.n), 'stacks: club rows add up');
  ok(E.teams.every((t) => { const T = S.team[t]; return near(E.sum(T.top.map((x) => x.share)), T.war > 0 ? 1 : 0, 1e-6) && T.top.every((x, i) => !i || T.top[i - 1].war >= x.war); }), 'stacks: shares add to 100%, biggest first');
  ok(E.sum(DP.stacksData(true).clubs.map((c) => c.n)) >= act.length, 'stacks: the whole roster has at least as many');
}

// ---- Title Path: a candidate added to the roster, same random numbers as the baseline
{
  const base = DP.pathBase(200), C = DP.pathCandidates('ROO', 3, 3);
  ok(C.length === 6 && C.slice(0, 3).every((p) => !p.gm) && C.slice(3).every((p) => p.gm && p.gm !== 'ROO'), 'title path: free agents and other teams\' players');
  const r1 = DP.pathEval('ROO', C[3], base, 200);
  ok(isFinite(r1.dCh) && isFinite(r1.dPo) && r1.from && r1.from.t === C[3].gm && near(r1.po - r1.dPo, base.ROO.po), 'title path: odds with him, his old team without him');
  ok(near(DP.pathEval('ROO', C[3], base, 200).dCh, r1.dCh), 'title path: same seed, same answer');
  ok(E.rosters.ROO.every((p) => p.id !== C[3].id) && E.rosters[C[3].gm].some((p) => p.id === C[3].id), 'title path: the real rosters are left alone');
}

// ---- League Feed: every trade, every team-day of adds and drops, every finished matchup; newest first
{
  const F = DP.feedItems({ values: DP.values, lines: DP.depthLog }), by = (k) => F.filter((x) => x.k === k);
  const M = (DP.league.moves || []).filter((m) => m.type === 'add' || m.type === 'drop');
  ok(by('trade').length === (DP.league.trades || []).length, 'feed: one item per trade');
  ok(by('move').length === new Set(M.map((m) => m.d + '|' + (m.type === 'add' ? m.to : m.from))).size, 'feed: one item per team and day of adds/drops');
  ok(by('result').length === E.sum(HW.filter((w) => w.games).map((w) => w.games.length)), 'feed: one item per finished matchup');
  ok(F.every((x, i) => !i || F[i - 1].d >= x.d), 'feed: newest first');
  ok(!DP.depthLog || by('line').length > 0, 'feed: line moves when the depth log is there');
  ok(by('value').every((x) => /Value swings/.test(x.html)), 'feed: value swings');
  const me = 'ROO', mine = DP.feedFilter(F, { team: me });
  ok(mine.length > 0 && mine.every((x) => x.teams.includes(me)), 'feed: the team filter');
  ok(DP.feedFilter(F, { kinds: ['trade'] }).every((x) => x.k === 'trade'), 'feed: the kind filter');
}
ok(['feed', 'catprofile', 'ranges', 'upcoming', 'outlook', 'rivals', 'topassets'].every((k) => DP.WIDGETS[k]), 'my page: the extra widgets are registered');

// ---- Trophy Case: every badge comes with its reason, and the ones that can be recounted are
{
  const T = DP.trophies(Object.values(DP.weekDetail || {}));
  ok(E.teams.every((t) => Array.isArray(T[t]) && T[t].every((b) => b.k && b.ic && b.name && b.why && b.why.length > 10)), 'trophies: every badge has an icon, a name and a reason');
  let perfect = 0; HW.forEach((w) => (w.games || []).forEach((g) => [g.sa, g.sb].forEach((s) => { if (s.L === 0 && s.W >= 13) perfect++; })));
  ok(E.sum(E.teams.map((t) => T[t].filter((b) => b.k === 'perfect').length)) === perfect, `trophies: clean sweeps (${perfect})`);
  ok(E.sum(E.teams.map((t) => T[t].filter((b) => b.k === 'totw').length)) === HW.filter((w) => w.games && w.games.length).length, 'trophies: one team of the week per week');
  ok(E.sum(E.teams.map((t) => T[t].filter((b) => b.k === 'catrec').length)) === DP.recordData().cats.filter((c) => c.best).length, 'trophies: one record holder per category');
  if (DP.values && DP.values.calls) ok(E.sum(E.teams.map((t) => T[t].filter((b) => b.k === 'heist').length)) === DP.modelCalls().filter((m) => m.res === 0 && m.pd <= 0.25).length, 'trophies: heists = upsets from 25% or less');
}

// ---- Category carriers: the starters' lines add up to the team's season totals
E.teams.forEach((t) => {
  const C = DP.carriers(t, Object.values(DP.weekDetail || {})), g = (k) => C.cats.find((c) => c.k === k);
  const tot = (k) => E.sum(HW.filter((w) => w.games && w.games.length && DP.weekDetail[w.n]).map((w) => w.tot[t][k] || 0));
  ok(g('G').tot === tot('G') && g('A').tot === tot('A') && g('Hit').tot === tot('Hit') && g('W').tot === tot('W') && g('SHO').tot === tot('SHO'), `carriers ${t}: totals match the season`);
  ok(C.cats.every((c) => !c.ps.length || near(E.sum(c.ps.map((x) => x.share)), 1, 1e-9)), `carriers ${t}: shares add to 100%`);
});

// ---- precomputed season simulation (tools/presim.js): identical to running it here, when it applies
if (DP.simPre && DP.simPre.built === DP.meta.built && DP.simPre.lw === E.lockWeek() && DP.simPre.nw === E.nowWeek()) {
  E._bsim = null;
  ok(JSON.stringify(E.baseSim()) === JSON.stringify(DP.simPre.res), 'presim: data/sim.js = a fresh 1,500-season simulation');
}

// ---- Start Here tour: every link is a page in the menu
const navSrc = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');
DP.tourSteps.forEach((s) => s[2].forEach((x) => ok(x[0] === 'pick' || x[0] === 'install' || navSrc.indexOf("['" + x[0] + "', '") >= 0, `tour: ${x[0]} is a page in the menu`)));

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
