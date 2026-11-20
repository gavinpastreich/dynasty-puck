/* Dynasty Puck HQ - day-by-day flow of a matchup: each day's category totals for both locked lineups
   (data/weeks/dNN.js from tools/build_data.py + tools/scoreboard.py week_days) added up day by day, and the win odds
   after each day from the same simulation as the Live Scoreboard (E.liveOdds: totals so far + the rest of the week
   from projections). Used by the Live Scoreboard (each matchup) and The Weekly (comebacks). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  DP.weekDays = DP.weekDays || {};
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var CHECK = ['G', 'A', 'SOG', 'Hit', 'Blk', 'PIM'];

  DP.loadDays = function (n, done) {
    if (DP.weekDays[n]) return done(DP.weekDays[n]);
    var s = document.createElement('script');
    s.src = 'data/weeks/d' + (n < 10 ? '0' : '') + n + '.js';
    s.onload = function () { done(DP.weekDays[n] || null); }; s.onerror = function () { done(null); };
    document.head.appendChild(s);
  };
  function dates(w) {
    var out = [], t1 = Date.parse(w.end + 'T12:00:00Z');
    for (var t = Date.parse(w.start + 'T12:00:00Z'); t <= t1; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
  }
  // the locked lineup of a team in week n: the week's player-line file, or the live scoreboard for the week in progress
  function locked(n, t) {
    var wd = DP.weekDetail && DP.weekDetail[n], sc = DP.league.score;
    if (wd && wd.teams && wd.teams[t]) return wd.teams[t].active || [];
    if (sc && sc.week === n && sc.teams && sc.teams[t]) return sc.teams[t].active || [];
    return null;
  }
  // { pts: [{ d (null = before the week, 'now' = live), win, loss, tie, ls: [cats a leads, b leads, tied] }], ok }
  DP.matchFlow = function (n, a, b, sims) {
    var E = DP.E, D = DP.weekDays[n], w = E.weeks[n - 1];
    if (!D || !w) return null;
    var A = locked(n, a), B = locked(n, b);
    if (!A || !B) return null;
    var byD = {}; D.days.forEach(function (x) { byD[x.d] = x.teams; });
    var last = D.days.length ? D.days[D.days.length - 1].d : null, ca = {}, cb = {}, pts = [];
    var add = function (c, x) { Object.keys(x || {}).forEach(function (k) { c[k] = (c[k] || 0) + x[k]; }); };
    var at = function (d, to, fin) {
      var sc = { week: n, to: to, final: fin, live: null, hist: true, teams: {} };
      sc.teams[a] = { tot: Object.assign({}, ca), active: A }; sc.teams[b] = { tot: Object.assign({}, cb), active: B };
      var o = E.liveOdds(a, b, sc, sims || 1500), ls = E.liveScore(o);
      if (fin) { // the week is over: score it like the standings (goalie minimum included)
        ls = [0, 0, 0];
        E.catResults(E.weekVec(ca), E.weekVec(cb)).forEach(function (r) { if (r === 1) ls[0]++; else if (r === -1) ls[1]++; else if (r === 0) ls[2]++; });
      }
      pts.push({ d: d, win: o.win, loss: o.loss, tie: o.tie, ls: ls });
    };
    at(null, null, false);
    dates(w).forEach(function (d) {
      if (!last || d > last) return;
      add(ca, (byD[d] || {})[a]); add(cb, (byD[d] || {})[b]);
      at(d, d, d === w.end);
    });
    var sc = DP.league.score, live = sc && sc.week === n && !sc.final && sc.live && sc.live.date > (last || '') && DP.liveOdds;
    if (live) { var o = DP.liveOdds(a, b); if (o) pts.push({ d: 'now', win: o.win, loss: o.loss, tie: o.tie, ls: E.liveScore(o) }); }
    // the days must add up to the week's real totals (a missing day would bend the whole line)
    var H = E.history(), wk = H.weeks.filter(function (x) { return x.n === n; })[0], ok = true;
    if (wk && last === w.end) [[a, ca], [b, cb]].forEach(function (x) { var T = wk.tot[x[0]] || {}; CHECK.forEach(function (k) { if (Math.abs((T[k] || 0) - (x[1][k] || 0)) > 0.01) ok = false; }); });
    return { n: n, a: a, b: b, pts: pts, done: last === w.end, ok: ok, days: dates(w).length };
  };
  // the winner's lowest odds along the way (before the last day's result was in) and where they were
  DP.flowSwing = function (F) {
    var fin = F.pts[F.pts.length - 1], winA = fin.ls[0] > fin.ls[1], winB = fin.ls[1] > fin.ls[0];
    if (!F.done || (!winA && !winB)) return null;
    var low = null;
    F.pts.slice(0, -1).forEach(function (p) { var x = winA ? p.win : p.loss; if (!low || x < low.p) low = { p: x, d: p.d }; });
    return { t: winA ? F.a : F.b, low: low };
  };
  function dayLab(d) { return d === null ? 'Start' : d === 'now' ? 'Now' : DOW[new Date(d + 'T12:00:00Z').getUTCDay()]; }
  DP.flowChart = function (F) {
    var W = 640, H = 190, padL = 46, padR = 46, padT = 12, padB = 40, n = F.days + 1 + (F.pts.length && F.pts[F.pts.length - 1].d === 'now' ? 1 : 0);
    var px = function (i) { return padL + i / Math.max(1, n - 1) * (W - padL - padR); }, py = function (v) { return padT + (1 - v) * (H - padT - padB); };
    var ca = U.teamColor(F.a), cb = U.teamColor(F.b), id = 'fl' + F.n + F.a.replace(/\W/g, '') + F.b.replace(/\W/g, '');
    var pt = F.pts.map(function (p, i) { return [px(i), py(p.win + p.tie / 2)]; });
    var line = pt.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join('');
    var area = line + 'L' + pt[pt.length - 1][0].toFixed(1) + ',' + py(0.5) + 'L' + pt[0][0].toFixed(1) + ',' + py(0.5) + 'Z';
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="flow" role="img" aria-label="' + esc(U.teamName(F.a) + ' win chance after each day') + '">' +
      '<defs><clipPath id="' + id + 'u"><rect x="0" y="0" width="' + W + '" height="' + py(0.5) + '"/></clipPath><clipPath id="' + id + 'd"><rect x="0" y="' + py(0.5) + '" width="' + W + '" height="' + H + '"/></clipPath></defs>' +
      '<line class="gridl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + py(0.5) + '" y2="' + py(0.5) + '" stroke-dasharray="4 4"/>' +
      '<text class="axis" x="' + (padL - 6) + '" y="' + (py(1) + 8) + '" text-anchor="end" style="fill:' + ca + ';font-weight:700">' + esc(U.teamAbbr(F.a)) + '</text>' +
      '<text class="axis" x="' + (padL - 6) + '" y="' + (py(0.5) + 4) + '" text-anchor="end">50%</text>' +
      '<text class="axis" x="' + (padL - 6) + '" y="' + py(0) + '" text-anchor="end" style="fill:' + cb + ';font-weight:700">' + esc(U.teamAbbr(F.b)) + '</text>' +
      '<path d="' + area + '" fill="' + ca + '" opacity=".28" clip-path="url(#' + id + 'u)"/><path d="' + area + '" fill="' + cb + '" opacity=".28" clip-path="url(#' + id + 'd)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linejoin="round"/>';
    F.pts.forEach(function (p, i) {
      var fav = p.win >= p.loss, tip = '<div class="tv">' + esc(p.d === null ? 'Before the week' : p.d === 'now' ? 'Right now' : U.date(new Date(p.d + 'T12:00:00Z'))) + '</div><div class="tl">' + esc(U.teamName(fav ? F.a : F.b)) + ' ' + U.pct(fav ? p.win : p.loss) + ' to win' + (p.tie > 0.005 ? ' · tie ' + U.pct(p.tie) : '') + (p.d === null ? '' : '<br>categories led ' + p.ls[0] + '-' + p.ls[1] + (p.ls[2] ? '-' + p.ls[2] : '')) + '</div>';
      s += '<g data-tip="' + esc(tip) + '"><circle cx="' + pt[i][0].toFixed(1) + '" cy="' + pt[i][1].toFixed(1) + '" r="4.5" fill="' + (fav ? ca : cb) + '" stroke="var(--card)" stroke-width="2"/><rect x="' + (pt[i][0] - 18).toFixed(1) + '" y="0" width="36" height="' + H + '" fill="transparent"/></g>' +
        '<text class="axis" x="' + pt[i][0].toFixed(1) + '" y="' + (H - 22) + '" text-anchor="middle">' + esc(dayLab(p.d)) + '</text>' +
        (p.d === null ? '' : '<text class="axis" x="' + pt[i][0].toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" style="font-variant-numeric:tabular-nums">' + p.ls[0] + '-' + p.ls[1] + '</text>');
    });
    return '<div class="chart">' + s + '</svg></div>';
  };
  // fills a box: <div data-flow data-week data-a data-b>
  DP.flowFill = function (box) {
    var n = +box.dataset.week, a = box.dataset.a, b = box.dataset.b;
    box.innerHTML = '<p class="small muted">Rebuilding the week day by day…</p>';
    var go = function () {
      DP.loadDays(n, function (D) {
        if (!D) { box.innerHTML = '<p class="small muted">Day-by-day numbers for this week aren\'t published yet (they come with the nightly build).</p>'; return; }
        setTimeout(function () {
          var F = DP.matchFlow(n, a, b);
          if (!F || F.pts.length < 2) { box.innerHTML = '<p class="small muted">No finished days to show yet.</p>'; return; }
          var sw = DP.flowSwing(F);
          box.innerHTML = DP.flowChart(F) + '<p class="small muted">' + esc(U.teamName(a)) + '\'s chance to win the matchup after each day (above the line = ' + esc(U.teamAbbr(a)) + ' favored), from the totals so far plus the rest of the week simulated with the locked lineups and today\'s projections. Numbers under the days = categories each side led.' +
            (sw && sw.low ? ' <b>' + esc(U.teamName(sw.t)) + '</b> was at ' + U.pct(sw.low.p) + ' ' + (sw.low.d === null ? 'before the week' : 'after ' + esc(dayLab(sw.low.d))) + ' at the lowest.' : '') +
            (F.ok ? '' : ' <b>The days don\'t add up to the week\'s final totals yet</b> (a day may be missing), so read it as approximate.') + '</p>';
        }, 10);
      });
    };
    if (DP.weekDetail && DP.weekDetail[n]) return go();
    if (DP.loadWeek) DP.loadWeek(n, go); else go();
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-flowbtn]'); if (!b) return;
    var box = document.getElementById(b.dataset.flowbtn); if (!box) return;
    box.hidden = !box.hidden;
    if (!box.hidden && !box.dataset.done) { box.dataset.done = '1'; DP.flowFill(box); }
  });
})();
