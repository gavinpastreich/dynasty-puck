// Assertions for the draft tracker (data/draft.js) and the Mock Draft model. Exits non-zero on failure.
//   node tools/test/check_draft.js
const fs = require('fs'), path = require('path');
const load = require('./load.js');
const ROOT = path.join(__dirname, '..', '..');
global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
const haveDraft = fs.existsSync(path.join(ROOT, 'data', 'draft.js')), haveRadar = fs.existsSync(path.join(ROOT, 'data', 'radar.js'));
load(['data/league.js', 'data/prospects.js'].concat(haveRadar ? ['data/radar.js'] : [], haveDraft ? ['data/draft.js'] : [])
  .concat(['assets/js/util.js', 'assets/js/engine.js', 'assets/js/ui.js', 'assets/js/pages-radar.js', 'assets/js/pages-draft.js']));
const E = DP.E; E.init();
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; if (fails <= 25) console.log('FAIL', msg); } };

// ---- the tracker's data
const D = DP.draft;
ok(!!D, 'data/draft.js is built');
if (D) {
  const rows = D.rows, on = rows.filter((r) => r.rk);
  ok(on.length >= 30, `at least 30 players on the live board (${on.length})`);
  ok(new Set(on.map((r) => r.rk)).size === on.length && on.every((r) => r.rk >= 1), 'live ranks are unique and positive');
  ok(new Set(rows.map((r) => r.k)).size === rows.length, 'one row per player');
  ok(rows.every((r) => r.k === DP.draftKey(r.n)), 'the site and the tracker compute the same name key for every player');
  ok(rows.every((r) => r.r.every((e, i) => i === 0 || e[0] >= r.r[i - 1][0])), 'rank histories are in date order');
  ok(on.every((r) => r.r.length && r.r[r.r.length - 1][1] === r.rk), 'the last rank in each history is the live rank');
  ok(rows.filter((r) => !r.rk).every((r) => !r.r.length || r.r[r.r.length - 1][1] === null), 'a player off the board ends his history with "off"');
  ok(rows.every((r) => !r.s || (r.s.pts === r.s.g + r.s.a && r.s.gp >= 0)), 'points = goals + assists in every stat line, with games played');
  ok(rows.every((r) => !r.ls || (r.ls.season && r.ls.season < '2026-27' && !r.s)), 'a last-season line from Tankathon is never shown as this season');
  ok(rows.every((r) => (r.sh || []).every((e, i, a) => i === 0 || (e[0] >= a[i - 1][0] && e[1] >= a[i - 1][1]))), 'stat snapshots run forward in date and games');
  ok(D.seeded && rows.some((r) => r.r.length && r.r[0][0] === D.seeded), 'histories start from the September board');
  const cur = (DP.prospects.boards['2027'] || { players: [] }).players;
  ok(cur.every((b) => rows.some((r) => r.k === DP.draftKey(b.name))), 'every player on the curated 2027 board has a row');
  ok(rows.filter((r) => r.pre).every((r) => cur.some((b) => DP.draftKey(b.name) === r.k && b.rank === r.pre)), 'preseason rank = the curated board\'s rank');
  ok(rows.filter((r) => r.gm).every((r) => E.byId[r.fid] && E.byId[r.fid].gm === r.gm && (!E.byId[r.fid].dob || E.byId[r.fid].dob >= '2008')), 'an owned 2027 prospect is a real, young player on that roster');
  const keys = {}; rows.forEach((r) => { keys['d27:' + r.k] = 1; });
  [2028, 2029].forEach((y) => (DP.prospects.boards[y] || { players: [] }).players.forEach((b) => { keys['d' + (y % 100) + ':' + DP.draftKey(b.name)] = 1; }));
  ok(Object.keys(D.news || {}).every((k) => keys[k]), 'every headline is filed under a player in a draft class');
  ok(Object.values(D.news || {}).every((l) => l.every((it) => /^\d{4}-\d\d-\d\d$/.test(it.d) && /^https?:/.test(it.u) && it.t)), 'every headline has a date, link and title');
  ok(D.status && D.status.tk && D.status.tk.url && Array.isArray(D.status.css), 'source status is recorded');
}

// ---- the view model
const V = DP.draftView();
ok(V.rows.length === (D ? D.rows.length : 0), 'the view has every player');
V.rows.forEach((x) => {
  ['pre', '30', 'up'].forEach((w) => {
    const m = x.m[w];
    ok(m && (m.off || m.isNew || m.back || (Number.isInteger(m.dr) && m.then - x.rk === m.dr)), `movement for ${x.n} (${w}) is a whole number of spots or a status`);
  });
});

