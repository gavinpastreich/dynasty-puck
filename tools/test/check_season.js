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
    'assets/js/pages-movers.js', 'assets/js/pages-lines.js', 'assets/js/pages-tape.js', 'assets/js/pages-tour.js']).concat(opt('data/values.js'), opt('data/depthlog.js')));
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

// ---- Start Here tour: every link is a page in the menu
const navSrc = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'app.js'), 'utf8');
DP.tourSteps.forEach((s) => s[2].forEach((x) => ok(x[0] === 'pick' || x[0] === 'install' || navSrc.indexOf("['" + x[0] + "', '") >= 0, `tour: ${x[0]} is a page in the menu`)));

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
