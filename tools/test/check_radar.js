// Assertions for the Prospect Radar: the pool, the nightly history (data/radar.js) and the headlines. Exits non-zero
// on failure.   node tools/test/check_radar.js
const fs = require('fs'), path = require('path');
const load = require('./load.js');
const ROOT = path.join(__dirname, '..', '..');
const haveRadar = fs.existsSync(path.join(ROOT, 'data', 'radar.js'));
load(['data/league.js', 'data/prospects.js'].concat(haveRadar ? ['data/radar.js'] : []).concat(['assets/js/engine.js']));
const E = DP.E; E.init();
let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; if (fails <= 25) console.log('FAIL', msg); } };

// ---- the pool
const pool = E.prospectPool();
const mnr = E.P.filter((p) => p.gm && p.ct === 'MNR').length;
ok(pool.length >= 250, `pool has ${pool.length} prospects`);
ok(pool.filter((x) => x.owned).length === mnr, `every rostered MNR player is in the pool (${pool.filter((x) => x.owned).length} of ${mnr})`);
ok(pool.every((x) => isFinite(x.stock)), 'every stock value is a number');
ok(pool.every((x, i) => x.rank === i + 1 && (i === 0 || pool[i - 1].stock >= x.stock)), 'ranks follow stock');
ok(new Set(pool.map((x) => x.key)).size === pool.length, 'pool keys are unique');
ok(pool.every((x) => (x.p.age >= 25 && !x.pros) || (x.pros && x.pros.p > 0 && x.pros.p <= 0.95 + 1e-9)), 'every prospect under 25 has career odds in (0, 0.95]');
ok(pool.every((x) => !x.p.dob || (x.p.age > 16 && x.p.age < 30)), 'no prospect has an impossible age (a wrong name match in the draft data)');
ok(pool.filter((x) => x.owned).every((x) => Math.abs(x.stock - (x.p.DV + x.p.yVal[0] * (1 - E.remFrac()))) < 1e-6), 'stock of a rostered MNR player = his dynasty value with the full season counted');
ok(E.gPeak > 0.5 && E.gPeak < 5, `goalie base value in range (${E.gPeak.toFixed(2)})`);
// career odds: never below the draft-slot rate, never falling as NHL games accumulate
[null, 1, 12, 40, 90, 200].forEach((ov) => [false, true].forEach((g) => {
  let prev = 0;
  for (let gp = 0; gp <= 120; gp += 5) { const o = E.careerOdds(ov, gp, g); ok(o >= prev - 1e-12 && o >= E.pNHL(ov) - 1e-12 && o <= 0.95 + 1e-12, `career odds monotone (pick ${ov}, ${gp} GP, goalie ${g})`); prev = o; }
}));
// season lines are league play the model can read
pool.slice(0, 120).forEach((x) => E.seasonLines(x.p).forEach((l) => ok(l[2] > 0 && typeof l[0] === 'string', `season line for ${x.p.n}`)));

// ---- the nightly history
if (!haveRadar) { console.log('data/radar.js is missing: run node tools/prospect_radar.js'); fails++; }
else {
  const R = DP.radar, nd = R.dates.length;
  ok(R.model === E.PROSPECT_MODEL && !R.stale, `history is scored with the current prospect model (${R.model} vs ${E.PROSPECT_MODEL}); if not, run node tools/prospect_radar.js --backfill`);
  ok(nd >= 1 && R.dates.every((d, i) => /^\d{4}-\d\d-\d\d$/.test(d) && (i === 0 || R.dates[i - 1] < d)), 'history dates are sorted and unique');
  const age = (new Date(DP.meta.built.slice(0, 10)) - new Date(R.dates[nd - 1])) / 864e5;
  ok(age >= 0 && age <= 1, `history ends at the data build date (${R.dates[nd - 1]} vs ${DP.meta.built.slice(0, 10)})`);
  ok(R.ref.length === 2 + R.windows.length && R.ref[0] === nd - 1 && R.ref.every((i) => i >= 0 && i < nd), 'comparison dates are valid');
  let miss = 0, off = 0, rankOff = 0;
  pool.forEach((x) => {
    const h = R.p[x.key];
    if (!h) { miss++; return; }
    if (h.v.length !== nd || h.r.length !== nd || h.m.length !== R.ref.length) off++;
    else if (age === 0 && Math.abs(h.v[nd - 1] - x.stock) > 0.011) off++;
    if (age === 0 && h.r[nd - 1] !== x.rank && Math.abs(h.v[nd - 1] - x.stock) > 0.011) rankOff++;
  });
  ok(miss === 0, `every prospect has a history row (${miss} missing)`);
  ok(off === 0, `history's last night matches the live model (${off} off)`);
  ok(rankOff === 0, `ranks in the history match the live model (${rankOff} off)`);
  // ranks at each date are 1..k without gaps among the players tracked that night (players who left the pool aside)
  for (let i = 0; i < nd; i++) {
    const rs = Object.values(R.p).map((h) => h.r[i]).filter((r) => r !== null);
    ok(rs.length > 200 && new Set(rs).size === rs.length && Math.min(...rs) >= 1, `ranks on ${R.dates[i]} are distinct (${rs.length} players)`);
  }
  // games and points never go backwards within a season
  let back = 0;
  Object.values(R.p).forEach((h) => { for (let j = 1; j < h.m.length; j++) if (h.m[0] && h.m[j] && (h.m[0][0] < h.m[j][0] - 1 || h.m[0][2] < h.m[j][2])) back++; });
  ok(back <= 3, `season games don't run backwards (${back} cases)`);

  // ---- headlines
  const today = new Date().toISOString().slice(0, 10);
  let items = 0;
  Object.keys(R.news).forEach((k) => {
    ok(!!R.p[k], `headlines are filed under a tracked prospect (${k})`);
    const seen = new Set();
    R.news[k].forEach((it) => {
      items++;
      ok(/^\d{4}-\d\d-\d\d$/.test(it.d) && it.d <= today && it.t && it.s && /^https?:\/\//.test(it.u) && Array.isArray(it.k), `headline is complete (${k}: ${String(it.t).slice(0, 40)})`);
      ok(!seen.has(it.u), `no duplicate headline under one player (${it.u})`); seen.add(it.u);
    });
  });
  ok(R.sources.length >= 5 && R.sources.filter((s) => s.ok).length >= R.sources.length / 2, `most news sources were reachable (${R.sources.filter((s) => s.ok).length} of ${R.sources.length})`);
  console.log(`  ${pool.length} prospects, ${nd} nights, ${items} headlines from ${R.sources.filter((s) => s.ok).length}/${R.sources.length} sources`);
}
console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
