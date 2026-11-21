/* Dynasty Puck HQ - Elo & Luck: two models built only from the weekly results.
   Elo: every team starts at 1500; after each week a team gains K x (its share of the 15 categories - the share Elo
   expected), where expected = 1 / (1 + 10^((opponent - team) / 400)) and a tie counts half. K = 32. Results only: no
   projections, so it shows who has been winning, not who should.
   Schedule luck: the category points a team actually got (W + T/2) minus what its weekly totals would have earned on
   average against the other 13 teams that week (all-play). Positive = a kind schedule, negative = a cruel one. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var K = 32, START = 1500;
  DP.ELO = { K: K, START: START };

  DP.eloData = function () {
    var E = DP.E, W = E.history().weeks.filter(function (w) { return w.games && w.games.length; }), R = {}, hist = {}, luck = {};
    E.teams.forEach(function (t) { R[t] = START; hist[t] = [START]; luck[t] = { act: 0, exp: 0, wk: [] }; });
    var log = [];
    W.forEach(function (w) {
      var nR = Object.assign({}, R);
      w.games.forEach(function (g) {
        var ea = 1 / (1 + Math.pow(10, (R[g.b] - R[g.a]) / 400)), sa = (g.sa.W + g.sa.T / 2) / E.NC;
        nR[g.a] = R[g.a] + K * (sa - ea); nR[g.b] = R[g.b] + K * ((1 - sa) - (1 - ea));
        log.push({ n: w.n, a: g.a, b: g.b, ea: ea, sa: sa, res: g.sa.W > g.sa.L ? 1 : g.sa.W < g.sa.L ? 0 : 0.5 });
        [[g.a, g.sa], [g.b, g.sb]].forEach(function (x) {
          var t = x[0], act = x[1].W + x[1].T / 2, exp = w.ap && w.ap[t] ? E.sum(w.ap[t]) : act;
          luck[t].act += act; luck[t].exp += exp; luck[t].wk.push({ n: w.n, act: act, exp: exp, d: act - exp });
        });
      });
      R = nR;
      E.teams.forEach(function (t) { hist[t].push(R[t]); });
    });
    var rows = E.teams.map(function (t) { var h = hist[t]; return { t: t, r: R[t], d1: h.length > 1 ? R[t] - h[h.length - 2] : 0, peak: Math.max.apply(null, h), low: Math.min.apply(null, h), luck: luck[t].act - luck[t].exp, act: luck[t].act, exp: luck[t].exp, wk: luck[t].wk }; }).sort(function (a, b) { return b.r - a.r; });
    rows.forEach(function (x, i) { x.rank = i + 1; });
    // how Elo would have called each week before it was played (matchups from week 2 on): favorite = higher rating
    var called = log.filter(function (x) { return x.n > 1 && x.res !== 0.5; }), right = called.filter(function (x) { return (x.ea >= 0.5) === (x.res === 1); }).length;
    return { rows: rows, by: rows.reduce(function (o, r) { o[r.t] = r; return o; }, {}), hist: hist, weeks: W.map(function (w) { return w.n; }), dates: [E.weeks[0].start].concat(W.map(function (w) { return E.weeks[w.n - 1].end; })), called: called.length, right: right, log: log };
  };
  // Elo's expected category share for a future matchup
  DP.eloExpect = function (a, b) { var D = DP.eloData(); return 1 / (1 + Math.pow(10, (D.by[b].r - D.by[a].r) / 400)); };

  DP.pages.elo = {
    title: 'Elo & Luck',
    render: function (el) {
      var E = DP.E, me = DP.state.team, D = DP.eloData();
      var h = '<div class="page-head"><h1>📐 Elo &amp; Luck</h1><p class="sub">Two models built only from what happened. <b>Elo</b> rates every team from its weekly results (every team started at 1,500; beating a strong team counts more). <b>Schedule luck</b> compares the category points each team actually got with what its numbers would have earned against an average opponent that week.</p></div>';
      if (!D.weeks.length) { el.innerHTML = h + '<div class="callout">After the first week.</div>'; return; }
      var nx = E.lockWeek() === null ? null : E.lockWeek() + 1, NX = nx ? DP.meta.h2h.filter(function (g) { return g[0] === nx; }) : [];
      h += '<div class="grid g2"><div class="card"><h2>Elo ratings after week ' + D.weeks[D.weeks.length - 1] + '</h2><div class="hint">K = ' + K + '; a team\'s share of the 15 categories is its score. Elo picked the winner of ' + D.right + ' of ' + D.called + ' decided matchups from week 2 on, before they were played.</div><ol class="list-plain pwlist">' + D.rows.map(function (r) {
        return '<li class="' + (r.t === me ? 'mine' : '') + '" style="--tc:' + U.teamColor(r.t) + '"><span class="pw-rk num">' + r.rank + '</span><span class="pw-mv small">' + (r.d1 >= 0.5 ? '<span class="good">▲' + Math.round(r.d1) + '</span>' : r.d1 <= -0.5 ? '<span class="bad">▼' + Math.round(-r.d1) + '</span>' : '<span class="faint">–</span>') + '</span><div class="pw-body"><div class="pw-top">' + U.teamChip(r.t, { link: 1 }) + '<b class="num" style="margin-left:auto">' + Math.round(r.r) + '</b></div><div class="small muted">peak ' + Math.round(r.peak) + ' · low ' + Math.round(r.low) + '</div></div></li>';
      }).join('') + '</ol></div>';
      h += '<div class="card"><h2>🍀 Schedule luck</h2><div class="hint">Category points got (W + ½T) minus what the same weekly numbers would have earned against the average opponent (all-play). Over ' + D.weeks.length + ' weeks.</div><div class="tbl-wrap"><table class="t small"><thead><tr><th>Team</th><th class="num">Got</th><th class="num">Expected</th><th class="num">Luck</th><th>Week by week</th></tr></thead><tbody>' +
        D.rows.slice().sort(function (a, b) { return b.luck - a.luck; }).map(function (r) {
          return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td>' + U.teamChip(r.t, { link: 1 }) + '</td><td class="num">' + U.fmt(r.act, 1) + '</td><td class="num">' + U.fmt(r.exp, 1) + '</td><td class="num"><b>' + ui.delta(r.luck, 1) + '</b></td><td><span class="luckbars">' + r.wk.map(function (x) { var hgt = Math.min(14, Math.abs(x.d) * 3); return '<span class="lb ' + (x.d >= 0 ? 'up' : 'dn') + '" style="height:' + Math.max(1, hgt) + 'px" title="Week ' + x.n + ': got ' + x.act + ', expected ' + U.fmt(x.exp, 1) + ' (' + U.sgn(x.d, 1) + ')"></span>'; }).join('') + '</span></td></tr>';
        }).join('') + '</tbody></table></div></div></div>';
      h += '<div class="card" style="margin-top:14px"><h2>Elo through the season</h2><div id="elo-chart"></div></div>';
      if (NX.length) {
        h += '<div class="card" style="margin-top:14px"><h2>Week ' + nx + ': Elo vs the model</h2><div class="hint">Elo\'s expected share of the categories (results only) next to the main model\'s win chance (projections, optimal lineups). When they disagree, one of them is reading something the other misses.</div><ul class="list-plain mwlist">' + NX.map(function (g) {
          var ea = DP.eloExpect(g[1], g[2]), mc = E.simWeek(E.baseline[g[1]][nx - 1], E.baseline[g[2]][nx - 1], 1000, (nx - 1) * 31 + 7), fE = ea >= 0.5 ? g[1] : g[2], fM = mc.win >= mc.loss ? g[1] : g[2];
          return '<li class="' + (g[1] === me || g[2] === me ? 'mine' : '') + '"><span class="mw-l">' + U.teamChip(g[1], { link: 1 }) + ' vs ' + U.teamChip(g[2], { link: 1 }) + '</span><span class="mw-r small">Elo: <b>' + esc(U.teamAbbr(fE)) + '</b> ' + U.pct(Math.max(ea, 1 - ea)) + ' of cats · model: <b>' + esc(U.teamAbbr(fM)) + '</b> ' + U.pct(Math.max(mc.win, mc.loss)) + ' to win' + (fE !== fM ? ' <span class="badge warn">disagree</span>' : '') + '</span></li>';
        }).join('') + '</ul></div>';
      }
      el.innerHTML = h;
      var c = U.qs('#elo-chart', el);
      if (c && DP.teamLinesChart) c.innerHTML = DP.teamLinesChart(D.dates, D.hist, { me: me, step: 25, title: 'Elo rating after each week', fmt: function (v) { return String(Math.round(v)); }, tip: function (t, v) { return Math.round(v[v.length - 1]) + ' now'; } });
    }
  };
})();
