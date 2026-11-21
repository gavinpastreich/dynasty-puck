/* Dynasty Puck HQ - more widgets for My Page (registered through DP.regWidget from pages-mypage.js). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  if (!DP.regWidget) return;
  var H = DP.myWidgetHelpers, reg = DP.regWidget;

  reg('feed', { name: 'League feed', ic: '📣', cat: 'league', team: 1, anyTeam: 1, ns: [6, 10, 20], n: 8, size: 2, desc: 'The latest trades, moves, line changes, value swings and results, for your team or everyone.', link: function () { return '#/feed'; },
    render: function (box, o, t) {
      box.innerHTML = '<p class="small muted">Loading…</p>';
      DP.loadFeed(function (items) { if (!H.alive(box)) return; box.innerHTML = DP.feedHtml(DP.feedFilter(items, { team: o.team === '*' ? '' : t }), o.n || 8); });
    } });
  reg('catprofile', { name: 'Category profile', ic: '🧩', cat: 'team', team: 1, desc: 'Your average weekly starter totals in each category against the league (rank of 14).', link: function () { return '#/cats'; },
    render: function (box, o, t) { var s = DP.teamSummary()[t]; box.innerHTML = s && DP.C ? DP.C.catProfile(s.z, s.rank) : ''; } });
  reg('ranges', { name: 'Next week\'s ranges', ic: '📏', cat: 'week', team: 1, size: 2, desc: 'What your lineup should put up next week in each category (the middle 80% of outcomes), next to your opponent\'s.', link: function () { return '#/matchup'; },
    render: function (box, o, t) {
      var E = DP.E, wi = E.lockWeek(); if (wi === null) { box.innerHTML = '<p class="small muted">No lineup locks left.</p>'; return; }
      var g = DP.meta.h2h.filter(function (m) { return m[0] === wi + 1 && (m[1] === t || m[2] === t); })[0], opp = g ? (g[1] === t ? g[2] : g[1]) : null;
      var A = E.catVec(E.baseline[t][wi]), B = opp ? E.catVec(E.baseline[opp][wi]) : null, z = 1.2816;
      var f = function (c, v) { return c === 12 ? U.fmt(v, 2) : c === 13 ? U.rate(Math.min(1, v)) : U.fmt(Math.max(0, v), 0); };
      var rng = function (cv, c) { var m = cv.mu[c], s = Math.sqrt(Math.max(0, cv.va[c])); return f(c, m - z * s) + '–' + f(c, m + z * s); };
      box.innerHTML = '<p class="small muted" style="margin:0 0 6px">Week ' + (wi + 1) + (opp ? ' vs ' + esc(U.teamName(opp)) : '') + ' · projected, optimal lineups · goalie categories assume the goalie minimum is met</p><div class="tbl-wrap"><table class="t small"><thead><tr><th>Cat</th><th class="num">' + esc(U.teamAbbr(t)) + ' expected</th><th class="num">range</th>' + (B ? '<th class="num">' + esc(U.teamAbbr(opp)) + ' expected</th><th class="num">range</th>' : '') + '</tr></thead><tbody>' +
        E.CATS.map(function (cat, c) { return '<tr><td><b>' + esc(cat.l) + '</b></td><td class="num">' + f(c, A.mu[c]) + '</td><td class="num muted">' + rng(A, c) + '</td>' + (B ? '<td class="num">' + f(c, B.mu[c]) + '</td><td class="num muted">' + rng(B, c) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table></div>';
    } });
  reg('upcoming', { name: 'Next four opponents', ic: '📆', cat: 'week', team: 1, desc: 'Your next four matchups with the projected chance to win each.', link: function () { return '#/matchup'; },
    render: function (box, o, t) {
      var E = DP.E, wi = E.lockWeek(); if (wi === null) { box.innerHTML = '<p class="small muted">No lineup locks left.</p>'; return; }
      var G = DP.meta.h2h.filter(function (m) { return m[0] > wi && (m[1] === t || m[2] === t); }).slice(0, 4);
      box.innerHTML = H.list(G.map(function (g) {
        var w = g[0] - 1, opp = g[1] === t ? g[2] : g[1], mc = E.simWeek(E.baseline[t][w], E.baseline[opp][w], 1500, w * 31 + 7);
        return H.li('Wk ' + g[0] + ' ' + U.teamChip(opp, { link: 1 }), '<b>' + U.pct(mc.win) + '</b> to win' + (mc.tie > 0.08 ? ' · ' + U.pct(mc.tie) + ' tie' : ''));
      }), 'No regular-season matchups left.');
    } });
  reg('outlook', { name: 'Games outlook', ic: '🗓️', cat: 'week', team: 1, desc: 'Expected skater games from your optimal lineup in each of the next four weeks, against the league average.', link: function () { return '#/schedule?tab=sos'; },
    render: function (box, o, t) {
      var E = DP.E, w0 = E.openFrom(), ws = []; for (var w = w0; w < Math.min(E.REG_WEEKS || 24, w0 + 4); w++) ws.push(w);
      if (!ws.length) { box.innerHTML = '<p class="small muted">No regular-season weeks left.</p>'; return; }
      var sg = function (tm, w) { var lu = E.baseline[tm][w].lu; return E.sum(lu.F.concat(lu.D).map(function (x) { return E.games(x.p, w).m; })); };
      box.innerHTML = H.list(ws.map(function (w) {
        var mine = sg(t, w), avg = E.sum(E.teams.map(function (tm) { return sg(tm, w); })) / E.teams.length, d = mine - avg;
        return H.li('Week ' + (w + 1), '<b class="num">' + U.fmt(mine, 1) + '</b> games · league ' + U.fmt(avg, 1) + ' (' + ui.delta(d, 1) + ')');
      }));
    } });
  reg('rivals', { name: 'Who has my number', ic: '⚔️', cat: 'league', team: 1, desc: 'Your category record against every team across the weeks played (all-play), best and worst.', link: function () { return '#/rivals'; },
    render: function (box, o, t) {
      var E = DP.E, W = H.finished(), rec = {};
      E.teams.forEach(function (x) { if (x !== t) rec[x] = { W: 0, L: 0, T: 0 }; });
      W.forEach(function (w) { E.teams.forEach(function (x) { if (x === t) return; E.catResults(w.vec[t], w.vec[x]).forEach(function (r) { if (r === 1) rec[x].W++; else if (r === 0) rec[x].T++; else rec[x].L++; }); }); });
      var rows = Object.keys(rec).map(function (x) { var r = rec[x], n = r.W + r.L + r.T; return { t: x, r: r, p: n ? (r.W + r.T / 2) / n : 0.5 }; }).sort(function (a, b) { return b.p - a.p; });
      if (!W.length) { box.innerHTML = '<p class="small muted">After week 1.</p>'; return; }
      var row = function (x) { return H.li(U.teamChip(x.t, { link: 1 }), '<span class="num">' + x.r.W + '-' + x.r.L + '-' + x.r.T + '</span> · ' + U.pct(x.p)); };
      box.innerHTML = '<h4 class="mw-h">You own</h4>' + H.list(rows.slice(0, 3).map(row)) + '<h4 class="mw-h">They have your number</h4>' + H.list(rows.slice(-3).reverse().map(row));
    } });
  reg('topassets', { name: 'My most valuable assets', ic: '💎', cat: 'team', team: 1, ns: [5, 8, 12], n: 6, desc: 'Your players and picks by dynasty value, with the 30-day trend.', link: function () { return '#/values'; },
    render: function (box, o, t) {
      var E = DP.E, P = H.roster(t).map(function (p) { return { p: p, v: p.DV || 0 }; }).concat(E.picksOf(t).map(function (pk) { return { pk: pk, v: E.pickValue(pk) }; })).sort(function (a, b) { return b.v - a.v; }).slice(0, o.n || 6);
      box.innerHTML = H.list(P.map(function (x) { return H.li(x.p ? ui.plink(x.p) + ' <span data-vt="' + esc(x.p.id) + '"></span>' : '🎟️ ' + esc(E.pickLabel(x.pk)) + ' pick', '<b class="num">' + U.fmt(x.v, 1) + '</b>'); }));
      if (DP.fillValueTrends) DP.fillValueTrends(box);
    } });
  reg('trophies', { name: 'Trophy case', ic: '🏅', cat: 'team', team: 1, desc: 'The badges your team has earned this season (perfect weeks, streaks, records, heists...).', link: function () { return '#/trophies'; },
    render: function (box, o, t) { box.innerHTML = '<p class="small muted">Loading…</p>'; if (DP.loadTrophies) DP.loadTrophies(function (T) { if (H.alive(box)) box.innerHTML = DP.trophyHtml(T[t] || []); }); } });
  reg('carriers', { name: 'Category carriers', ic: '🏋️', cat: 'team', team: 1, ns: [1, 2, 3], n: 2, size: 2, desc: 'Who produced your totals in each category this season (locked lineups).', link: function (t) { return '#/team/' + encodeURIComponent(t); },
    render: function (box, o, t) { var ns = H.finished().map(function (w) { return w.n; }); DP.loadWeeks(ns, function (details) { if (H.alive(box) && DP.carriers) box.innerHTML = DP.carriersHtml(DP.carriers(t, details), o.n || 2); }); } });
})();
