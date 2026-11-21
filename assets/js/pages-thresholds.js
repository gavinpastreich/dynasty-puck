/* Dynasty Puck HQ - what wins each category (Category Insights): every team-week this season (the weekly category
   totals, E.history), counting categories scaled to a 7-day week (week 1 had 6 days, week 19 has 14), ratio categories
   (GAA, SV%) as they are. The 25th / 50th / 75th / 90th percentile of those totals are how much of a category beats a
   quarter, half, three quarters and nine tenths of the league's weeks. A team's own average and the share of team-weeks
   it beats (all-play) sit next to them. Weeks a team missed the goalie minimum are left out of the goalie categories. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  var Q = [0.25, 0.5, 0.75, 0.9];

  function pctile(sorted, q) { if (!sorted.length) return null; var i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  // share of values x beats (ties count half); low = lower wins
  function beats(vals, x, low) { var w = 0; vals.forEach(function (v) { if (v === x) w += 0.5; else if (low ? x < v : x > v) w += 1; }); return vals.length ? w / vals.length : null; }
  DP.pctile = pctile;

  DP.catThresholds = function () {
    var E = DP.E, H = E.history(), W = H.weeks.filter(function (w) { return w.games && w.games.length; }), minGP = E.RULES.goalieMinGP || 2;
    var vals = E.CATS.map(function () { return []; }), byTeam = {};
    E.teams.forEach(function (t) { byTeam[t] = E.CATS.map(function () { return []; }); });
    W.forEach(function (w) {
      var wk = E.weeks[w.n - 1], days = wk ? E.dayIndex(wk.end) - E.dayIndex(wk.start) + 1 : 7, f = 7 / Math.max(1, days);
      E.teams.forEach(function (t) {
        var v = w.vec[t]; if (!v) return;
        E.CATS.forEach(function (c, i) {
          var x = v[i]; if (x === null || x === undefined || isNaN(x)) return;
          if (c.grp === 'G' && v.ggp < minGP) return;
          x = c.ratio ? x : x * f;
          vals[i].push(x); byTeam[t][i].push(x);
        });
      });
    });
    var cats = E.CATS.map(function (c, i) {
      var s = vals[i].slice().sort(function (a, b) { return a - b; });
      var q = Q.map(function (p) { return pctile(s, c.low ? 1 - p : p); });
      return { c: c, i: i, n: s.length, q: q, vals: vals[i] };
    });
    return { weeks: W.length, cats: cats, team: function (t) {
      return cats.map(function (o) { var v = byTeam[t][o.i]; if (!v.length) return { avg: null, beat: null }; var avg = E.sum(v) / v.length; return { avg: avg, beat: beats(o.vals, avg, o.c.low) }; });
    } };
  };

  DP.catThresholdCard = function (me) {
    var E = DP.E, T = DP.catThresholds(); if (!T.weeks) return '';
    var mine = me && E.rosters[me] ? T.team(me) : null;
    var fmt = function (c, x) { if (x === null || x === undefined) return '–'; return c.k === 'SV' ? U.rate(x) : c.k === 'GAA' ? x.toFixed(2) : U.fmt(x, x < 10 ? 1 : 0); };
    return '<div class="card flush" style="margin-top:14px"><h2 style="padding:12px 14px 0">🎯 What wins each category</h2><div class="hint" style="padding:0 14px">How much of each category a team piles up in a week, from all ' + T.weeks * E.teams.length + ' team-weeks this season (counting stats scaled to 7 days). The median wins about half your matchups; the 75th percentile wins about three in four.' + (mine ? ' Your average and the share of team-weeks it beats are on the right.' : '') + '</div>' +
      '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Category</th><th class="num" title="Beats a quarter of team-weeks">25%</th><th class="num" title="The median: beats half">Median</th><th class="num" title="Beats three quarters">75%</th><th class="num" title="Beats nine in ten">90%</th>' + (mine ? '<th class="num">You</th><th class="num" title="Share of all team-weeks your average beats">Beats</th>' : '') + '</tr></thead><tbody>' +
      T.cats.map(function (o, i) {
        var m = mine ? mine[i] : null;
        return '<tr><td title="' + esc(o.c.name) + '">' + esc(o.c.l) + (o.c.low ? ' <span class="faint small">(low wins)</span>' : '') + '</td>' + o.q.map(function (x, j) { return '<td class="num">' + (j === 1 ? '<b>' + fmt(o.c, x) + '</b>' : fmt(o.c, x)) + '</td>'; }).join('') +
          (mine ? '<td class="num">' + fmt(o.c, m.avg) + '</td><td class="num">' + (m.beat === null ? '–' : '<span class="' + (m.beat >= 0.6 ? 'good' : m.beat <= 0.4 ? 'bad' : '') + '">' + U.pct(m.beat) + '</span>') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div><p class="small muted" style="padding:0 14px 12px">From the weekly results. Weeks a team missed the ' + (E.RULES.goalieMinGP || 2) + '-game goalie minimum are left out of the goalie categories. Ratio categories (GAA, SV%) are not scaled.</p></div>';
  };
})();