// ---- the Mock Draft model
const M = DP._mock, pool = M.pool(), order = M.order(), c = E.pickCurve();
ok(order.length === E.teams.length * (DP.league.rounds || 3), `the order has ${E.teams.length * 3} picks`);
ok(E.teams.every((t) => order.filter((o, i) => i < E.teams.length && o.orig === t).length === 1), 'every team\'s own first-round pick is in round 1 once');
ok(order.every((o) => DP.league.picks.some((p) => p.year === 2027 && p.round === o.r && p.orig === o.orig && p.owner === o.owner)), 'each pick belongs to its current owner');
ok(new Set(pool.map((x) => x.key)).size === pool.length, 'pool keys are unique');
ok(pool.length > order.length, 'more players in the pool than picks');
ok(!pool.some((x) => x.x && x.x.gm), 'no 2027 prospect already on a league roster is in the pool');
ok(!pool.some((x) => x.p && x.p.gm), 'no rostered player is in the pool');
const cls = pool.filter((x) => x.x && x.x.rk).sort((a, b) => a.rank - b.rank);
ok(cls.every((x, i) => i === 0 || x.v <= cls[i - 1].v + 1e-9), 'a better Tankathon rank never means less value');
ok(cls.every((x) => Math.abs(x.v - (c[Math.min(c.length - 1, x.rank - 1)] * 0.97 + 0.3 * Math.pow(0.97, x.rank))) < 1e-9), 'class value = the league\'s rookie-draft curve at his rank');

// a full all-AI mock: every slot filled once, nobody twice, deterministic for a seed
const st = (me, seed) => ({ me: me, order: order, pool: pool, need: M.needs(), taken: {}, log: [], i: 0, auto: true, rand: E.rng(seed) });
const a = st(null, 7); M.run(a);
ok(a.log.length === order.length && a.i === order.length, 'an all-AI mock fills every pick');
ok(new Set(a.log.map((l) => l.x.key)).size === a.log.length, 'nobody is drafted twice');
const b2 = st(null, 7); M.run(b2);
ok(a.log.map((l) => l.x.key).join() === b2.log.map((l) => l.x.key).join(), 'the same seed gives the same mock');
ok(a.log[0].x.v >= a.log[a.log.length - 1].x.v, 'the first pick is worth more than the last');

// your queue: your pick is the first queued player still there
const U = DP.U, me = order[4].owner, saved = U.store.get;
const q = [pool[30].key, pool[12].key, pool[0].key];
U.store.get = (k, d) => (k === 'mockq_' + me ? q.slice() : saved(k, d));
const s3 = st(me, 11); s3.taken[pool[30].key] = 1;
const pick = M.pickFor(s3, me, pool.filter((x) => !s3.taken[x.key]), s3.taken, s3.rand);
ok(pick && pick.key === pool[12].key, 'with the first queued player gone, the second queued player is picked');
ok(M.pickFor(s3, order[0].owner === me ? order[1].owner : order[0].owner, pool, {}, s3.rand) !== null, 'other teams still pick by value');

// odds: availability can only fall from one of your picks to the next, and counts stay within the number of drafts
const s4 = st(me, 3); s4.auto = false; M.run(s4);
const od = M.odds(s4, 120);
ok(od.picks.every((j) => j > s4.i && order[j].owner === me), 'odds cover your picks after the current one');
ok(od.cnt.every((m) => Object.values(m).every((v) => v >= 0 && v <= od.N)), 'availability counts are between 0 and the number of drafts');
for (let i = 1; i < od.cnt.length; i++) ok(Object.keys(od.cnt[i]).every((k) => (od.cnt[i][k] || 0) <= (od.cnt[i - 1][k] || 0)), `nobody is likelier to be there at your pick ${i + 1} than at pick ${i}`);
U.store.get = saved;

// projection (Draft Center's "League pick")
const P = DP.mockProjection();
ok(P.N >= 100, 'projection runs enough mocks');
const totalPicks = Object.values(P.by).reduce((s, x) => s + x.n, 0);
ok(totalPicks === P.N * order.length, 'every simulated pick is counted once');
ok(Object.values(P.by).every((x) => x.any >= x.r1 && x.r1 >= 0 && x.any <= 1 && (!x.med || (x.p10 <= x.med && x.med <= x.p90 && x.p90 <= order.length))), 'pick ranges are consistent');
const top = cls[0] && P.by[cls[0].key];
ok(top && top.r1 > 0.9, `the top of the board goes in round 1 almost always (${top && top.r1})`);

console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
