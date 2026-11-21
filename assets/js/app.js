/* Dynasty Puck HQ - app shell: router, navigation, team picker, global search, theme. Loaded last. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.state = { team: U.store.get('team', null) };
  if (DP.state.team && !DP.meta.gms.some(function (g) { return g.code === DP.state.team; })) DP.state.team = null;

  // the menu, grouped by what people come to do. Pages not listed here (e.g. Weekly Preview) are reached from their
  // family's tab row and from search (PAGE_EXTRA).
  var NAV = [
    ['Overview', [['home', '🏠', 'Dashboard'], ['mypage', '🛠️', 'My Page'], ['team', '🧢', 'Team Hub'], ['live', '📺', 'Live Scoreboard'], ['weekly', '🗞️', 'The Weekly'], ['standings', '📊', 'Standings'], ['playoffs', '🏆', 'Playoff Picture']]],
    ['Players', [['players', '📋', 'Players'], ['rater', '⭐', 'Player Rater'], ['breakout', '🚀', 'Breakout Watch'], ['fa', '🛒', 'Free Agents'], ['pickup', '📥', 'Pickup Planner'], ['form', '🔥', 'Hot & Cold'], ['movers', '📈', 'Market Movers'], ['luck', '🎰', 'Buy Low / Sell High'], ['compare', '⚖️', 'Compare'], ['leaders', '🏆', 'Leaderboards'], ['injuries', '🩹', 'Injuries & Depth'], ['lines', '🔀', 'Line & PP Changes']]],
    ['Trades', [['deadline', '⏳', 'Trade Deadline'], ['trade', '🔁', 'Trade Machine'], ['finder', '🔎', 'Trade Finder'], ['values', '💎', 'Trade Value Chart'], ['history', '📜', 'Trade History'], ['moves', '🧾', 'Transactions'], ['picks', '🎟️', 'Draft Picks']]],
    ['Simulators', [['scout', '🔭', 'Opponent Scouting'], ['matchup', '🥊', 'Weekly Matchup'], ['outlook', '🌡️', 'Category Outlook'], ['season', '🎲', 'Season Sim'], ['scenarios', '🔮', 'Scenario Builder'], ['path', '🗺️', 'Title Path'], ['scorecard', '🧮', 'Model Scorecard'], ['signing', '✍️', 'Signing Sim']]],
    ['League', [['rankings', '🧭', 'Rankings Hub'], ['feed', '📣', 'League Feed'], ['power', '⚡', 'Power Rankings'], ['elo', '📐', 'Elo & Luck'], ['rivals', '⚔️', 'Rivalries'], ['tape', '📏', 'Tale of the Tape'], ['records', '📚', 'Record Book'], ['grades', '📝', 'GM Report Cards'], ['trophies', '🏅', 'Trophy Case'], ['cats', '🧩', 'Category Insights'], ['windows', '📈', 'Contention Windows'], ['awards', '🏅', 'Awards & Wrapped']]],
    ['Cap & Contracts', [['cap', '💰', 'Contracts & Cap'], ['offseason', '📅', 'Offseason Planner'], ['auction', '🔨', 'Auction War Room']]],
    ['Prospects', [['radar', '📡', 'Prospect Radar'], ['prospects', '🌱', 'Prospects & MNR'], ['wjc', '🌍', 'World Juniors'], ['draft', '🎯', 'Draft Center'], ['mock', '🧪', 'Mock Draft']]],
    ['Schedule', [['calendar', '📆', 'Weekly Calendar'], ['fixtures', '📅', 'Season Grid'], ['schedule', '🗓️', 'Schedule Tools'], ['stacks', '🧱', 'NHL Team Stacks']]],
    ['About', [['tour', '🧭', 'Start Here'], ['alerts', '🔔', 'Alerts'], ['commish', '🧑‍⚖️', 'Commissioner Checks'], ['rules', '📖', 'Rules & Methods'], ['data', '🗂️', 'Data & Updates']]]
  ];
  var PAGE_EXTRA = [['preview', '📰', 'Weekly Preview', 'The Weekly']]; // in search, not in the menu
  // families: related pages share a tab row at the top, so moving between them is one click
  var FAMS = [
    [['weekly', 'Last week'], ['live', 'This week (live)'], ['preview', 'Next week'], ['scout', 'Scout your opponent'], ['matchup', 'Matchup sim'], ['outlook', 'Category outlook'], ['scorecard', 'How good are the odds?']],
    [['players', 'Players'], ['rater', 'Player Rater'], ['breakout', 'Breakout Watch'], ['fa', 'Free Agents'], ['pickup', 'Pickup Planner'], ['form', 'Hot & Cold'], ['lines', 'Line Changes'], ['movers', 'Market Movers'], ['luck', 'Buy Low / Sell High'], ['compare', 'Compare'], ['leaders', 'Leaderboards']],
    [['deadline', 'Deadline'], ['trade', 'Trade Machine'], ['finder', 'Trade Finder'], ['values', 'Value Chart'], ['history', 'Trade History'], ['moves', 'Transactions'], ['picks', 'Draft Picks']],
    [['standings', 'Standings'], ['rankings', 'Rankings Hub'], ['power', 'Power Rankings'], ['elo', 'Elo & Luck'], ['playoffs', 'Playoff Picture'], ['rivals', 'Rivalries'], ['tape', 'Tale of the Tape'], ['records', 'Record Book'], ['grades', 'GM Report Cards'], ['trophies', 'Trophy Case'], ['season', 'Season Sim'], ['cats', 'Category Insights'], ['windows', 'Contention Windows'], ['awards', 'Awards & Wrapped']],
    [['cap', 'Contracts & Cap'], ['offseason', 'Offseason Planner'], ['auction', 'Auction War Room'], ['signing', 'Signing Sim']],
    [['radar', 'Prospect Radar'], ['prospects', 'Prospects & MNR'], ['wjc', 'World Juniors'], ['draft', 'Draft Center'], ['mock', 'Mock Draft']]
  ];
  var FAM_OF = {}; FAMS.forEach(function (f) { f.forEach(function (it) { if (!FAM_OF[it[0]]) FAM_OF[it[0]] = f; }); });
  function famTabs(route) {
    var el = U.qs('#famtabs'); if (!el) return;
    var f = FAM_OF[route];
    el.innerHTML = f ? f.map(function (it) { return '<a href="#/' + it[0] + '"' + (it[0] === route ? ' class="on" aria-current="page"' : '') + '>' + esc(it[1]) + '</a>'; }).join('') : '';
    el.hidden = !f;
  }
  DP.NAV = NAV;

  // a group can be folded away (remembered on this device); the group holding the page you're on always shows
  var folded = U.store.get('navFold', {});
  // a page's [route, icon, name] from the menu
  function pageInfo(r) { for (var i = 0; i < NAV.length; i++) for (var j = 0; j < NAV[i][1].length; j++) if (NAV[i][1][j][0] === r) return NAV[i][1][j]; return null; }
  DP.pageInfo = pageInfo;
  // favorites: pages starred in the menu (☆), pinned in a group at the top; kept on this device
  DP.favs = function () { return (U.store.get('favs', []) || []).filter(function (r) { return pageInfo(r); }); };
  DP.setFavs = function (a) { U.store.set('favs', a); if (U.qs('#nav')) U.qs('#nav').innerHTML = navHtml(DP._navCur); };
  function navHtml(cur) {
    var fv = DP.favs(), item = function (it) {
      var on = fv.indexOf(it[0]) >= 0;
      return '<div class="navi"><a href="#/' + it[0] + '" class="' + (cur === it[0] ? 'on' : '') + '"' + (cur === it[0] ? ' aria-current="page"' : '') + '><span class="i" aria-hidden="true">' + it[1] + '</span>' + esc(it[2]) + '</a><button type="button" class="fav' + (on ? ' on' : '') + '" data-fav="' + esc(it[0]) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' + esc(it[2]) + ' from favorites' : 'Add ' + esc(it[2]) + ' to favorites') + '" title="' + (on ? 'Remove from favorites' : 'Pin to favorites (this device)') + '">' + (on ? '★' : '☆') + '</button></div>';
    };
    var groups = (fv.length ? [['★ Favorites', fv.map(pageInfo)]] : []).concat(NAV);
    return groups.map(function (g) {
      var here = g[1].some(function (it) { return it[0] === cur; }), shut = folded[g[0]] && !here;
      return '<button type="button" class="grp" data-grp="' + esc(g[0]) + '" aria-expanded="' + !shut + '">' + esc(g[0]) + '<span class="car" aria-hidden="true">' + (shut ? '▸' : '▾') + '</span></button>' + (shut ? '' : g[1].map(item).join(''));
    }).join('') + '<a href="assets/Dynasty-Puck-HQ-Guide.pdf" target="_blank" rel="noopener"><span class="i" aria-hidden="true">📘</span>League guide (PDF)</a><div class="grp">Season</div><div class="small muted" style="padding:0 10px">' + esc(DP.meta.season) + ' · data updated ' + esc(U.builtText()) + '</div>';
  }

  // phones: the five places people go most, one thumb away (the full menu is the last button)
  var TABS = [['home', '🏠', 'Home'], ['team', '🧢', 'My team'], ['live', '📺', 'Live'], ['trade', '🔁', 'Trade'], ['', '☰', 'More']];
  var SHORT = { home: 'Home', team: 'My team', live: 'Live', trade: 'Trade', mypage: 'My Page', weekly: 'Weekly', standings: 'Standings', playoffs: 'Playoffs', players: 'Players', fa: 'Free agents', pickup: 'Pickups', form: 'Hot', movers: 'Movers', finder: 'Finder', values: 'Values', history: 'Trades', moves: 'Moves', scout: 'Scout', matchup: 'Matchup', power: 'Power', feed: 'Feed', records: 'Records', grades: 'Grades', trophies: 'Trophies', cap: 'Cap', offseason: 'Offseason', radar: 'Radar', prospects: 'Prospects', draft: 'Draft', schedule: 'Schedule', lines: 'Lines', injuries: 'Injuries' };
  DP.TAB_DEFAULT = TABS.slice(0, 4).map(function (t) { return t[0]; });
  // phones: the four pages in the bottom bar can be chosen (My Page → Customize); the menu is always the last button
  DP.tabRoutes = function () { var a = U.store.get('tabs', null); return Array.isArray(a) && a.length === 4 && a.every(function (r) { return pageInfo(r) || r === 'team'; }) ? a : DP.TAB_DEFAULT; };
  DP.setTabs = function (a) { U.store.set('tabs', a); tabbar(DP._route || 'home'); };
  function tabbar(route) {
    var el = U.qs('#tabbar'); if (!el) return;
    DP._route = route;
    var T = DP.tabRoutes().map(function (r) { var d = TABS.filter(function (t) { return t[0] === r; })[0], pi = pageInfo(r); return d || [r, pi ? pi[1] : '•', SHORT[r] || (pi ? pi[2] : r)]; }).concat([TABS[4]]);
    el.innerHTML = T.map(function (t) {
      return t[0] ? '<a href="#/' + t[0] + '" class="' + (route === t[0] ? 'on' : '') + '"' + (route === t[0] ? ' aria-current="page"' : '') + '><span class="i" aria-hidden="true">' + t[1] + '</span>' + t[2] + '</a>'
        : '<button type="button" data-act="menu"><span class="i" aria-hidden="true">' + t[1] + '</span>' + t[2] + '</button>';
    }).join('');
  }

  function teamBtn() {
    var t = DP.state.team, b = U.qs('#teambtn');
    b.innerHTML = t ? U.teamBadge(t, 'sm') + '<span class="tn">' + esc(U.teamName(t)) + '</span>' : '<span aria-hidden="true">🧢</span><span class="tn">Pick your team</span>';
    b.title = t ? 'Your team: ' + U.teamName(t) + ' (' + t + '). Click to change.' : 'Choose your team';
  }

  DP.openPicker = function () {
    var bg = U.qs('#picker-bg'), E = DP.E;
    var st = {}; (E.expStandings || []).forEach(function (r) { st[r.t] = r; });
    U.qs('#picker-teams').innerHTML = DP.meta.gms.map(function (g) {
      var ros = E.rosters[g.code] || [], pay = E.teamCap(g.code)[0].total;
      return '<button data-team="' + esc(g.code) + '" style="--tc:' + U.teamColor(g.code) + '">' + U.teamBadge(g.code, 'lg') + '<span class="pt"><b>' + esc(g.name) + '</b><span>' + esc(g.code) + ' · ' + ros.length + ' players · ' + U.m(pay) + '</span></span></button>';
    }).join('');
    bg.classList.add('open');
  };
  DP.setTeam = function (code) {
    DP.state.team = code; U.store.set('team', code); teamBtn();
    U.qs('#picker-bg').classList.remove('open');
    render();
  };

  // ------------------------------------------------------------ router
  DP.pages = DP.pages || {};
  var current = null;
  // History entries are numbered (history.state.i) so the app can tell Back / Forward from a new page:
  //   - Back with a player card open closes the card and stays on the page
  //   - going Back or Forward to a page puts you where you were on it; a new page starts at the top
  var nav = { i: 0, pos: {}, want: null, token: 0 };
  function stamp(extra) { try { history.replaceState(Object.assign({ i: nav.i }, extra || {}), ''); } catch (e) { /* ignore */ } }
  function navInit() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    if (history.state && typeof history.state.i === 'number') nav.i = history.state.i; else stamp();
    window.addEventListener('scroll', function () { nav.pos[nav.i] = window.scrollY; }, { passive: true });
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, function () { nav.token++; }, { passive: true }); }); // the reader took over: stop restoring
    ui.onModal = function () {
      if (history.state && history.state.dpModal) return;
      try { nav.i++; history.pushState({ i: nav.i, dpModal: 1 }, ''); } catch (e) { /* ignore */ }
    };
    window.addEventListener('popstate', function () {
      var s = history.state;
      if (!s || typeof s.i !== 'number') return; // a new page (hash link): numbered in onHash
      var dir = s.i < nav.i ? -1 : 1, open = U.qs('#modal-bg').classList.contains('open');
      nav.i = s.i; nav.want = nav.pos[s.i] === undefined ? null : nav.pos[s.i];
      if (open) ui.closeModal(true);
      else if (s.dpModal) { try { if (dir < 0) history.back(); else history.forward(); } catch (e) { /* ignore */ } } // a closed card's leftover entry: step over it
    });
  }
  function onHash() {
    var s = history.state, back = s && typeof s.i === 'number';
    if (!back) { nav.i++; stamp(); nav.want = null; }
    ui.closeModal(true); U.qs('#picker-bg').classList.remove('open'); // following a link out of a card closes it
    var want = back ? nav.want : null;
    ui.restore = !!back; // tables come back as they were left (see ui.table)
    try { render(); } finally { ui.restore = false; }
    if (want !== null && want > 0) {
      var token = ++nav.token;
      [0, 60, 250, 700].forEach(function (ms) {
        setTimeout(function () { if (token === nav.token && Math.abs(window.scrollY - want) > 2) window.scrollTo(0, want); }, ms);
      });
    } else if (back && want === 0) window.scrollTo(0, 0);
  }
  function render() {
    var h = U.parseHash(), page = DP.pages[h.route] || DP.pages.home;
    var route = DP.pages[h.route] ? h.route : 'home';
    var navCur = route === 'player' ? 'players' : route === 'preview' ? 'weekly' : route;
    U.qs('#nav').innerHTML = navHtml(navCur); DP._navCur = navCur;
    famTabs(route);
    U.qs('#nav').classList.remove('open');
    tabbar(route); ui._tn = 0;
    // a fresh <main> each render: pages attach click handlers to it, and a reused node would stack them
    // (one click firing several times, e.g. a Mock Draft pick taken twice) and leak them onto other pages
    var old = U.qs('#main'), main = old.cloneNode(false);
    old.parentNode.replaceChild(main, old);
    ui.tipHide();
    try {
      document.title = (page.title ? page.title + ' · ' : '') + 'Dynasty Puck HQ'; // before render: a page may set its own
      page.render(main, h);
    } catch (e) {
      console.error(e);
      main.innerHTML = '<div class="callout bad"><b>Something went wrong rendering this page.</b><br><span class="small">' + esc(e.message) + '</span></div>';
    }
    if (current !== route) window.scrollTo(0, 0);
    current = route;
    main.insertAdjacentHTML('beforeend', '<div class="foot">Dynasty Puck HQ · ' + esc(DP.meta.season) + ' · data updated ' + esc(U.builtText()) + ' · Fantrax league data (' + (DP.live && DP.live.state === 'ok' ? 'live' : 'nightly') + ') + contract sheet + NHL public APIs · projections are model estimates, not facts · <a href="#/rules">methods</a> · <a href="#/data">data</a></div>');
  }
  DP.render = render;
  DP.go = function (route, arg, q) { location.hash = U.hash(route, arg, q); };

  // ------------------------------------------------------------ global search: players, teams and pages
  // extra words people type for a page that aren't in its name
  var PAGE_WORDS = { live: 'score scoreboard games tonight', fa: 'waivers pickups add', cap: 'salary salaries payroll space dead penalties', offseason: 'rfa ufa elc re-sign extension roster planner future contracts expiring 2027 next season',
    auction: 'bid ufa budget', trade: 'simulator analyzer three team cap space', finder: 'ideas partners targets', history: 'trades log roster moves', picks: 'draft picks', cats: 'categories needs strengths partners',
    radar: 'prospects news risers fallers rankings', prospects: 'mnr graduation minors pipeline', draft: 'rookie draft board', mock: 'mock draft', matchup: 'h2h weekly lineup odds', season: 'playoff odds simulation',
    standings: 'record seeds playoffs', values: 'trade value chart rankings', windows: 'contender rebuild title odds', preview: 'matchups lineup watch', schedule: 'streaming games off-nights playoffs',
    injuries: 'injury ir depth lines', rules: 'methods how it works model glossary', data: 'updates upload sources freshness', alerts: 'email push notifications calendar reminders', compare: 'versus side by side',
    leaders: 'leaderboards best top', power: 'power rankings ranking rank best team weekly movers who is the best',  moves: 'transactions adds drops pickups waivers log moves best pickups got away activity',  tour: 'start here tour help guide new how to getting started what is',  tape: 'tale of the tape compare teams team vs team head to head side by side matchup',  lines: 'line changes power play pp1 promotion demotion scratch depth chart goalie starter', movers: 'market movers value risers fallers stock trend dynasty value history', outlook: 'category outlook heatmap next week categories weak strong thin chance to win each category', rankings: 'rankings hub every ranking consensus compare models best team who is best', elo: 'elo ratings luck schedule luck lucky unlucky all-play results rating model', breakout: 'breakout watch young players rising role promotion sleepers prospects ready', scenarios: 'scenario builder what if pick winners playoff odds scenarios simulate picks', calendar: 'weekly calendar schedule this week days nights back to back who plays when games per day', rater: 'player rater actual production this season z-score best players so far real stats ranking', fixtures: 'season grid schedule fixtures results calendar every week whole season remaining strength of schedule', trophies: 'trophy case badges achievements perfect week blowout heist streak records', feed: 'league feed timeline activity what happened news recent everything moves trades lines', mypage: 'my page build custom dashboard widgets layout personal home customize', path: 'title path what it takes win the title championship odds best trade target add who would help most', stacks: 'nhl team stacks clubs exposure schedule which teams own oilers', scorecard: 'model scorecard accuracy calibration brier how good are the odds predictions upsets favorites', grades: 'gm report cards grades grade report card manager best gm lineup calls waiver wire trades luck', records: 'record book records best week most goals hits streaks blowout history', rivals: 'rivalries head to head all-play matrix standings race who has my number bump chart', form: 'hot cold streaks last 14 days form trending recent', pickup: 'pickup planner streaming add drop waivers this week free agent matchup', wjc: 'world juniors wjc u20 junior championship international canada usa sweden finland', scout: 'opponent scouting report lineup tuned matchup swing categories', commish: 'commissioner rules checks cap roster limit goalie minimum ir graduation audit', playoffs: 'playoff picture bracket clinch eliminated magic number seeds schedule', deadline: 'trade deadline buyers sellers rentals hometown discount countdown', luck: 'regression luck shooting percentage hot cold sell high buy low trade targets', weekly: 'recap newsletter results last week standings movers players of the week', awards: 'wrapped mvp recap', signing: 'sign drop what-if', team: 'roster my team hub', home: 'dashboard start', players: 'all players stats projections' };
  DP.recent = U.store.get('recent', []);
  DP.noteRecent = function (id) { // last few player cards opened, for the empty search box
    DP.recent = [id].concat(DP.recent.filter(function (x) { return x !== id; })).slice(0, 6);
    U.store.set('recent', DP.recent);
  };
  function searchInit() {
    var inp = U.qs('#gsearch'), box = U.qs('#gresults'), hl = -1, list = [];
    var norm = function (s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
    var words = function (text, q) { return q.split(/\s+/).every(function (w) { return text.indexOf(w) >= 0; }); };
    var starts = function (text, q) { var ws = text.split(/[^a-z0-9]+/); return q.split(/\s+/).every(function (w) { return ws.some(function (x) { return x.indexOf(w) === 0; }); }); }; // every typed word begins a word
    function find(q) {
      var nq = norm(q), out = [];
      NAV.forEach(function (g) {
        g[1].forEach(function (it) {
          var name = norm(it[2]), all = name + ' ' + norm(g[0]) + ' ' + (PAGE_WORDS[it[0]] || '');
          if (starts(all, nq)) out.push({ kind: 'page', route: it[0], icon: it[1], label: it[2], sub: g[0], rank: name.indexOf(nq) === 0 ? 0 : starts(name, nq) ? 1 : 2 });
        });
      });
      PAGE_EXTRA.forEach(function (it) {
        var name = norm(it[2]), all = name + ' ' + norm(it[3]) + ' ' + (PAGE_WORDS[it[0]] || '');
        if (starts(all, nq)) out.push({ kind: 'page', route: it[0], icon: it[1], label: it[2], sub: it[3], rank: name.indexOf(nq) === 0 ? 0 : starts(name, nq) ? 1 : 2 });
      });
      out.sort(function (a, b) { return a.rank - b.rank; });
      out = out.slice(0, 4);
      DP.meta.gms.forEach(function (g) { if (words(norm(g.name + ' ' + g.code), nq)) out.push({ kind: 'team', code: g.code, label: g.name, sub: g.code }); });
      DP.E.P.filter(function (p) { return words(norm(p.n), nq); })
        .sort(function (a, b) { return (b.gm ? 1 : 0) - (a.gm ? 1 : 0) || b.WAR - a.WAR; }).slice(0, 10)
        .forEach(function (p) { out.push({ kind: 'player', p: p }); });
      return out;
    }
    function row(x, i) {
      var cls = i === hl ? 'hl' : '';
      if (x.kind === 'player') return '<button data-i="' + i + '" class="' + cls + '">' + ui.pos(x.p) + '<span>' + esc(x.p.n) + ' <span class="faint small">' + esc(x.p.t || '') + '</span></span><span style="margin-left:auto" class="small">' + (x.p.gm ? esc(x.p.gm) : '<span class="muted">FA</span>') + '</span></button>';
      if (x.kind === 'team') return '<button data-i="' + i + '" class="' + cls + '"><span class="pos" aria-hidden="true">🧢</span><span>' + esc(x.label) + ' <span class="faint small">' + esc(x.sub) + '</span></span><span style="margin-left:auto" class="small muted">Team Hub</span></button>';
      return '<button data-i="' + i + '" class="' + cls + '"><span class="pos" aria-hidden="true">' + x.icon + '</span><span>' + esc(x.label) + '</span><span style="margin-left:auto" class="small muted">' + esc(x.sub) + '</span></button>';
    }
    function show() {
      var q = inp.value.trim(), h = '', last = null;
      if (q.length < 2) { // nothing typed yet: the players you opened last
        list = DP.recent.map(function (id) { return DP.E.byId[id]; }).filter(Boolean).map(function (p) { return { kind: 'player', p: p }; });
        if (!list.length || document.activeElement !== inp) { box.classList.remove('open'); return; }
        box.innerHTML = '<div class="shead">Recently opened</div>' + list.map(row).join('');
        box.classList.add('open'); return;
      }
      list = find(q);
      var head = { page: 'Pages', team: 'Teams', player: 'Players' };
      list.forEach(function (x, i) { if (x.kind !== last) { h += '<div class="shead">' + head[x.kind] + '</div>'; last = x.kind; } h += row(x, i); });
      box.innerHTML = h || '<div class="small muted" style="padding:10px">Nothing found. Try a player, a team or a page name.</div>';
      box.classList.add('open');
    }
    function pick(x) {
      box.classList.remove('open'); inp.value = ''; inp.blur();
      if (x.kind === 'player') DP.openPlayer(x.p.id);
      else if (x.kind === 'team') DP.go('team', x.code);
      else DP.go(x.route);
    }
    inp.addEventListener('input', function () { hl = -1; show(); });
    inp.addEventListener('focus', function () { hl = -1; show(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { hl = Math.min(list.length - 1, hl + 1); show(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); show(); e.preventDefault(); }
      else if (e.key === 'Enter' && list.length && box.classList.contains('open')) pick(list[Math.max(0, hl)]);
      else if (e.key === 'Escape') { box.classList.remove('open'); inp.blur(); }
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]'); if (!b) return;
      pick(list[+b.dataset.i]);
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.classList.remove('open'); });
  }

  // ------------------------------------------------------------ boot
  function boot() {
    var t0 = Date.now();
    var theme = U.store.get('theme', null);
    if (theme) document.documentElement.dataset.theme = theme;
    DP.E.init();
    if (DP.applyOverrides) DP.applyOverrides();
    // the season simulation the nightly job already ran on this exact data (tools/presim.js): use it instead of running
    // 1,500 seasons on this device, while it still matches (same build, lineup week, week in progress and Eastern date)
    try {
      var SP = DP.simPre, Eb = DP.E, day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Eb.now());
      if (SP && SP.res && SP.built === DP.meta.built && !DP.overrideInfo && SP.lw === Eb.lockWeek() && SP.nw === Eb.nowWeek() && SP.day === day && SP.res.length === Eb.teams.length) Eb._bsim = { v: Eb.version, n: SP.n, res: SP.res, pre: true };
    } catch (e) { /* simulate on the device as before */ }
    teamBtn();
    searchInit();
    U.qs('#teambtn').addEventListener('click', DP.openPicker);
    U.qs('#themebtn').addEventListener('click', function () {
      var cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = cur; U.store.set('theme', cur); render();
    });
    U.qs('#menubtn').addEventListener('click', function () { U.qs('#nav').classList.toggle('open'); });
    U.qs('#nav').addEventListener('click', function (e) {
      var fb = e.target.closest('[data-fav]');
      if (fb) {
        e.preventDefault(); e.stopPropagation();
        var r = fb.dataset.fav, fv = DP.favs(), i = fv.indexOf(r);
        if (i >= 0) fv.splice(i, 1); else fv.push(r);
        DP.setFavs(fv); U.toast(i >= 0 ? 'Removed from favorites' : 'Pinned to Favorites at the top of the menu');
        var again2 = U.qs('#nav [data-fav="' + r.replace(/"/g, '') + '"]'); if (again2) again2.focus();
        return;
      }
      var g = e.target.closest('[data-grp]'); if (!g) return;
      e.stopPropagation(); // the menu is redrawn under the tap: don't let the tap-outside check close it on phones
      var k = g.dataset.grp; folded[k] = g.getAttribute('aria-expanded') === 'true'; U.store.set('navFold', folded);
      U.qs('#nav').innerHTML = navHtml(DP._navCur);
      var again = U.qs('#nav [data-grp="' + k.replace(/"/g, '') + '"]'); if (again) again.focus();
    });
    U.qs('#picker-teams').addEventListener('click', function (e) { var b = e.target.closest('[data-team]'); if (b) DP.setTeam(b.dataset.team); });
    U.qs('#picker-skip').addEventListener('click', function () { U.qs('#picker-bg').classList.remove('open'); });
    U.qs('#modal-close').addEventListener('click', ui.closeModal);
    U.qs('#modal-bg').addEventListener('click', function (e) { if (e.target.id === 'modal-bg') ui.closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { ui.closeModal(); U.qs('#picker-bg').classList.remove('open'); }
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); U.qs('#gsearch').focus(); }
    });
    // player links open the modal (ctrl/cmd-click opens the full page in a new tab)
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-pid]');
      if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); DP.openPlayer(a.dataset.pid); return; }
      var act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'pick-team') DP.openPicker();
      if (act && act.dataset.act === 'menu') { U.qs('#nav').classList.toggle('open'); return; }
      // a tap outside the open menu closes it (phones)
      var nv = U.qs('#nav');
      if (nv.classList.contains('open') && !e.target.closest('#nav') && !e.target.closest('#menubtn')) nv.classList.remove('open');
    });
    navInit();
    window.addEventListener('hashchange', onHash);
    if ((!location.hash || location.hash === '#' || location.hash === '#/') && U.store.get('startPage', '') === 'mypage') { try { history.replaceState(null, '', '#/mypage'); } catch (e) { location.hash = '#/mypage'; } }
    if (DP.noteVisit) DP.noteVisit(); // before the first render: "since your last visit" needs the previous visit's time
    render();
    if (!DP.state.team && U.parseHash().route === 'home') DP.openPicker();
    DP.bootMs = Date.now() - t0;
    if (DP.live) DP.live.start();
    // offline copy (sw.js): only on the real site, never on file:// or a local server
    try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* ignore */ }
    var offMsg = function () { U.toast('Offline: showing the copy saved on this device (data from ' + U.builtText() + ')', 6000); };
    if (navigator.onLine === false) offMsg();
    window.addEventListener('offline', offMsg);
    window.addEventListener('online', function () { U.toast('Back online', 2000); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
