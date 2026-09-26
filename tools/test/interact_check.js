// Interaction fuzz: open every route, then use its controls one by one (selects, tabs, buttons, table sorts, sliders)
// and report page errors, "Something went wrong" renders and junk text (NaN, undefined, [object Object], Infinity).
//   PW_PATH=... node tools/test/interact_check.js [routes...]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ROOT = path.join(__dirname, '..', '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#/';
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ['home', 'team/ROO', 'team/SPG', 'players', 'fa', 'compare', 'leaders', 'matchup', 'season', 'trade', 'trade?t=SPG,CGN', 'finder', 'finder?mode=get', 'signing', 'cap', 'offseason', 'prospects', 'draft', 'schedule', 'injuries', 'rules', 'data', 'history', 'picks', 'values', 'windows', 'preview', 'standings', 'alerts', 'live', 'auction', 'mock', 'awards', 'player/*04lc0*'];
const JUNK = /\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b/;
const SKIP_BTN = /test|send|subscribe|unsubscribe|copy|download|csv|reset all|clear all|delete|📥|email/i; // network, clipboard, destructive

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('dp_team', JSON.stringify('ROO')); } catch (e) {} });
  await ctx.route('https://www.fantrax.com/**', (r) => r.abort());
  await ctx.route('https://ntfy.sh/**', (r) => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  let problems = 0, actions = 0;
  const check = async (label) => {
    const st = await page.evaluate((re) => {
      const m = document.querySelector('#main'); if (!m) return { gone: true };
      const t = m.innerText, j = t.match(new RegExp(re));
      return { broke: /Something went wrong rendering this page/.test(t), junk: j ? t.slice(Math.max(0, j.index - 60), j.index + 40).replace(/\s+/g, ' ') : null };
    }, JUNK.source);
    const out = [];
    if (st.broke) out.push('RENDER ERROR');
    if (st.junk) out.push('junk text: …' + st.junk + '…');
    errs.splice(0).forEach((e) => out.push(e.slice(0, 240)));
    if (out.length) { problems++; console.log('✗', label); out.forEach((o) => console.log('    ', o)); }
  };
  for (const r of ROUTES) {
    await page.goto(URL + r); await page.waitForTimeout(r.startsWith('team') || r === 'home' ? 2500 : 1200);
    await check(r + ' (load)');
    const base = await page.evaluate(() => location.hash);
    // describe controls once; re-find them by index after each action (renders replace the DOM)
    const plan = await page.evaluate((skip) => {
      const m = document.querySelector('#main'), out = [];
      m.querySelectorAll('select').forEach((s, i) => { if (s.options.length > 1) out.push({ kind: 'select', i }); });
      m.querySelectorAll('.seg button, [role=tab]').forEach((b, i) => out.push({ kind: 'tab', i }));
      m.querySelectorAll('input[type=range]').forEach((b, i) => out.push({ kind: 'range', i }));
      m.querySelectorAll('th').forEach((b, i) => { if (i < 6 && b.closest('table') && b.textContent.trim()) out.push({ kind: 'th', i }); });
      m.querySelectorAll('button.btn').forEach((b, i) => { if (!new RegExp(skip, 'i').test(b.textContent)) out.push({ kind: 'btn', i, t: b.textContent.trim().slice(0, 30) }); });
      return out.slice(0, 40);
    }, SKIP_BTN.source);
    for (const a of plan) {
      const label = `${r} · ${a.kind}#${a.i}${a.t ? ' "' + a.t + '"' : ''}`;
      try {
        const did = await page.evaluate((a) => {
          const m = document.querySelector('#main');
          if (a.kind === 'select') { const s = m.querySelectorAll('select')[a.i]; if (!s) return false; s.selectedIndex = (s.selectedIndex + 1) % s.options.length; if (!s.value && s.options.length > 2) s.selectedIndex = 2; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); return true; }
          if (a.kind === 'range') { const s = m.querySelectorAll('input[type=range]')[a.i]; if (!s) return false; s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
          const el = a.kind === 'tab' ? m.querySelectorAll('.seg button, [role=tab]')[a.i] : a.kind === 'th' ? m.querySelectorAll('th')[a.i] : m.querySelectorAll('button.btn')[a.i];
          if (!el) return false; el.click(); return true;
        }, a);
        if (!did) continue;
        actions++;
        await page.waitForTimeout(a.kind === 'btn' ? 1200 : 450);
        await check(label);
        const now = await page.evaluate(() => location.hash);
        if (now !== base || a.kind === 'select' || a.kind === 'tab') { await page.goto(URL + r); await page.waitForTimeout(900); errs.length = 0; }
      } catch (e) { problems++; console.log('✗', label, 'threw', e.message.slice(0, 160)); await page.goto(URL + r); await page.waitForTimeout(900); }
    }
    console.log('·', r, plan.length, 'controls');
  }
  await browser.close();
  console.log(`${actions} actions, ${problems} problems`);
  process.exit(problems ? 1 : 0);
})();
