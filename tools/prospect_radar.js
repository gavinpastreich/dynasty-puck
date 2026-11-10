#!/usr/bin/env node
/* Prospect Radar data (run by the nightly refresh after tools/build_data.py and tools/research/scrape_news.py).

   Scores tonight's prospect pool with the app's own engine (assets/js/engine.js, E.prospectPool), adds the result to
   raw/<season>/prospects/history.json, and writes data/radar.js for the Prospect Radar page: every prospect's value
   and rank over time, this season's games and points at each date (so "last 14 days" is a real difference between two
   nights' NHL-API totals), and the headlines the scraper collected.

     node tools/prospect_radar.js              tonight's snapshot + data/radar.js
     node tools/prospect_radar.js --backfill   rebuild the whole history from the nightly data files in git
                                               (needs a full clone: git fetch --unshallow)

   History keeps every night for the last 21 days and Mondays before that. Every date is scored with the model the
   engine has today (E.PROSPECT_MODEL): when the model changes, bump that number and run --backfill so old and new
   ranks stay comparable. */
const fs = require('fs'), path = require('path'), vm = require('vm'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'league.json'), 'utf8'));
const RAW = path.join(ROOT, ...(cfg.rawFolder || 'raw/2026-27').split('/'), 'prospects');
const HIST = path.join(RAW, 'history.json'), NEWS = path.join(RAW, 'news.json'), OUT = path.join(ROOT, 'data', 'radar.js');
const ENGINE = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'engine.js'), 'utf8');
const DAILY_DAYS = 21, SERIES = ['v', 'g', 's', 'c', 'e', 'k'], WINDOWS = [7, 14, 30];
const r2 = (x) => Math.round(x * 100) / 100;

// one night's data files -> { date, model, rows: { key: [v, g, s, c, e, k] } }:
//   v stock (value as an MNR asset), g games this season, s points this season (wins for goalies), c career NHL games,
//   e NHL games projected for this season, k the model's read: peak points per 82 (skaters) or save % against the
//   league's usual level, -1.5 to +1.5 (goalies)
function score(leagueSrc, prospectsSrc, pinNow) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  vm.runInContext(leagueSrc, ctx, { filename: 'data/league.js' });
  vm.runInContext(prospectsSrc, ctx, { filename: 'data/prospects.js' });
  vm.runInContext(ENGINE, ctx, { filename: 'assets/js/engine.js' });
  const built = ctx.DP.meta.built;
  if (pinNow) ctx.DP.nowOverride = built + ':00Z';   // score an old file as of the moment it was built
  const E = ctx.DP.E; E.init();
  const rows = {};
  E.prospectPool().forEach((x) => {
    const L = E.seasonLines(x.p), g = x.p.slot === 'G';
    const pr = x.pros || {}, k = g ? (pr.form ? r2(pr.form.score * pr.form.rel) : null) : (pr.peakPts ? Math.round(pr.peakPts * 10) / 10 : null);
    rows[x.key] = [r2(x.stock), L.reduce((a, l) => a + l[2], 0), L.reduce((a, l) => a + (g ? l[3] : l[5]), 0), x.p.cgp || 0, Math.round(x.p.projGP || 0), k];
  });
  return { date: built.slice(0, 10), model: E.PROSPECT_MODEL, rows };
}

function put(hist, snap) {
  let i = hist.dates.indexOf(snap.date);
  if (i < 0) {
    i = hist.dates.findIndex((d) => d > snap.date); if (i < 0) i = hist.dates.length;
    hist.dates.splice(i, 0, snap.date);
    Object.values(hist.p).forEach((o) => SERIES.forEach((k) => o[k].splice(i, 0, null)));
  }
  const n = hist.dates.length;
  Object.keys(snap.rows).forEach((key) => {
    const o = hist.p[key] || (hist.p[key] = {});
    SERIES.forEach((k, j) => { if (!o[k]) o[k] = new Array(n).fill(null); o[k][i] = snap.rows[key][j]; });
  });
  Object.keys(hist.p).forEach((key) => { if (!snap.rows[key]) SERIES.forEach((k) => { hist.p[key][k][i] = null; }); });
}
// every night for the last 21 days, Mondays (and the first night) before that
function thin(hist) {
  const last = new Date(hist.dates[hist.dates.length - 1] + 'T12:00:00Z');
  const keep = hist.dates.map((d, i) => i === 0 || (last - new Date(d + 'T12:00:00Z')) / 864e5 <= DAILY_DAYS || new Date(d + 'T12:00:00Z').getUTCDay() === 1);
  hist.dates = hist.dates.filter((_, i) => keep[i]);
  Object.keys(hist.p).forEach((key) => {
    SERIES.forEach((k) => { hist.p[key][k] = hist.p[key][k].filter((_, i) => keep[i]); });
    if (hist.p[key].v.every((x) => x === null)) delete hist.p[key];
  });
}
function save(hist) {
  const keys = Object.keys(hist.p).sort();
  const body = keys.map((k) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(hist.p[k])).join(',\n');
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(HIST, '{\n  "_what": ' + JSON.stringify('Prospect Radar history (tools/prospect_radar.js). Per player, aligned with "dates": v = model value as an MNR asset, g = games this season, s = points this season (wins for goalies), c = career NHL games, e = NHL games projected this season, k = peak points per 82 in the model (goalies: save % against league level, -1.5 to 1.5). Keys are n + NHL id. Every date is scored with prospect model ' + hist.model + '.') +
    ',\n  "model": ' + hist.model + ',\n  "dates": ' + JSON.stringify(hist.dates) + ',\n  "p": {\n' + body + '\n  }\n}\n');
}

