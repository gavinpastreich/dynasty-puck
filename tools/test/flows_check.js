// Multi-step user flows with expected outcomes (not just "no errors"):
//   PW_PATH=... node tools/test/flows_check.js
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const ROOT = path.join(__dirname, '..', '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#/';
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('dp_team')) localStorage.setItem('dp_team', JSON.stringify('ROO')); } catch (e) {} });
  await ctx.route('https://www.fantrax.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  const go = async (r, w) => { await page.goto(URL + r); await page.waitForTimeout(w || 1200); };
  const q = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
  const pickOpt = (sel, i) => page.evaluate(([s, i]) => { const e = document.querySelector(s); e.selectedIndex = i; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, i]);

  // ---- Trade Machine: build, edit and read a trade
  await go('trade?t=ROO,SPG');
  await pickOpt('[data-add="ROO"]', 2); await page.waitForTimeout(900);
  await pickOpt('[data-add="SPG"]', 3); await page.waitForTimeout(900);
  ok(await q('#tr-cols .pl') === 2, 'trade: two assets added (one per side)');
  ok(await page.evaluate(() => /Team context/.test(document.querySelector('#tr-res').innerText)), 'trade: team-context card shown');
  await page.click('#tr-cols [data-rm]'); await page.waitForTimeout(900);
  ok(await q('#tr-cols .pl') === 1, 'trade: one click removes exactly one asset');
  await page.click('#tr-addteam'); await page.waitForTimeout(900);
  ok(await q('[data-team]') === 3, 'trade: third team added');
  await pickOpt('#tr-lens', 2); await page.waitForTimeout(900);
  ok(await q('input[data-lens]') === 4, 'trade: custom lens sliders');
  await page.evaluate(() => { const s = document.querySelector('input[data-lens="pick"]'); s.value = 3; s.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(900);
  ok(/pick=3/.test(await page.evaluate(() => location.hash)), 'trade: slider change kept in the link');
  await page.click('#tr-clear'); await page.waitForTimeout(900);
  ok(await q('#tr-cols .pl') === 0, 'trade: clear');

  // ---- Trade Finder: both modes produce ranked results with an Open link into the machine
  await go('finder', 2500);
  ok(await q('#f-t tbody tr') > 3, 'finder give: results');
  const href = await page.evaluate(() => (document.querySelector('#f-t a.btn') || {}).getAttribute && document.querySelector('#f-t a.btn').getAttribute('href'));
  await page.goto(URL + href.replace(/^#\//, '')); await page.waitForTimeout(1500);
  ok(await q('#tr-cols .pl') >= 2, 'finder → trade machine opens the deal');
  await go('finder?mode=get', 3000);
  ok(await page.evaluate(() => /Mutual fit|No one- or two-asset package/.test(document.querySelector('#f-out').innerText)), 'finder get: packages or a clear message');

  // ---- Signing sim: add / drop / remove / reset
  await page.evaluate(() => localStorage.removeItem('dp_sign_ROO'));
  await go('signing?team=ROO', 1500);
  await page.click('#g-fa-add'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.querySelectorAll('#g-out [data-rm]').length) === 1, 'signing: one FA added');
  await page.click('#g-drop-add'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.querySelectorAll('#g-out [data-rm]').length) === 2, 'signing: one drop added');
  await page.click('#g-out [data-rm]'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.querySelectorAll('#g-out [data-rm]').length) === 1, 'signing: remove one');
  const capTxt = await page.evaluate(() => document.querySelector('#g-out .stats').innerText);
  ok(/space/.test(capTxt) && !/NaN/.test(capTxt), 'signing: cap tile');
  await page.click('#g-reset'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.querySelectorAll('#g-out [data-rm]').length) === 0, 'signing: reset');

  // ---- Mock draft: draft for a team to the end
  await go('mock?team=M.M');
  for (let i = 0; i < 10; i++) { const b = await page.$('[data-draft]'); if (!b) break; await b.click(); await page.waitForTimeout(250); }
  ok(await page.evaluate(() => /Draft complete/.test(document.querySelector('#main h2').innerText)), 'mock: draft completes');
  ok(await page.evaluate(() => [...document.querySelectorAll('#mk-log tbody tr')].every((r) => r.children[2].innerText.trim())), 'mock: every pick filled');

  // ---- Auction sale tracker (prompt dialogs)
  await page.evaluate(() => localStorage.removeItem('dp_auction27'));
  await go('auction?team=M.M', 1500);
  const answers = ['SPG', '3.5']; let k = 0;
  const onDialog = (d) => d.accept(answers[k++] || '');
  page.on('dialog', onDialog);
  const sell = await page.$('[data-sell]');
  if (sell) { await sell.click(); await page.waitForTimeout(1500); ok(await page.evaluate(() => /3\.5|\$3\.50M/.test(document.querySelector('#main').innerText)), 'auction: sale recorded'); }
  else ok(false, 'auction: sell button');
  page.off('dialog', onDialog);
  await page.evaluate(() => localStorage.removeItem('dp_auction27'));

  // ---- Global search → player page
  await go('home', 2000);
  await page.fill('#gsearch', 'McAvoy'); await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => { const m = document.querySelector('#modal-bg.open'); return !!m && /McAvoy/.test(m.innerText); }), 'search: Enter opens the player card');
  const full = await page.evaluate(() => { const a = document.querySelector('#modal-bg a[href^="#/player/"]'); return a ? a.getAttribute('href') : null; });
  ok(!!full, 'player card links to the full page');
  await page.evaluate(() => DP.ui.closeModal());
  await page.goto(URL + (full || '').replace(/^#\//, '')); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => !!document.querySelector('#p-market')), 'player: trade market card');
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => { const m = document.querySelector('#p-market'); return !!m && /Worth to them/.test(m.innerText); }), 'player: trade market filled');

  // ---- Team picker and theme
  await page.click('#teambtn'); await page.waitForTimeout(400);
  await page.click('#picker-teams [data-team="CGN"]'); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => DP.state.team === 'CGN'), 'picker: team switched');
  const th0 = await page.evaluate(() => document.documentElement.dataset.theme || '');
  await page.click('#themebtn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.documentElement.dataset.theme || '') !== th0, 'theme toggles');
  await page.click('#themebtn');

  // ---- Data page: upload a real Fantrax export, then reset
  await go('data', 1200);
  await page.setInputFiles('#up-file', path.join(ROOT, 'raw', '2026-27', 'Fantrax-Players-Dynasty Puck_Skaters_Projected2627.csv'));
  await page.waitForTimeout(2500);
  const log = await page.evaluate(() => document.querySelector('#up-log').innerText);
  ok(/✓/.test(log), 'data: projections CSV accepted (' + log.trim().slice(0, 80) + ')');
  await go('home', 2500);
  ok(await page.evaluate(() => !/Something went wrong/.test(document.querySelector('#main').innerText)), 'data: app renders with the override');
  await go('data', 1200);
  const rs = await page.$('#ov-reset'); if (rs) { await rs.click(); await page.waitForTimeout(2500); }
  ok(await page.evaluate(() => !localStorage.getItem('dp_overrides_v1')), 'data: reset clears the override');

  // ---- Phone: menu opens, a nav link navigates and closes it
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ph.route('https://www.fantrax.com/**', (r) => r.abort());
  await ph.addInitScript(() => { try { localStorage.setItem('dp_team', JSON.stringify('BHHC')); } catch (e) {} }); // first visit opens the team picker
  const pp = await ph.newPage();
  pp.on('pageerror', (e) => errs.push('phone: ' + e.message));
  await pp.goto(URL + 'home'); await pp.waitForTimeout(2000);
  await pp.tap('#menubtn'); await pp.waitForTimeout(300);
  ok(await pp.evaluate(() => document.querySelector('#nav').classList.contains('open')), 'phone: menu opens');
  await pp.tap('#nav a[href="#/windows"]'); await pp.waitForTimeout(2500);
  ok(await pp.evaluate(() => location.hash === '#/windows' && !document.querySelector('#nav').classList.contains('open')), 'phone: nav link navigates and closes the menu');
  ok(await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 2), 'phone: no sideways scroll on Windows');
  await ph.close();

  ok(errs.length === 0, 'no page errors (' + errs.slice(0, 3).join(' | ') + ')');
  await browser.close();
  console.log(`${n - fails}/${n} flow checks passed`);
  process.exit(fails ? 1 : 0);
})();
