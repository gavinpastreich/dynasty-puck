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
    ['League', [['standings', '📊', 'Standings'], ['awards', '🏅', 'Awards & Wrapped'], ['values', '💎', 'Trade Value Chart'], ['windows', '📈', 'Contention Windows'], ['preview', '📰', 'Weekly Preview'], ['history', '📜', 'Trade History'], ['picks', '🎟️', 'Draft Picks']]],
    ['Cap & Contracts', [['cap', '💰', 'Contracts & Cap'], ['offseason', '📅', '2027 Offseason'], ['auction', '🔨', 'Auction War Room']]],
    ['Prospects', [['prospects', '🌱', 'Prospects & MNR'], ['draft', '🎯', 'Draft Center'], ['mock', '🧪', 'Mock Draft']]],
    ['Schedule & News', [['schedule', '🗓️', 'Schedule Tools'], ['injuries', '🩹', 'Injuries & Depth']]],
    ['About', [['rules', '📖', 'Rules & Methods'], ['data', '🗂️', 'Data & Updates']]]
  ];
  DP.NAV = NAV;

  function navHtml(cur) {
    return NAV.map(function (g) {
      return '<div class="grp">' + esc(g[0]) + '</div>' + g[1].map(function (it) {
        return '<a href="#/' + it[0] + '" class="' + (cur === it[0] ? 'on' : '') + '"' + (cur === it[0] ? ' aria-current="page"' : '') + '><span class="i" aria-hidden="true">' + it[1] + '</span>' + esc(it[2]) + '</a>';
      }).join('');
    }).join('') + '<a href="assets/Dynasty-Puck-HQ-Guide.pdf" target="_blank" rel="noopener"><span class="i" aria-hidden="true">📘</span>League guide (PDF)</a><div class="grp">Season</div><div class="small muted" style="padding:0 10px">' + esc(DP.meta.season) + ' · data built ' + esc(DP.meta.built.replace('T', ' ')) + '</div>';
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
  function render() {
    var h = U.parseHash(), page = DP.pages[h.route] || DP.pages.home;
    var route = DP.pages[h.route] ? h.route : 'home';
    U.qs('#nav').innerHTML = navHtml(route === 'player' ? 'players' : route);
    U.qs('#nav').classList.remove('open');
    var main = U.qs('#main');
    ui.tipHide();
    try {
      main.innerHTML = '';
      page.render(main, h);
      document.title = (page.title ? page.title + ' · ' : '') + 'Dynasty Puck HQ';
    } catch (e) {
      console.error(e);
      main.innerHTML = '<div class="callout bad"><b>Something went wrong rendering this page.</b><br><span class="small">' + esc(e.message) + '</span></div>';
    }
    if (current !== route) window.scrollTo(0, 0);
    current = route;
    main.insertAdjacentHTML('beforeend', '<div class="foot">Dynasty Puck HQ · ' + esc(DP.meta.season) + ' · Fantrax league data (' + (DP.live && DP.live.state === 'ok' ? 'live' : 'nightly') + ') + contract sheet + NHL public APIs · projections are model estimates, not facts · <a href="#/rules">methods</a> · <a href="#/data">data</a></div>');
  }
  DP.render = render;
  DP.go = function (route, arg, q) { location.hash = U.hash(route, arg, q); };

  // ------------------------------------------------------------ global search
  function searchInit() {
    var inp = U.qs('#gsearch'), box = U.qs('#gresults'), hl = -1, list = [];
    function show() {
      var q = inp.value.trim().toLowerCase();
      if (q.length < 2) { box.classList.remove('open'); return; }
      var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
      var nq = norm(q);
      list = DP.E.P.filter(function (p) { return norm(p.n).indexOf(nq) >= 0; })
        .sort(function (a, b) { return (b.gm ? 1 : 0) - (a.gm ? 1 : 0) || b.WAR - a.WAR; }).slice(0, 12);
      box.innerHTML = list.length ? list.map(function (p, i) {
        return '<button data-i="' + i + '" class="' + (i === hl ? 'hl' : '') + '">' + ui.pos(p) + '<span>' + esc(p.n) + ' <span class="faint small">' + esc(p.t) + '</span></span><span style="margin-left:auto" class="small">' + (p.gm ? esc(p.gm) : '<span class="muted">FA</span>') + '</span></button>';
      }).join('') : '<div class="small muted" style="padding:10px">No players found.</div>';
      box.classList.add('open');
    }
    inp.addEventListener('input', function () { hl = -1; show(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { hl = Math.min(list.length - 1, hl + 1); show(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); show(); e.preventDefault(); }
      else if (e.key === 'Enter' && list.length) { DP.openPlayer(list[Math.max(0, hl)].id); box.classList.remove('open'); inp.blur(); }
      else if (e.key === 'Escape') { box.classList.remove('open'); inp.blur(); }
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]'); if (!b) return;
      DP.openPlayer(list[+b.dataset.i].id); box.classList.remove('open'); inp.value = '';
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
    });
    window.addEventListener('hashchange', render);
    render();
    if (!DP.state.team && U.parseHash().route === 'home') DP.openPicker();
    DP.bootMs = Date.now() - t0;
    if (DP.live) DP.live.start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
