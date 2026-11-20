/* Dynasty Puck HQ - Rivalries: the standings race (every team's place week by week) and the all-play head-to-head matrix
   (each team's weekly category totals against every other team's, every week played: who has whose number).
   Everything comes from the real weekly results (E.history()). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function weeksPlayed() { var H = DP.E.history(); return { H: H, W: H.weeks.filter(function (w) { return w.games && w.games.length; }) }; }

  // place after each week for every team (rebuilt from the weekly results, like The Weekly)
  DP.raceData = function () {
    var X = weeksPlayed(), E = DP.E;
    var place = {}; E.teams.forEach(function (t) { place[t] = []; });
    X.W.forEach(function (w) { var S = DP._weekly.standingsAfter(X.H, w.n); E.teams.forEach(function (t) { place[t].push(S.by[t].rank); }); });
    return { weeks: X.W.map(function (w) { return w.n; }), place: place };
  };
  DP.bumpChart = function (me) {
    var R = DP.raceData(), E = DP.E, n = R.weeks.length, nT = E.teams.length;
    if (n < 2) return '<p class="muted small">The race chart starts after week 2.</p>';
    var W = 900, H = 420, padL = 34, padR = 132, padT = 14, padB = 26;
    var px = function (i) { return padL + i / (n - 1) * (W - padL - padR); }, py = function (r) { return padT + (r - 1) / (nT - 1) * (H - padT - padB); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bump" role="img" aria-label="Standings place by week, every team">';
    for (var r = 1; r <= nT; r++) s += '<text class="axis" x="' + (padL - 8) + '" y="' + (py(r) + 4) + '" text-anchor="end">' + r + '</text>';
    var po = (DP.meta.playoffs || {}).teams || 8;
    s += '<line class="gridl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + ((py(po) + py(po + 1)) / 2) + '" y2="' + ((py(po) + py(po + 1)) / 2) + '" stroke-dasharray="4 4"/>';
    R.weeks.forEach(function (wn, i) { s += '<text class="axis" x="' + px(i) + '" y="' + (H - 6) + '" text-anchor="middle">W' + wn + '</text>'; });
    // my team last, so it is drawn on top
    E.teams.slice().sort(function (a, b) { return (a === me) - (b === me); }).forEach(function (t) {
      var col = U.teamColor(t), pl = R.place[t], d = pl.map(function (rk, i) { return (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(rk).toFixed(1); }).join('');
      var tip = '<div class="tv">' + esc(U.teamName(t)) + '</div><div class="tl">' + pl.map(function (rk, i) { return 'W' + R.weeks[i] + ' ' + U.ord(rk); }).join(' · ') + '</div>';
      s += '<g class="bl' + (t === me ? ' me' : '') + '" data-tip="' + esc(tip) + '"><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (t === me ? 4.5 : 3) + '" stroke-linejoin="round" stroke-linecap="round"/>' +
        pl.map(function (rk, i) { return '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(rk).toFixed(1) + '" r="' + (t === me ? 5 : 3.6) + '" fill="' + col + '"/>'; }).join('') +
        '<text x="' + (W - padR + 10) + '" y="' + (py(pl[n - 1]) + 4) + '" style="fill:' + col + ';font-size:12px;font-weight:' + (t === me ? 800 : 600) + '">' + esc(U.ord(pl[n - 1]) + ' ' + trunc(U.teamName(t), 15)) + '</text></g>';
    });
    return '<div class="chart">' + s + '</svg></div>';
  };
  function trunc(x, k) { x = String(x); return x.length > k ? x.slice(0, k - 1) + '…' : x; }

  // all-play head to head: for each pair, every week played, each team's 15 category totals against the other's
  DP.allPlayH2H = function () {
    var X = weeksPlayed(), E = DP.E, T = E.teams, M = {};
    T.forEach(function (a) { M[a] = {}; T.forEach(function (b) { if (a !== b) M[a][b] = { W: 0, L: 0, T: 0, wk: [0, 0, 0] }; }); });
    X.W.forEach(function (w) {
      T.forEach(function (a) {
        T.forEach(function (b) {
          if (a >= b) return;
          var r = E.catResults(w.vec[a], w.vec[b]), x = [0, 0, 0, 0];   // W, L, T, lost by both (goalie minimum)
          r.forEach(function (v) { if (v === 1) x[0]++; else if (v === -1) x[1]++; else if (v === 0) x[2]++; else x[3]++; });
          var A = M[a][b], B = M[b][a];
          A.W += x[0]; A.L += x[1] + x[3]; A.T += x[2]; B.W += x[1]; B.L += x[0] + x[3]; B.T += x[2];
          var k = x[0] > x[1] ? 0 : x[0] < x[1] ? 1 : 2; A.wk[k]++; B.wk[k === 2 ? 2 : 1 - k]++;
        });
      });
    });
    T.forEach(function (a) { T.forEach(function (b) { if (a !== b) { var c = M[a][b], n = c.W + c.L + c.T; c.pct = n ? (c.W + c.T / 2) / n : null; } }); });
    // the meetings that really happened
    var real = []; X.W.forEach(function (w) { w.games.forEach(function (g) { real.push({ n: w.n, a: g.a, b: g.b, sa: g.sa, sb: g.sb }); }); });
    return { M: M, weeks: X.W.length, real: real };
  };

  DP.pages.rivals = {
    title: 'Rivalries',
    render: function (el) {
      var E = DP.E, me = DP.state.team, A = DP.allPlayH2H(), T = E.teams;
      var h = '<div class="page-head"><h1>⚔️ Rivalries</h1><p class="sub">The standings race week by week, and every pair of teams compared as if they had played each other every week: each team\'s real weekly category totals against the other\'s, all ' + A.weeks + ' weeks played. Who has whose number, from the real results.</p></div>';
      if (!A.weeks) { el.innerHTML = h + '<div class="callout">This starts after week 1.</div>'; return; }
      h += '<div class="card"><h2>📈 The standings race</h2><div class="hint">Place after each week (category win %, rebuilt from the weekly results). Dashed line = the playoff cut. Hover a line for a team\'s path' + (me ? '; yours is the thick one' : '') + '.</div>' + DP.bumpChart(me) + '</div>';
      if (me) {
        var opp = T.filter(function (t) { return t !== me; }).map(function (t) { return { t: t, c: A.M[me][t] }; }).sort(function (a, b) { return a.c.pct - b.c.pct; });
        var meet = A.real.filter(function (g) { return g.a === me || g.b === me; });
        var row = function (x) { return '<li>' + U.teamChip(x.t, { link: 1 }) + '<span class="small muted" style="margin-left:auto;text-align:right"><b class="num ' + (x.c.pct >= 0.5 ? 'good' : 'bad') + '">' + x.c.W + '-' + x.c.L + '-' + x.c.T + '</b> cats · would be ' + x.c.wk[0] + '-' + x.c.wk[1] + '-' + x.c.wk[2] + ' in weeks</span></li>'; };
        h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>' + U.teamBadge(me) + ' Who has your number</h2><div class="hint">Your weekly totals vs theirs, every week played: the teams you\'d lose to most.</div><ul class="list-plain">' + opp.slice(0, 4).map(row).join('') + '</ul></div>' +
          '<div class="card"><h2>' + U.teamBadge(me) + ' Whose number you have</h2><div class="hint">The teams you\'d beat most often.</div><ul class="list-plain">' + opp.slice(-4).reverse().map(row).join('') + '</ul></div></div>';
        if (meet.length) h += '<div class="card" style="margin-top:14px"><h2>Your real meetings</h2><ul class="list-plain">' + meet.map(function (g) {
          var mine = g.a === me ? g.sa : g.sb, o = g.a === me ? g.b : g.a, res = mine.W > mine.L ? 'W' : mine.W < mine.L ? 'L' : 'T';
          return '<li><span class="wkchip ' + res + '"><span class="wk">W' + g.n + '</span><b>' + res + '</b> <span class="num">' + mine.W + '-' + mine.L + '-' + mine.T + '</span></span> vs ' + U.teamChip(o, { link: 1 }) + '<span class="small muted" style="margin-left:auto">all-play vs them: ' + A.M[me][o].W + '-' + A.M[me][o].L + '-' + A.M[me][o].T + '</span></li>';
        }).join('') + '</ul></div>';
      }
      // the matrix
      var order = T.slice().sort(function (a, b) { var s = function (t) { return E.sum(T.filter(function (u) { return u !== t; }).map(function (u) { return A.M[t][u].pct; })); }; return s(b) - s(a); });
      h += '<div class="card" style="margin-top:14px"><h2>All-play head-to-head</h2><div class="hint">Row team\'s category record against the column team over every week played (W-L in the tooltip). Green = the row team wins that pairing; red = it loses. Teams ordered by overall all-play record.</div><div class="tbl-wrap"><table class="t heat h2hmx"><thead><tr><th></th>' +
        order.map(function (t) { return '<th class="c" title="' + esc(U.teamName(t)) + '">' + U.teamBadge(t, 'sm') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        order.map(function (a) {
          return '<tr class="' + (a === me ? 'mine' : '') + '"><td>' + U.teamChip(a, { link: 1 }) + '</td>' + order.map(function (b) {
            if (a === b) return '<td class="hc self"></td>';
            var c = A.M[a][b], x = c.pct, col = x >= 0.5 ? 'color-mix(in srgb, var(--good) ' + Math.round(Math.min(1, (x - 0.5) * 2.6) * 55) + '%, transparent)' : 'color-mix(in srgb, var(--bad) ' + Math.round(Math.min(1, (0.5 - x) * 2.6) * 55) + '%, transparent)';
            return '<td class="hc" style="background:' + col + '" data-tip="' + esc('<div class="tv">' + U.teamName(a) + ' vs ' + U.teamName(b) + '</div><div class="tl">' + c.W + '-' + c.L + '-' + c.T + ' in categories · weeks ' + c.wk[0] + '-' + c.wk[1] + '-' + c.wk[2] + '</div>') + '">' + Math.round(x * 100) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="small muted">Cell = category win % (ties count half). Built from each week\'s locked-lineup totals; ties and goalie-minimum rules as in the real scoring.</p></div>';
      el.innerHTML = h;
    }
  };
})();
