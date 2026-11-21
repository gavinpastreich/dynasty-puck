/* Dynasty Puck HQ - Historical comps on player pages (data/comps.js, built nightly by write_comps in
   tools/build_data.py): the eight NHL seasons since 2016-17 most like a player's last full season (goalies: by save %,
   wins a game and workload; outcome = save %), one per player, by
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

  // next season against the comp season: skaters {known, up (+20% points per game), down (-20%), out, med (ratio)};
  // goalies (c.g) the same in save % points: up = +.005 or more, down = -.005 or more, med = the median difference
  DP.compSummary = function (c) {
    var rs = [], o = { known: 0, up: 0, down: 0, out: 0, med: null, g: !!(c && c.g) };
    (c && c.c || []).forEach(function (r) {
      var base = r[3], nx = r[4];
      if (nx === null || nx === undefined) return;
      o.known++;
      if (nx === -1) { o.out++; return; }
      if (o.g) { var dv = nx - base; rs.push(dv); if (dv >= 0.005) o.up++; else if (dv <= -0.005) o.down++; return; }
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
  // goalie values are save % above the league's that season: +.008 = eight more saves per 1,000 shots than average
  var svs = function (v) { return v.toFixed(3).replace(/^0/, ''); }, svd = function (d) { return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(3).replace(/^0/, ''); };
  function cell(base, v, g) {
    if (v === null || v === undefined) return '<span class="faint">not yet</span>';
    if (v === -1) return '<span class="bad">under 20 GP</span>';
    if (g) { var d = v - base; return svd(v) + ' <span class="small ' + (d >= 0.005 ? 'good' : d <= -0.005 ? 'bad' : 'muted') + '">' + svd(d) + '</span>'; }
    var q = base > 0 ? v / base : 1;
    return U.fmt(v, 2) + ' <span class="small ' + (q >= 1.2 ? 'good' : q <= 0.8 ? 'bad' : 'muted') + '">' + chg(q) + '</span>';
  }

  DP.compsCard = function (p, el) {
    if (!p || !el) return;
    var holder = document.createElement('div'); holder.className = 'comps-holder'; el.appendChild(holder);
    DP.loadComps(function (C) {
      var c = C && C.by && C.by[p.id]; if (!c || !document.body.contains(holder)) return;
      var S = DP.compSummary(c), last = U.season(C.base), G = !!c.g, num = function (v) { return G ? svd(v) : U.fmt(v, 2); };
      var rows = c.c.map(function (r) {
        var q = current(r[0]), nm = C.names[r[0]] || String(r[0]);
        return '<tr><td>' + (q ? ui.plink(q) : esc(nm)) + '</td><td class="nw">' + esc(U.season(r[1])) + ' <span class="faint small">' + r[2] + 'y' + (r[6] ? ' · ' + esc(r[6]) : '') + '</span></td><td class="num">' + num(r[3]) + '</td><td class="num nw">' + cell(r[3], r[4], G) + '</td><td class="num nw">' + cell(r[3], r[5], G) + '</td></tr>';
      }).join('');
      holder.innerHTML = '<div class="card" style="margin-top:14px"><h2>📜 History: seasons like his</h2><div class="hint">The ' + c.c.length + ' NHL seasons since ' + esc(U.season(C.seasons[0])) + ' most like his ' + esc(last) + ' (' + (G ? svs(c.sv) + ' save %, ' + svd(c.svr) + ' vs the league' : U.fmt(c.pts, 2) + ' points a game') + ' in ' + c.gp + ' games at ' + c.age + '): ' + (G ? 'goalies within a year of his age, by save % and wins a game (each relative to the league that season) and workload; save % is shown against the league\'s that season, so a league-wide drop doesn\'t look like decline' : 'same position, age within a year, per-game rates in our categories and ice time, each relative to the league that season') + '. What those players did next is a record, not a projection.</div>' +
        '<p class="small">The next season: ' + (S.med === null ? '' : G ? 'median <b class="' + (S.med >= 0.003 ? 'good' : S.med <= -0.003 ? 'bad' : '') + '">' + svd(S.med) + '</b> in save %; ' : 'median <b class="' + (S.med >= 1.05 ? 'good' : S.med <= 0.95 ? 'bad' : '') + '">' + chg(S.med) + '</b> in points per game; ') + '<b class="good">' + S.up + '</b> ' + (G ? 'improved by .005+' : 'rose 20%+') + ', <b class="bad">' + S.down + '</b> ' + (G ? 'dropped by .005+' : 'fell 20%+') + (S.out ? ', <b class="bad">' + S.out + '</b> played under 20 games or left the NHL' : '') + ' (of ' + S.known + ').</p>' +
        '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Historical comparables"><table class="t small"><thead><tr><th>Player</th><th>Season</th><th class="num" title="' + (G ? 'Save % minus the league\'s that season' : 'Points per game that season') + '">' + (G ? 'SV% vs lg' : 'P/GP') + '</th><th class="num">Next season</th><th class="num">Two seasons on</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    });
  };
})();
