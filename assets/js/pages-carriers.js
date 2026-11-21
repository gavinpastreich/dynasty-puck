/* Dynasty Puck HQ - Category carriers: for each team, which players produced its totals in each category this season,
   from the locked lineups' weekly lines (data/weeks/wNN.js, the lines that counted). Goalies: wins, shutouts and saves
   (the save-% and GAA categories are ratios, so saves and goals against are shown instead). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  // category -> how to read it from a weekly line (skater: [GP, G, A, PIM, SOG, STP, Hit, Blk, Tk, Cor]; goalie: [GP, W, GA, SA, SHO, TOI])
  var SK = [['PtD', function (l, p) { return p.pos === 'D' ? l[1] + l[2] : 0; }], ['G', function (l) { return l[1]; }], ['A', function (l) { return l[2]; }], ['GA2', function (l) { return 2 * l[1] + l[2]; }],
    ['PIM', function (l) { return l[3]; }], ['SOG', function (l) { return l[4]; }], ['STP', function (l) { return l[5]; }], ['Hit', function (l) { return l[6]; }], ['Blk', function (l) { return l[7]; }], ['Tk', function (l) { return l[8]; }], ['Cor', function (l) { return l[9]; }]];
  var GK = [['W', function (l) { return l[1]; }], ['SHO', function (l) { return l[4]; }], ['Saves', function (l) { return l[3] - l[2]; }]];

  DP.carriers = function (t, details) {
    var E = DP.E, by = {}, weeks = 0;
    (details || []).forEach(function (W) {
      var T = W && W.teams && W.teams[t]; if (!T) return;
      weeks++;
      (T.active || []).forEach(function (id) {
        var l = (T.pl || {})[id], p = E.byId[id]; if (!l || !p) return;
        (p.G ? GK : SK).forEach(function (k) { var v = k[1](l, p) || 0; if (!v) return; var o = by[k[0]] || (by[k[0]] = { tot: 0, ps: {} }); o.tot += v; o.ps[id] = (o.ps[id] || 0) + v; });
      });
    });
    var out = SK.concat(GK).map(function (k) {
      var o = by[k[0]] || { tot: 0, ps: {} }, ps = Object.keys(o.ps).map(function (id) { return { p: E.byId[id], v: o.ps[id], share: o.tot ? o.ps[id] / o.tot : 0 }; }).sort(function (a, b) { return b.v - a.v; });
      var cat = E.CATS.filter(function (c) { return c.k === k[0]; })[0];
      return { k: k[0], l: cat ? cat.l : k[0], tot: o.tot, ps: ps };
    });
    return { weeks: weeks, cats: out };
  };
  DP.carriersHtml = function (C, n) {
    if (!C.weeks) return '<p class="small muted">After the first week.</p>';
    return '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Cat</th><th class="num">Total</th><th>Carried by</th></tr></thead><tbody>' + C.cats.map(function (c) {
      return '<tr><td><b>' + esc(c.l) + '</b></td><td class="num">' + U.fmt(c.tot, c.k === 'Cor' ? 1 : 0) + '</td><td>' + (c.ps.length ? c.ps.slice(0, n || 3).map(function (x) { return ui.plink(x.p) + ' <span class="faint">' + U.pct(x.share) + '</span>'; }).join(', ') : '<span class="faint">–</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  };
})();
