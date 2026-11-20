/* Dynasty Puck HQ - Pickup Planner: the free agents that most raise your expected category wins against next week's
   opponent (NHL games that week, your lineup re-optimized with him in it), who to drop for the roster spot, and the cap. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function expCats(P) { return DP.E.sum(P.map(function (x) { return x.w + x.t / 2; })); }
  function hurt(p) { return p.inj && /OUT|IR|Injured/i.test(p.inj[0]) && !p.inj[4]; }
  // what a free agent costs: Fantrax's listed salary for him (the league minimum when it lists none)
  DP.faSalary = function (p) { return p.sal ? p.sal / 1e6 : (DP.E.RULES.minSalary || 1); };

  DP.pickupData = function (me, wi, n) {
    var E = DP.E, opp = E.opponent(me, wi); if (!opp) return null;
    var oppSet = E.setLineupIds(opp), B = oppSet ? E.teamWeek(E.rosters[opp], wi, { only: oppSet, injuries: true }) : E.teamWeek(E.rosters[opp], wi, { injuries: true });
    var ros = E.rosters[me], A0 = E.teamWeek(ros, wi, { injuries: true }), P0 = E.matchupProbs(A0, B), e0 = expCats(P0);
    var lim = ((DP.league.fantrax || {}).roster || {}).maxTotalPlayers || 23, onR = ros.filter(function (p) { return p.fs === 'A' || p.fs === 'R'; });
    var space = E.teamCap(me)[0].space, pct = E.RULES.deadCapPct || 0.5;
    var starters = {}; A0.lu.F.concat(A0.lu.D, A0.lu.G).forEach(function (x) { starters[x.p.id] = 1; });
    // a roster spot, cheapest first: an injured player can go to IR; else drop the active-roster player with the least
    // dynasty value who isn't starting this week (MNR players can usually go to a Minors slot instead of being dropped)
    // an MNR player who graduated on the active roster can't be sent back down (league rule), and dropping one gives
    // away a prospect for nothing, so those are never suggested
    var grad = function (p) { return p.ct === 'MNR' && (p.cgp || 0) >= p.gradThr; };
    var drops = onR.filter(function (p) { return !starters[p.id] && (!grad(p) || hurt(p)); }).map(function (p) {
      var dead = E.deadCapCounts(p) ? pct : 0;
      return { p: p, how: hurt(p) ? 'IR' : p.ct === 'MNR' ? 'minors' : 'drop', free: hurt(p) || p.ct === 'MNR' ? p.sal26 || 0 : (p.sal26 || 0) * (1 - dead), dead: hurt(p) || p.ct === 'MNR' ? 0 : (p.sal26 || 0) * dead };
    }).sort(function (a, b) { return (a.how === 'IR' ? 0 : a.how === 'minors' ? 1 : 2) - (b.how === 'IR' ? 0 : b.how === 'minors' ? 1 : 2) || (a.p.DV || 0) - (b.p.DV || 0); }).slice(0, 4);
    var cands = E.P.filter(function (p) { return !p.gm && p.r && !E.injuredOut(p, wi) && (E.games(p, wi).N || 0) > 0; })
      .map(function (p) { return { p: p, wv: E.weeklyValue(p, wi) }; }).sort(function (a, b) { return b.wv - a.wv; }).slice(0, n || 80);
    var rows = cands.map(function (c) {
      var p = c.p, A1 = E.teamWeek(ros.concat([p]), wi, { injuries: true }), P1 = E.matchupProbs(A1, B), e1 = expCats(P1);
      var starts = A1.lu.F.concat(A1.lu.D, A1.lu.G).some(function (x) { return x.p === p; });
      var bumped = starts ? A0.lu.F.concat(A0.lu.D, A0.lu.G).map(function (x) { return x.p; }).filter(function (q) { return !A1.lu.F.concat(A1.lu.D, A1.lu.G).some(function (x) { return x.p === q; }); })[0] : null;
      var by = P1.map(function (x, k) { return (x.w + x.t / 2) - (P0[k].w + P0[k].t / 2); });
      var sal = DP.faSalary(p), room = onR.length < lim ? space - sal : drops.length ? space + drops[0].free - sal : space - sal;
      return { p: p, g: E.games(p, wi).N || 0, gain: e1 - e0, starts: starts, bumped: bumped, by: by, sal: sal, room: room, A1: A1 };
    }).sort(function (a, b) { return b.gain - a.gain; });
    return { me: me, opp: opp, wi: wi, B: B, A0: A0, e0: e0, oppSet: !!oppSet, rows: rows, drops: drops, full: onR.length >= lim, n: onR.length, lim: lim, space: space };
  };

  DP.pages.pickup = {
    title: 'Pickup Planner',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = q.team || DP.state.team;
      var h = '<div class="page-head"><h1>🛒 Pickup Planner</h1><p class="sub">The free agents that most raise your expected category wins against next week\'s opponent: his NHL games that week, your lineup re-optimized with him in it, against their lineup. Plus the roster spot and the cap. Projections are model estimates; season-long fit is on the <a href="#/fa">Free Agents</a> page.</p></div>';
      if (!me) { el.innerHTML = h; ui.needTeam(el.appendChild(document.createElement('div')), 'pickups for your team'); return; }
      var lw = E.lockWeek(), wi = q.w ? +q.w - 1 : lw;
      if (wi === null || wi === undefined) { el.innerHTML = h + '<div class="callout">No lineup locks left this season.</div>'; return; }
      var weeks = E.weeks.map(function (w, i) { return i; }).filter(function (i) { return i >= lw && E.opponent(me, i); }).slice(0, 4);
      h += '<div class="controls"><label>Team ' + ui.teamSelect('pk-team', me) + '</label><label>Week <select id="pk-w">' + weeks.map(function (i) { var w = E.weeks[i]; return '<option value="' + (i + 1) + '"' + (i === wi ? ' selected' : '') + '>' + (w.po ? 'Playoffs R' + w.po : 'Week ' + w.n) + ' · vs ' + esc(U.teamName(E.opponent(me, i))) + '</option>'; }).join('') + '</select></label></div>';
      var X = DP.pickupData(me, wi);
      if (!X) { el.innerHTML = h + '<div class="callout">No opponent that week.</div>'; return; }
      var w = E.weeks[wi], best = X.rows.filter(function (r) { return r.gain > 0.01; }).slice(0, 5);
      var odds0 = E.simWeek(X.A0, X.B, 2500, 21 + wi);
      h += '<div class="hero" style="--tc:' + U.teamColor(X.opp) + '"><div class="hero-id">' + U.teamBadge(X.opp, 'xl') + '<div class="hero-tx"><h1>vs ' + esc(U.teamName(X.opp)) + '</h1><p class="sub">' + (w.po ? 'Playoffs round ' + w.po : 'Week ' + w.n) + ' · ' + esc(DP.lockText(wi)) + '</p></div></div>' +
        '<div class="hero-rec"><div class="big num">' + U.fmt(X.e0, 1) + '</div><div class="small">expected cats now · ' + U.pct(odds0.win) + ' to win the week</div></div>' +
        '<div class="hero-sel small"><a href="' + U.hash('scout', null, { w: wi + 1 }) + '">🔭 Scouting report →</a></div></div>';
      if (best.length) {
        h += '<div class="grid g2"><div class="card"><h2>Best adds this week</h2><div class="hint">Win chance with each one added (2,500 simulated weeks against their lineup).</div><ul class="list-plain" id="pk-best">' +
          best.map(function (r) {
            var o = E.simWeek(r.A1, X.B, 2500, 21 + wi);
            return '<li>' + ui.pcell(r.p, { pos: 1 }) + '<span class="small muted" style="margin-left:auto;text-align:right">' + r.g + ' games · <b class="good">' + U.sgn(r.gain, 2) + ' cats</b><br>win ' + U.pct(odds0.win) + ' → <b>' + U.pct(o.win) + '</b></span></li>';
          }).join('') + '</ul></div>';
        h += '<div class="card"><h2>Making room</h2><div class="hint">' + (X.full ? 'Your Active + Bench is full (' + X.n + ' of ' + X.lim + '), so a pickup needs a spot. Cheapest first:' : 'You have ' + (X.lim - X.n) + ' open Active + Bench spot' + (X.lim - X.n > 1 ? 's' : '') + ': no drop needed.') + ' Cap space now ' + U.m(X.space) + '; a free agent costs his Fantrax salary (' + U.m(E.RULES.minSalary || 1) + ' minimum).</div>' +
          (X.full ? '<ul class="list-plain">' + X.drops.map(function (d) {
            return '<li>' + ui.pcell(d.p, { pos: 1 }) + '<span class="small muted" style="margin-left:auto;text-align:right">' + (d.how === 'IR' ? 'injured: move to IR' : d.how === 'minors' ? 'MNR: move to a Minors slot' : 'drop (' + esc(d.p.ct) + ' ' + U.m(d.p.sal26) + ')') + '<br>frees ' + U.m(d.free) + (d.dead ? ' · ' + U.m(d.dead) + ' dead cap' : '') + '</span></li>';
          }).join('') + '</ul>' : '') + '</div></div>';
      } else h += '<div class="callout">No free agent with games that week raises your expected category wins against ' + esc(U.teamName(X.opp)) + '. Your lineup is already as good as the pool allows.</div>';
      h += '<div class="card flush" style="margin-top:14px"><h2>Every free agent with games that week</h2><div class="hint">Δ cats = change in expected category wins against ' + esc(U.teamName(X.opp)) + ' with him added and your lineup re-optimized (0 = he wouldn\'t crack your lineup). "Cap after" assumes the first move under Making room when your roster is full.</div><div id="pk-t" style="padding:0 12px 12px"></div></div>';
      el.innerHTML = h;
      ui.table(U.qs('#pk-t', el), {
        rows: X.rows, sort: 'gain', csv: 'pickups-week-' + w.n + '.csv', search: function (r) { return r.p.n + ' ' + r.p.t; },
        filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (r, v) { return r.p.slot === v || (v === 'D' && r.p.fd); } }, { l: 'Show', opts: [['', 'All'], ['in', 'Would start'], ['wv', 'On waivers']], fn: function (r, v) { return v === 'in' ? r.starts : r.p.wv; } }],
        cols: [
          { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
          { k: 'g', l: 'Games', cls: 'num', v: function (r) { return r.g; } },
          { k: 'gain', l: 'Δ cats', cls: 'num', v: function (r) { return r.gain; }, f: function (r) { return r.gain > 0.005 ? '<b>' + ui.delta(r.gain, 2) + '</b>' : '<span class="faint">0</span>'; } },
          { k: 'helps', l: 'Moves', v: null, f: function (r) { return '<span class="small">' + r.by.map(function (x, k) { return [k, x]; }).filter(function (x) { return Math.abs(x[1]) >= 0.02; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).map(function (x) { return '<span class="' + (x[1] > 0 ? 'good' : 'bad') + '">' + esc(E.CATS[x[0]].l) + ' ' + U.sgn(x[1] * 100, 0) + '%</span>'; }).join(' · ') + '</span>'; } },
          { k: 'bump', l: 'Replaces', v: null, f: function (r) { return r.bumped ? '<span class="small">' + esc(r.bumped.n) + '</span>' : '<span class="faint small">–</span>'; } },
          { k: 'sal', l: 'Salary', cls: 'num', v: function (r) { return r.sal; }, f: function (r) { return U.m(r.sal); } },
          { k: 'room', l: 'Cap after', cls: 'num', v: function (r) { return r.room; }, f: function (r) { return '<span class="' + (r.room < 0 ? 'bad' : '') + '">' + U.m(r.room) + '</span>'; } },
          { k: 'war', l: 'Season WAR', cls: 'num', v: function (r) { return r.p.WAR; }, f: function (r) { return ui.warCell(r.p.WAR); } }
        ]
      });
      U.qs('#pk-team', el).addEventListener('change', function (e) { DP.go('pickup', null, { team: e.target.value === DP.state.team ? undefined : e.target.value }); });
      U.qs('#pk-w', el).addEventListener('change', function (e) { DP.go('pickup', null, { team: q.team, w: e.target.value }); });
    }
  };
})();
