/* Dynasty Puck HQ - Season Grid: every team's 24-week schedule on one screen. Played weeks show the result (W/L/T and
   the category score, from the weekly results); weeks ahead show the projected chance to win (the same simulation as
   the Weekly Matchup page, optimal lineups by games played, 1,000 weeks each). Remaining schedule strength = the average
   projected chance to win the matchups left. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  DP.pages = DP.pages || {};
  var cache = {};

  DP.gridData = function () {
    var E = DP.E, key = E.version + '|' + ((DP.league.score || {}).asOf || ''); if (cache.k === key) return cache.d;   // live score changes redraw it
    var H = E.history(), played = {}, out = {};
    H.weeks.forEach(function (w) { (w.games || []).forEach(function (g) { played[w.n + '|' + g.a] = { o: g.b, s: g.sa }; played[w.n + '|' + g.b] = { o: g.a, s: g.sb }; }); });
    var from = E.openFrom();
    E.teams.forEach(function (t) { out[t] = []; });
    DP.meta.h2h.forEach(function (m) {
      var n = m[0];
      [[m[1], m[2]], [m[2], m[1]]].forEach(function (pr) {
        var t = pr[0], o = pr[1], p = played[n + '|' + t], cell = { n: n, o: o };
        var sc = DP.league.score;
        if (p) { cell.s = p.s; cell.res = p.s.W > p.s.L ? 'W' : p.s.W < p.s.L ? 'L' : 'T'; }
        else if (sc && sc.week === n && sc.teams && DP.liveOdds) {   // the week being played: the live score, from the Live Scoreboard
          var od = DP.liveOdds(m[1], m[2]), ls = od ? E.liveScore(od) : null;
          if (ls) { var mine = t === m[1]; cell.live = { W: mine ? ls[0] : ls[1], L: mine ? ls[1] : ls[0], p: od.final ? null : (mine ? od.win : od.loss) }; }
        }
        else if (n - 1 >= from && E.baseline[t] && E.baseline[t][n - 1]) {
          var key2 = n + '|' + [t, o].sort().join('|');
          if (!cache[key2] || cache[key2].v !== key) {
            var a = [t, o].sort(), mc = E.simWeek(E.baseline[a[0]][n - 1], E.baseline[a[1]][n - 1], 1000, (n - 1) * 31 + 7);
            cache[key2] = { v: key, a: a[0], win: mc.win, loss: mc.loss };
          }
          var c = cache[key2]; cell.p = c.a === t ? c.win : c.loss;
        }
        out[t].push(cell);
      });
    });
    var rows = E.teams.map(function (t) {
      var cells = out[t].sort(function (a, b) { return a.n - b.n; }), fut = cells.filter(function (c) { return c.p !== undefined; });
      var rec = cells.reduce(function (r, c) { if (c.res) r[c.res]++; return r; }, { W: 0, L: 0, T: 0 });
      return { t: t, cells: cells, rec: rec, sos: fut.length ? E.sum(fut.map(function (c) { return c.p; })) / fut.length : null, left: fut.length };
    });
    cache.k = key; cache.d = { rows: rows, weeks: E.REG_WEEKS || 24 };
    return cache.d;
  };

  DP.pages.fixtures = {
    title: 'Season Grid',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, sort = hsh.q.sort || 'rec';
      var h = '<div class="page-head"><h1>🗓️ Season Grid</h1><p class="sub">Every team\'s whole regular season on one screen: results for the weeks played (green won, red lost, grey tied, with the category score), the week being played with its live score (●) and the projected chance to win each week still ahead (darker = better odds). Projections use today\'s rosters with optimal lineups.</p></div>';
      h += '<div class="controls"><div class="seg">' + [['rec', 'By record'], ['sos', 'Easiest schedule left'], ['name', 'By name']].map(function (s) { return '<button data-sort="' + s[0] + '" class="' + (s[0] === sort ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') + '</div></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Projecting the weeks ahead…</p></div>';
      U.qsa('[data-sort]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('fixtures', null, { sort: b.dataset.sort === 'rec' ? undefined : b.dataset.sort }); }); });
      setTimeout(function () {
        var box = U.qs('.lz', el); if (!box) return;
        var G = DP.gridData(), rows = G.rows.slice();
        rows.sort(sort === 'sos' ? function (a, b) { return (b.sos === null ? -1 : b.sos) - (a.sos === null ? -1 : a.sos); } : sort === 'name' ? function (a, b) { return U.teamName(a.t).localeCompare(U.teamName(b.t)); } : function (a, b) { return (b.rec.W - b.rec.L) - (a.rec.W - a.rec.L) || b.rec.W - a.rec.W; });
        var hh = '<div class="card flush"><div class="tbl-wrap"><table class="t small sgrid"><thead><tr><th>Team</th><th class="num">W-L-T</th><th class="num" title="Average projected chance to win the matchups left">Left</th>' + Array.apply(null, { length: G.weeks }).map(function (_, i) { return '<th class="num">' + (i + 1) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td class="nw">' + U.teamChip(r.t, { link: 1 }) + '</td><td class="num nw">' + r.rec.W + '-' + r.rec.L + '-' + r.rec.T + '</td><td class="num">' + (r.sos === null ? '–' : U.pct(r.sos)) + '</td>' +
              r.cells.map(function (c) {
                var ab = esc(U.teamAbbr(c.o)), tip = esc('Week ' + c.n + ' vs ' + U.teamName(c.o) + (c.res ? ': ' + (c.res === 'W' ? 'won ' : c.res === 'L' ? 'lost ' : 'tied ') + c.s.W + '-' + c.s.L + '-' + c.s.T : c.p !== undefined ? ': ' + U.pct(c.p) + ' to win (projected)' : ''));
                if (c.live) return '<td class="sg LV" title="' + tip + ': live ' + c.live.W + '-' + c.live.L + (c.live.p !== null ? ', ' + U.pct(c.live.p) + ' to win' : '') + '"><a href="#/live"><b>' + ab + '</b><span>' + c.live.W + '-' + c.live.L + ' ●</span></a></td>';
                if (c.res) return '<td class="sg ' + c.res + '" title="' + tip + '"><a href="#/weekly?w=' + c.n + '"><b>' + ab + '</b><span>' + c.s.W + '-' + c.s.L + '</span></a></td>';
                if (c.p !== undefined) return '<td class="sg P" style="--p:' + c.p.toFixed(2) + '" title="' + tip + '"><b>' + ab + '</b><span>' + Math.round(c.p * 100) + '%</span></td>';
                return '<td class="sg" title="' + tip + '"><b>' + ab + '</b></td>';
              }).join('') + '</tr>';
          }).join('') + '</tbody></table></div></div>';
        hh += '<p class="small muted">Hover a cell for the details; click a played week for its recap. "Left" is the average projected chance to win the matchups still to play: higher = an easier road from here.</p>';
        box.innerHTML = hh;
      }, 30);
    }
  };
})();
