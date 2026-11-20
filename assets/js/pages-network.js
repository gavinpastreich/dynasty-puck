/* Dynasty Puck HQ - trade network: who trades with whom, from the Fantrax trade log (every trade since 2025-26).
   A trade among three or four teams links every pair in it. Shown on Trade History and the Team Hub. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;

  DP.tradePairs = function () {
    var E = DP.E, T = (DP.league && DP.league.trades) || [], pair = {}, per = {};
    E.teams.forEach(function (t) { per[t] = 0; });
    T.forEach(function (tr) {
      var ts = tr.teams.filter(function (t) { return per[t] !== undefined; });
      ts.forEach(function (t) { per[t]++; });
      for (var i = 0; i < ts.length; i++) for (var j = i + 1; j < ts.length; j++) {
        var k = [ts[i], ts[j]].sort().join('|');
        (pair[k] = pair[k] || { a: k.split('|')[0], b: k.split('|')[1], n: 0, last: '' }).n++;
        if (tr.date > pair[k].last) pair[k].last = tr.date;
      }
    });
    return { pairs: Object.keys(pair).map(function (k) { return pair[k]; }).sort(function (x, y) { return y.n - x.n || (y.last > x.last ? 1 : -1); }), per: per, trades: T.length, from: T.length ? T.map(function (t) { return t.date; }).sort()[0] : null };
  };
  // one team's partners: [{t, n, last}] (most first) and the teams it has never traded with
  DP.tradePartners = function (t) {
    var N = DP.tradePairs(), out = [];
    N.pairs.forEach(function (p) { if (p.a === t || p.b === t) out.push({ t: p.a === t ? p.b : p.a, n: p.n, last: p.last }); });
    var met = {}; out.forEach(function (x) { met[x.t] = 1; });
    return { with: out, never: DP.E.teams.filter(function (x) { return x !== t && !met[x]; }), total: N.per[t] || 0 };
  };

  DP.tradeNetworkSvg = function (me) {
    var E = DP.E, N = DP.tradePairs(), teams = E.teams.slice().sort(function (a, b) { return (N.per[b] || 0) - (N.per[a] || 0); });
    // order around the circle: busiest first, alternating sides, so the busy teams spread out
    var W = 660, H = 450, cx = W / 2, cy = H / 2, R = 165, pos = {}, k = teams.length;
    teams.forEach(function (t, i) { var a = -Math.PI / 2 + 2 * Math.PI * (i % 2 ? k - (i + 1) / 2 : i / 2) / k; pos[t] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a: a }; });
    var mx = Math.max.apply(null, N.pairs.map(function (p) { return p.n; }).concat([1]));
    var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="tnet" role="img" aria-label="Who trades with whom">';
    N.pairs.slice().reverse().forEach(function (p) {
      var A = pos[p.a], B = pos[p.b]; if (!A || !B) return;
      var mine = me && (p.a === me || p.b === me), qx = cx + (A.x + B.x - 2 * cx) * 0.25, qy = cy + (A.y + B.y - 2 * cy) * 0.25;
      h += '<path d="M' + A.x.toFixed(1) + ',' + A.y.toFixed(1) + ' Q' + qx.toFixed(1) + ',' + qy.toFixed(1) + ' ' + B.x.toFixed(1) + ',' + B.y.toFixed(1) + '" class="te' + (mine ? ' mine' : me ? ' dim' : '') + '" stroke-width="' + (1.2 + 4.8 * p.n / mx).toFixed(1) + '"><title>' + esc(U.teamName(p.a)) + ' and ' + esc(U.teamName(p.b)) + ': ' + p.n + ' trade' + (p.n > 1 ? 's' : '') + ' (last ' + esc(U.date(new Date(p.last + 'T12:00:00Z'))) + ')</title></path>';
    });
    teams.forEach(function (t) {
      var P = pos[t], r = 13 + Math.min(9, (N.per[t] || 0) * 0.9), lx = cx + (R + r + 10) * Math.cos(P.a), ly = cy + (R + r + 10) * Math.sin(P.a), anc = Math.cos(P.a) > 0.25 ? 'start' : Math.cos(P.a) < -0.25 ? 'end' : 'middle';
      h += '<a href="#/team/' + encodeURIComponent(t) + '"><g class="tn' + (t === me ? ' mine' : '') + '"><title>' + esc(U.teamName(t)) + ': ' + (N.per[t] || 0) + ' trades</title><circle cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + U.teamColor(t) + '"/>' +
        '<text x="' + P.x.toFixed(1) + '" y="' + (P.y + 4).toFixed(1) + '" text-anchor="middle" class="tab">' + esc(U.teamAbbr(t)) + '</text>' +
        '<text x="' + lx.toFixed(1) + '" y="' + (ly + (Math.sin(P.a) > 0.5 ? 10 : Math.sin(P.a) < -0.5 ? -2 : 4)).toFixed(1) + '" text-anchor="' + anc + '" class="tl">' + esc(U.teamName(t)) + ' <tspan class="tc">' + (N.per[t] || 0) + '</tspan></text></g></a>';
    });
    return h + '</svg>';
  };

  DP.tradeNetworkCard = function (me) {
    var N = DP.tradePairs(); if (!N.trades) return '';
    var top = N.pairs.slice(0, 5), P = me ? DP.tradePartners(me) : null;
    var h = '<div class="card" id="th-net" style="margin-top:14px"><h2>🕸️ Who trades with whom</h2><div class="hint">Every trade in the Fantrax log since ' + esc(U.date(new Date(N.from + 'T12:00:00Z'))) + ' (' + N.trades + ' trades). A line joins two teams that traded; thicker = more trades. A 3- or 4-team trade links every pair in it. The number after a name is its trades.' + (me ? ' Your lines are highlighted.' : '') + '</div>';
    h += '<div class="tnet-wrap">' + DP.tradeNetworkSvg(me) + '<div class="tnet-side small"><h3 class="small">Most frequent partners</h3><ul class="list-plain">' + top.map(function (p) { return '<li>' + U.teamChip(p.a, { link: 1 }) + ' &amp; ' + U.teamChip(p.b, { link: 1 }) + '<span class="num muted" style="margin-left:auto">' + p.n + '</span></li>'; }).join('') + '</ul>';
    if (P) h += '<h3 class="small" style="margin-top:12px">' + esc(U.teamName(me)) + '</h3><p>' + (P.with.length ? 'Traded with ' + P.with.map(function (x) { return esc(U.teamName(x.t)) + ' (' + x.n + ')'; }).join(', ') + '.' : 'No trades yet.') + (P.never.length ? ' <span class="muted">Never: ' + P.never.map(function (t) { return esc(U.teamName(t)); }).join(', ') + '.</span>' : '') + '</p>';
    return h + '</div></div></div>';
  };
})();
