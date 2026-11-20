#!/usr/bin/env node
/* Market Movers data (run by the nightly refresh after tools/build_data.py).

   Scores tonight's player universe with the app's own engine (assets/js/engine.js): every player's dynasty value (DV),
   projected 2026-27 WAR, owner and contract. Adds it to raw/<season>/values/history.json and writes data/values.js for
   the Market Movers page (loaded only by that page).

     node tools/value_history.js              tonight's snapshot + data/values.js
     node tools/value_history.js --backfill   re-score every night's data/league.js in git with today's engine
                                              (needs a full clone), so old and new values are comparable

   History keeps every night for the last 21 days and Mondays before that. The file records the engine version it
   was scored with; when engine.js changes, the next run fetches the git history (the nightly job's checkout is
   shallow) and re-scores every night by itself. If that fails, the page warns until someone runs --backfill. */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'league.json'), 'utf8'));
const RAW = path.join(ROOT, ...(cfg.rawFolder || 'raw/2026-27').split('/'), 'values');
const HIST = path.join(RAW, 'history.json'), OUT = path.join(ROOT, 'data', 'values.js');
const ENGINE = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'engine.js'), 'utf8');
const ENGINE_V = crypto.createHash('sha1').update(ENGINE).digest('hex').slice(0, 10);
const DAILY_DAYS = 21, SERIES = ['v', 'w', 'o', 'c'], WINDOWS = [1, 7, 30];
const r2 = (x) => Math.round(x * 100) / 100;

// one night's data files -> { date, rows: { id: [DV, WAR, owner, contract + salary] } }
function score(leagueSrc, prospectsSrc, pinNow) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  vm.runInContext(leagueSrc, ctx, { filename: 'data/league.js' });
  vm.runInContext(prospectsSrc, ctx, { filename: 'data/prospects.js' });
  vm.runInContext(ENGINE, ctx, { filename: 'assets/js/engine.js' });
  const built = ctx.DP.meta.built;
  if (pinNow) ctx.DP.nowOverride = built + ':00Z';
  const E = ctx.DP.E; E.init();
  const rows = {};
  E.P.forEach((p) => {
    if (typeof p.DV !== 'number' || isNaN(p.DV)) return;
    if (!p.gm && p.DV < 0.5) return;   // unowned players with next to no value: left out to keep the file small
    rows[p.id] = [r2(p.DV), Math.round((p.WAR || 0) * 10) / 10, p.gm || '', (p.ct || '') + (p.sal26 ? ' ' + p.sal26 : '')];
  });
  return { date: built.slice(0, 10), rows };
}
function put(hist, snap) {
  let i = hist.dates.indexOf(snap.date);
  if (i < 0) {
    i = hist.dates.findIndex((d) => d > snap.date); if (i < 0) i = hist.dates.length;
    hist.dates.splice(i, 0, snap.date);
    Object.values(hist.p).forEach((o) => SERIES.forEach((k) => o[k].splice(i, 0, null)));
  }
  const n = hist.dates.length;
  Object.keys(snap.rows).forEach((id) => {
    const o = hist.p[id] || (hist.p[id] = {});
    SERIES.forEach((k, j) => { if (!o[k]) o[k] = new Array(n).fill(null); o[k][i] = snap.rows[id][j]; });
  });
  Object.keys(hist.p).forEach((id) => { if (!snap.rows[id]) SERIES.forEach((k) => { hist.p[id][k][i] = null; }); });
}
function thin(hist) {
  const last = new Date(hist.dates[hist.dates.length - 1] + 'T12:00:00Z');
  const keep = hist.dates.map((d, i) => i === 0 || (last - new Date(d + 'T12:00:00Z')) / 864e5 <= DAILY_DAYS || new Date(d + 'T12:00:00Z').getUTCDay() === 1);
  hist.dates = hist.dates.filter((_, i) => keep[i]);
  Object.keys(hist.p).forEach((id) => {
    SERIES.forEach((k) => { hist.p[id][k] = hist.p[id][k].filter((_, i) => keep[i]); });
    if (hist.p[id].v.every((x) => x === null)) delete hist.p[id];
  });
}
function save(hist) {
  const ids = Object.keys(hist.p).sort();
  const body = ids.map((k) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(hist.p[k])).join(',\n');
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(HIST, '{\n  "_what": ' + JSON.stringify('Market Movers history (tools/value_history.js). Per Fantrax player id, aligned with "dates": v = dynasty value, w = projected 2026-27 WAR, o = owner (team code, empty = free agent), c = contract type and 2026-27 salary. Every date is scored with the engine version in "engine".') +
    ',\n  "engine": ' + JSON.stringify(hist.engine) + ',\n  "dates": ' + JSON.stringify(hist.dates) + ',\n  "p": {\n' + body + '\n  }\n}\n');
}
function backfill(hist) {
  const git = (c) => execSync('git ' + c, { cwd: ROOT, maxBuffer: 3e8 }).toString();
  if (git('rev-parse --is-shallow-repository').trim() === 'true') console.log('  ! shallow clone: only the nights in the fetched history can be re-scored (git fetch --unshallow for all of them)');
  const byDay = {};
  git('log --format=%H_%cd --date=short -- data/league.js').trim().split('\n').forEach((l) => { const [h, d] = l.split('_'); if (!byDay[d]) byDay[d] = h; });
  const days = Object.keys(byDay).sort();
  let ok = 0;
  days.forEach((d) => {
    try { put(hist, score(git('show ' + byDay[d] + ':data/league.js'), git('show ' + byDay[d] + ':data/prospects.js'), true)); ok++; }
    catch (e) { console.log('  ! ' + d + ' (' + byDay[d].slice(0, 7) + ') could not be scored: ' + String(e.message).slice(0, 120)); }
  });
  console.log('  backfill: ' + ok + ' of ' + days.length + ' nights re-scored (' + days[0] + ' to ' + days[days.length - 1] + ')');
}

