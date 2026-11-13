/* Dynasty Puck HQ - app shell: router, navigation, team picker, global search, theme. Loaded last. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.state = { team: U.store.get('team', null) };
  if (DP.state.team && !DP.meta.gms.some(function (g) { return g.code === DP.state.team; })) DP.state.team = null;

  var NAV = [
    ['Overview', [['home', '🏠', 'Dashboard'], ['team', '🧢', 'Team Hub'], ['live', '📺', 'Live Scoreboard'], ['alerts', '🔔', 'Alerts']]],
    ['Players', [['players', '📋', 'Players'], ['fa', '🛒', 'Free Agents'], ['compare', '⚖️', 'Compare'], ['leaders', '🏆', 'Leaderboards']]],
    ['Simulators', [['matchup', '🥊', 'Weekly Matchup'], ['season', '🎲', 'Season Sim'], ['trade', '🔁', 'Trade Machine'], ['finder', '🔎', 'Trade Finder'], ['signing', '✍️', 'Signing Sim']]],
    ['League', [['standings', '📊', 'Standings'], ['cats', '🧩', 'Category Insights'], ['awards', '🏅', 'Awards & Wrapped'], ['values', '💎', 'Trade Value Chart'], ['windows', '📈', 'Contention Windows'], ['preview', '📰', 'Weekly Preview'], ['history', '📜', 'Trade History'], ['picks', '🎟️', 'Draft Picks']]],
    ['Cap & Contracts', [['cap', '💰', 'Contracts & Cap'], ['offseason', '📅', 'Offseason Planner'], ['auction', '🔨', 'Auction War Room']]],
    ['Prospects', [['radar', '📡', 'Prospect Radar'], ['prospects', '🌱', 'Prospects & MNR'], ['draft', '🎯', 'Draft Center'], ['mock', '🧪', 'Mock Draft']]],
    ['Schedule & News', [['schedule', '🗓️', 'Schedule Tools'], ['injuries', '🩹', 'Injuries & Depth']]],
    ['About', [['rules', '📖', 'Rules & Methods'], ['data', '🗂️', 'Data & Updates']]]
  ];
  DP.NAV = NAV;

  function navHtml(cur) {
    return NAV.map(function (g) {
      return '<div class="grp">' + esc(g[0]) + '</div>' + g[1].map(function (it) {
        return '<a href="#/' + it[0] + '" class="' + (cur === it[0] ? 'on' : '') + '"' + (cur === it[0] ? ' aria-current="page"' : '') + '><span class="i" aria-hidden="true">' + it[1] + '</span>' + esc(it[2]) + '</a>';
      }).join('');
    }).join('') + '<a href="assets/Dynasty-Puck-HQ-Guide.pdf" target="_blank" rel="noopener"><span class="i" aria-hidden="true">📘</span>League guide (PDF)</a><div class="grp">Season</div><div class="small muted" style="padding:0 10px">' + esc(DP.meta.season) + ' · data updated ' + esc(U.builtText()) + '</div>';
  }

  // phones: the five places people go most, one thumb away (the full menu is the last button)
  var TABS = [['home', '🏠', 'Home'], ['team', '🧢', 'My team'], ['live', '📺', 'Live'], ['trade', '🔁', 'Trade'], ['', '☰', 'More']];
  function tabbar(route) {
    var el = U.qs('#tabbar'); if (!el) return;
    el.innerHTML = TABS.map(function (t) {
      return t[0] ? '<a href="#/' + t[0] + '" class="' + (route === t[0] ? 'on' : '') + '"' + (route === t[0] ? ' aria-current="page"' : '') + '><span class="i" aria-hidden="true">' + t[1] + '</span>' + t[2] + '</a>'
        : '<button type="button" data-act="menu"><span class="i" aria-hidden="true">' + t[1] + '</span>' + t[2] + '</button>';
    }).join('');
  }

  function teamBtn() {
    var t = DP.state.team, b = U.qs('#teambtn');
    b.innerHTML = t ? '<span aria-hidden="true">🧢</span><span class="tn">' + esc(U.teamName(t)) + '</span>' : '<span aria-hidden="true">🧢</span><span class="tn">Pick your team</span>';
    b.title = t ? 'Your team: ' + U.teamName(t) + ' (' + t + '). Click to change.' : 'Choose your team';
  }

  DP.openPicker = function () {
    var bg = U.qs('#picker-bg'), E = DP.E;
    var st = {}; (E.expStandings || []).forEach(function (r) { st[r.t] = r; });
    U.qs('#picker-teams').innerHTML = DP.meta.gms.map(function (g) {
      var ros = E.rosters[g.code] || [], pay = E.teamCap(g.code)[0].total;
      return '<button data-team="' + esc(g.code) + '"><b>' + esc(g.name) + '</b><span>' + esc(g.code) + ' · ' + ros.length + ' players · ' + U.m(pay) + '</span></button>';
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
    U.qs('#nav').innerHTML = navHtml(route === 'player' ? 'players' : route);
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
    leaders: 'leaderboards best top', awards: 'wrapped mvp recap', signing: 'sign drop what-if', team: 'roster my team hub', home: 'dashboard start', players: 'all players stats projections' };
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
    teamBtn();
    searchInit();
    U.qs('#teambtn').addEventListener('click', DP.openPicker);
    U.qs('#themebtn').addEventListener('click', function () {
      var cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = cur; U.store.set('theme', cur); render();
    });
    U.qs('#menubtn').addEventListener('click', function () { U.qs('#nav').classList.toggle('open'); });
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
    render();
    if (!DP.state.team && U.parseHash().route === 'home') DP.openPicker();
    DP.bootMs = Date.now() - t0;
    if (DP.live) DP.live.start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
