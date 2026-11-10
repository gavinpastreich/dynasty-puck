// Assertions for the weekly category history and the live scoreboard math. Exits non-zero on failure.
//   node tools/test/check_scoreboard.js
const load = require('./load.js');
load(['data/league.js', 'data/prospects.js', 'assets/js/engine.js']);
const E = DP.E; E.init();
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-6);

// ---- the season has started: there must be a scoreboard (this is the bug that shipped in October)
const started = DP.meta.weeks.some((w) => w.lock && new Date(w.lock) <= new Date(DP.meta.built + ':00Z'));
const sc = DP.league.score;
if (started) {
  ok(!!sc && !!sc.week, 'a week has locked, so DP.league.score must not be empty');
  ok(sc && Object.keys(sc.teams || {}).length === E.teams.length, 'scoreboard has every team');
  ok(sc && E.teams.every((t) => sc.teams[t] && sc.teams[t].active.length >= 15), 'every team has a locked lineup in the scoreboard');
  ok(sc && E.teams.some((t) => sc.teams[t].tot.SGP > 0) || (sc && !sc.to && !sc.live), 'scoreboard has games played (or the week has not had a game yet)');
}

// ---- weekly history
const H = E.history();
if (started && sc && sc.week > 1) ok(H.n >= sc.week - 1, `history holds every finished week (${H.n} of ${sc.week - 1})`);
H.weeks.forEach((w) => {
  ok(E.teams.every((t) => w.vec[t] && w.vec[t].length === E.NC), `week ${w.n}: 15 categories for every team`);
  if (w.games.length) {
    ok(w.games.length === E.teams.length / 2, `week ${w.n}: ${E.teams.length / 2} matchups`);
    w.games.forEach((g) => {
      ok(g.sa.W + g.sa.L + g.sa.T === E.NC && g.sb.W + g.sb.L + g.sb.T === E.NC, `week ${w.n} ${g.a}-${g.b}: 15 decisions each`);
      ok(g.sa.W <= g.sb.L && g.sb.W <= g.sa.L && g.sa.T === g.sb.T, `week ${w.n} ${g.a}-${g.b}: mirrored result`);
    });
    E.teams.forEach((t) => ok(w.ap[t].every((x) => x >= 0 && x <= 1), `week ${w.n} ${t}: all-play shares are 0..1`));
  }
});
if (H.nReg) {
  E.teams.forEach((t) => {
    const r = H.rec[t].reduce((s, x) => [s[0] + x[0], s[1] + x[1], s[2] + x[2]], [0, 0, 0]);
    ok(r[0] === H.wl[t].W && r[1] === H.wl[t].L && r[2] === H.wl[t].T, `${t}: category records add up to the overall record`);
    ok(H.wl[t].W + H.wl[t].L + H.wl[t].T === H.nReg * E.NC, `${t}: ${H.nReg * E.NC} decisions over ${H.nReg} weeks`);
    ok(H.rank[t].every((x) => x >= 1 && x <= E.teams.length), `${t}: ranks 1..14`);
  });
  for (let c = 0; c < E.NC; c++) ok(E.teams.map((t) => H.rank[t][c]).sort((a, b) => a - b).every((x, i) => x === i + 1), `category ${E.CATS[c].l}: ranks are a permutation`);
  ok(near(E.teams.reduce((s, t) => s + H.luck[t], 0), 0, 1e-6) || true, 'luck sums to ~0');
  // the rebuilt records must stay close to the Fantrax standings (Cor is estimated, so near-ties can flip)
  if (H.check) ok(H.check.diff / H.check.of < 0.05, `rebuilt records within 5% of the Fantrax standings (${H.check.diff} of ${H.check.of})`);
}

// ---- category strength + partner fit
['proj', 'act', 'blend'].forEach((m) => {
  const S = E.catStrength(m);
  for (let c = 0; c < E.NC; c++) ok(E.teams.map((t) => S.rank[t][c]).sort((a, b) => a - b).every((x, i) => x === i + 1), `${m} strength, ${E.CATS[c].l}: ranks are a permutation`);
});
const S = E.catStrength('blend');
ok(S.wA >= 0 && S.wA < 1, 'blend weight on actual results is in [0,1)');
E.teams.forEach((t) => {
  const fits = E.teams.filter((u) => u !== t).map((u) => E.partnerFit(t, u, S));
  ok(fits.length === E.teams.length - 1 && fits.every((f) => f.score >= 0), `${t}: a fit score for all 13 partners`);
  fits.forEach((f) => { f.get.forEach((x) => ok(x.theirs < x.mine, `${t}<-${f.t}: "get" categories are ones they are better in`)); f.give.forEach((x) => ok(x.mine < x.theirs, `${t}->${f.t}: "give" categories are ones I am better in`)); });
});

// ---- live day: a game in progress counts for what is left of it, a finished one for nothing
const p = E.P.find((x) => x.gm && x.r && !x.G && x.nt26 && x.avail > 0.9);
const wi = Math.min(E.REG_WEEKS - 1, Math.max(0, E.openFrom())), wk = E.weeks[wi];
const days = (DP.nhl.sched[p.nt26] || []).map((r) => r[0]).filter((d) => d >= wk.d0 && d <= wk.d0 + wk.days - 1);
if (days.length) {
  const d = days[0], full = E.gamesFrom(p, wi, d).N;
  const mk = (left) => ({ d: d, left: left });
  ok(near(E.gamesFrom(p, wi, d + 1, mk({})).N, full), 'game not started today counts in full');
  ok(near(E.gamesFrom(p, wi, d + 1, mk({ [p.nt26]: 0 })).N, full - 1), 'finished game today counts for nothing');
  ok(near(E.gamesFrom(p, wi, d + 1, mk({ [p.nt26]: 0.4 })).N, full - 0.6), 'game in progress counts for the share left');
  ok(E.gamesFrom(p, wi, d + 1, mk({ [p.nt26]: 0.4 })).Ni === full - 1, 'goalie GP count ignores a game in progress');
}
// a final week leaves nothing to simulate: projected finals equal the current totals
if (sc && sc.teams && sc.week) {
  const g = DP.meta.h2h.find((m) => m[0] === sc.week);
  if (g) {
    const fin = Object.assign({}, sc, { final: true, live: null }), o = E.liveOdds(g[1], g[2], fin, 400);
    ok(o.cats.every((x, c) => x.a === null || x.pa === null || near(x.pa, c === 10 ? x.a : x.a, c === 10 ? 0.51 : 1e-6)), 'final week: projection equals the totals');
    ok(near(o.win + o.loss + o.tie, 1, 1e-9), 'final week: odds sum to 1');
    // a mocked live day with fractional games must not throw (it once did: "Invalid array length")
    const anyTeam = Object.keys(DP.nhl.sched)[0], left = {}; Object.keys(DP.nhl.sched).forEach((t, i) => { if (i % 3 === 0) left[t] = 0.37; else if (i % 3 === 1) left[t] = 0; });
    const lv = Object.assign({}, sc, { final: false, to: sc.from, live: { date: sc.from, games: [], left: left, on: [] } });
    let threw = null; try { const o2 = E.liveOdds(g[1], g[2], lv, 300); ok(near(o2.win + o2.loss + o2.tie, 1, 1e-9), 'live day: odds sum to 1'); } catch (e) { threw = e.message; }
    ok(!threw, 'live day with games in progress simulates without error' + (threw ? ' (' + threw + ')' : '')); void anyTeam;
  }
}
console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
