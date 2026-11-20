/* Dynasty Puck HQ - Tale of the Tape: any two teams side by side. This season (record, projected finish, odds),
   the dynasty picture (value, core by season, prospects, picks, cap), all 15 categories, every meeting (real and
   all-play) with the next scheduled one simulated, best players, and how the two fit as trade partners. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function catFmt(c, v) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    if (c === 12) return v.toFixed(2);
    if (c === 13) return U.rate(v);
    return U.fmt(v, v < 10 ? 1 : 0);
  }
  // both teams' numbers for one tale-of-the-tape line; better: 'hi' | 'lo' | null (no "better" side)
  DP.tapeData = function (a, b) {
    var E = DP.E, TS = DP.teamSummary(), C = E.contention(), act = E.actual(), L = E.LENS_MODEL;
    var place = {};
    if (act && act.done) act.list.slice().sort(function (x, y) { var p = function (r) { return (r.W + r.T / 2) / Math.max(1, r.W + r.L + r.T); }; return p(y) - p(x); }).forEach(function (r, i) { place[r.t] = i + 1; });
    var side = function (t) {
      var s = TS[t], ws = E.windowStrength(t), pk = E.picksOf(t), r = act && act.rec[t];
      return {
        t: t, s: s, c: C[t], rec: r || null, place: place[t] || null, ws: ws,
        picks: pk.length, pickV: E.sum(pk.map(function (x) { return E.pickValue(x, L); })),
        p1: pk.filter(function (x) { return x.round === 1; }).length
      };
    };
    var A = side(a), B = side(b), Y = E.YEARS;
    var rows = [
      { g: 'This season' },
      act && act.done ? { l: 'Category record', a: A.rec ? (A.rec.W + A.rec.T / 2) / Math.max(1, A.rec.W + A.rec.L + A.rec.T) : null, b: B.rec ? (B.rec.W + B.rec.T / 2) / Math.max(1, B.rec.W + B.rec.L + B.rec.T) : null, better: 'hi',
        f: function (v, X) { return X.rec ? X.rec.W + '-' + X.rec.L + '-' + X.rec.T + ' <span class="faint">' + U.ord(X.place) + '</span>' : '–'; } } : null,
      { l: 'Projected finish', a: A.s.exp.rank, b: B.s.exp.rank, better: 'lo', f: function (v, X) { return U.ord(v) + ' <span class="faint">' + U.fmt(X.s.exp.pct * 100, 1) + '%</span>'; } },
      { l: 'Playoff odds', a: A.c.po, b: B.c.po, better: 'hi', f: function (v) { return U.pct(v, 0); } },
      { l: 'Title odds', a: A.c.champ, b: B.c.champ, better: 'hi', f: function (v) { return U.pct(v, 1); } },
      { l: 'Starters\' ' + Y[0] + ' WAR', a: A.s.war, b: B.s.war, better: 'hi', f: function (v) { return U.fmt(v, 1); } },
      { l: 'Power rank', a: A.s.prank, b: B.s.prank, better: 'lo', f: function (v) { return U.ord(v); } },
      { g: 'Dynasty' },
      { l: 'Dynasty value (roster)', a: A.s.dv, b: B.s.dv, better: 'hi', f: function (v) { return U.fmt(v, 0); } },
      { l: 'Core strength ' + Y[1], a: A.ws[1], b: B.ws[1], better: 'hi', f: function (v) { return U.fmt(v, 1) + ' <span class="faint">WAR</span>'; } },
      { l: 'Core strength ' + Y[2], a: A.ws[2], b: B.ws[2], better: 'hi', f: function (v) { return U.fmt(v, 1) + ' <span class="faint">WAR</span>'; } },
      { l: 'Prospect pool', a: A.s.pros, b: B.s.pros, better: 'hi', f: function (v, X) { return U.fmt(v, 1) + ' <span class="faint">' + U.ord(X.s.prosRank) + ' · ' + X.s.nMnr + ' MNR</span>'; } },
      { l: 'Draft picks', a: A.pickV, b: B.pickV, better: 'hi', f: function (v, X) { return X.picks + ' <span class="faint">(' + X.p1 + ' first' + (X.p1 === 1 ? '' : 's') + ') · value ' + U.fmt(v, 1) + '</span>'; } },
      { l: 'Avg starter age', a: A.s.age, b: B.s.age, better: null, f: function (v) { return U.fmt(v, 1); } },
      { g: 'Cap' },
      { l: 'Cap space ' + Y[0], a: A.s.cap[0].space, b: B.s.cap[0].space, better: 'hi', f: function (v) { return U.m(v); } },
      { l: 'Committed ' + Y[1], a: A.s.cap[1].total, b: B.s.cap[1].total, better: null, f: function (v, X) { return U.m(v) + ' <span class="faint">' + U.m(X.s.cap[1].space) + ' free</span>'; } },
      { l: 'Roster', a: A.s.n, b: B.s.n, better: null, f: function (v) { return v + ' players'; } }
    ].filter(Boolean);
    var edge = { a: 0, b: 0 };
    rows.forEach(function (r) {
      if (r.g || !r.better || r.a === null || r.b === null || r.a === r.b) return;
      r.win = (r.better === 'hi') === (r.a > r.b) ? 'a' : 'b'; edge[r.win]++;
    });
    return { A: A, B: B, rows: rows, edge: edge };
  };
  DP.tapeMeetings = function (a, b) {
    var E = DP.E, act = E.actual(), done = act ? act.done : 0, H = DP.allPlayH2H ? DP.allPlayH2H() : null;
    var real = H ? H.real.filter(function (g) { return (g.a === a && g.b === b) || (g.a === b && g.b === a); }).map(function (g) { return { n: g.n, s: g.a === a ? g.sa : g.sb }; }) : [];
    var next = DP.meta.h2h.filter(function (m) { return m[0] > done && ((m[1] === a && m[2] === b) || (m[1] === b && m[2] === a)); }).map(function (m) { return m[0]; });
    var sim = null;
    if (next.length) {
      var wi = next[0] - 1, s = E.simWeek(E.baseline[a][wi], E.baseline[b][wi], 3000, 11), pr = E.matchupProbs(E.baseline[a][wi], E.baseline[b][wi]);
      sim = { n: next[0], win: s.win, loss: s.loss, tie: s.tie, cats: pr.map(function (x) { return x.w + x.t / 2; }) };
    }
    return { all: H ? H.M[a][b] : null, weeks: H ? H.weeks : 0, real: real, next: next, sim: sim };
  };

  DP.pages.tape = {
    title: 'Tale of the Tape',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team, T = E.teams;
      var a = T.indexOf(q.a) >= 0 ? q.a : (me || T[0]);
      var b = T.indexOf(q.b) >= 0 && q.b !== a ? q.b : null;
      if (!b) { var op = me && a === me && E.opponent ? E.opponent(me, E.nowWeek()) : null; b = op && op !== a ? op : T.filter(function (t) { return t !== a; })[0]; }
      var D = DP.tapeData(a, b), M = DP.tapeMeetings(a, b), A = D.A, B = D.B;
      var h = '<div class="page-head"><h1>📏 Tale of the Tape</h1><p class="sub">Any two teams side by side: this season, the dynasty picture, all 15 categories, every meeting and the best players. Projections and values are model estimates (see Rules & Methods).</p></div>';
      h += '<div class="controls"><label>Team ' + ui.teamSelect('tp-a', a) + '</label><button class="btn sm" id="tp-swap" title="Swap sides">⇄</button><label>vs ' + ui.teamSelect('tp-b', b) + '</label><button class="btn sm" id="tp-share">🖼️ Share as image</button></div>';
      var head = function (X, side) {
        return '<div class="tp-team ' + side + '" style="--tc:' + U.teamColor(X.t) + '"><a href="#/team/' + encodeURIComponent(X.t) + '">' + U.teamBadge(X.t, 'xl') + '</a><div><div class="tp-name">' + esc(U.teamName(X.t)) + '</div><div class="small muted">' + (X.rec ? X.rec.W + '-' + X.rec.L + '-' + X.rec.T + ' · ' : '') + DP.tierBadge(X.t) + '</div></div></div>';
      };
      h += '<div class="card tp-head">' + head(A, 'l') + '<div class="tp-vs"><b>' + D.edge.a + '</b><span>edges</span><b>' + D.edge.b + '</b></div>' + head(B, 'r') + '</div>';
      // the tale
      h += '<div class="card tp-card"><h2>The tale</h2><div class="hint">The highlighted side is better on that line (age, roster size and next season\'s commitments have no better side). The edge count above adds them up.</div><div class="tp-rows">' + D.rows.map(function (r) {
        if (r.g) return '<div class="tp-g">' + esc(r.g) + '</div>';
        return '<div class="tp-row"><span class="tp-v l' + (r.win === 'a' ? ' win' : '') + '">' + (r.a === null ? '–' : r.f(r.a, A)) + '</span><span class="tp-l">' + esc(r.l) + '</span><span class="tp-v r' + (r.win === 'b' ? ' win' : '') + '">' + (r.b === null ? '–' : r.f(r.b, B)) + '</span></div>';
      }).join('') + '</div></div>';
      // categories
      var S = E.catStrength('blend'), Hh = S.hist, P = S.proj, nT = T.length, catEdge = [0, 0];
      h += '<div class="card tp-card" style="margin-top:14px"><h2>Category by category</h2><div class="hint">Bars = category strength rank in the league (actual results so far blended with the rest-of-season projection, as on Category Insights). Numbers = ' + (Hh.nReg ? 'per week so far' : 'projected per week') + ' and league rank.</div><div class="tp-rows">' + E.CATS.map(function (cat, c) {
        var ra = S.rank[a][c], rb = S.rank[b][c], va = Hh.nReg ? Hh.avg[a][c] : P.avg[a][c], vb = Hh.nReg ? Hh.avg[b][c] : P.avg[b][c];
        if (ra < rb) catEdge[0]++; else if (rb < ra) catEdge[1]++;
        var bar = function (r, side) { return '<span class="tp-bar ' + side + '"><i style="width:' + Math.round((nT - r + 1) / nT * 100) + '%;background:' + U.teamColor(side === 'l' ? a : b) + '"></i></span>'; };
        return '<div class="tp-row cat"><span class="tp-v l' + (ra < rb ? ' win' : '') + '">' + catFmt(c, va) + ' <span class="faint">' + U.ord(ra) + '</span></span>' + bar(ra, 'l') + '<span class="tp-l" title="' + esc(cat.name) + '">' + esc(cat.l) + '</span>' + bar(rb, 'r') + '<span class="tp-v r' + (rb < ra ? ' win' : '') + '"><span class="faint">' + U.ord(rb) + '</span> ' + catFmt(c, vb) + '</span></div>';
      }).join('') + '</div><p class="small muted" style="margin-top:8px">' + esc(U.teamName(a)) + ' ranks higher in <b>' + catEdge[0] + '</b>, ' + esc(U.teamName(b)) + ' in <b>' + catEdge[1] + '</b> of 15.</p></div>';
      // meetings
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>Head to head</h2>';
      if (M.real.length) h += '<ul class="list-plain">' + M.real.map(function (g) { var res = g.s.W > g.s.L ? 'W' : g.s.W < g.s.L ? 'L' : 'T'; return '<li><span class="wkchip ' + res + '"><span class="wk">W' + g.n + '</span><b>' + res + '</b> <span class="num">' + g.s.W + '-' + g.s.L + '-' + g.s.T + '</span></span> <span class="small muted">' + esc(U.teamName(a)) + '\'s result</span></li>'; }).join('') + '</ul>';
      else h += '<p class="small muted">They haven\'t met yet this season.</p>';
      if (M.all && M.weeks) h += '<p class="small">All-play, every week played (' + M.weeks + '): <b>' + esc(U.teamName(a)) + ' ' + M.all.W + '-' + M.all.L + '-' + M.all.T + '</b> in categories, ' + M.all.wk[0] + '-' + M.all.wk[1] + '-' + M.all.wk[2] + ' in weeks. <a href="#/rivals">Rivalries</a></p>';
      if (M.sim) h += '<div class="tp-sim"><div class="small muted">Next meeting: Week ' + M.sim.n + (M.next.length > 1 ? ' (then ' + M.next.slice(1).map(function (n) { return 'W' + n; }).join(', ') + ')' : '') + '</div>' +
        '<div class="tp-odds"><span style="width:' + (M.sim.win * 100).toFixed(1) + '%;background:' + U.teamColor(a) + '"></span><span style="width:' + (M.sim.tie * 100).toFixed(1) + '%" class="tie"></span><span style="width:' + (M.sim.loss * 100).toFixed(1) + '%;background:' + U.teamColor(b) + '"></span></div>' +
        '<div class="small"><b>' + U.pct(M.sim.win, 0) + '</b> ' + esc(U.teamName(a)) + ' · ' + U.pct(M.sim.tie, 0) + ' tie · <b>' + U.pct(M.sim.loss, 0) + '</b> ' + esc(U.teamName(b)) + ' <span class="muted">(projected lineups, 3,000 simulated weeks)</span></div></div>';
      else h += '<p class="small muted">No more scheduled meetings in the regular season.</p>';
      var fit = E.partnerFit(a, b), cl = function (x) { return x.map(function (y) { return E.CATS[y.c].l; }).join(', '); };
      h += '</div><div class="card"><h2>Trade fit</h2><div class="hint">Categories one side is strong in and the other needs (from the category ranks above).</div>' +
        '<p><b class="num">' + U.fmt(fit.score, 1) + '</b> <span class="small muted">fit score (Category Insights scale)</span></p>' +
        '<p class="small">' + esc(U.teamName(a)) + ' could get: <b>' + esc(cl(fit.get) || 'nothing obvious') + '</b><br>' + esc(U.teamName(b)) + ' could get: <b>' + esc(cl(fit.give) || 'nothing obvious') + '</b></p>' +
        '<a class="btn sm" href="' + U.hash('trade', null, { t: a + ',' + b }) + '">Open the Trade Machine with both</a></div></div>';
      // best players
      var top = function (t) { return E.rosters[t].slice().sort(function (x, y) { return y.DV - x.DV; }).slice(0, 10); };
      var col = function (t) { return '<ol class="list-plain tp-pl">' + top(t).map(function (p, i) { return '<li><span class="faint num">' + (i + 1) + '</span>' + ui.pcell(p, { pos: 1 }) + '<span class="num small" style="margin-left:auto">' + U.fmt(p.DV, 1) + '</span></li>'; }).join('') + '</ol>'; };
      h += '<div class="card" style="margin-top:14px"><h2>Best players by dynasty value</h2><div class="grid g2"><div>' + U.teamChip(a, { b: 1 }) + col(a) + '</div><div>' + U.teamChip(b, { b: 1 }) + col(b) + '</div></div></div>';
      el.innerHTML = h;
      var go = function (x, y) { DP.go('tape', null, { a: x, b: y }); };
      U.qs('#tp-a', el).addEventListener('change', function (e) { go(e.target.value, b === e.target.value ? a : b); });
      U.qs('#tp-b', el).addEventListener('change', function (e) { go(a === e.target.value ? b : a, e.target.value); });
      U.qs('#tp-swap', el).addEventListener('click', function () { go(b, a); });
      U.qs('#tp-share', el).addEventListener('click', function () {
        var rows = [{ kind: 'head', text: 'Edges ' + D.edge.a + ' – ' + D.edge.b + ' · categories ' + catEdge[0] + ' – ' + catEdge[1] }];
        D.rows.forEach(function (r) {
          if (r.g || r.a === null || r.b === null) return;
          var plain = function (v, X) { var d = document.createElement('div'); d.innerHTML = r.f(v, X); return d.textContent; };
          rows.push({ kind: 'text', text: r.l + ':  ' + plain(r.a, A) + (r.win === 'a' ? ' ◀' : '') + '   vs   ' + plain(r.b, B) + (r.win === 'b' ? ' ◀' : '') });
        });
        if (M.sim) rows.push({ kind: 'text', text: 'Next meeting (Week ' + M.sim.n + '): ' + U.pct(M.sim.win, 0) + ' / ' + U.pct(M.sim.tie, 0) + ' tie / ' + U.pct(M.sim.loss, 0) + ' (model)', muted: true });
        DP.shareCard({ title: 'Tale of the Tape', sub: U.teamName(a) + ' vs ' + U.teamName(b), accent: U.teamColor(a), rows: rows, foot: ((DP.meta.alerts || {}).siteUrl || '') + U.hash('tape', null, { a: a, b: b }) }, 'dynasty-puck-tape-' + a + '-' + b + '.png');
      });
    }
  };
})();
