/* Dynasty Puck HQ - Opponent scouting report: this week's matchup, the categories in play and a lineup tuned to beat
   this one opponent (rather than the league in general). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function expCats(P) { return DP.E.sum(P.map(function (x) { return x.w + x.t / 2; })); }
  // The usual lineup optimizer values a stat by what it's worth in an even matchup. Against one known opponent a
  // category you'll win or lose by a mile is worth little, and a close one is worth a lot: weight each category by how
  // likely one more unit is to flip it (the normal density at the projected margin), then re-optimize. Two passes.
  DP.tunedLineup = function (team, wi, B, opts) {
    var E = DP.E, ros = E.rosters[team], base = E.teamWeek(ros, wi, { injuries: true }), best = base, bestE = expCats(E.matchupProbs(base, B)), cur = base;
    for (var it = 0; it < 2; it++) {
      var a = E.catVec(cur), b = E.catVec(B), mult = {};
      E.CATS.forEach(function (cat, c) {
        if (a.mu[c] === null || b.mu[c] === null) { mult[cat.k] = 1; return; }
        var sd = Math.sqrt(Math.max(1e-9, a.va[c] + b.va[c])), z = (a.mu[c] - b.mu[c]) / sd;
        mult[cat.k] = Math.max(0.1, Math.exp(-0.5 * z * z));
      });
      cur = E.withWeights(mult, function () { return E.teamWeek(ros, wi, { injuries: true }); });
      var e = expCats(E.matchupProbs(cur, B));
      if (e > bestE + 1e-6) { best = cur; bestE = e; }
    }
    return { base: base, tuned: best, eBase: expCats(E.matchupProbs(base, B)), eTuned: bestE };
  };
  function ids(lu) { var o = {}; lu.F.concat(lu.D, lu.G).forEach(function (x) { o[x.p.id] = x.p; }); return o; }
  DP.scoutData = function (me, wi) {
    var E = DP.E, opp = E.opponent(me, wi); if (!opp) return null;
    var oppSet = E.setLineupIds(opp), B = oppSet ? E.teamWeek(E.rosters[opp], wi, { only: oppSet, injuries: true }) : E.teamWeek(E.rosters[opp], wi, { injuries: true });
    var T = DP.tunedLineup(me, wi, B), mySet = E.setLineupIds(me), A = mySet ? E.teamWeek(E.rosters[me], wi, { only: mySet, injuries: true }) : null;
    var P = E.matchupProbs(T.tuned, B), a = E.catVec(T.tuned), b = E.catVec(B);
    var bi = ids(T.base.lu), ti = ids(T.tuned.lu);
    var start = Object.keys(ti).filter(function (k) { return !bi[k]; }).map(function (k) { return ti[k]; });
    var sit = Object.keys(bi).filter(function (k) { return !ti[k]; }).map(function (k) { return bi[k]; });
    var games = function (agg) { return E.sum(agg.lu.F.concat(agg.lu.D).map(function (x) { return E.games(x.p, wi).N || 0; })); };
    var H = E.history();
    return { me: me, opp: opp, wi: wi, B: B, oppSet: !!oppSet, T: T, P: P, a: a, b: b, start: start, sit: sit, set: A, eSet: A ? expCats(E.matchupProbs(A, B)) : null,
      odds: E.simWeek(T.tuned, B, 4000, 11 + wi), gMe: games(T.tuned), gOpp: games(B), hist: H, rows: DP.seasonRows ? DP.seasonRows(opp) : [] };
  };

  DP.pages.scout = {
    title: 'Opponent Scouting',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = q.team || DP.state.team;
      var h = '<div class="page-head"><h1>🔭 Opponent Scouting</h1><p class="sub">Your next opponent up close: the categories that will decide the week, what they do well this season, and a lineup tuned to beat this team rather than the league in general. Projections are model estimates from each side\'s lineup for the week.</p></div>';
      if (!me) { el.innerHTML = h; ui.needTeam(el.appendChild(document.createElement('div')), 'your scouting report'); return; }
      var lw = E.lockWeek(), wi = q.w ? +q.w - 1 : lw === null ? null : lw;
      if (wi === null || wi < 0 || wi >= E.NW) { el.innerHTML = h + '<div class="callout">No lineup locks left this season.</div>'; return; }
      var weeks = E.weeks.map(function (w, i) { return i; }).filter(function (i) { return (lw === null || i >= lw) && E.opponent(me, i); });
      h += '<div class="controls"><label>Team ' + ui.teamSelect('sc-team', me) + '</label><label>Week <select id="sc-w">' + weeks.map(function (i) { var w = E.weeks[i]; return '<option value="' + (i + 1) + '"' + (i === wi ? ' selected' : '') + '>' + (w.po ? 'Playoffs R' + w.po : 'Week ' + w.n) + ' · vs ' + esc(U.teamName(E.opponent(me, i))) + '</option>'; }).join('') + '</select></label></div>';
      var X = DP.scoutData(me, wi);
      if (!X) { el.innerHTML = h + '<div class="callout">No opponent that week (bye or playoffs not reached).</div>'; return; }
      var opp = X.opp, wk = E.weeks[wi], lab = wk.po ? 'Playoffs round ' + wk.po : 'Week ' + wk.n;
      var last = X.rows.slice(-3).map(function (r) { return '<span class="wkchip ' + r.res + '"><span class="wk">W' + r.n + '</span><b>' + r.res + '</b> <span class="num">' + r.W + '-' + r.L + '-' + r.T + '</span> ' + U.teamBadge(r.opp, 'sm') + '</span>'; }).join('');
      var act = E.actual(), rec = act && !act.odd ? act.rec[opp] : null;
      h += '<div class="hero" style="--tc:' + U.teamColor(opp) + '"><div class="hero-id">' + U.teamBadge(opp, 'xl') + '<div class="hero-tx"><h1>' + esc(U.teamName(opp)) + '</h1><p class="sub">' + esc(lab) + ' opponent' + (rec ? ' · ' + rec.W + '-' + rec.L + '-' + rec.T : '') + ' · ' + DP.tierBadge(opp) + '</p>' + (last ? '<div class="wkchips">' + last + '</div>' : '') + '</div></div>' +
        '<div class="hero-rec"><div class="big num">' + U.pct(X.odds.win) + '</div><div class="small">your chance to win the week · ' + U.fmt(X.T.eTuned, 1) + ' of 15 cats expected</div></div>' +
        '<div class="hero-sel small"><a href="' + U.hash('matchup', null, { w: wi + 1, a: me, b: opp }) + '">Full matchup sim →</a> · <a href="#/team/' + encodeURIComponent(opp) + '">Their Team Hub →</a></div></div>';
      // the categories in play
      var tag = function (p) { return p >= 0.8 ? ['good', 'safe'] : p >= 0.6 ? ['good', 'lean yours'] : p > 0.4 ? ['warn', 'swing'] : p > 0.2 ? ['bad', 'lean theirs'] : ['bad', 'uphill']; };
      var fmtV = function (c, v) { return v === null || v === undefined ? '–' : c === 12 ? v.toFixed(2) : c === 13 ? U.rate(v) : U.fmt(v, c === 10 ? 0 : 1); };
      var swing = X.P.map(function (x, c) { return { c: c, p: x.w + x.t / 2 }; }).filter(function (x) { return x.p > 0.4 && x.p < 0.6; });
      h += '<div class="grid g2"><div class="card"><h2>Category battle</h2><div class="hint">Projected totals for the week (your tuned lineup vs ' + (X.oppSet ? 'their lineup as set in Fantrax' : 'their best lineup') + ') and your chance to win each. Swing categories decide the week.</div><div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th class="num">You</th><th class="num">Them</th><th class="num">Win</th><th></th></tr></thead><tbody>' +
        E.CATS.map(function (cat, c) { var p = X.P[c].w + X.P[c].t / 2, tg = tag(p); return '<tr><td><b>' + esc(cat.l) + '</b></td><td class="num">' + fmtV(c, X.a.mu[c]) + '</td><td class="num">' + fmtV(c, X.b.mu[c]) + '</td><td class="num"><b>' + U.pct(p) + '</b></td><td><span class="badge ' + tg[0] + '">' + tg[1] + '</span></td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="small">' + (swing.length ? '<b>Swing categories:</b> ' + swing.map(function (x) { return esc(E.CATS[x.c].l); }).join(', ') + '.' : 'No true coin-flip categories this week.') + ' Skater games: you ' + X.gMe + ', them ' + X.gOpp + '.</p></div>';
      // tuned lineup
      var gain = X.T.eTuned - X.T.eBase, nm = function (p) { return ui.pcell(p, { pos: 1 }) + ' <span class="faint small">' + (E.games(p, wi).N || 0) + 'G</span>'; };
      h += '<div class="card"><h2>🎯 Lineup to beat ' + esc(U.teamName(opp)) + '</h2><div class="hint">Your best lineup against the league puts every stat on the same footing. Against this opponent, categories you\'ll win or lose by a mile hardly matter and the close ones matter most, so the lineup is re-optimized for this matchup.</div>' +
        '<div class="stats" style="margin:6px 0 10px">' + DP.statTile('Best vs the league', U.fmt(X.T.eBase, 1), 'expected cats vs them') + DP.statTile('Tuned for them', U.fmt(X.T.eTuned, 1), gain > 0.005 ? U.sgn(gain, 2) + ' cats' : 'same lineup') + (X.eSet !== null ? DP.statTile('As set in Fantrax', U.fmt(X.eSet, 1), 'expected cats vs them') : '') + '</div>' +
        (X.start.length ? '<div class="grid g2"><div><h3 class="small">⬆ Start</h3><ul class="list-plain">' + X.start.map(function (p) { return '<li>' + nm(p) + '</li>'; }).join('') + '</ul></div><div><h3 class="small">⬇ Sit</h3><ul class="list-plain">' + X.sit.map(function (p) { return '<li>' + nm(p) + '</li>'; }).join('') + '</ul></div></div>' : '<div class="callout good">✓ Your best lineup against the league is also your best against this team.</div>') +
        '<p class="small muted">Injured players left out (Daily Faceoff). Lineups lock ' + esc(DP.lockText(wi).replace(/^locks /, '')) + '.</p></div></div>';
      // what they do well this season (real weekly results)
      var H = X.hist;
      if (H.nReg && H.rank[opp]) {
        var r = H.rank[opp], best = r.map(function (x, c) { return [x, c]; }).sort(function (a, b) { return a[0] - b[0]; });
        h += '<div class="card" style="margin-top:14px"><h2>' + U.teamBadge(opp) + ' Their season, category by category</h2><div class="hint">Rank of 14 in weekly averages from the ' + H.nReg + ' weeks played (real results), and their category record.</div><div class="catgrid">' +
          best.map(function (x) { var c = x[1], rc = H.rec[opp][c]; return '<div class="catcell ' + (x[0] <= 4 ? 'hi' : x[0] >= 11 ? 'lo' : '') + '"><b>' + esc(E.CATS[c].l) + '</b><span class="num">' + U.ord(x[0]) + '</span><span class="small muted num">' + rc[0] + '-' + rc[1] + '-' + rc[2] + '</span></div>'; }).join('') + '</div>' +
          '<p class="small">Strongest: ' + best.slice(0, 3).map(function (x) { return esc(E.CATS[x[1]].l); }).join(', ') + ' · weakest: ' + best.slice(-3).reverse().map(function (x) { return esc(E.CATS[x[1]].l); }).join(', ') + '.</p></div>';
      }
      // their lineup this week
      var lu = X.B.lu, hurt = E.rosters[opp].filter(function (p) { return p.fs === 'A' && E.injuredOut(p, wi); });
      var top = lu.F.concat(lu.D, lu.G).map(function (x) { return x.p; }).sort(function (a, b) { return (E.games(b, wi).N || 0) - (E.games(a, wi).N || 0) || b.WAR - a.WAR; });
      h += '<div class="card" style="margin-top:14px"><h2>Their lineup this week</h2><div class="hint">' + (X.oppSet ? 'As set in Fantrax right now (it can still change before the lock)' : 'No Fantrax lineup set yet: their best lineup') + ', busiest first.</div><div class="lineup">' +
        top.map(function (p) { return '<div class="slot">' + ui.pos(p) + ui.plink(p) + ui.injBadge(p) + '<span class="gms">' + (E.games(p, wi).N || 0) + 'G</span></div>'; }).join('') + '</div>' +
        (hurt.length ? '<p class="small warn">Injured but active in Fantrax: ' + hurt.map(function (p) { return ui.plink(p) + ' (' + esc(p.inj[0]) + ')'; }).join(', ') + '.</p>' : '') +
        '<p class="small ' + (X.B.r.gFail > 0.12 ? 'warn' : 'muted') + '">Goalie minimum: they have a ' + U.pct(X.B.r.gFail) + ' chance of fewer than 2 goalie GP' + (X.B.r.gFail > 0.12 ? ', which would hand you all four goalie categories' : '') + '.</p></div>';
      el.innerHTML = h;
      U.qs('#sc-team', el).addEventListener('change', function (e) { DP.go('scout', null, { team: e.target.value === DP.state.team ? undefined : e.target.value }); });
      U.qs('#sc-w', el).addEventListener('change', function (e) { DP.go('scout', null, { team: q.team, w: e.target.value }); });
    }
  };
})();
