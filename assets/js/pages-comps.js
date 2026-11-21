/* Dynasty Puck HQ - Historical comps on player pages (data/comps.js, built nightly by write_comps in
   tools/build_data.py): the eight NHL seasons since 2016-17 most like a skater's last full season, one per player, by
   players of the same position and about the same age (within a year). Similarity = distance between per-game rates
   in our categories and ice time, each relative to the league that season (z-scored), plus half a unit per year of
   age difference. Then what those players did: points per game in the next two seasons (-1 = under 20 games or out of
   the NHL, null = not played yet). A record of what happened to similar players, not a projection. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;

  DP.loadComps = function (done) {
    if (DP.comps) return done(DP.comps);
    var s = document.createElement('script');
    s.src = 'data/comps.js';
    s.onload = function () { done(DP.comps || null); }; s.onerror = function () { done(null); };
    document.head.appendChild(s);
  };

  // next season against the comp season (points per game): {known, up (+20%), down (-20%), out, med (ratio)}
  DP.compSummary = function (c) {
    var rs = [], o = { known: 0, up: 0, down: 0, out: 0, med: null };
    (c && c.c || []).forEach(function (r) {
      var base = r[3], nx = r[4];
      if (nx === null || nx === undefined) return;
      o.known++;
      if (nx === -1) { o.out++; return; }
      if (!(base > 0)) return;
      var q = nx / base; rs.push(q);
      if (q >= 1.2) o.up++; else if (q <= 0.8) o.down++;
    });
    rs.sort(function (a, b) { return a - b; });
    if (rs.length) o.med = rs.length % 2 ? rs[(rs.length - 1) / 2] : (rs[rs.length / 2 - 1] + rs[rs.length / 2]) / 2;
    return o;
  };

  var byNhl = null, byNhlV = null;
  function current(nid) {
    var E = DP.E;
    if (!byNhl || byNhlV !== E.version) { byNhl = {}; byNhlV = E.version; E.P.forEach(function (q) { if (q.nhl) byNhl[q.nhl] = q; }); }
    return byNhl[nid] || null;
  }
  var chg = function (q) { return (q >= 1 ? '+' : '−') + Math.abs(Math.round((q - 1) * 100)) + '%'; };
  function cell(base, v) {
    if (v === null || v === undefined) return '<span class="faint">not yet</span>';
    if (v === -1) return '<span class="bad">under 20 GP</span>';
    var q = base > 0 ? v / base : 1;
    return U.fmt(v, 2) + ' <span class="small ' + (q >= 1.2 ? 'good' : q <= 0.8 ? 'bad' : 'muted') + '">' + chg(q) + '</span>';
  }

  DP.compsCard = function (p, el) {
    if (!p || p.G || !el) return;
    var holder = document.createElement('div'); holder.className = 'comps-holder'; el.appendChild(holder);
    DP.loadComps(function (C) {
      var c = C && C.by && C.by[p.id]; if (!c || !document.body.contains(holder)) return;
      var S = DP.compSummary(c), last = U.season(C.base);
      var rows = c.c.map(function (r) {
        var q = current(r[0]), nm = C.names[r[0]] || String(r[0]);
        return '<tr><td>' + (q ? ui.plink(q) : esc(nm)) + '</td><td class="nw">' + esc(U.season(r[1])) + ' <span class="faint small">' + r[2] + 'y' + (r[6] ? ' · ' + esc(r[6]) : '') + '</span></td><td class="num">' + U.fmt(r[3], 2) + '</td><td class="num nw">' + cell(r[3], r[4]) + '</td><td class="num nw">' + cell(r[3], r[5]) + '</td></tr>';
      }).join('');
      holder.innerHTML = '<div class="card" style="margin-top:14px"><h2>📜 History: seasons like his</h2><div class="hint">The ' + c.c.length + ' NHL seasons since ' + esc(U.season(C.seasons[0])) + ' most like his ' + esc(last) + ' (' + U.fmt(c.pts, 2) + ' points a game in ' + c.gp + ' games at ' + c.age + '): same position, age within a year, per-game rates in our categories and ice time, each relative to the league that season. What those players did next is a record, not a projection.</div>' +
        '<p class="small">The next season: ' + (S.med === null ? '' : 'median <b class="' + (S.med >= 1.05 ? 'good' : S.med <= 0.95 ? 'bad' : '') + '">' + chg(S.med) + '</b> in points per game; ') + '<b class="good">' + S.up + '</b> rose 20%+, <b class="bad">' + S.down + '</b> fell 20%+' + (S.out ? ', <b class="bad">' + S.out + '</b> played under 20 games or left the NHL' : '') + ' (of ' + S.known + ').</p>' +
        '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Historical comparables"><table class="t small"><thead><tr><th>Player</th><th>Season</th><th class="num" title="Points per game that season">P/GP</th><th class="num">Next season</th><th class="num">Two seasons on</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    });
  };
})();
