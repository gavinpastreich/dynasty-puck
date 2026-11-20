/* Dynasty Puck HQ - NHL Team Stacks: which fantasy teams depend on which NHL clubs. A grid of the 32 clubs by the 14
   teams (players on each team's active roster, Active + Bench, and their projected 2026-27 WAR), each club's games this
   week and next, and every team's biggest exposure: when a club has a light week, a slump or a goalie change, these
   are the rosters it hits. From the Fantrax rosters and the NHL schedule. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  DP.stacksData = function (all) {
    var E = DP.E, clubs = {}, team = {};
    E.teams.forEach(function (t) { team[t] = { t: t, war: 0, n: 0, by: {} }; });
    E.P.forEach(function (p) {
      if (!p.gm || !team[p.gm] || !p.nt) return;
      if (!all && p.fs !== 'A' && p.fs !== 'R') return;
      var c = p.nt, w = Math.max(0, p.WAR || 0), T = team[p.gm];
      var C = clubs[c] || (clubs[c] = { c: c, n: 0, war: 0, by: {}, sk: p.nt26 || c });
      C.n++; C.war += w; (C.by[p.gm] = C.by[p.gm] || { n: 0, war: 0, ps: [] }); C.by[p.gm].n++; C.by[p.gm].war += w; C.by[p.gm].ps.push(p);
      T.n++; T.war += w; (T.by[c] = T.by[c] || { n: 0, war: 0 }); T.by[c].n++; T.by[c].war += w;
    });
    var wi = Math.max(0, E.nowWeek()), wn = E.lockWeek();
    Object.keys(clubs).forEach(function (c) { var g = E.wg && E.wg[clubs[c].sk]; clubs[c].g0 = g ? g[wi] || 0 : null; clubs[c].g1 = g && wn !== null ? g[wn] || 0 : null; });
    E.teams.forEach(function (t) {
      var T = team[t], top = Object.keys(T.by).map(function (c) { return { c: c, n: T.by[c].n, war: T.by[c].war, share: T.war > 0 ? T.by[c].war / T.war : 0 }; }).sort(function (a, b) { return b.war - a.war || b.n - a.n; });
      T.top = top; T.clubs = top.length;
    });
    return { clubs: Object.keys(clubs).map(function (c) { return clubs[c]; }).sort(function (a, b) { return b.war - a.war; }), team: team, wi: wi, wn: wn };
  };

  DP.pages.stacks = {
    title: 'NHL Team Stacks',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, all = hsh.q.all === '1', S = DP.stacksData(all), mx = 0;
      S.clubs.forEach(function (C) { Object.keys(C.by).forEach(function (t) { mx = Math.max(mx, C.by[t].war); }); });
      var h = '<div class="page-head"><h1>🧱 NHL Team Stacks</h1><p class="sub">Which fantasy teams depend on which NHL clubs: players on each team\'s ' + (all ? 'whole roster' : 'active roster (Active + Bench)') + ' by NHL club, shaded by their projected 2026-27 WAR, with each club\'s games this week and next. A light schedule week, a slump or a goalie change at one club hits these rosters together.</p></div>';
      h += '<div class="controls"><div class="seg"><button data-all="0" class="' + (all ? '' : 'on') + '">Active roster</button><button data-all="1" class="' + (all ? 'on' : '') + '">Whole roster (incl. minors, IR)</button></div></div>';
      // every team's exposure
      h += '<div class="card"><h2>Biggest exposures</h2><div class="hint">Each team\'s club with the largest share of its projected WAR, and how many clubs its roster spans.</div><div class="tbl-wrap"><table class="t small"><thead><tr><th>Team</th><th>Top club</th><th class="num">Players</th><th class="num">Share of WAR</th><th>Next two</th><th class="num">Clubs</th></tr></thead><tbody>' +
        E.teams.slice().sort(function (a, b) { return ((S.team[b].top[0] || {}).share || 0) - ((S.team[a].top[0] || {}).share || 0); }).map(function (t) {
          var T = S.team[t], a = T.top[0];
          return '<tr class="' + (t === me ? 'mine' : '') + '"><td>' + U.teamChip(t, { link: 1 }) + '</td><td><b>' + (a ? esc(a.c) : '–') + '</b></td><td class="num">' + (a ? a.n : '') + '</td><td class="num">' + (a ? U.pct(a.share) : '') + '</td><td class="small muted">' + T.top.slice(1, 3).map(function (x) { return esc(x.c) + ' ' + U.pct(x.share); }).join(', ') + '</td><td class="num">' + T.clubs + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      // the grid
      var teams = E.teams.slice();
      if (me) teams = [me].concat(teams.filter(function (t) { return t !== me; }));
      h += '<div class="card flush" style="margin-top:14px"><h2 style="padding:12px 12px 0">Club by team</h2><div class="hint" style="padding:0 12px">Number = players; darker = more projected WAR. GP = the club\'s games in week ' + (S.wi + 1) + (S.wn !== null ? ' and week ' + (S.wn + 1) : '') + '. Hover a cell for the names.</div><div class="tbl-wrap"><table class="t small stk"><thead><tr><th>Club</th><th class="num" title="Games this week">GP</th>' + (S.wn !== null && S.wn !== S.wi ? '<th class="num" title="Games next week">next</th>' : '') + '<th class="num">Owned</th>' +
        teams.map(function (t) { return '<th class="stk-t' + (t === me ? ' mine' : '') + '" title="' + esc(U.teamName(t)) + '">' + U.teamBadge(t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        S.clubs.map(function (C) {
          return '<tr><td><b>' + esc(C.c) + '</b></td><td class="num">' + (C.g0 === null ? '–' : C.g0) + '</td>' + (S.wn !== null && S.wn !== S.wi ? '<td class="num' + (C.g1 >= 4 ? ' good' : C.g1 !== null && C.g1 <= 2 ? ' bad' : '') + '">' + (C.g1 === null ? '–' : C.g1) + '</td>' : '') + '<td class="num">' + C.n + '</td>' +
            teams.map(function (t) {
              var x = C.by[t]; if (!x) return '<td class="stk-c"></td>';
              var a = mx > 0 ? Math.min(1, 0.12 + 0.88 * x.war / mx) : 0.2;
              return '<td class="stk-c" style="--a:' + a.toFixed(2) + '" title="' + esc(U.teamName(t)) + ' · ' + esc(C.c) + ': ' + esc(x.ps.map(function (p) { return p.n; }).join(', ')) + ' (' + U.fmt(x.war, 1) + ' WAR)"><span>' + x.n + '</span></td>';
            }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
      if (me) {
        var T = S.team[me];
        h += '<div class="card" style="margin-top:14px"><h2>' + U.teamBadge(me) + ' Your clubs</h2><div class="hint">Every NHL club on your ' + (all ? 'roster' : 'active roster') + ', by share of your projected WAR, with its games this week and next.</div><ul class="list-plain mwlist">' + T.top.map(function (x) {
          var C = S.clubs.filter(function (c) { return c.c === x.c; })[0];
          return '<li><span class="mw-l"><b>' + esc(x.c) + '</b> <span class="small muted">' + esc(C.by[me].ps.map(function (p) { return p.n; }).join(', ')) + '</span></span><span class="mw-r small">' + U.pct(x.share) + ' of WAR · ' + (C.g0 === null ? '–' : C.g0) + ' GP' + (C.g1 !== null && S.wn !== S.wi ? ' / ' + C.g1 + ' next' : '') + '</span></li>';
        }).join('') + '</ul></div>';
      }
      el.innerHTML = h;
      U.qsa('[data-all]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('stacks', null, { all: b.dataset.all === '1' ? '1' : undefined }); }); });
    }
  };
})();
