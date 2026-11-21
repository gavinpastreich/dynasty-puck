/* Dynasty Puck HQ - Scenario Builder: pick winners for upcoming matchups and see every team's playoff and title odds
   re-simulated. The season simulation (E.simSeason) takes the picks as `force`: a picked matchup is re-drawn until the
   picked team wins it (so the categories it wins come from the same model, only conditioned on the result). Compared
   with the same number of seasons and the same seed without picks. Picks live in the link, so a scenario can be shared. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var N = 2000, SEED = 4711;

  DP.scenarioWeeks = function () {
    var E = DP.E, act = E.actual(), done = act && !act.odd ? act.done : 0;
    return [done + 1, done + 2].filter(function (n) { return n <= (E.REG_WEEKS || 24); });
  };
  // picks: { 'n|a|b': 1 (a wins) or -1 (b wins) }, in the link as n.a.b.r joined by '~' (team codes can contain dots, so
  // they are URI-encoded)
  DP.encodePicks = function (P) { return Object.keys(P).map(function (k) { var x = k.split('|'); return [x[0], encodeURIComponent(x[1]), encodeURIComponent(x[2]), P[k]].join('!'); }).join('~'); };
  DP.decodePicks = function (s) { var P = {}; String(s || '').split('~').forEach(function (x) { var y = x.split('!'); if (y.length === 4 && (+y[3] === 1 || +y[3] === -1)) P[y[0] + '|' + decodeURIComponent(y[1]) + '|' + decodeURIComponent(y[2])] = +y[3]; }); return P; };
  DP.runScenario = function (P, n) {
    var E = DP.E, base = E.simSeason({ n: n || N, seed: SEED }), sc = E.simSeason({ n: n || N, seed: SEED, force: P }), by = {};
    base.forEach(function (r) { by[r.t] = { t: r.t, po0: r.po, ch0: r.champ, seed0: r.avgSeed }; });
    sc.forEach(function (r) { var o = by[r.t]; o.po = r.po; o.ch = r.champ; o.seed = r.avgSeed; o.dPo = r.po - o.po0; o.dCh = r.champ - o.ch0; });
    return E.teams.map(function (t) { return by[t]; }).sort(function (a, b) { return b.po - a.po || b.ch - a.ch; });
  };

  DP.pages.scenarios = {
    title: 'Scenario Builder',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, P = DP.decodePicks(hsh.q.f), weeks = DP.scenarioWeeks();
      var h = '<div class="page-head"><h1>🔮 Scenario Builder</h1><p class="sub">Pick the winners of the next matchups and see what it does to every team\'s playoff and title odds. Each picked matchup is simulated so the picked team wins it (its categories still come from the model), and the rest of the season is played out ' + N.toLocaleString() + ' times. The link keeps your picks, so you can send a scenario to the chat.</p></div>';
      if (!weeks.length) { el.innerHTML = h + '<div class="callout">No regular-season weeks left to pick.</div>'; return; }
      h += weeks.map(function (n) {
        var G = DP.meta.h2h.filter(function (g) { return g[0] === n; });
        return '<div class="card" style="margin-bottom:12px"><h2>Week ' + n + '</h2><div class="scn">' + G.map(function (g) {
          var k = n + '|' + g[1] + '|' + g[2], v = P[k] || 0, A = E.baseline[g[1]][n - 1], B = E.baseline[g[2]][n - 1], mc = E.simWeek(A, B, 800, (n - 1) * 31 + 7);
          var btn = function (val, t, pct) { return '<button class="scn-b' + (v === val ? ' on' : '') + '" data-k="' + esc(k) + '" data-v="' + val + '">' + (t ? U.teamBadge(t) + ' <span>' + esc(U.teamName(t)) + '</span> <span class="faint small">' + U.pct(pct) + '</span>' : '<span class="small">no pick</span>') + '</button>'; };
          return '<div class="scn-g' + (g[1] === me || g[2] === me ? ' mine' : '') + '">' + btn(1, g[1], mc.win) + btn(0) + btn(-1, g[2], mc.loss) + '</div>';
        }).join('') + '</div></div>';
      }).join('');
      var np = Object.keys(P).length;
      h += '<div class="controls"><button class="btn" id="sc-go">▶ Simulate ' + (np ? 'with ' + np + ' pick' + (np === 1 ? '' : 's') : 'the season') + '</button>' + (np ? '<button class="btn sm ghost" id="sc-clear">Clear picks</button><button class="btn sm" id="sc-copy">🔗 Copy link</button>' : '') + '<span class="small muted">' + N.toLocaleString() + ' seasons with and without the picks, about ' + Math.max(2, Math.round(N / 700)) + ' seconds.</span></div><div id="sc-out"></div>';
      el.innerHTML = h;
      var set = function (P2) { DP.go('scenarios', null, { f: Object.keys(P2).length ? DP.encodePicks(P2) : undefined }); };
      U.qsa('.scn-b', el).forEach(function (b) { b.addEventListener('click', function () { var P2 = Object.assign({}, P); if (+b.dataset.v) P2[b.dataset.k] = +b.dataset.v; else delete P2[b.dataset.k]; set(P2); }); });
      if (U.qs('#sc-clear', el)) U.qs('#sc-clear', el).addEventListener('click', function () { set({}); });
      if (U.qs('#sc-copy', el)) U.qs('#sc-copy', el).addEventListener('click', function () { U.copy(location.href, 'Scenario link copied.'); });
      var run = function () {
        var out = U.qs('#sc-out', el); out.innerHTML = '<p class="small muted">Simulating…</p>';
        setTimeout(function () {
          if (!document.body.contains(out)) return;
          var R = DP.runScenario(P);
          out.innerHTML = '<div class="card flush" style="margin-top:12px"><div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">Playoffs</th><th class="num">change</th><th class="num">Title</th><th class="num">change</th><th class="num">Avg seed</th></tr></thead><tbody>' + R.map(function (r) {
            return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td>' + U.teamChip(r.t, { link: 1 }) + '</td><td class="num"><b>' + U.pct(r.po) + '</b></td><td class="num">' + (np ? ui.delta(r.dPo * 100, 0) : '') + '</td><td class="num">' + U.pct(r.ch, 1) + '</td><td class="num">' + (np ? ui.delta(r.dCh * 100, 1) : '') + '</td><td class="num">' + U.fmt(r.seed, 1) + '</td></tr>';
          }).join('') + '</tbody></table></div></div><p class="small muted">Changes = with your picks minus without them, both ' + N.toLocaleString() + ' seasons with the same random seed; differences under 1 point are noise. The percentages on each pick are that team\'s projected chance to win the matchup.</p>';
        }, 30);
      };
      U.qs('#sc-go', el).addEventListener('click', run);
      if (np) run();
    }
  };
})();
