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

  // ---- Trade Machine: cap space as an asset (add, set the amount, legality, one-click fix)
  await go('trade?t=ROO,SPG');
  const space = () => page.evaluate(() => { const o = {}; ['ROO', 'SPG'].forEach((t) => { o[t] = DP.E.teamCap(t)[0].space; }); return o; });
  const sp0 = await space();
  await page.evaluate(() => { const e = document.querySelector('[data-add="ROO"]'); e.value = [...e.options].find((o) => o.value.indexOf('c:') === 0).value; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(900);
  ok(await q('#tr-cols input.capamt') === 1 && /c:1:ROO>SPG/.test(decodeURIComponent(await page.evaluate(() => location.hash))), 'trade: cap space added from the menu ($1.0M to start)');
  ok(await page.evaluate(() => ![...document.querySelector('[data-add="ROO"]').options].some((o) => o.value.indexOf('c:') === 0)), 'trade: one cap entry per sending team');
  await page.evaluate(() => { const i = document.querySelector('#tr-cols input.capamt'); i.value = '2.5'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(900);
  ok(/c:2\.5:ROO>SPG/.test(decodeURIComponent(await page.evaluate(() => location.hash))), 'trade: amount edit kept in the link');
  const capCells = await page.evaluate(() => { const t = [...document.querySelectorAll('#tr-res table')].find((x) => /Cap space after/.test(x.innerText)); const i = [...t.querySelectorAll('th')].findIndex((h) => /Cap space after/.test(h.textContent)); return [...t.querySelectorAll('tbody tr')].map((r) => r.children[i].innerText); });
  const usd = (x) => +x.replace(/[^0-9.\-]/g, '');
  ok(Math.abs(usd(capCells[0].split('(')[0]) - (sp0.ROO - 2.5)) < 0.011 && Math.abs(usd(capCells[1].split('(')[0]) - (sp0.SPG + 2.5)) < 0.011, 'trade: cap space after = before -/+ the cap sent (' + capCells.join(' | ') + ')');
  ok(await page.evaluate(() => /of which cap space/.test(document.querySelector('#tr-res').innerText) && !/Who wins when/.test(document.querySelector('#tr-res').innerText)), 'trade: cap shown in team context; no empty player chart');
  await go('trade?t=ROO,SPG&a=' + encodeURIComponent('c:60:ROO>SPG'));
  ok(await page.evaluate(() => /Not legal as built/.test(document.querySelector('#tr-res').innerText)), 'trade: sending more cap than a team has room for is flagged');
  await page.click('#tr-res .callout.bad a.btn'); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !/Not legal as built/.test(document.querySelector('#tr-res').innerText) && document.querySelectorAll('#tr-cols input.capamt').length === 2), 'trade: the one-click cap fix makes the deal legal');
  await page.evaluate(() => { const i = document.querySelector('#tr-cols input.capamt'); i.value = '0'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(900);
  ok(await q('#tr-cols input.capamt') === 1, 'trade: setting the amount to 0 removes the cap entry');
  await go('history', 1500);
  ok(await page.evaluate(() => [...document.querySelectorAll('#h-list .card')].some((c) => /Cap space \$\d/.test(c.innerText) && /from [A-Za-z.0-9]+ · 2026-27 cap/.test(c.innerText))), 'history: this season\'s traded cap is listed with its sender');

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

  // ---- Getting around: search (pages, teams, players), Back with a card open, scroll kept, phone bar and pinned column
  {
    const nc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await nc.route('https://www.fantrax.com/**', (r) => r.abort()); await nc.route('https://api.github.com/**', (r) => r.abort()); await nc.route('https://raw.githubusercontent.com/**', (r) => r.abort());
    await nc.addInitScript(() => { try { localStorage.setItem('dp_team', JSON.stringify('ROO')); } catch (e) {} });
    const np = await nc.newPage(); const nerr = []; np.on('pageerror', (e) => nerr.push(e.message));
    const S = () => np.evaluate(() => ({ hash: location.hash, card: document.querySelector('#modal-bg').classList.contains('open'), y: Math.round(scrollY), h1: (document.querySelector('#main h1') || {}).textContent }));
    await np.goto(URL + 'home'); await np.waitForTimeout(2000);
    ok(await np.evaluate(() => !!document.querySelector('#newscard') && /Traded cap space/.test(document.querySelector('#newscard').innerText)), 'dashboard: "new on the site" card shown');
    await np.tap('#newscard [data-act="news-seen"]'); await np.waitForTimeout(200);
    ok(await np.evaluate(() => !document.querySelector('#newscard') && JSON.parse(localStorage.getItem('dp_newsSeen')) === DP.NEWS[0][0]), 'dashboard: "Got it" hides the card and remembers');
    ok(await np.evaluate(() => getComputedStyle(document.querySelector('#tabbar')).display === 'flex' && document.querySelectorAll('#tabbar a, #tabbar button').length === 5), 'phone: bottom bar with five entries');
    await np.tap('#tabbar a[href="#/live"]'); await np.waitForTimeout(1500);
    ok((await S()).hash === '#/live' && await np.evaluate(() => document.querySelector('#tabbar a.on').getAttribute('href') === '#/live'), 'phone: bottom bar navigates and marks the page');
    await np.tap('#tabbar button[data-act="menu"]'); await np.waitForTimeout(300);
    ok(await np.evaluate(() => document.querySelector('#nav').classList.contains('open')), 'phone: More opens the full menu');
    await np.touchscreen.tap(350, 420); await np.waitForTimeout(300); // right of the 240px drawer
    ok(await np.evaluate(() => !document.querySelector('#nav').classList.contains('open')), 'phone: tapping outside closes the menu');
    // search
    const res = async (q2) => { await np.fill('#gsearch', q2); await np.waitForTimeout(250); return np.evaluate(() => [...document.querySelectorAll('#gresults > *')].map((e) => e.className === 'shead' ? '[' + e.textContent + ']' : e.innerText.replace(/\s+/g, ' ')).join(' | ')); };
    ok(/\[Pages\] \| .*Contracts & Cap/.test(await res('cap')) && !/Awards/.test(await res('cap')), 'search: "cap" finds the Contracts & Cap page (word starts only)');
    ok(/\[Teams\] \| .*Kalamazoo Kangaroo/.test(await res('kalam')), 'search: finds a team by name');
    ok(/Live Scoreboard/.test(await res('score')) && /Free Agents/.test(await res('waiv')), 'search: finds pages by what people call them');
    await res('kalam'); await np.keyboard.press('Enter'); await np.waitForTimeout(1500);
    ok((await S()).hash === '#/team/ROO', 'search: Enter on a team opens its Team Hub');
    // Back with a card open, and scroll kept on the way back
    await np.goto(URL + 'players'); await np.waitForTimeout(1800);
    await np.evaluate(() => window.scrollTo(0, 900)); await np.waitForTimeout(300);
    const name = await np.evaluate(() => { const a = document.querySelector('#main a.plink'); a.click(); return a.textContent; }); await np.waitForTimeout(500);
    ok((await S()).card, 'player card opens');
    await np.goBack(); await np.waitForTimeout(800);
    let s1 = await S();
    ok(!s1.card && s1.hash === '#/players' && s1.y === 900, 'Back closes the card and stays on the page at the same spot (' + JSON.stringify(s1) + ')');
    await np.evaluate(() => { document.querySelector('#gsearch').focus(); }); await np.waitForTimeout(300);
    ok(await np.evaluate((nm) => /Recently opened/i.test(document.querySelector('#gresults').innerText) && document.querySelector('#gresults').innerText.indexOf(nm) >= 0, name), 'search: empty box lists the players opened last');
    await np.evaluate(() => { document.querySelector('#gsearch').blur(); location.hash = '#/cap'; }); await np.waitForTimeout(1500);
    ok((await S()).y === 0, 'a new page starts at the top');
    await np.goBack(); await np.waitForTimeout(1500);
    s1 = await S();
    ok(s1.hash === '#/players' && s1.y === 900, 'Back to a list returns to where you were (' + s1.y + ')');
    await np.evaluate(() => document.querySelector('#main a.plink').click()); await np.waitForTimeout(500);
    await np.evaluate(() => [...document.querySelectorAll('#modal-body a.btn')].find((a) => /Trade for/.test(a.textContent)).click()); await np.waitForTimeout(1500);
    s1 = await S();
    ok(!s1.card && /^#\/trade/.test(s1.hash), 'a link inside the card closes it and goes there');
    await np.goBack(); await np.waitForTimeout(1500); s1 = await S();
    ok(s1.hash === '#/players' && !s1.card, 'Back from there: the list, no card');
    await np.goBack(); await np.waitForTimeout(1500); s1 = await S();
    ok(s1.hash !== '#/players', 'Back again leaves the list (no dead press on the card\'s old entry): ' + s1.hash);
    // Back to a list: the table is as it was left (sort, filter, search, rows shown); a fresh visit starts clean
    await np.goto(URL + 'players'); await np.waitForTimeout(1800);
    const T = () => np.evaluate(() => { const t = document.querySelector('#main table.t'), th = t.querySelector('th.sorted'); return [th ? th.textContent.replace(/[^A-Za-z%+]/g, '') : '', t.querySelectorAll('tbody tr').length, document.querySelector('#main [data-r=q]').value, document.querySelector('#main .tbl-tools select').value].join('|'); });
    const t0 = await T();
    await np.evaluate(() => { [...document.querySelectorAll('#main table.t th')].find((h) => /^GP/.test(h.textContent)).click(); const s2 = document.querySelector('#main .tbl-tools select'); s2.selectedIndex = 2; s2.dispatchEvent(new Event('change', { bubbles: true })); });
    await np.fill('#main [data-r=q]', 'an'); await np.waitForTimeout(300);
    await np.evaluate(() => document.querySelector('#main .tbl-more [data-more=page]').click()); await np.waitForTimeout(300);
    const t1 = await T();
    await np.evaluate(() => { location.hash = '#/cap'; }); await np.waitForTimeout(1500);
    await np.goBack(); await np.waitForTimeout(1500);
    ok(t1 !== t0 && await T() === t1, 'Back to a list: sort, filter, search and rows shown are as you left them (' + t1 + ')');
    await np.evaluate(() => { location.hash = '#/home'; }); await np.waitForTimeout(1200);
    await np.evaluate(() => { location.hash = '#/players'; }); await np.waitForTimeout(1500);
    ok(await T() === t0, 'a fresh visit to the list starts clean (' + t0 + ')');
    // pinned name column
    await np.goto(URL + 'players'); await np.waitForTimeout(1800);
    const pin = await np.evaluate(() => { const w = document.querySelector('#main .tbl-wrap'); w.scrollLeft = 300; const c = w.querySelector('tbody td.stick'), r = c.getBoundingClientRect(), wr = w.getBoundingClientRect(); return { left: Math.round(r.left - wr.left), scrolled: w.scrollLeft, bg: getComputedStyle(c).backgroundColor }; });
    ok(pin.scrolled > 100 && Math.abs(pin.left) <= 1 && !/rgba\(0, 0, 0, 0\)|transparent/.test(pin.bg), 'phone: the name column stays in view when the table scrolls sideways (' + JSON.stringify(pin) + ')');
    ok(await np.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 2), 'phone: no sideways page scroll on Players');
    ok(nerr.length === 0, 'getting around: no page errors (' + nerr.slice(0, 2).join(' | ') + ')');
    await nc.close();
  }

  // ---- Live Scoreboard feed: GitHub's API first (fresh), the cached file when the API refuses, then stay off the API
  {
    const lc = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await lc.addInitScript(() => { try { localStorage.setItem('dp_team', JSON.stringify('ROO')); } catch (e) {} });
    await lc.route('https://www.fantrax.com/**', (r) => r.abort());
    let apiCalls = 0, fileCalls = 0, apiStatus = 200, apiBody = null, fileBody = null;
    await lc.route('https://api.github.com/**', (r) => { apiCalls++; r.fulfill({ status: apiStatus, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: apiStatus === 200 ? apiBody : '{"message":"API rate limit exceeded"}' }); });
    await lc.route('https://raw.githubusercontent.com/**', (r) => { fileCalls++; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: fileBody }); });
    const lp = await lc.newPage(); const lerr = []; lp.on('pageerror', (e) => lerr.push(e.message));
    // the page's first automatic pull gets "nothing newer" (the build's own score), so the test controls what follows
    const seed = await (async () => { const t = await browser.newPage(); await t.goto(URL + 'rules'); await t.waitForTimeout(600); const v = await t.evaluate(() => JSON.stringify(DP.league.score)); await t.close(); return v; })();
    apiBody = fileBody = seed;
    await lp.goto(URL + 'live'); await lp.waitForTimeout(2500);
    const base = JSON.parse(seed), later = (min) => JSON.stringify(Object.assign({}, base, { asOf: new Date(Date.parse(base.asOf) + min * 60000).toISOString().slice(0, 16) + '+00:00' }));
    const pull = () => lp.evaluate(() => new Promise((res) => DP.scoreFeed.pull((changed) => res({ changed, via: DP.scoreFeed.via, asOf: DP.league.score.asOf, off: DP.scoreFeed.apiOff > Date.now() }))));
    apiCalls = fileCalls = 0; apiBody = later(9); fileBody = later(3);
    let r1 = await pull();
    ok(r1.changed && r1.via === 'api' && r1.asOf === JSON.parse(apiBody).asOf && apiCalls === 1 && fileCalls === 0, 'live feed: takes the fresh copy from the GitHub API and leaves the cached file alone');
    apiStatus = 403; fileBody = later(12);
    let r2 = await pull();
    ok(r2.changed && r2.via === 'file' && r2.asOf === JSON.parse(fileBody).asOf && r2.off, 'live feed: API refuses (rate limit) -> uses the cached file and backs off the API');
    const before = apiCalls; fileBody = later(15);
    let r3 = await pull();
    ok(r3.changed && r3.via === 'file' && apiCalls === before, 'live feed: stays off the API while backed off');
    fileBody = later(1);
    let r4 = await pull();
    ok(!r4.changed && r4.asOf === JSON.parse(later(15)).asOf, 'live feed: an older copy never replaces a newer one');
    ok(lerr.length === 0, 'live feed: no page errors (' + lerr.slice(0, 2).join(' | ') + ')');
    await lc.close();
  }

  // ---- Live sync: a team's cap changing in Fantrax (cap space traded today) is applied on the visit
  {
    const fc = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await fc.addInitScript(() => { try { localStorage.setItem('dp_team', JSON.stringify('ROO')); } catch (e) {} });
    await fc.route('https://api.github.com/**', (r) => r.abort()); await fc.route('https://raw.githubusercontent.com/**', (r) => r.abort());
    // Fantrax's roster response rebuilt from the build's own data, with $2.0M of cap moved from ROO to SPG
    const mock = await (async () => {
      const t = await browser.newPage(); await t.route('https://www.fantrax.com/**', (r) => r.abort()); await t.goto(URL + 'rules'); await t.waitForTimeout(800);
      const v = await t.evaluate(() => {
        const ids = DP.league.fantrax.teamIds, ST = { A: 'ACTIVE', R: 'RESERVE', M: 'MINORS', IR: 'INJURED_RESERVE' }, out = { period: 1, rosters: {} };
        Object.keys(ids).forEach((tid) => {
          const gm = ids[tid];
          out.rosters[tid] = { teamName: gm, salaryCap: (DP.E.capOf(gm, 0) + (gm === 'ROO' ? -2 : gm === 'SPG' ? 2 : 0)) * 1e6,
            rosterItems: DP.players.filter((p) => p.gm === gm).map((p) => ({ id: p.id.replace(/\*/g, ''), contract: { name: p.ct }, salary: p.sal, status: ST[p.fs] || 'ACTIVE', position: p.pos })) };
        });
        return { body: JSON.stringify(out), roo: DP.E.teamCap('ROO')[0], spg: DP.E.teamCap('SPG')[0] };
      });
      await t.close(); return v;
    })();
    await fc.route('https://www.fantrax.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: /getTeamRosters/.test(r.request().url()) ? mock.body : '[]' }));
    const fp = await fc.newPage(); const ferr = []; fp.on('pageerror', (e) => ferr.push(e.message));
    await fp.goto(URL + 'home'); await fp.waitForTimeout(3500);
    const lv = await fp.evaluate(() => ({ state: DP.live.state, ch: DP.live.changes.map((c) => c.type + ':' + c.to), roo: DP.E.teamCap('ROO')[0], spg: DP.E.teamCap('SPG')[0], txt: document.querySelector('#main').innerText }));
    ok(lv.state === 'ok' && lv.ch.length === 2 && lv.ch.every((c) => /^cap:(ROO|SPG)$/.test(c)), 'live sync: a cap trade in Fantrax shows up as two cap changes and nothing else (' + lv.ch.join(',') + ')');
    ok(Math.abs(lv.roo.cap - (mock.roo.cap - 2)) < 1e-6 && Math.abs(lv.spg.cap - (mock.spg.cap + 2)) < 1e-6 && Math.abs(lv.roo.space - (mock.roo.space - 2)) < 1e-6, 'live sync: both teams\' caps and cap space move by the traded amount');
    ok(/sent \$2\.0M of cap space/.test(lv.txt) && /took in \$2\.0M of cap space/.test(lv.txt), 'live sync: the dashboard activity card says who sent and who took in cap');
    ok(ferr.length === 0, 'live sync: no page errors (' + ferr.slice(0, 2).join(' | ') + ')');
    await fc.close();
  }

  ok(errs.length === 0, 'no page errors (' + errs.slice(0, 3).join(' | ') + ')');
  await browser.close();
  console.log(`${n - fails}/${n} flow checks passed`);
  process.exit(fails ? 1 : 0);
})();
