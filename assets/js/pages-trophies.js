/* Dynasty Puck HQ - Trophy Case: badges each team has earned this season, every one from a real result on the site
   (the weekly category results, the Fantrax logs, the value history and the pre-lock odds). Nothing is voted on or
   made up: each badge says what earned it and when. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  // { team: [ { k, ic, name, why, n (week, when there is one) } ] }; needs data/values.js and the week files for all of them
  DP.trophies = function (details) {
    var E = DP.E, out = {}, add = function (t, b) { if (out[t]) out[t].push(b); };
    E.teams.forEach(function (t) { out[t] = []; });
    var W = E.history().weeks.filter(function (w) { return w.games && w.games.length; });
    var rec = function (s) { return s.W + '-' + s.L + (s.T ? '-' + s.T : ''); };
    // matchups: perfect weeks and blowouts
    W.forEach(function (w) {
      w.games.forEach(function (g) {
        [[g.a, g.sa, g.b], [g.b, g.sb, g.a]].forEach(function (x) {
          var s = x[1];
          if (s.L === 0 && s.W >= 13) add(x[0], { k: 'perfect', ic: '💯', name: s.W === E.NC ? 'Perfect week' : 'Clean sweep', why: 'Week ' + w.n + ': ' + rec(s) + ' over ' + U.teamName(x[2]) + ' without losing a category.', n: w.n });
          else if (s.W - s.L >= 10) add(x[0], { k: 'blowout', ic: '💥', name: 'Blowout', why: 'Week ' + w.n + ': ' + rec(s) + ' over ' + U.teamName(x[2]) + '.', n: w.n });
        });
      });
      // team of the week (best all-play)
      var best = null; E.teams.forEach(function (t) { var a = w.ap && w.ap[t]; if (!a) return; var v = E.sum(a) / a.length; if (!best || v > best.v) best = { t: t, v: v }; });
      if (best) add(best.t, { k: 'totw', ic: '👑', name: 'Team of the week', why: 'Week ' + w.n + ': its 15 category totals beat ' + U.pct(best.v) + ' of the league.', n: w.n });
    });
    // streaks (matchups won in a row) and category records
    var R = DP.recordData ? DP.recordData() : null;
    if (R) {
      R.streaks.forEach(function (x) { if (x.bestW >= 3) add(x.t, { k: 'streak', ic: '🔥', name: 'On fire', why: 'Won ' + x.bestW + ' matchups in a row.' }); });
      R.cats.forEach(function (c) { if (c.best) add(c.best.t, { k: 'catrec', ic: '🏆', name: E.CATS[c.c].l + ' record', why: 'The season\'s best week in ' + E.CATS[c.c].name + ': ' + (E.CATS[c.c].k === 'GAA' ? U.fmt(c.best.v, 2) : E.CATS[c.c].k === 'SV' ? U.rate(c.best.v) : U.fmt(c.best.v, E.CATS[c.c].k === 'Cor' ? 1 : 0)) + ' in week ' + c.best.n + '.', n: c.best.n }); });
    }
    if (DP.catStreaks) DP.catStreaks().best.forEach(function (x) { if (x.n >= 5) add(x.t, { k: 'catrun', ic: '🧩', name: E.CATS[x.c].l + ' machine', why: 'Won ' + E.CATS[x.c].name + ' ' + x.n + ' weeks in a row (weeks ' + x.from + '–' + x.to + ').' }); });
    // the closest call of the season
    var cc = []; W.forEach(function (w) { if (DP.closeCalls) cc = cc.concat(DP.closeCalls(w)); });
    cc.sort(function (a, b) { return a.z - b.z; });
    if (cc[0]) add(cc[0].win, { k: 'photo', ic: '📸', name: 'Photo finish', why: 'Won the closest category of the season: ' + E.CATS[cc[0].c].l + ' in week ' + cc[0].n + ' against ' + U.teamName(cc[0].lose) + '.', n: cc[0].n });
    // lineups: no regrets all season
    var ns = W.map(function (w) { return w.n; });
    if (DP.teamRegrets && DP.weekDetail && ns.length && ns.every(function (n) { return DP.weekDetail[n]; })) {
      E.teams.forEach(function (t) { if (!DP.teamRegrets(t, ns).length) add(t, { k: 'clean', ic: '🧼', name: 'Clean sheet', why: 'No week this season where a bench or minors swap would have helped.' }); });
    }
    // activity (this season's Fantrax logs)
    var M = DP.league.moves || [], cnt = function (f) { var c = {}; M.forEach(function (m) { var t = f(m); if (t && out[t]) c[t] = (c[t] || 0) + 1; }); return c; };
    var top = function (c, k, ic, name, why) { var ks = Object.keys(c); if (!ks.length) return; var mx = Math.max.apply(null, ks.map(function (t) { return c[t]; })); ks.filter(function (t) { return c[t] === mx; }).forEach(function (t) { add(t, { k: k, ic: ic, name: name, why: why(mx) }); }); };
    top(cnt(function (m) { return m.type === 'add' ? m.to : null; }), 'waiver', '🛒', 'Waiver king', function (n) { return 'The most pickups in the league this season (' + n + ').'; });
    var td = {}; M.forEach(function (m) { if (m.type === 'move' || m.type === 'pick' || m.type === 'cap') [m.from, m.to].forEach(function (t) { if (out[t]) (td[t] = td[t] || {})[m.d] = 1; }); });
    var tc = {}; Object.keys(td).forEach(function (t) { tc[t] = Object.keys(td[t]).length; });
    top(tc, 'dealer', '🤝', 'Wheeler-dealer', function (n) { return 'Part of the most trades this season (' + n + ').'; });
    // value and odds (data/values.js)
    var V = DP.values;
    if (V && V.teams) {
      var vg = E.teams.filter(function (t) { return V.teams[t]; }).map(function (t) { var v = V.teams[t]; return { t: t, d: v[v.length - 1] - v[0] }; }).sort(function (a, b) { return b.d - a.d; });
      if (vg[0] && vg[0].d > 0) add(vg[0].t, { k: 'riser', ic: '📈', name: 'Stock riser', why: 'The biggest gain in total dynasty value since ' + U.date(new Date(V.dates[0] + 'T12:00:00Z')) + ' (+' + U.fmt(vg[0].d, 1) + ').' });
    }
    if (DP.modelCalls) {
      var MC = DP.modelCalls() || [];
      MC.filter(function (m) { return m.res === 0 && m.pd <= 0.25; }).forEach(function (m) { add(m.dog, { k: 'heist', ic: '🦹', name: 'Heist', why: 'Week ' + m.n + ': beat ' + U.teamName(m.fav) + ' with a ' + U.pct(m.pd) + ' chance before the lock.', n: m.n }); });
    }
    return out;
  };
  // group repeated badges of the same kind into one chip with a count
  DP.trophyGroups = function (list) {
    var g = {}, order = [];
    list.forEach(function (b) { var k = b.k + '|' + b.name; if (!g[k]) { g[k] = { b: b, n: 0, why: [] }; order.push(k); } g[k].n++; g[k].why.push(b.why); });
    return order.map(function (k) { return g[k]; });
  };
  DP.trophyHtml = function (list) {
    var G = DP.trophyGroups(list || []);
    return G.length ? '<div class="troph">' + G.map(function (x) { return '<span class="tro" title="' + esc(x.why.join('\n')) + '"><span class="tro-ic">' + x.b.ic + '</span>' + esc(x.b.name) + (x.n > 1 ? ' <b>×' + x.n + '</b>' : '') + '</span>'; }).join('') + '</div>' : '<p class="small muted">No badges yet.</p>';
  };
  DP.loadTrophies = function (done) {
    var ns = DP.E.history().weeks.filter(function (w) { return w.games && w.games.length; }).map(function (w) { return w.n; });
    DP.loadValues(function () { DP.loadWeeks(ns, function (details) { done(DP.trophies(details)); }); });
  };

  DP.pages.trophies = {
    title: 'Trophy Case',
    render: function (el) {
      var E = DP.E, me = DP.state.team;
      var h = '<div class="page-head"><h1>🏅 Trophy Case</h1><p class="sub">Badges every team has earned this season, each from a real result: perfect weeks, blowouts, streaks, category records, heists against the odds, a clean lineup sheet and more. Hover (or long-press) a badge for what earned it.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the season…</p></div>';
      DP.loadTrophies(function (T) {
        var box = U.qs('.lz', el); if (!box) return;
        var teams = E.teams.slice().sort(function (a, b) { return T[b].length - T[a].length; });
        if (me) teams = [me].concat(teams.filter(function (t) { return t !== me; }));
        var all = []; E.teams.forEach(function (t) { T[t].forEach(function (b) { all.push(b); }); });
        var kinds = DP.trophyGroups(all).sort(function (a, b) { return a.n - b.n; });
        var hh = '<div class="grid g2">' + teams.map(function (t) {
          return '<div class="card' + (t === me ? ' mine-card' : '') + '" style="border-left:4px solid ' + U.teamColor(t) + '"><h2>' + U.teamChip(t, { link: 1, b: 1 }) + '<span class="small muted" style="margin-left:auto">' + T[t].length + ' badge' + (T[t].length === 1 ? '' : 's') + '</span></h2>' + DP.trophyHtml(T[t]) +
            '<details class="small" style="margin-top:6px"><summary>What earned them</summary><ul>' + T[t].map(function (b) { return '<li>' + b.ic + ' <b>' + esc(b.name) + '</b>: ' + esc(b.why) + '</li>'; }).join('') + '</ul></details></div>';
        }).join('') + '</div>';
        hh += '<div class="card" style="margin-top:14px"><h2>The rarest badges</h2><div class="hint">How many times each badge has been earned this season.</div><div class="troph">' + kinds.map(function (x) { return '<span class="tro"><span class="tro-ic">' + x.b.ic + '</span>' + esc(x.b.name) + ' <b>×' + x.n + '</b></span>'; }).join('') + '</div></div>';
        box.innerHTML = hh;
      });
    }
  };
})();
