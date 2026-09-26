// Screenshots for the league guide PDF (tools/guide/build.sh). Usage: PW_PATH=... node tools/guide/shoot.js <outdir> [only...]
// Opens the local site, relays Fantrax through curl (sandbox CA) so the Live chip is on, and captures pages or cards.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(ROOT, 'tools', 'guide', 'shots');
const ONLY = process.argv.slice(3);
const URL = 'file://' + path.join(ROOT, 'index.html') + '#/';

// [name, route, team, {card: 'heading text' | selector, phone, h, before(page)}]
const SHOTS = [
  ['dashboard', 'home', 'SPG', { h: 1000 }],
  ['lineupcheck', 'team/ROO', 'ROO', { card: 'Fantrax lineup check' }],
  ['teamhub', 'team/ROO', 'ROO', { h: 900, scrollTo: 'Category profile' }],
  ['standings', 'standings', 'M.M', { h: 900 }],
  ['matchup', 'matchup?w=1&a=SPG&b=PuckLuck&set=1', 'SPG', { h: 1000 }],
  ['lineupwatch', 'preview', 'CGN', { card: 'Lineup watch', wait: 2500 }],
  ['alerts', 'alerts?team=btsay45', 'btsay45', { h: 900 }],
  ['players', 'players', 'Wags8210', { h: 900 }],
  ['player', 'player/*05w9c*', 'SPG', { h: 1000 }],
  ['decision', 'player/*06xmq*', 'TommyG10', { card: 'Next contract decision', lookup: 'Matthew Schaefer' }],
  ['fa', 'fa', 'mertin', { h: 900 }],
  ['trade', 'trade?t=M.M,ROO&a=p:*04lc0*>M.M', 'M.M', { h: 1050 }],
  ['values', 'values', 'nebsnave', { h: 900 }],
  ['personas', 'history', 'BHHC', { card: 'GM trade personas' }],
  ['picks', 'picks', 'PuckLuck', { h: 850 }],
  ['cap', 'cap', 'TommyG10', { h: 900 }],
  ['penalties', 'cap', 'TommyG10', { card: 'Cap hit penalties' }],
  ['offseason', 'offseason?team=M.M', 'M.M', { h: 1000 }],
  ['auction', 'auction?team=BULLIES', 'BULLIES', { h: 1050 }],
  ['prospects', 'prospects', 'CGN', { h: 900 }],
  ['board2027', 'draft?tab=b2027', 'CGN', { h: 900 }],
  ['mock', 'mock?team=nbracken', 'nbracken', { h: 950, clickFirst: '[data-draft]' }],
  ['awards', 'awards?team=CGN', 'CGN', { h: 1000 }],
  ['wrapped', 'awards?team=mcianfra', 'mcianfra', { card: 'Team Wrapped' }],
  ['windows', 'windows', 'SPG', { h: 900 }],
  ['live', 'live', 'M.M', { card: '.card', liveDemo: true }],
  ['phone_home', 'home', 'BHHC', { phone: true }],
  ['phone_team', 'team/mertin', 'mertin', { phone: true, scrollTo: 'Fantrax lineup check' }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  for (const [name, route, team, o] of SHOTS) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    const ctx = await browser.newContext(o.phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: o.h || 900 }, deviceScaleFactor: 2 });
    await ctx.route('https://www.fantrax.com/**', (r) => {
      try { r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: require('child_process').execFileSync('curl', ['-sS', '--max-time', '20', r.request().url()]) }); } catch (e) { r.abort(); }
    });
    await ctx.route('https://assets.nhle.com/**', async (r) => { // headshots via curl too
      try { r.fulfill({ status: 200, contentType: 'image/png', body: require('child_process').execFileSync('curl', ['-sS', '--max-time', '20', r.request().url()]) }); } catch (e) { r.abort(); }
    });
    await ctx.addInitScript((t) => { try { localStorage.setItem('dp_team', JSON.stringify(t)); } catch (e) {} }, team);
    const page = await ctx.newPage();
    let r = route;
    if (o.lookup) { // resolve a player id by name
      await page.goto(URL + 'home'); await page.waitForTimeout(800);
      const id = await page.evaluate((n) => (DP.E.P.find((p) => p.n === n) || {}).id, o.lookup);
      r = 'player/' + encodeURIComponent(id);
    }
    await page.goto(URL + r);
    await page.waitForTimeout(o.wait || 2600);
    await page.evaluate(() => { const bg = document.querySelector('#picker-bg'); if (bg) bg.classList.remove('open'); });
    if (o.liveDemo) { // illustration: real NHL box scores from a past week on today's lineups, with the date moved into week 7
      await page.evaluate(() => { const sc = DP.league.score; if (sc && sc.test) { sc.to = '2026-11-12'; DP.liveOddsCache = {}; DP.render(); } });
      await page.waitForTimeout(1500);
    }
    if (o.clickFirst) { const b = await page.$(o.clickFirst); if (b) { await b.click(); await page.waitForTimeout(800); } }
    if (o.scrollTo) { await page.evaluate((t) => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes(t)); if (h) h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }, o.scrollTo); await page.waitForTimeout(400); }
    const file = path.join(OUT, name + '.jpg');
    if (o.card) {
      const el = o.card.startsWith('.') ? await page.$('#live-games ' + o.card) : await page.evaluateHandle((t) => { const h = [...document.querySelectorAll('h2,h3')].find((x) => x.textContent.includes(t)); return h ? h.closest('.card') : null; }, o.card);
      const e = el && el.asElement ? el.asElement() : el;
      if (e) await e.screenshot({ path: file, type: 'jpeg', quality: 86 }); else console.log('  ! card not found', name);
    } else {
      await page.screenshot({ path: file, type: 'jpeg', quality: 86 });
    }
    console.log('shot', name);
    await ctx.close();
  }
  await browser.close();
})();
