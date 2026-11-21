/* Dynasty Puck HQ - My Page: a page each GM builds for themselves. Pick widgets (each one a small view of something
   the site already computes), order them, size them, set a team or a count, and the layout is kept on this device
   (localStorage 'dp_mypage'). A share link carries the layout in the URL (#/mypage?l=...), so it can be copied to
   another device or sent to a leaguemate; opening one shows a preview with "Use this layout". No server involved. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var KEY = 'mypage', W = {}, ORDER = [];
  var CATS = [['week', 'This week'], ['league', 'League'], ['players', 'Players'], ['trades', 'Trades & moves'], ['team', 'Your team'], ['prospects', 'Prospects & draft'], ['model', 'Model & site'], ['custom', 'Your own']];

  // spec: { name, ic, cat, desc, team (uses a team), ns (count options), n (default count), size (1 half, 2 full), link(t), render(box, o, t) }
  function reg(k, spec) { spec.k = k; spec.size = spec.size || 1; W[k] = spec; ORDER.push(k); }
  DP.WIDGETS = W;

  // ------------------------------------------------------------ helpers
  var E0 = function () { return DP.E; };
  function finished() { return E0().history().weeks.filter(function (w) { return w.games && w.games.length; }); }
  function lastWeek() { var f = finished(); return f.length ? f[f.length - 1] : null; }
  function alive(box) { return document.body.contains(box); }
  function li(left, right, cls) { return '<li' + (cls ? ' class="' + cls + '"' : '') + '><span class="mw-l">' + left + '</span>' + (right !== undefined ? '<span class="mw-r small">' + right + '</span>' : '') + '</li>'; }
  function list(items, empty) { return items.length ? '<ul class="list-plain mwlist">' + items.join('') + '</ul>' : '<p class="small muted">' + (empty || 'Nothing to show right now.') + '</p>'; }
  function dt(d) { return U.date(new Date(d + 'T12:00:00Z')); }
  function roster(t) { return (E0().rosters[t] || []).slice(); }
  function mine(t) { return t === DP.state.team ? ' mine' : ''; }
  function liveGame(t) {
    var sc = DP.league.score; if (!sc || !sc.week || !sc.teams) return null;
    var g = DP.meta.h2h.filter(function (m) { return m[0] === sc.week && (m[1] === t || m[2] === t); })[0];
    return g ? { n: sc.week, opp: g[1] === t ? g[2] : g[1], sc: sc } : null;
  }
  function catChips(od) {
    var E = E0();
    return '<div class="mw-cats">' + od.cats.map(function (x, c) {
      var cat = E.CATS[c], lead = x.a === null || x.b === null || x.a === x.b ? 0 : ((cat.low ? x.a < x.b : x.a > x.b) ? 1 : -1);
      return '<span class="mw-cat ' + (lead > 0 ? 'W' : lead < 0 ? 'L' : 'T') + '" title="' + esc(cat.name) + ': ' + (od.final ? '' : U.pct(x.pw) + ' to win it') + '">' + esc(cat.l) + '</span>';
    }).join('') + '</div>';
  }
  function chip(e) { var lab = function (x) { return x || (e.k === 'line' ? 'out' : e.k === 'pp' ? 'none' : '–'); }; return '<span class="lchip ' + (e.up ? 'up' : 'dn') + '">' + esc(lab(e.from)) + ' → <b>' + esc(lab(e.to)) + '</b></span>'; }

  // ------------------------------------------------------------ widgets: this week
  reg('matchup', { name: 'My matchup', ic: '🥊', cat: 'week', team: 1, size: 2, desc: 'This week\'s score, category by category, and the chance to win (live during games).', link: function () { return '#/live'; },
    render: function (box, o, t) {
      var E = E0(), g = liveGame(t);
      if (g) {
        var od = DP.liveOdds ? DP.liveOdds(t, g.opp) : null, ls = od ? E.liveScore(od) : [0, 0, E.NC], fin = !!g.sc.final;
        box.innerHTML = '<div class="mw-score">' + U.teamBadge(t) + '<b class="num">' + ls[0] + '</b><span class="muted">–</span><b class="num">' + ls[1] + '</b>' + U.teamBadge(g.opp) + '<span class="small muted">Week ' + g.n + (fin ? ' final' : ' so far') + ' vs ' + esc(U.teamName(g.opp)) + (ls[2] ? ' · ' + ls[2] + ' tied' : '') + '</span></div>' +
          (od && !fin ? '<div class="yw-bar"><span style="width:' + (od.win * 100).toFixed(0) + '%"></span></div><p class="small muted" style="margin:4px 0">' + U.pct(od.win) + ' to win the week · ' + U.pct(od.tie) + ' tie</p>' : '') + (od ? catChips(od) : '');
        return;
      }
      W.next.render(box, o, t);
    } });
  reg('next', { name: 'Next matchup', ic: '🔭', cat: 'week', team: 1, desc: 'The next lineup lock\'s opponent: win chance, expected categories and the swing categories.', link: function () { return '#/scout'; },
    render: function (box, o, t) {
      var E = E0(), wi = E.lockWeek(); if (wi === null) { box.innerHTML = '<p class="small muted">No lineup locks left.</p>'; return; }
      var g = DP.meta.h2h.filter(function (m) { return m[0] === wi + 1 && (m[1] === t || m[2] === t); })[0];
      if (!g) { box.innerHTML = '<p class="small muted">No regular-season matchup for ' + esc(E.weeks[wi].po ? 'playoff round ' + E.weeks[wi].po : 'week ' + (wi + 1)) + '.</p>'; return; }
      var opp = g[1] === t ? g[2] : g[1], A = E.baseline[t][wi], B = E.baseline[opp][wi], pr = E.matchupProbs(A, B), ex = E.sum(pr.map(function (x) { return x.w + x.t / 2; })), mc = E.simWeek(A, B, 2000, wi * 31 + 7);
      var sw = pr.map(function (x, c) { return { c: c, w: x.w }; }).sort(function (a, b) { return Math.abs(a.w - 0.5) - Math.abs(b.w - 0.5); }).slice(0, 4);
      box.innerHTML = '<div class="mw-score">' + U.teamBadge(t) + '<span class="small">vs</span>' + U.teamBadge(opp) + '<span class="small"><b>' + esc(U.teamName(opp)) + '</b> · week ' + (wi + 1) + ' · ' + esc(DP.lockText(wi)) + '</span></div>' +
        '<p class="small" style="margin:6px 0"><b>' + U.pct(mc.win) + '</b> to win (projected, optimal lineups) · ' + U.fmt(ex, 1) + ' of 15 categories expected</p><p class="small muted" style="margin:0">Swing categories: ' + sw.map(function (s) { return esc(E.CATS[s.c].l) + ' ' + U.pct(s.w); }).join(', ') + '</p>';
    } });
  reg('swing', { name: 'Up for grabs', ic: '⚖️', cat: 'week', team: 1, desc: 'The categories in your live matchup that are closest to a coin flip, with the current gap.', link: function () { return '#/live'; },
    render: function (box, o, t) {
      var E = E0(), g = liveGame(t), od = g && DP.liveOdds ? DP.liveOdds(t, g.opp) : null;
      if (!od || g.sc.final) { box.innerHTML = '<p class="small muted">Shows while a week is being played.</p>'; return; }
      var s = od.cats.map(function (x, c) { return { x: x, c: c }; }).sort(function (p, q) { return Math.abs(p.x.pw - 0.5) - Math.abs(q.x.pw - 0.5); }).slice(0, o.n || 6);
      box.innerHTML = list(s.map(function (z) {
        var cat = E.CATS[z.c], ratio = cat.k === 'GAA' || cat.k === 'SV', d = ratio || z.x.a === null || z.x.b === null ? null : z.x.a - z.x.b;
        return li('<b>' + esc(cat.l) + '</b> ' + (d === null ? '' : Math.abs(d) < 1e-9 ? '<span class="muted">level</span>' : d > 0 ? '<span class="good">up ' + U.fmt(d, cat.k === 'Cor' ? 1 : 0) + '</span>' : '<span class="bad">down ' + U.fmt(-d, cat.k === 'Cor' ? 1 : 0) + '</span>'), U.pct(z.x.pw) + ' ' + ui.meter(z.x.pw, z.x.pw >= 0.6 ? 'good' : z.x.pw <= 0.4 ? 'bad' : '', U.pct(z.x.pw)));
      }));
    }, ns: [4, 6, 8, 15], n: 6 });
  reg('allgames', { name: 'Every matchup', ic: '📺', cat: 'week', size: 2, desc: 'All seven matchups this week with the live score and win chances.', link: function () { return '#/live'; },
    render: function (box) {
      var E = E0(), sc = DP.league.score; if (!sc || !sc.week || !sc.teams) { box.innerHTML = '<p class="small muted">No week in progress.</p>'; return; }
      box.innerHTML = list(DP.meta.h2h.filter(function (m) { return m[0] === sc.week; }).map(function (m) {
        var od = DP.liveOdds ? DP.liveOdds(m[1], m[2]) : null, ls = od ? E.liveScore(od) : [0, 0, 0];
        return li(U.teamChip(m[1], { link: 1 }) + ' <b class="num">' + ls[0] + '–' + ls[1] + '</b> ' + U.teamChip(m[2], { link: 1 }), od && !sc.final ? esc(U.teamAbbr(od.win >= od.loss ? m[1] : m[2])) + ' ' + U.pct(Math.max(od.win, od.loss)) : sc.final ? 'final' : '', (m[1] === DP.state.team || m[2] === DP.state.team) ? 'mine' : '');
      }));
    } });
  reg('lineup', { name: 'Lineup check', ic: '🔒', cat: 'week', team: 1, desc: 'Is the lineup set in Fantrax for the next lock the best one? What to change.', link: function (t) { return '#/team/' + encodeURIComponent(t); },
    render: function (box, o, t) { box.innerHTML = DP.lineupCheckHtml ? DP.lineupCheckHtml(t, true) : ''; } });
  reg('stakes', { name: 'What this week is worth', ic: '🎯', cat: 'week', ns: [3, 5, 7], n: 5, desc: 'Playoff odds if each team wins or loses this week, the matchups with the most riding on them first.', link: function () { return '#/playoffs'; },
    render: function (box, o) {
      box.innerHTML = '<p class="small muted">Simulating the season…</p>';
      DP.getSim(function (res) {
        if (!alive(box)) return;
        var S = DP.stakes ? DP.stakes(res) : null;
        if (!S || !S.games) { box.innerHTML = '<p class="small muted">No regular-season week left to decide.</p>'; return; }
        box.innerHTML = list(S.games.slice(0, o.n || 5).map(function (g) {
          return li(U.teamChip(g.a.t, { link: 1 }) + ' vs ' + U.teamChip(g.b.t, { link: 1 }), 'playoff swing ' + Math.round(g.a.sw * 100) + ' / ' + Math.round(g.b.sw * 100) + ' pts');
        }));
      });
    } });
  reg('countdown', { name: 'Countdowns', ic: '⏱️', cat: 'week', desc: 'The next lineup lock, the trade deadline, the playoffs and the end of the regular season.',
    render: function (box) {
      var E = E0(), wi = E.lockWeek(), po = E.weeks.filter(function (w) { return w.po; })[0], last = E.weeks.filter(function (w) { return !w.po; }).slice(-1)[0];
      var days = function (d) { var x = Math.ceil((Date.parse(d + 'T12:00:00Z') - E.now().getTime()) / 864e5); return x > 0 ? x + ' day' + (x === 1 ? '' : 's') : x === 0 ? 'today' : 'done'; };
      box.innerHTML = list([
        li('🔒 Next lineup lock', wi === null ? 'none left' : esc(DP.lockText(wi))),
        li('⏳ Trade deadline', esc(E.deadlineText ? E.deadlineText() : '')),
        po ? li('🏆 Playoffs start', esc(dt(po.start)) + ' · ' + days(po.start)) : '',
        last ? li('🏁 Regular season ends', esc(dt(last.end)) + ' · ' + days(last.end)) : ''
      ].filter(Boolean));
    } });

  // ------------------------------------------------------------ league
  reg('standings', { name: 'Standings', ic: '📊', cat: 'league', ns: [5, 8, 14], n: 8, desc: 'The table from the weekly category results.', link: function () { return '#/standings'; },
    render: function (box, o) {
      var lw = lastWeek(); if (!lw) { box.innerHTML = '<p class="small muted">After week 1.</p>'; return; }
      var S = DP._weekly.standingsAfter(E0().history(), lw.n);
      box.innerHTML = list(S.list.slice(0, o.n || 8).map(function (r) { return li('<span class="num faint mw-rk">' + r.rank + '</span>' + U.teamChip(r.t, { link: 1 }), '<span class="num">' + r.W + '-' + r.L + '-' + r.T + '</span> · ' + U.pct(r.pct), mine(r.t)); }));
    } });
  reg('power', { name: 'Power rankings', ic: '⚡', cat: 'league', ns: [5, 8, 14], n: 8, desc: 'This week\'s power rankings with movement.', link: function () { return '#/power'; },
    render: function (box, o) {
      var lw = lastWeek(); if (!lw || !DP.powerAfter) { box.innerHTML = '<p class="small muted">After week 1.</p>'; return; }
      var P = DP.powerAfter(lw.n), prev = lw.n > 1 ? DP.powerAfter(lw.n - 1) : null;
      box.innerHTML = list(P.rows.slice(0, o.n || 8).map(function (r) { var d = prev && prev.by[r.t] ? prev.by[r.t].rank - r.rank : 0; return li('<span class="num faint mw-rk">' + r.rank + '</span>' + U.teamChip(r.t, { link: 1 }), d > 0 ? '<span class="good">▲' + d + '</span>' : d < 0 ? '<span class="bad">▼' + (-d) + '</span>' : '–', mine(r.t)); }));
    } });
  reg('odds', { name: 'Playoff odds', ic: '🏆', cat: 'league', ns: [5, 8, 14], n: 8, desc: 'Playoff and title odds from the season simulation.', link: function () { return '#/playoffs'; },
    render: function (box, o) {
      box.innerHTML = '<p class="small muted">Simulating the season…</p>';
      DP.getSim(function (res) {
        if (!alive(box)) return;
        box.innerHTML = list(res.slice().sort(function (a, b) { return b.po - a.po; }).slice(0, o.n || 8).map(function (r) { return li(U.teamChip(r.t, { link: 1 }), '<b>' + U.pct(r.po) + '</b> playoffs · ' + U.pct(r.champ, 1) + ' title', mine(r.t)); }));
      });
    } });
  reg('oddschart', { name: 'Playoff odds through the season', ic: '📉', cat: 'league', team: 1, size: 2, desc: 'Every team\'s playoff odds night by night, your team highlighted.', link: function () { return '#/playoffs'; },
    render: function (box, o, t) { box.innerHTML = '<p class="small muted">Loading…</p>'; DP.loadValues(function () { if (alive(box)) box.innerHTML = DP.oddsChart(t, 'po') || '<p class="small muted">No history yet.</p>'; }); } });
  reg('race', { name: 'Standings race', ic: '🏁', cat: 'league', team: 1, size: 2, desc: 'Every team\'s place after each week (bump chart).', link: function () { return '#/rivals'; },
    render: function (box, o, t) { box.innerHTML = DP.bumpChart ? DP.bumpChart(t) : ''; } });
  reg('results', { name: 'Last week\'s results', ic: '🗞️', cat: 'league', desc: 'Every matchup of the last finished week.', link: function () { var lw = lastWeek(); return '#/weekly' + (lw ? '?w=' + lw.n : ''); },
    render: function (box) {
      var lw = lastWeek(); if (!lw) { box.innerHTML = '<p class="small muted">After week 1.</p>'; return; }
      box.innerHTML = '<p class="small muted" style="margin:0 0 4px">Week ' + lw.n + '</p>' + list(lw.games.map(function (g) {
        var aw = g.sa.W > g.sa.L, bw = g.sb.W > g.sb.L;
        return li((aw ? '<b>' : '') + U.teamChip(g.a, { link: 1 }) + (aw ? '</b>' : '') + ' <span class="num">' + g.sa.W + '-' + g.sa.L + (g.sa.T ? '-' + g.sa.T : '') + '</span> ' + (bw ? '<b>' : '') + U.teamChip(g.b, { link: 1 }) + (bw ? '</b>' : ''), undefined, (g.a === DP.state.team || g.b === DP.state.team) ? 'mine' : '');
      }));
    } });
  reg('streaks', { name: 'Category streaks', ic: '🧩', cat: 'league', team: 1, ns: [5, 8, 12], n: 6, desc: 'Category win and loss runs still going (3+ weeks). Set "Everyone" for the whole league.', anyTeam: 1, link: function () { return '#/records'; },
    render: function (box, o, t) {
      var E = E0(), S = DP.catStreaks ? DP.catStreaks().cur.filter(function (x) { return x.n >= 3 && (o.team === '*' || x.t === t); }) : [];
      box.innerHTML = list(S.slice(0, o.n || 6).map(function (x) { return li((o.team === '*' ? U.teamChip(x.t, { link: 1 }) + ' ' : '') + (x.k === 'W' ? '<span class="good">won</span> ' : '<span class="bad">lost</span> ') + '<b>' + esc(E.CATS[x.c].l) + '</b>', x.n + ' weeks running'); }), 'No runs of 3+ weeks.');
    } });
  reg('grades', { name: 'GM report cards', ic: '📝', cat: 'league', ns: [5, 8, 14], n: 8, desc: 'Every GM\'s letter grades: results, lineup calls, waiver wire, trades, roster value.', link: function () { return '#/grades'; },
    render: function (box, o) {
      box.innerHTML = '<p class="small muted">Loading…</p>';
      DP.loadValues(function () { DP.loadWeeks(finished().map(function (w) { return w.n; }), function (details) {
        if (!alive(box)) return;
        var G = DP.gmReport(details);
        box.innerHTML = list(G.rows.slice(0, o.n || 8).map(function (r) { return li('<span class="num faint mw-rk">' + r.rank + '</span>' + U.teamChip(r.t, { link: 1 }), DP.gradeChip(r.overall) + ' ' + DP.GRADE_KEYS.map(function (k) { return r.g[k[0]] ? DP.gradeChip(r.g[k[0]].l) : '<span class="gr gr-none">–</span>'; }).join(''), mine(r.t)); }));
      }); });
    } });
  reg('closest', { name: 'Closest calls', ic: '🤏', cat: 'league', ns: [3, 5, 8], n: 3, desc: 'Last week\'s categories won by the smallest margins.', link: function () { return '#/records'; },
    render: function (box, o) { var lw = lastWeek(); box.innerHTML = lw && DP.closeCalls ? list(DP.closeCalls(lw).slice(0, o.n || 3).map(function (x) { return '<li class="small">' + DP.closeTxt(x) + '</li>'; })) : '<p class="small muted">After week 1.</p>'; } });

  // ------------------------------------------------------------ players
  reg('hot', { name: 'Hot & cold on my roster', ic: '🔥', cat: 'players', team: 1, ns: [3, 5, 8], n: 4, desc: 'Your players running furthest above and below their projection over the last 14 days.', link: function () { return '#/form'; },
    render: function (box, o, t) {
      var R = roster(t).map(function (p) { return { p: p, f: DP.formOf ? DP.formOf(p) : null }; }).filter(function (x) { return x.f && x.f.pct !== null && x.f.pct !== undefined; }).sort(function (a, b) { return b.f.pct - a.f.pct; }), n = o.n || 4;
      var row = function (x) { return li(ui.plink(x.p) + ' ' + (DP.formBadge ? DP.formBadge(x.p) : ''), (x.f.pct >= 0 ? '+' : '') + Math.round(x.f.pct * 100) + '% vs proj · ' + x.f.gp + ' GP'); };
      box.innerHTML = '<h4 class="mw-h">Hot</h4>' + list(R.slice(0, n).filter(function (x) { return x.f.pct > 0; }).map(row), 'No one running hot.') + '<h4 class="mw-h">Cold</h4>' + list(R.slice(-n).reverse().filter(function (x) { return x.f.pct < 0; }).map(row), 'No one running cold.');
    } });
  reg('hotfa', { name: 'Hot free agents', ic: '🛒', cat: 'players', ns: [5, 8, 12], n: 6, desc: 'Unowned players producing the most above their projection in the last 14 days.', link: function () { return '#/form'; },
    render: function (box, o) {
      var R = E0().P.filter(function (p) { return !p.gm; }).map(function (p) { return { p: p, f: DP.formOf ? DP.formOf(p) : null }; }).filter(function (x) { return x.f && x.f.kind === 'S' && x.f.extra > 0; }).sort(function (a, b) { return b.f.extra - a.f.extra; });
      box.innerHTML = list(R.slice(0, o.n || 6).map(function (x) { var l = x.p.l14; return li(ui.plink(x.p) + ' <span class="faint small">' + esc(x.p.nt || '') + '</span>', l[0] + ' GP · ' + l[2] + ' G ' + l[3] + ' A · ' + (x.f.pct >= 0 ? '+' : '') + Math.round(x.f.pct * 100) + '%'); }));
    } });
  reg('movers', { name: 'Market movers', ic: '📈', cat: 'players', team: 1, anyTeam: 1, ns: [4, 6, 10], n: 6, desc: 'Biggest dynasty value changes in the last 7 days, for your roster or the whole league.', link: function () { return '#/movers'; },
    render: function (box, o, t) {
      box.innerHTML = '<p class="small muted">Loading…</p>';
      DP.loadValues(function (V) {
        if (!alive(box)) return;
        if (!V) { box.innerHTML = '<p class="small muted">No value history.</p>'; return; }
        var rows = Object.keys(V.p).map(function (id) { return DP.moverRow(id, 2); }).filter(function (r) { return r && r.p && Math.abs(r.d) >= 0.05 && (o.team === '*' || r.p.gm === t); }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
        box.innerHTML = list(rows.slice(0, o.n || 6).map(function (r) { return li(ui.plink(r.p) + (o.team === '*' ? ' <span class="faint small">' + esc(r.p.gm || 'FA') + '</span>' : ''), ui.delta(r.d, 1) + ' <span class="faint">→ ' + U.fmt(r.v1, 1) + '</span>'); }), 'No moves of note this week.');
      });
    } });
  reg('lines', { name: 'Line & PP moves', ic: '🔀', cat: 'players', team: 1, ns: [4, 6, 10], n: 6, desc: 'Your players\' line and power-play moves in the last 7 days, and free agents promoted.', link: function () { return '#/lines'; },
    render: function (box, o, t) {
      box.innerHTML = '<p class="small muted">Loading…</p>';
      DP.loadDepthLog(function (L) {
        if (!alive(box)) return;
        if (!L || !L.events.length) { box.innerHTML = '<p class="small muted">No depth-chart log yet.</p>'; return; }
        var net = DP.lineNet(DP.lineEvents(L, 7).filter(function (e) { return e.p; }));
        var promo = function (e) { return e.up && ((e.k === 'pp' && e.to === 'PP1') || (e.k === 'line' && (e.to === 'F1' || e.to === 'F2' || e.to === 'D1')) || (e.k === 'g' && e.to === 'G1')); };
        var my = net.filter(function (e) { return e.p.gm === t; }).reverse(), fa = net.filter(function (e) { return !e.p.gm && promo(e); }).sort(function (a, b) { return (b.p.WAR || 0) - (a.p.WAR || 0); }), n = o.n || 6;
        box.innerHTML = '<h4 class="mw-h">' + esc(U.teamName(t)) + '</h4>' + list(my.slice(0, n).map(function (e) { return li(ui.plink(e.p), chip(e)); }), 'No moves for your players.') + '<h4 class="mw-h">Free agents moving up</h4>' + list(fa.slice(0, n).map(function (e) { return li(ui.plink(e.p), chip(e)); }), 'None this week.');
      });
    } });
  reg('luck', { name: 'Buy low / sell high', ic: '🎰', cat: 'players', team: 1, anyTeam: 1, ns: [4, 6, 10], n: 6, desc: 'Players scoring (or stopping pucks) far above or below their normal rate.', link: function () { return '#/luck'; },
    render: function (box, o, t) {
      var R = DP.luck ? DP.luck().rows.filter(function (r) { return r.sig && (o.team === '*' || r.p.gm === t); }).sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); }) : [];
      box.innerHTML = list(R.slice(0, o.n || 6).map(function (r) { return li(ui.plink(r.p) + ' ' + (r.sig === 'sell' ? '<span class="badge warn">sell high</span>' : '<span class="badge good">buy low</span>'), (r.kind === 'S' ? r.G + ' G on ' + r.S + ' SOG' : U.rate(r.sv) + ' SV%') + ' · ' + (r.d > 0 ? '+' : '') + U.fmt(r.d, 1)); }), 'No strong signals.');
    } });
  reg('tracker', { name: 'Players I follow', ic: '👀', cat: 'players', size: 2, desc: 'Any players you pick: value, last 14 days, owner and games this week. Add them under ⚙️.', link: function () { return '#/players'; }, ids: 1,
    render: function (box, o) {
      var E = E0(), ids = (o.ids || []).filter(function (id) { return E.byId[id]; }), wi = Math.max(0, E.nowWeek());
      if (!ids.length) { box.innerHTML = '<p class="small muted">No players yet. Press ✏️ Edit, then ⚙️ on this widget, and add players by name.</p>'; return; }
      box.innerHTML = list(ids.map(function (id) {
        var p = E.byId[id], l = p.l14, g = E.games(p, wi);
        return li(ui.plink(p) + ' <span class="faint small">' + esc(p.nt || '') + ' · ' + esc(p.gm || 'FA') + '</span> ' + (DP.formBadge ? DP.formBadge(p) : '') + (p.inj ? ' ' + ui.injBadge(p) : ''),
          'value ' + U.fmt(p.DV, 1) + ' · ' + (l ? (p.G ? l[0] + ' GP ' + l[1] + ' W' : l[0] + ' GP ' + l[2] + 'G ' + l[3] + 'A') + ' (14 d)' : 'no games (14 d)') + ' · ' + g.N + ' games this wk');
      }));
    } });

  // ------------------------------------------------------------ your team
  reg('reportcard', { name: 'My report card', ic: '📝', cat: 'team', team: 1, desc: 'Your GM grades and the notes behind them.', link: function () { return '#/grades'; },
    render: function (box, o, t) {
      box.innerHTML = '<p class="small muted">Loading…</p>';
      DP.loadValues(function () { DP.loadWeeks(finished().map(function (w) { return w.n; }), function (details) {
        if (!alive(box)) return;
        var G = DP.gmReport(details), r = G.by[t]; if (!r) return;
        box.innerHTML = '<p>' + DP.gradeChip(r.overall) + ' <span class="small muted">' + U.ord(r.rank) + ' of ' + G.rows.length + '</span></p><div class="grrow">' + DP.GRADE_KEYS.map(function (k) { return '<div class="grcell"><span class="small muted">' + k[2] + ' ' + esc(k[1]) + '</span>' + (r.g[k[0]] ? DP.gradeChip(r.g[k[0]].l) : '–') + '</div>'; }).join('') + '</div>' +
          (r.notes.length ? '<ul class="small grnotes">' + r.notes.slice(0, 4).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '');
      }); });
    } });
  reg('cap', { name: 'Cap space', ic: '💰', cat: 'team', team: 1, desc: 'Cap space this season and the next two (traded cap and IR relief included).', link: function () { return '#/cap'; },
    render: function (box, o, t) {
      var E = E0(), C = E.teamCap(t);
      box.innerHTML = list(C.slice(0, 3).map(function (y, i) { return li('<b>' + esc(E.YEARS[i]) + '</b> <span class="faint small">cap ' + U.m(y.cap, 1) + '</span>', '<span class="' + (y.space < 0 ? 'bad' : 'good') + '">' + U.m(y.space, 2) + ' space</span>' + (i === 0 && y.ir ? ' · IR ' + U.m(y.ir, 1) : '')); }));
    } });
  reg('injuries', { name: 'Injuries on my roster', ic: '🩹', cat: 'team', team: 1, desc: 'Your players on the injury report, with their Fantrax slot.', link: function () { return '#/injuries'; },
    render: function (box, o, t) {
      var R = roster(t).filter(function (p) { return p.inj; }).sort(function (a, b) { return (b.DV || 0) - (a.DV || 0); });
      box.innerHTML = list(R.map(function (p) { return li(ui.plink(p) + ' ' + ui.injBadge(p), esc((p.inj[1] || p.inj[0] || '').toString().slice(0, 60)) + (p.fs ? ' · ' + esc({ A: 'Active', R: 'Bench', M: 'Minors', IR: 'IR' }[p.fs] || p.fs) : '')); }), 'No one on the injury report.');
    } });
  reg('games', { name: 'Games this week', ic: '🗓️', cat: 'team', team: 1, ns: [6, 10, 23], n: 10, desc: 'NHL games for each player on your active roster in the week being played (fewest first).', link: function () { return '#/schedule'; },
    render: function (box, o, t) {
      var E = E0(), wi = Math.max(0, E.nowWeek()), R = roster(t).filter(function (p) { return p.fs === 'A' || p.fs === 'R'; }).map(function (p) { return { p: p, g: E.games(p, wi).N }; }).sort(function (a, b) { return a.g - b.g || (b.p.WAR || 0) - (a.p.WAR || 0); });
      box.innerHTML = '<p class="small muted" style="margin:0 0 4px">Week ' + (wi + 1) + ' · ' + E.sum(R.map(function (x) { return x.g; })) + ' games on the active roster (Active + Bench)</p>' + list(R.slice(0, o.n || 10).map(function (x) { return li(ui.pos(x.p) + ui.plink(x.p), '<b class="num">' + x.g + '</b> games'); }));
    } });
  reg('regrets', { name: 'My lineup regrets', ic: '🪑', cat: 'team', team: 1, desc: 'Each week, the bench swap that would have helped most.', link: function (t) { return '#/team/' + encodeURIComponent(t); },
    render: function (box, o, t) {
      var ns = finished().map(function (w) { return w.n; });
      DP.loadWeeks(ns, function () {
        if (!alive(box)) return;
        var R = DP.teamRegrets(t, ns).sort(function (a, b) { return b.n - a.n; });
        box.innerHTML = list(R.slice(0, 4).map(function (x) { return '<li class="small"><b>W' + x.n + '</b> ' + DP.regretText(x, { team: false }) + '</li>'; }), 'No week where a bench swap would have helped.');
      });
    } });
  reg('season', { name: 'My season so far', ic: '📈', cat: 'team', team: 1, size: 2, desc: 'Place in the standings after each week and every result.', link: function (t) { return '#/team/' + encodeURIComponent(t); },
    render: function (box, o, t) { box.innerHTML = DP.seasonStrip ? DP.seasonStrip(t) : ''; if (DP.fillWeekFlows) DP.fillWeekFlows(box); } });
  reg('value', { name: 'Team value through the season', ic: '💎', cat: 'team', team: 1, size: 2, desc: 'Every team\'s total dynasty value night by night, yours highlighted.', link: function () { return '#/movers'; },
    render: function (box, o, t) { box.innerHTML = '<p class="small muted">Loading…</p>'; DP.loadValues(function () { if (alive(box)) box.innerHTML = DP.teamValueChart(t) || '<p class="small muted">No history yet.</p>'; }); } });

  // ------------------------------------------------------------ trades & moves
  reg('trades', { name: 'Latest trades', ic: '🤝', cat: 'trades', ns: [3, 5, 8], n: 4, desc: 'The newest trades in the league.', link: function () { return '#/history'; },
    render: function (box, o) {
      var T = ((DP.league && DP.league.trades) || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      box.innerHTML = list(T.slice(0, o.n || 4).map(function (tr) {
        return '<li class="small"><span class="faint">' + esc(dt(tr.date)) + '</span> ' + tr.teams.map(function (t) { return U.teamChip(t, { link: 1 }) + ' got ' + esc(tr.moves.filter(function (m) { return m.to === t; }).map(function (m) { return m.label; }).slice(0, 3).join(', ') || '–') + (tr.moves.filter(function (m) { return m.to === t; }).length > 3 ? '…' : ''); }).join('; ') + '</li>';
      }));
    } });
  reg('moves', { name: 'Latest adds & drops', ic: '🧾', cat: 'trades', team: 1, anyTeam: 1, ns: [5, 8, 12], n: 6, desc: 'The newest adds and drops, for one team or everyone.', link: function () { return '#/moves'; },
    render: function (box, o, t) {
      var E = E0(), M = (DP.league.moves || []).filter(function (m) { return (m.type === 'add' || m.type === 'drop') && (o.team === '*' || m.to === t || m.from === t); }).slice().sort(function (a, b) { return a.d < b.d ? 1 : -1; });
      box.innerHTML = list(M.slice(0, o.n || 6).map(function (m) { var p = E.byId[m.id]; return li((m.type === 'add' ? '🛒 ' : '🗑️ ') + (p ? ui.plink(p) : esc(m.n)), (o.team === '*' ? esc(m.to || m.from) + ' · ' : '') + esc(dt(m.d))); }), 'No moves.');
    } });
  reg('partners', { name: 'Trade partners', ic: '🔎', cat: 'trades', team: 1, ns: [3, 5, 8], n: 4, desc: 'The teams whose category strengths fit your needs best.', link: function () { return '#/finder'; },
    render: function (box, o, t) {
      var P = DP.partnersBrief ? DP.partnersBrief(t, o.n || 4) : [];
      box.innerHTML = list(P.map(function (x) { return li(U.teamChip(x.t, { link: 1 }), 'fit ' + U.fmt(x.score, 0) + ' · <a href="' + U.hash('tape', null, { a: t, b: x.t }) + '">compare</a>'); }));
    } });
  reg('network', { name: 'Who trades with whom', ic: '🕸️', cat: 'trades', team: 1, size: 2, desc: 'The league\'s trade map since 2025-26, your team highlighted.', link: function () { return '#/history'; },
    render: function (box, o, t) { box.innerHTML = DP.tradeNetworkSvg ? DP.tradeNetworkSvg(t) : ''; } });

  // ------------------------------------------------------------ prospects & draft
  reg('prospects', { name: 'Top prospects', ic: '📡', cat: 'prospects', team: 1, anyTeam: 1, ns: [5, 8, 12], n: 6, desc: 'Prospects by the model\'s rank, for one team or everyone (Everyone = unowned only).', link: function () { return '#/radar'; },
    render: function (box, o, t) {
      var R = E0().P.filter(function (p) { return p._pros && p.prRank && (o.team === '*' ? !p.gm : p.gm === t); }).sort(function (a, b) { return a.prRank - b.prRank; });
      box.innerHTML = list(R.slice(0, o.n || 6).map(function (p) { return li('<span class="num faint mw-rk">#' + p.prRank + '</span>' + ui.plink(p) + ' <span class="faint small">' + (p.age ? Math.floor(p.age) + 'y' : '') + '</span>', 'value ' + U.fmt(p.DV, 1)); }), 'No ranked prospects.');
    } });
  reg('mnr', { name: 'MNR in the NHL', ic: '🌱', cat: 'prospects', team: 1, desc: 'Your MNR players with NHL games in the last 14 days and their graduation clock.', link: function () { return '#/prospects?nhl=now'; },
    render: function (box, o, t) {
      var E = E0(), R = roster(t).filter(function (p) { return p.ct === 'MNR' && p.l14 && p.l14[0] > 0; });
      box.innerHTML = list(R.map(function (p) { var g = E.graduation(p), l = p.l14; return li(ui.plink(p) + (p.fs === 'M' ? ' <span class="badge warn">Minors slot</span>' : ''), l[0] + ' GP · ' + (p.G ? l[1] + ' W' : l[2] + 'G ' + l[3] + 'A') + ' · ' + g.cgp + '/' + g.thr + ' career'); }), 'None of your MNR players has played in the NHL in the last 14 days.');
    } });
  reg('picks', { name: 'My draft picks', ic: '🎟️', cat: 'prospects', team: 1, desc: 'Your picks with the projected slot and value.', link: function () { return '#/picks'; },
    render: function (box, o, t) {
      var E = E0(), P = E.picksOf(t).slice().sort(function (a, b) { return a.year - b.year || a.round - b.round; });
      box.innerHTML = list(P.map(function (pk) { return li(esc(E.pickLabel(pk)), '~#' + E.pickOverall(pk) + ' · value ' + U.fmt(E.pickValue(pk), 1)); }), 'No picks.');
    } });
  reg('watch', { name: 'Prospect watchlist', ic: '⭐', cat: 'prospects', size: 2, desc: 'The prospects you starred on the Prospect Radar (this device).', link: function () { return '#/radar?tab=watch'; },
    render: function (box) { if (DP.watchTab) DP.watchTab(box); } });

  // ------------------------------------------------------------ model & site
  reg('scorecard', { name: 'Model scorecard', ic: '🧮', cat: 'model', desc: 'How the site\'s matchup odds have done against the real results.', link: function () { return '#/scorecard'; },
    render: function (box) {
      DP.loadValues(function () {
        if (!alive(box)) return;
        var S = DP.modelScore ? DP.modelScore(DP.modelCalls()) : null;
        box.innerHTML = S ? list([li('Favorites won', '<b>' + S.favW + ' of ' + S.dec + '</b>' + (S.ties ? ' · ' + S.ties + ' tied' : '')), li('Brier score', U.fmt(S.brier, 3) + ' (coin flip 0.250)'), li('Expected vs got', U.fmt(S.expFav, 1) + ' → ' + U.fmt(S.actFav, 1))]) : '<p class="small muted">No calls scored yet.</p>';
      });
    } });
  reg('news', { name: 'What\'s new on the site', ic: '📰', cat: 'model', ns: [3, 5, 8], n: 3, desc: 'The latest features and changes.', link: function () { return '#/data'; },
    render: function (box, o) { box.innerHTML = DP.newsHtml ? '<ul class="list-plain small mwnews">' + DP.newsHtml(null, o.n || 3) + '</ul>' : ''; } });

  // ------------------------------------------------------------ your own
  reg('note', { name: 'Notes', ic: '🗒️', cat: 'custom', desc: 'Your own notes: trade ideas, targets, reminders. Edit the text under ⚙️.', text: 1,
    render: function (box, o) { box.innerHTML = o.text ? '<div class="mw-note">' + esc(o.text).replace(/\n/g, '<br>') + '</div>' : '<p class="small muted">Empty. Press ✏️ Edit, then ⚙️, and write anything.</p>'; } });
  reg('links', { name: 'Quick links', ic: '🔗', cat: 'custom', desc: 'Buttons for the pages you use most. Pick them under ⚙️.', pages: 1,
    render: function (box, o) {
      var all = {}; (DP.NAV || []).forEach(function (g) { g[1].forEach(function (x) { all[x[0]] = x; }); });
      var ks = (o.pages && o.pages.length ? o.pages : ['live', 'team', 'trade', 'pickup']).filter(function (k) { return all[k]; });
      box.innerHTML = '<div class="mw-links">' + ks.map(function (k) { return '<a class="btn" href="#/' + k + '">' + all[k][1] + ' ' + esc(all[k][2]) + '</a>'; }).join('') + '</div>';
    } });

  // ------------------------------------------------------------ layouts
  var PRESETS = {
    starter: { name: 'Starter', w: [['matchup', 2], ['lineup', 1], ['standings', 1], ['hot', 1], ['lines', 1], ['movers', 1], ['countdown', 1]] },
    gameday: { name: 'Game day', w: [['matchup', 2], ['swing', 1], ['allgames', 1], ['games', 1], ['lineup', 1], ['stakes', 1], ['injuries', 1]] },
    dynasty: { name: 'Dynasty GM', w: [['reportcard', 1], ['cap', 1], ['value', 2], ['movers', 1], ['picks', 1], ['mnr', 1], ['partners', 1], ['oddschart', 2]] },
    waiver: { name: 'Waiver hawk', w: [['hotfa', 1], ['lines', 1], ['luck', 1], ['moves', 1], ['injuries', 1], ['games', 1]] },
    prospects: { name: 'Prospect hound', w: [['prospects', 1], ['mnr', 1], ['picks', 1], ['watch', 2]] },
    junkie: { name: 'League junkie', w: [['power', 1], ['standings', 1], ['race', 2], ['grades', 1], ['streaks', 1], ['results', 1], ['closest', 1], ['trades', 1], ['scorecard', 1], ['network', 2]] }
  };
  DP.MYPAGE_PRESETS = PRESETS;
  function fromPreset(k) { return { v: 1, w: PRESETS[k].w.map(function (x) { return { k: x[0], s: x[1], o: {} }; }) }; }
  function clean(L) {
    if (!L || !Array.isArray(L.w)) return null;
    return { v: 1, w: L.w.filter(function (x) { return x && W[x.k]; }).slice(0, 80).map(function (x) { return { k: x.k, s: x.s === 2 ? 2 : 1, o: x.o && typeof x.o === 'object' ? x.o : {} }; }) };
  }
  DP.myLayout = function () { var L = clean(U.store.get(KEY, null)); return L || fromPreset('starter'); };
  function save(L) { U.store.set(KEY, L); }
  // share links: [[key, size, team, count, text, ids, pages]] as URL-safe base64 JSON
  DP.encodeLayout = function (L) {
    var a = L.w.map(function (x) { var o = x.o || {}, r = [x.k, x.s, o.team || '', o.n || 0]; if (o.text || o.ids || o.pages) r.push(o.text || '', o.ids || [], o.pages || []); return r; });
    return btoa(unescape(encodeURIComponent(JSON.stringify(a)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  DP.decodeLayout = function (s) {
    try {
      var a = JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))));
      return clean({ w: a.map(function (r) { var o = {}; if (r[2]) o.team = r[2]; if (r[3]) o.n = r[3]; if (r[4]) o.text = String(r[4]).slice(0, 2000); if (r[5] && r[5].length) o.ids = r[5].slice(0, 30); if (r[6] && r[6].length) o.pages = r[6].slice(0, 20); return { k: r[0], s: r[1], o: o }; }) });
    } catch (e) { return null; }
  };

  // re-draw My Page with these query params (the router only redraws when the address changes)
  function reload(q) { var h = U.hash('mypage', null, q || {}); if (location.hash === h || (h === '#/mypage' && location.hash === '#/mypage')) DP.render(); else location.hash = h; }
  DP.regWidget = reg;
  // widgets from files that loaded before this one (pages-usage.js, pages-draftrace.js, pages-mywidgets2.js)
  (DP._wq || []).forEach(function (x) { reg(x[0], x[1]); }); DP._wq = null;
  DP.myWidgetHelpers = { alive: alive, list: list, li: li, finished: finished, lastWeek: lastWeek, roster: roster, liveGame: liveGame, catChips: catChips };
  function teamOf(spec, o) { return o.team && o.team !== '*' ? o.team : DP.state.team || null; }
  function renderWidget(cell, x, i, edit) {
    var spec = W[x.k], o = x.o || {}, t = teamOf(spec, o), body = U.qs('.mw-body', cell);
    var head = '<span class="mw-ic">' + spec.ic + '</span><span class="mw-name">' + esc(spec.name) + '</span>' + (spec.team && o.team === '*' ? ' <span class="faint small">everyone</span>' : spec.team && o.team && o.team !== DP.state.team ? ' ' + U.teamBadge(o.team) : '');
    U.qs('.mw-head', cell).innerHTML = head + (edit ? '<span class="mw-ctl"><button class="btn sm ghost" data-mv="-1" title="Move earlier" aria-label="Move earlier">◀</button><button class="btn sm ghost" data-mv="1" title="Move later" aria-label="Move later">▶</button><button class="btn sm ghost" data-sz title="Half or full width" aria-label="Change width">' + (x.s === 2 ? '◧' : '⬌') + '</button><button class="btn sm ghost" data-set title="Settings" aria-label="Settings">⚙️</button><button class="btn sm ghost" data-rm title="Remove" aria-label="Remove">✕</button></span>'
      : (spec.link ? '<a class="small mw-go" href="' + spec.link(t || '') + '">open →</a>' : ''));
    if (spec.team && !t && !spec.anyTeam) { body.innerHTML = '<p class="small muted">Pick your team (top right), or set a team for this widget under ✏️ Edit → ⚙️.</p>'; return; }
    if (spec.team && !t && spec.anyTeam && o.team !== '*') { body.innerHTML = '<p class="small muted">Pick your team (top right), or choose "Everyone" for this widget under ✏️ Edit → ⚙️.</p>'; return; }
    try { spec.render(body, o, t); } catch (e) { body.innerHTML = '<p class="small bad">This widget could not load (' + esc(String(e.message).slice(0, 80)) + ').</p>'; if (window.console) console.error(e); }
  }
  function settingsHtml(x) {
    var spec = W[x.k], o = x.o || {}, h = '<div class="mw-set">';
    if (spec.team) h += '<label>Team <select data-o="team"><option value="">My team</option>' + (spec.anyTeam ? '<option value="*"' + (o.team === '*' ? ' selected' : '') + '>Everyone</option>' : '') + U.teamOptions(o.team && o.team !== '*' ? o.team : '') + '</select></label>';
    if (spec.ns) h += '<label>Show <select data-o="n">' + spec.ns.map(function (n) { return '<option value="' + n + '"' + ((o.n || spec.n) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>';
    if (spec.text) h += '<label style="flex-basis:100%">Text <textarea data-o="text" rows="4" maxlength="2000" style="width:100%">' + esc(o.text || '') + '</textarea></label>';
    if (spec.ids) h += '<div style="flex-basis:100%"><label>Add a player <input data-pfind list="mw-plist" placeholder="Type a name…" autocomplete="off"></label> <button class="btn sm" data-padd>Add</button><datalist id="mw-plist">' + DP.E.P.filter(function (p) { return p.r || p.gm; }).map(function (p) { return '<option value="' + esc(p.n) + '">'; }).join('') + '</datalist><div class="small" style="margin-top:6px">' + (o.ids || []).map(function (id) { var p = DP.E.byId[id]; return p ? '<span class="mw-pill">' + esc(p.n) + ' <button class="btn sm ghost" data-pdel="' + esc(id) + '" aria-label="Remove ' + esc(p.n) + '">✕</button></span>' : ''; }).join('') + '</div></div>';
    if (spec.pages) {
      var sel = o.pages || [];
      h += '<div class="mw-pages" style="flex-basis:100%">' + (DP.NAV || []).map(function (g) { return g[1].map(function (p) { return '<label class="small"><input type="checkbox" data-pg="' + esc(p[0]) + '"' + (sel.indexOf(p[0]) >= 0 ? ' checked' : '') + '> ' + p[1] + ' ' + esc(p[2]) + '</label>'; }).join(''); }).join('') + '</div>';
    }
    if (!spec.team && !spec.ns && !spec.text && !spec.ids && !spec.pages) h += '<span class="small muted">Nothing to set for this widget.</span>';
    return h + '<button class="btn sm" data-done>Done</button></div>';
  }

  DP.pages.mypage = {
    title: 'My Page',
    render: function (el, hsh) {
      var shared = hsh.q.l ? DP.decodeLayout(hsh.q.l) : null, edit = hsh.q.edit === '1' && !shared, L = shared || DP.myLayout(), hasOwn = !!U.store.get(KEY, null);
      var h = '<div class="page-head"><h1>🛠️ My Page</h1><p class="sub">Build your own page: pick the widgets you want, in the order you want, at the size you want. It\'s kept on this device; the share link copies it to another phone or to a leaguemate.</p></div>';
      if (shared) h += '<div class="callout info"><b>A shared layout</b> with ' + shared.w.length + ' widget' + (shared.w.length === 1 ? '' : 's') + ' (shown below). <button class="btn sm" id="mp-use">Use it as my page</button> <a class="btn sm ghost" href="#/mypage">' + (hasOwn ? 'Back to mine' : 'No thanks') + '</a>' + (hasOwn ? ' <span class="small muted">Using it replaces your current layout.</span>' : '') + '</div>';
      else h += '<div class="controls mp-bar"><button class="btn sm' + (edit ? ' on' : '') + '" id="mp-edit">' + (edit ? '✓ Done editing' : '✏️ Edit layout') + '</button><button class="btn sm" id="mp-add">＋ Add widgets</button><button class="btn sm" id="mp-share">🔗 Copy share link</button><label class="small">Start from <select id="mp-preset"><option value="">a preset…</option>' + Object.keys(PRESETS).map(function (k) { return '<option value="' + k + '">' + esc(PRESETS[k].name) + '</option>'; }).join('') + '</select></label><label class="small" title="When you open the site without a page in the link, it opens on My Page instead of the Dashboard (this device)"><input type="checkbox" id="mp-start"' + (U.store.get('startPage', '') === 'mypage' ? ' checked' : '') + '> Open the site on My Page</label></div>';
      h += '<div id="mp-gal" hidden></div><div class="mp-grid' + (edit ? ' editing' : '') + '" id="mp-grid">' + L.w.map(function (x, i) { return '<div class="card mw' + (x.s === 2 ? ' wide' : '') + '" data-i="' + i + '"><div class="mw-head"></div><div class="mw-setbox" hidden></div><div class="mw-body"></div></div>'; }).join('') + '</div>';
      if (!L.w.length) h += '<div class="callout">Your page is empty. Press <b>＋ Add widgets</b> or pick a preset.</div>';
      if (!shared && DP.favs && DP.tabRoutes) {
        var fv = DP.favs(), tr = DP.tabRoutes(), opts = function (sel) { return (DP.NAV || []).map(function (g) { return '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (p) { return '<option value="' + esc(p[0]) + '"' + (p[0] === sel ? ' selected' : '') + '>' + p[1] + ' ' + esc(p[2]) + '</option>'; }).join('') + '</optgroup>'; }).join(''); };
        h += '<details class="card mp-cust" style="margin-top:14px"><summary><b>⚙️ Customize the site</b> <span class="small muted">favorites in the menu, the phone tab bar</span></summary>' +
          '<h3 class="small" style="margin-top:10px">★ Favorites</h3><p class="small muted">Pinned at the top of the menu. You can also tap the ☆ next to any page in the menu.</p><div class="mw-pages">' + (DP.NAV || []).map(function (g) { return g[1].map(function (p) { return '<label class="small"><input type="checkbox" data-favpick="' + esc(p[0]) + '"' + (fv.indexOf(p[0]) >= 0 ? ' checked' : '') + '> ' + p[1] + ' ' + esc(p[2]) + '</label>'; }).join(''); }).join('') + '</div>' +
          '<h3 class="small" style="margin-top:12px">📱 Phone tab bar</h3><p class="small muted">The four pages in the bar at the bottom of the screen on a phone (the last button always opens the menu).</p><div class="mp-tabs">' + tr.map(function (r, i) { return '<label class="small">' + (i + 1) + ' <select data-tab="' + i + '">' + opts(r) + '</select></label>'; }).join('') + '<button class="btn sm ghost" id="mp-tabreset">Reset</button></div></details>';
      }
      el.innerHTML = h;
      var grid = U.qs('#mp-grid', el);
      U.qsa('.mw', grid).forEach(function (cell) { var i = +cell.dataset.i; renderWidget(cell, L.w[i], i, edit); });
      var commit = function (keepEdit) { save(L); reload(keepEdit ? { edit: '1' } : {}); };
      U.qsa('[data-favpick]', el).forEach(function (c) { c.addEventListener('change', function () { DP.setFavs(U.qsa('[data-favpick]', el).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.favpick; })); }); });
      U.qsa('[data-tab]', el).forEach(function (s) { s.addEventListener('change', function () { var a = DP.tabRoutes().slice(); a[+s.dataset.tab] = s.value; DP.setTabs(a); U.toast('Phone tab bar updated'); }); });
      if (U.qs('#mp-tabreset', el)) U.qs('#mp-tabreset', el).addEventListener('click', function () { DP.setTabs(DP.TAB_DEFAULT.slice()); reload({}); });
      if (shared) { U.qs('#mp-use', el).addEventListener('click', function () { save(shared); U.toast('Saved as your page'); reload({}); }); return; }
      U.qs('#mp-edit', el).addEventListener('click', function () { reload(edit ? {} : { edit: '1' }); });
      U.qs('#mp-start', el).addEventListener('change', function (e) { U.store.set('startPage', e.target.checked ? 'mypage' : ''); if (e.target.checked && !hasOwn) save(L); U.toast(e.target.checked ? 'The site will open on My Page on this device' : 'The site will open on the Dashboard'); });
      U.qs('#mp-share', el).addEventListener('click', function () { var url = location.href.split('#')[0] + '#/mypage?l=' + DP.encodeLayout(L); U.copy(url, 'Link copied. Open it on another device (or send it to a leaguemate) to use this layout.'); });
      U.qs('#mp-preset', el).addEventListener('change', function (e) {
        var k = e.target.value; if (!k) return;
        if (hasOwn && L.w.length && !confirm('Replace your page with the "' + PRESETS[k].name + '" preset?')) { e.target.value = ''; return; }
        L = fromPreset(k); commit(false);
      });
      U.qs('#mp-add', el).addEventListener('click', function () {
        var gal = U.qs('#mp-gal', el); if (!gal.hidden) { gal.hidden = true; return; }
        gal.hidden = false;
        gal.innerHTML = '<div class="card"><h2>＋ Add widgets <button class="btn sm ghost" style="margin-left:auto" id="mp-galx">Close</button></h2><div class="hint">Each one is a small view of something the site already works out. Add as many as you like; you can move, resize and set them up after.</div>' + CATS.map(function (c) {
          var ks = ORDER.filter(function (k) { return W[k].cat === c[0]; }); if (!ks.length) return '';
          return '<h3 class="small">' + esc(c[1]) + '</h3><div class="mp-gal">' + ks.map(function (k) { var n = L.w.filter(function (x) { return x.k === k; }).length; return '<button class="mp-wg" data-add="' + k + '"><span class="mw-ic">' + W[k].ic + '</span><span><b>' + esc(W[k].name) + '</b>' + (n ? ' <span class="badge good">on your page</span>' : '') + '<span class="small muted">' + esc(W[k].desc) + '</span></span></button>'; }).join('') + '</div>';
        }).join('') + '</div>';
        U.qs('#mp-galx', gal).addEventListener('click', function () { gal.hidden = true; });
        U.qsa('[data-add]', gal).forEach(function (b) { b.addEventListener('click', function () { L.w.push({ k: b.dataset.add, s: W[b.dataset.add].size, o: {} }); save(L); U.toast(W[b.dataset.add].name + ' added at the bottom'); reload(edit ? { edit: '1' } : {}); }); });
      });
      if (!edit) return;
      U.qsa('.mw', grid).forEach(function (cell) {
        var i = +cell.dataset.i, x = L.w[i];
        var on = function (sel, fn) { var b = U.qs(sel, cell); if (b) b.addEventListener('click', fn); };
        on('[data-mv="-1"]', function () { if (i > 0) { L.w.splice(i - 1, 0, L.w.splice(i, 1)[0]); commit(true); } });
        on('[data-mv="1"]', function () { if (i < L.w.length - 1) { L.w.splice(i + 1, 0, L.w.splice(i, 1)[0]); commit(true); } });
        on('[data-sz]', function () { x.s = x.s === 2 ? 1 : 2; commit(true); });
        on('[data-rm]', function () { L.w.splice(i, 1); commit(true); });
        on('[data-set]', function () {
          var sb = U.qs('.mw-setbox', cell); sb.hidden = !sb.hidden; if (sb.hidden) return;
          sb.innerHTML = settingsHtml(x);
          U.qsa('[data-o]', sb).forEach(function (f) { f.addEventListener('change', function () { var k = f.dataset.o, v = f.value; if (k === 'n') v = +v; if (v === '' || v === 0) delete x.o[k]; else x.o[k] = v; save(L); }); });
          var ta = U.qs('textarea[data-o]', sb); if (ta) ta.addEventListener('input', function () { x.o.text = ta.value; save(L); });
          U.qsa('[data-pg]', sb).forEach(function (c) { c.addEventListener('change', function () { x.o.pages = U.qsa('[data-pg]', sb).filter(function (z) { return z.checked; }).map(function (z) { return z.dataset.pg; }); save(L); }); });
          var addP = function () { var inp = U.qs('[data-pfind]', sb), q = (inp.value || '').trim().toLowerCase(); if (!q) return; var p = DP.E.P.filter(function (z) { return z.n.toLowerCase() === q; }).sort(function (a, b) { return (b.DV || 0) - (a.DV || 0); })[0] || DP.E.P.filter(function (z) { return z.n.toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return (b.DV || 0) - (a.DV || 0); })[0]; if (!p) { U.toast('No player called "' + inp.value + '"'); return; } x.o.ids = (x.o.ids || []).filter(function (id) { return id !== p.id; }).concat([p.id]); save(L); commit(true); };
          var pa = U.qs('[data-padd]', sb); if (pa) { pa.addEventListener('click', addP); U.qs('[data-pfind]', sb).addEventListener('keydown', function (e) { if (e.key === 'Enter') addP(); }); }
          U.qsa('[data-pdel]', sb).forEach(function (b) { b.addEventListener('click', function () { x.o.ids = (x.o.ids || []).filter(function (id) { return id !== b.dataset.pdel; }); save(L); commit(true); }); });
          U.qs('[data-done]', sb).addEventListener('click', function () { commit(true); });
        });
      });
    }
  };
})();