function backfill(hist) {
  const git = (c) => execSync('git ' + c, { cwd: ROOT, maxBuffer: 3e8 }).toString();
  if (git('rev-parse --is-shallow-repository').trim() === 'true') console.log('  ! shallow clone: only the nights in the fetched history can be rebuilt (git fetch --unshallow for all of them)');
  const byDay = {};
  git("log --format=%H_%cd --date=short -- data/league.js").trim().split('\n').forEach((l) => { const [h, d] = l.split('_'); if (!byDay[d]) byDay[d] = h; });   // newest commit of each day
  const days = Object.keys(byDay).sort();
  let ok = 0;
  days.forEach((d) => {
    try {
      const snap = score(git('show ' + byDay[d] + ':data/league.js'), git('show ' + byDay[d] + ':data/prospects.js'), true);
      put(hist, snap); ok++;
    } catch (e) { console.log('  ! ' + d + ' (' + byDay[d].slice(0, 7) + ') could not be scored: ' + String(e.message).slice(0, 120)); }
  });
  console.log('  backfill: ' + ok + ' of ' + days.length + ' nights re-scored (' + days[0] + ' to ' + days[days.length - 1] + ')');
}

function main() {
  const doBackfill = process.argv.includes('--backfill');
  const today = score(fs.readFileSync(path.join(ROOT, 'data', 'league.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'data', 'prospects.js'), 'utf8'), false);
  let hist = { model: today.model, dates: [], p: {} };
  if (!doBackfill && fs.existsSync(HIST)) hist = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  let stale = false;
  if (hist.model !== today.model) {
    stale = true;
    console.log('!! prospect history was scored with model ' + hist.model + ' but the engine is on model ' + today.model + ': run  node tools/prospect_radar.js --backfill  so old and new ranks are comparable');
  }
  if (doBackfill) backfill(hist);
  put(hist, today);
  thin(hist);
  save(hist);

  // ---- data/radar.js: value and rank at every kept date; games, points, NHL games, projection and model read at the
  // comparison dates only (now, 7, 14 and 30 days back, first night) to keep the file small
  const n = hist.dates.length, P = {}, lastT = new Date(hist.dates[n - 1] + 'T12:00:00Z').getTime();
  const back = (days) => { let b = 0; hist.dates.forEach((d, i) => { if (new Date(d + 'T12:00:00Z').getTime() <= lastT - days * 864e5) b = i; }); return b; };
  const ref = [n - 1].concat(WINDOWS.map(back)).concat([0]);
  Object.keys(today.rows).forEach((k) => {
    const o = hist.p[k];
    P[k] = { v: o.v, r: new Array(n).fill(null), m: ref.map((i) => (o.v[i] === null ? null : [o.g[i], o.s[i], o.c[i], o.e[i], o.k[i]])) };
  });
  for (let i = 0; i < n; i++) {
    Object.keys(hist.p).filter((k) => hist.p[k].v[i] !== null).sort((a, b) => hist.p[b].v[i] - hist.p[a].v[i])
      .forEach((k, j) => { if (P[k]) P[k].r[i] = j + 1; });
  }
  let news = { items: {}, sources: [], fetched: null };
  if (fs.existsSync(NEWS)) news = JSON.parse(fs.readFileSync(NEWS, 'utf8'));
  const items = {};
  Object.keys(news.items || {}).forEach((k) => {
    if (!P[k]) return;
    items[k] = news.items[k].slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b.w || 0) - (a.w || 0)));
  });
  const radar = { built: new Date().toISOString().slice(0, 16), model: today.model, stale: stale, dates: hist.dates, ref: ref, windows: WINDOWS, p: P, news: items, sources: news.sources || [], newsAsOf: news.fetched || null };
  const js = '/* generated by tools/prospect_radar.js - do not edit */\nwindow.DP=window.DP||{};DP.radar=' + JSON.stringify(radar) + ';\n';
  const strip = (s) => s.replace(/"built":"[^"]*"/, '');
  if (!fs.existsSync(OUT) || strip(fs.readFileSync(OUT, 'utf8')) !== strip(js)) fs.writeFileSync(OUT, js);
  const nNews = Object.values(items).reduce((a, l) => a + l.length, 0);
  console.log('Prospect Radar: ' + Object.keys(P).length + ' prospects, ' + n + ' dates (' + hist.dates[0] + ' to ' + hist.dates[n - 1] + '), ' + nNews + ' headlines, ' + Math.round(js.length / 1024) + ' KB');
}
main();
