#!/usr/bin/env node
/* Dynasty Puck HQ opt-in alerts. Run every hour by .github/workflows/alerts.yml (GitHub Actions, no Claude involved).
 *  lock   - a few hours before every lineup lock: each team's Fantrax lineup check -> that team's ntfy topic
 *  daily  - once a day (after the nightly data refresh): roster moves and new injuries -> team topics; trades -> league topic
 *  weekly - Monday morning: writes tools/out/digest.{txt,html} + subject.txt for tools/alerts_email.py to email
 * Topics: <alerts.ntfyPrefix>-<team code letters> (e.g. dynastypuck-7q2-MM) and <prefix>-league.
 * Usage: node tools/alerts.js [--dry] [--force lock|daily|weekly] [--now 2026-10-05T20:30:00Z]
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'league.json'), 'utf8'));
const A = CFG.alerts || {};
const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry'), FORCE = arg('--force'), NOW = arg('--now');

global.window = global; global.self = global;
for (const f of ['data/league.js', 'data/prospects.js', 'data/research.js', 'assets/js/util.js', 'assets/js/engine.js', 'assets/js/live.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const DP = global.DP, E = DP.E, U = DP.U;
if (NOW) DP.nowOverride = NOW;
const SITE = A.siteUrl || '', PREFIX = A.ntfyPrefix || 'dynastypuck';
const topicOf = (code) => PREFIX + '-' + String(code).replace(/[^A-Za-z0-9]/g, '');
const now = () => E.now();
const et = (d, o) => d.toLocaleString('en-US', Object.assign({ timeZone: 'America/New_York' }, o));
const lockLabel = (wi) => et(E.lockTime(wi), { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET';
const weekLabel = (wi) => { const w = E.weeks[wi]; return w.po ? 'Playoffs round ' + w.po : 'Week ' + w.n; };
const m = (x) => '$' + (Math.round(x * 100) / 100).toFixed(2) + 'M';

async function ntfy(topic, title, message, click) {
  if (DRY) { console.log(`[dry] ${topic} | ${title}\n${message}\n`); return; }
  const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, click, tags: ['ice_hockey'] }) });
  console.log(`sent ${topic}: ${title} (${r.status})`);
}
// dedupe without keeping state: ask ntfy whether a message with this title went to the topic recently
async function alreadySent(topic, title, since) {
  if (DRY) return false;
  try {
    const r = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=${since || '24h'}`);
    return (await r.text()).split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).title === title; } catch (e) { return false; } });
  } catch (e) { return false; }
}

async function syncFantrax(period) { // same live overlay the website applies on load
  const FX = DP.league.fantrax; if (!FX) return;
  try {
    const r = await fetch(`https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=${FX.id}&period=${period}`);
    const res = DP.live.apply(await r.json());
    if (res.changes.length) E.init();
    console.log(`Fantrax: ${res.changes.length} roster changes, ${res.slots} lineup-slot changes since the nightly build`);
  } catch (e) { console.log('Fantrax sync failed, using the nightly data:', e.message); }
}

// ------------------------------------------------------------------ lineup-lock reminders
function lockMessage(team, wi) {
  const c = E.lineupCheck(team, wi), lines = [];
  if (!c) return { title: `${weekLabel(wi)} locks ${lockLabel(wi)}`, message: 'No lineup set in Fantrax yet. Set your 12 F / 6 D / 2 G before puck drop.' };
  const gap = c.eOpt - c.eSet;
  lines.push((c.opp ? `vs ${E.teamName[c.opp]} · ` : '') + `your Fantrax lineup projects ${c.eSet.toFixed(1)} of 15 cats` + (gap >= 0.05 ? ` (optimal ${c.eOpt.toFixed(1)}).` : ', which is optimal. ✓'));
  const slot = (p) => (p.fs && p.fs !== 'A' ? ` (${DP.SLOT_NAME[p.fs]})` : '');
  if (c.start.length) lines.push('Start: ' + c.start.map((x) => x.p.n + slot(x.p)).join(', ') + '.');
  if (c.sit.length) lines.push('Sit: ' + c.sit.map((x) => x.p.n).join(', ') + '.');
  const idle = c.hurt.concat(c.dead).filter((p, i, a) => a.indexOf(p) === i && !c.sit.some((x) => x.p === p));
  if (idle.length) lines.push('Active but not expected to play: ' + idle.map((p) => p.n + (p.inj ? ` (${p.inj[0]})` : '')).join(', ') + '.');
  if (c.gFailSet > 0.12) lines.push(`Goalie minimum: ${Math.round(c.gFailSet * 100)}% chance of fewer than ${E.RULES.goalieMinGP} goalie GP.`);
  return { title: `${weekLabel(wi)} locks ${lockLabel(wi)}`, message: lines.join('\n') };
}
async function doLock() {
  const wi = E.lockWeek(); if (wi === null) return;
  const hrs = (E.lockTime(wi) - now()) / 36e5, H = A.lockReminderHours || 3;
  if (FORCE !== 'lock' && !(hrs <= H && hrs > H - 1.5)) return;
  await syncFantrax(wi + 1);
  for (const t of E.teams) {
    const msg = lockMessage(t, wi), topic = topicOf(t);
    if (FORCE !== 'lock' && await alreadySent(topic, msg.title, '6h')) continue;
    await ntfy(topic, msg.title, msg.message, SITE + '#/team/' + encodeURIComponent(t));
  }
}

// ------------------------------------------------------------------ daily news
async function doDaily() {
  const d = now(), hourUTC = d.getUTCHours();
  if (FORCE !== 'daily' && hourUTC !== 11) return; // the nightly refresh finishes around 10:25 UTC
  const today = d.toISOString().slice(0, 10), yday = new Date(d - 864e5).toISOString().slice(0, 10);
  const moves = (DP.league.moves || []).filter((x) => x.d >= yday);
  const title = 'Dynasty Puck update ' + et(d, { month: 'short', day: 'numeric' });
  const desc = (x) => x.type === 'add' ? `${x.to} added ${x.n} (${x.ct}${x.ct === 'MNR' ? '' : ' ' + m(x.sal / 1e6)})`
    : x.type === 'drop' ? `${x.from} dropped ${x.n}` : x.type === 'move' ? `${x.n}: ${x.from} → ${x.to}` : `${x.n} (${x.to}): now ${x.ct} ${m(x.sal / 1e6)}`;
  for (const t of E.teams) {
    const lines = moves.filter((x) => x.from === t || x.to === t).map(desc);
    E.rosters[t].filter((p) => p.inj && p.inj[3] >= yday && p.r).forEach((p) => lines.push(`Injury: ${p.n} ${p.inj[0]}${p.inj[1] ? ' (' + p.inj[1] + ')' : ''}${p.inj[2] ? ', ' + p.inj[2] : ''}`));
    E.rosters[t].filter((p) => p.ct === 'MNR').forEach((p) => {
      const g = E.graduation(p);
      if (g.status !== 'graduated' && g.need > 0 && g.need <= 3) lines.push(`Graduation watch: ${p.n} is ${g.need} NHL GP from ${g.thr}.`);
    });
    if (!lines.length) continue;
    const topic = topicOf(t);
    if (FORCE !== 'daily' && await alreadySent(topic, title, '20h')) continue;
    await ntfy(topic, title, lines.join('\n'), SITE + '#/team/' + encodeURIComponent(t));
  }
  const trades = moves.filter((x) => x.type === 'move');
  if (trades.length) {
    const topic = topicOf('league');
    if (FORCE === 'daily' || !await alreadySent(topic, title, '20h')) await ntfy(topic, title, trades.map(desc).join('\n'), SITE + '#/history');
  }
  console.log('daily done', today);
}

// ------------------------------------------------------------------ weekly digest (emailed by tools/alerts_email.py)
async function doWeekly() {
  const d = now(), day = et(d, { weekday: 'long' }), hour = +et(d, { hour: 'numeric', hour12: false });
  if (FORCE !== 'weekly' && !(day === (A.weeklyDigestDay || 'Monday') && hour === (A.weeklyDigestHourET || 9))) return;
  const wi = E.lockWeek(); if (wi === null) return;
  await syncFantrax(wi + 1);
  const w = E.weeks[wi], txt = [], html = [];
  const H = (s) => html.push(s), T = (s) => txt.push(s), esc = U.esc;
  const subject = `Dynasty Puck: ${weekLabel(wi)} preview (locks ${lockLabel(wi)})`;
  H(`<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#1f2328">`);
  H(`<h2 style="margin:0 0 4px">🏒 Dynasty Puck: ${esc(weekLabel(wi))}</h2><p style="color:#59636e;margin:0 0 14px">${esc(w.start)} to ${esc(w.end)} · lineups lock ${esc(lockLabel(wi))} · <a href="${SITE}">open Dynasty Puck HQ</a></p>`);
  T(subject, ''); T(SITE, '');
  const act = E.actual();
  if (act && !act.odd) {
    const st = act.list.slice().sort((a, b) => (b.W + b.T / 2) / Math.max(1, b.W + b.L + b.T) - (a.W + a.T / 2) / Math.max(1, a.W + a.L + a.T));
    H('<h3>Standings</h3><table cellpadding="4" style="border-collapse:collapse;font-size:14px">' + st.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(E.teamName[r.t])}</td><td style="text-align:right">${r.W}-${r.L}-${r.T}</td></tr>`).join('') + '</table>');
    T('STANDINGS'); st.forEach((r, i) => T(`${i + 1}. ${E.teamName[r.t]} ${r.W}-${r.L}-${r.T}`)); T('');
  }
  if (!w.po) {
    H('<h3>This week\'s matchups</h3><ul style="padding-left:18px">'); T('MATCHUPS');
    DP.meta.h2h.filter((g) => g[0] === w.n).forEach((g, gi) => {
      const opt = (t) => { const s = E.setLineupIds(t); return E.teamWeek(E.rosters[t], wi, s ? { only: s, injuries: true } : { injuries: true }); };
      const mc = E.simWeek(opt(g[1]), opt(g[2]), 3000, w.n * 97 + gi);
      const fav = mc.win >= mc.loss ? g[1] : g[2], p = Math.max(mc.win, mc.loss);
      const line = `${E.teamName[g[1]]} at ${E.teamName[g[2]]}: ${p < 0.6 ? 'coin flip' : E.teamName[fav] + ' ' + Math.round(p * 100) + '%'}`;
      H(`<li>${esc(line)}</li>`); T('- ' + line);
    });
    H('</ul>'); T('');
  }
  const watch = E.teams.map((t) => ({ t, c: E.lineupCheck(t, wi) })).filter((x) => x.c && x.c.eOpt - x.c.eSet >= 0.1);
  if (watch.length) {
    H('<h3>Lineup watch</h3><p style="color:#59636e;margin:0">Lineups as set in Fantrax right now vs the best possible lineup.</p><ul style="padding-left:18px">'); T('LINEUP WATCH');
    watch.sort((a, b) => (b.c.eOpt - b.c.eSet) - (a.c.eOpt - a.c.eSet)).forEach((x) => {
      const line = `${E.teamName[x.t]}: ${(x.c.eOpt - x.c.eSet).toFixed(2)} cats on the table. Start ${x.c.start.slice(0, 3).map((y) => y.p.n).join(', ')}`;
      H(`<li>${esc(line)}</li>`); T('- ' + line);
    });
    H('</ul>'); T('');
  }
  const grads = E.P.filter((p) => p.gm && p.ct === 'MNR').map((p) => [p, E.graduation(p)]).filter((x) => x[1].week !== null && x[1].week <= wi + 1 && x[1].status !== 'graduated');
  if (grads.length) {
    H('<h3>Graduation watch</h3><ul style="padding-left:18px">' + grads.map((x) => `<li>${esc(x[0].n)} (${esc(x[0].gm)}): ${x[1].cgp}/${x[1].thr} NHL GP</li>`).join('') + '</ul>');
    T('GRADUATION WATCH'); grads.forEach((x) => T(`- ${x[0].n} (${x[0].gm}): ${x[1].cgp}/${x[1].thr} NHL GP`)); T('');
  }
  const since = new Date(d - 7 * 864e5).toISOString().slice(0, 10), mv = (DP.league.moves || []).filter((x) => x.d >= since);
  if (mv.length) {
    H('<h3>Roster moves this week</h3><ul style="padding-left:18px">' + mv.map((x) => `<li>${esc(x.d)}: ${esc(x.type === 'move' ? x.n + ': ' + x.from + ' → ' + x.to : x.type === 'add' ? x.to + ' added ' + x.n : x.type === 'drop' ? x.from + ' dropped ' + x.n : x.n + ' contract change')}</li>`).join('') + '</ul>');
    T('ROSTER MOVES'); mv.forEach((x) => T(`- ${x.d} ${x.type} ${x.n}`)); T('');
  }
  const unsub = A.emailAddress ? `mailto:${A.emailAddress}?subject=${encodeURIComponent('Dynasty Puck HQ: unsubscribe')}` : SITE + '#/alerts';
  H(`<p style="color:#818b98;font-size:12px;margin-top:20px">Projections are model estimates. You get this because you signed up on Dynasty Puck HQ. <a href="${unsub}">Unsubscribe</a> (or reply with "unsubscribe").</p></div>`);
  T('Projections are model estimates. To unsubscribe, reply with "unsubscribe".');
  const out = path.join(ROOT, 'tools', 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'digest.html'), html.join('\n'));
  fs.writeFileSync(path.join(out, 'digest.txt'), txt.join('\n'));
  fs.writeFileSync(path.join(out, 'subject.txt'), subject);
  console.log('weekly digest written:', subject);
}

(async () => {
  E.init();
  const which = FORCE ? [FORCE] : ['lock', 'daily', 'weekly'];
  for (const k of which) {
    try { await ({ lock: doLock, daily: doDaily, weekly: doWeekly })[k](); } catch (e) { console.error(k, 'failed:', e); process.exitCode = 1; }
  }
})();