function main() {
  const doBackfill = process.argv.includes('--backfill');
  const today = score(fs.readFileSync(path.join(ROOT, 'data', 'league.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'data', 'prospects.js'), 'utf8'), false);
  let hist = { engine: ENGINE_V, dates: [], p: {} };
  if (!doBackfill && fs.existsSync(HIST)) hist = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  let stale = hist.engine !== ENGINE_V, again = doBackfill;
  if (stale && !doBackfill) {
    // the valuation changed: re-score every night with it so old and new values compare. The nightly job checks out
    // only the last commit, so fetch the history first (about 250 MB; only on the nights the engine changed).
    console.log('value history was scored with engine ' + hist.engine + ', the engine is now ' + ENGINE_V + ': re-scoring every night');
    try {
      if (execSync('git rev-parse --is-shallow-repository', { cwd: ROOT }).toString().trim() === 'true') execSync('git fetch --unshallow --quiet origin', { cwd: ROOT, stdio: 'inherit', timeout: 600000 });
      again = true; hist = { engine: ENGINE_V, dates: [], p: {} };
    } catch (e) { console.log('!! could not fetch the history (' + String(e.message).slice(0, 100) + '): run  node tools/value_history.js --backfill  in a full clone'); }
  }
  if (again) { hist.engine = ENGINE_V; backfill(hist); stale = false; }
  put(hist, today);
  thin(hist);
  save(hist);
  // data/values.js: value at every kept date; WAR, owner and contract only at the comparison dates (now, 1, 7, 30 days
  // back, first night) to keep the file small
  const n = hist.dates.length, lastT = new Date(hist.dates[n - 1] + 'T12:00:00Z').getTime();
  const back = (days) => { let b = 0; hist.dates.forEach((d, i) => { if (new Date(d + 'T12:00:00Z').getTime() <= lastT - days * 864e5) b = i; }); return b; };
  const ref = [n - 1].concat(WINDOWS.map(back)).concat([0]);
  const P = {};
  Object.keys(today.rows).forEach((id) => {
    const o = hist.p[id];
    P[id] = { v: o.v, m: ref.map((i) => (o.v[i] === null ? null : [o.w[i], o.o[i], o.c[i]])) };
  });
  // each team's total value on every kept night (the players it owned that night)
  const teams = {};
  Object.keys(hist.p).forEach((id) => {
    const o = hist.p[id];
    o.o.forEach((t, i) => { if (t && o.v[i] !== null) { (teams[t] = teams[t] || new Array(n).fill(0))[i] += o.v[i]; } });
  });
  Object.keys(teams).forEach((t) => { teams[t] = teams[t].map((x) => Math.round(x * 10) / 10); });
  const out = { built: new Date().toISOString().slice(0, 16), engine: ENGINE_V, stale: stale, dates: hist.dates, ref: ref, windows: WINDOWS, teams: teams, p: P };
  const js = '/* generated by tools/value_history.js - do not edit */\nwindow.DP=window.DP||{};DP.values=' + JSON.stringify(out) + ';\n';
  const strip = (s) => s.replace(/"built":"[^"]*"/, '');
  if (!fs.existsSync(OUT) || strip(fs.readFileSync(OUT, 'utf8')) !== strip(js)) fs.writeFileSync(OUT, js);
  console.log('Market Movers: ' + Object.keys(P).length + ' players, ' + n + ' dates (' + hist.dates[0] + ' to ' + hist.dates[n - 1] + '), ' + Math.round(js.length / 1024) + ' KB');
}
main();
