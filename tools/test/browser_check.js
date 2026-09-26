// Headless browser smoke test: node tools/test/browser_check.js [routes...]
// Opens every route at desktop and phone width, reports console errors and page errors, saves screenshots.
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.SHOTS || path.join(ROOT, 'tools', 'test', 'shots');
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['home', 'team/ROO', 'players', 'fa', 'compare', 'leaders', 'matchup', 'season', 'trade', 'finder', 'signing', 'cap', 'offseason', 'prospects', 'draft', 'schedule', 'injuries', 'rules', 'data', 'history', 'picks', 'values', 'windows', 'preview', 'draft?tab=league', 'draft?tab=b2027', 'prospects?tab=rank', 'prospects?tab=pipes', 'schedule?tab=sos', 'schedule?tab=goalie', 'schedule?tab=stream', 'trade?t=M.M,ROO&a=p:*04lc0*>M.M', 'finder?mode=get', 'player/*04lc0*'];
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let bad = 0;
  for (const vp of [{ n: 'desk', w: 1360, h: 900 }, { n: 'phone', w: 390, h: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('dp_team', JSON.stringify('ROO')); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error' && !/assets\.nhle\.com|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    const url = 'file://' + path.join(ROOT, 'index.html');
    for (const r of routes) {
      errs.length = 0;
      const t0 = Date.now();
      await page.goto(url + '#/' + r);
      await page.waitForTimeout(r === 'home' || r.startsWith('team') || r === 'season' ? 2500 : 900);
      const main = await page.$eval('#main', el => el.innerText.slice(0, 160).replace(/\s+/g, ' '));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = path.join(OUT, vp.n + '_' + r.replace(/[^a-z0-9]+/gi, '_') + '.png');
      await page.screenshot({ path: file, fullPage: false });
      const flag = errs.length || overflow > 2 ? '✗' : '✓';
      if (flag === '✗') bad++;
      console.log(flag, vp.n, r.padEnd(16), (Date.now() - t0) + 'ms', overflow > 2 ? 'H-OVERFLOW ' + overflow + 'px' : '', '|', main.slice(0, 90));
      errs.forEach(e => console.log('    ', e.slice(0, 300)));
    }
    await ctx.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
