/* Dynasty Puck HQ - category correlation map (Category Insights): which of our skater categories come together in the
   same players. Pearson correlation of per-game rates from the 2026-27 projections (the rest-of-season blend once games
   are played), over the best forwards (or defensemen) by projected WAR with 20+ projected games: the top 12 forwards
   and 6 defensemen per team x 14 = the pool that fills lineups. A high correlation means you get both from the same players (punting one
   costs you the other too); a negative one means they pull against each other. Per game, so ice time drives part of it:
   players who play more do more of everything. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  // per-game rate of each category from the projection (p26 order: GP, PtD, G, A, PIM, SOG, STP, Hit, Blk, Tk, Cor)
  var KEYS = [['G', 2], ['A', 3], ['GA2', -1], ['PIM', 4], ['SOG', 5], ['STP', 6], ['Hit', 7], ['Blk', 8], ['Tk', 9], ['Cor', 10]];
  DP.CATMAP_KEYS = KEYS;
  function rate(p, k) { var a = p.p26, gp = a[0]; if (!(gp > 0)) return null; return k[1] < 0 ? (2 * a[2] + a[3]) / gp : a[k[1]] / gp; }
  function corr(x, y) {
    var n = x.length, mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    for (i = 0; i < n; i++) { var dx = x[i] - mx, dy = y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  }
  DP.pearson = corr;

  // {pos, n, keys, m: [[r]], pairs: [{a, b, r}] strongest first}
  DP.catCorr = function (pos) {
    var E = DP.E, D = pos === 'D', per = D ? 6 : 12;
    var pool = E.P.filter(function (p) { return !p.G && (p.pos === 'D') === D && p.p26 && p.p26[0] >= 20; }).sort(function (a, b) { return (b.WAR || 0) - (a.WAR || 0); }).slice(0, per * E.teams.length);
    var cols = KEYS.map(function (k) { return pool.map(function (p) { return rate(p, k); }); });
    var m = KEYS.map(function (_, i) { return KEYS.map(function (__, j) { return i === j ? 1 : corr(cols[i], cols[j]); }); });
    var pairs = [];
    KEYS.forEach(function (a, i) { KEYS.forEach(function (b, j) { if (j > i && !(a[0] === 'GA2' && (b[0] === 'G' || b[0] === 'A')) && !(b[0] === 'GA2' && (a[0] === 'G' || a[0] === 'A'))) pairs.push({ a: a[0], b: b[0], r: m[i][j] }); }); });
    pairs.sort(function (x, y) { return Math.abs(y.r) - Math.abs(x.r); });
    return { pos: D ? 'D' : 'F', n: pool.length, keys: KEYS.map(function (k) { return k[0]; }), m: m, pairs: pairs };
  };

  DP.catCorrCard = function (pos) {
    var E = DP.E, C = DP.catCorr(pos), lab = {}; E.CATS.forEach(function (c) { lab[c.k] = c.l; });
    var pos2 = C.pos === 'D' ? 'defensemen' : 'forwards', top = C.pairs.filter(function (x) { return x.r > 0; }).slice(0, 3), neg = C.pairs.filter(function (x) { return x.r < -0.1; }).slice(0, 2);
    var cell = function (r) { var a = Math.min(1, Math.abs(r)); return '<td class="ccm" style="--a:' + a.toFixed(2) + ';--c:' + (r >= 0 ? 'var(--link)' : 'var(--bad)') + '" title="' + U.fmt(r, 2) + '">' + (r === 1 ? '' : Math.round(r * 100)) + '</td>'; };
    return '<div class="card" style="margin-top:14px"><h2>🧬 Which categories come together</h2><div class="hint">Correlation of per-game rates across the ' + C.n + ' ' + pos2 + ' who fill our lineups (projections): 100 = always together, 0 = unrelated, negative = they pull against each other. ' +
      'Strongest: ' + top.map(function (x) { return '<b>' + esc(lab[x.a]) + ' + ' + esc(lab[x.b]) + '</b> ' + Math.round(x.r * 100); }).join(', ') + (neg.length ? '. Against each other: ' + neg.map(function (x) { return esc(lab[x.a]) + ' / ' + esc(lab[x.b]) + ' ' + Math.round(x.r * 100); }).join(', ') : '') + '. Punting a category costs you the ones that travel with it.</div>' +
      '<div class="controls"><div class="seg" role="group" aria-label="Position"><button data-ccpos="F" class="' + (C.pos === 'F' ? 'on' : '') + '">Forwards</button><button data-ccpos="D" class="' + (C.pos === 'D' ? 'on' : '') + '">Defense</button></div></div>' +
      '<div class="tbl-wrap"><table class="t small ccmap"><thead><tr><th></th>' + C.keys.map(function (k) { return '<th class="num">' + esc(lab[k]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      C.keys.map(function (k, i) { return '<tr><th>' + esc(lab[k]) + '</th>' + C.m[i].map(cell).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="small muted">Pearson correlation × 100 of projected per-game rates (rest-of-season blend). Per game, so ice time lifts many pairs: players who play more do more of everything. 2G+A is built from goals and assists, so it tracks both by construction.</p></div>';
  };
})();
