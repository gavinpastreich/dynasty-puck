/* Dynasty Puck HQ - Contracts & Cap, 2027 Offseason Planner. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  function lastYear(p) { var i = p.cy.map(function (x) { return typeof x === 'number'; }).lastIndexOf(true); return i; }
  function nextStatus(p) { var i = lastYear(p); return i >= 0 && i < 6 ? p.cy[i + 1] : null; }

  // ------------------------------------------------------------ Contracts & Cap
  DP.pages.cap = {
    title: 'Contracts & Cap',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, t = hsh.q.team || me || E.teams[0];
      var h = '<div class="page-head"><h1>Contracts & Cap</h1><p class="sub">$' + E.CAP + 'M cap (2026-27; future seasons assumed flat). 2026-27 salaries from Fantrax; later seasons from the contract sheet (through 2032-33). Contract types: BID, RFA1, ELC1 ($1.5M), MNR ($0), FA. Dropped contracts leave 50% dead cap for each remaining year.</p></div>';
      h += '<div class="card flush"><h2>League cap table</h2><div class="hint">Committed salary by season. Red = over the cap. Click a team for its chart.</div><div id="cap-league" style="padding:0 12px 12px"></div></div>';
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>Team cap by season</h2><div class="controls"><label>Team ' + ui.teamSelect('cap-team', t) + '</label></div><div id="cap-chart"></div></div>';
      h += '<div class="card"><h2>Extension price calculator</h2><div class="hint">League extension formulas (2027 scale: 1yr S+1.5, 2yr 1.5S+1.5, 3yr 1.5S+3, 4yr 1.5S+4, 5yr 1.75S+5, 6yr 1.75S+6). Pick a player to see value at each length.</div>' +
        '<div class="controls"><label>Salary $M <input type="number" id="ext-s" step="0.1" min="0" value="3.0"></label><label>Scale <select id="ext-scale"><option value="ext2027">2027 offseason</option><option value="ext2026">2026 (old +1.0 bases)</option></select></label></div>' +
        '<div class="controls"><label>or player <select id="ext-p"><option value="">–</option>' + E.P.filter(function (p) { return p.gm && (p.act27 || p.ct === 'RFA1' || p.ct === 'ELC1' || nextStatus(p) === 'RFA'); }).sort(U.by(function (p) { return p.n; })).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.n + ' (' + p.gm + ', ' + U.m(p.sal26) + ')') + '</option>'; }).join('') + '</select></label></div><div id="ext-out"></div></div>';
      h += '<div class="card span2"><h2>Salary vs value</h2><div class="hint">Every owned non-MNR contract: 2026-27 salary vs projected WAR. The dashed line is what the league pays per win (' + U.m(E.dollarPerWAR, 2) + '/WAR above the $1M minimum). Above the line = bargain, below = overpay. Your team in orange. Click a dot for the player.</div><div id="cap-scatter"></div></div>';
      h += '<div class="card span2"><h2>Expiring contracts & RFA / UFA timeline</h2><div class="hint">Last season of each current deal and what happens next. RFA = team keeps rights and can extend at formula prices; UFA | BID = back to the auction.</div><div id="cap-exp"></div></div>';
      h += '<div class="card span2"><h2>2027 offseason action list</h2><div class="hint">From the contract sheet ("27 Offseason Action Required"). Decide to re-sign (at the price for the chosen term) or drop. <a href="#/offseason">Open the 2027 planner →</a></div><div id="cap-act"></div></div>';
      h += '<div class="card span2"><h2>Dead-cap calculator</h2><div class="controls"><label>Player <select id="dc-p"><option value="">Choose a contract…</option>' + E.P.filter(function (p) { return p.gm && p.sal26 > 0; }).sort(U.by(function (p) { return p.sal26; }, true)).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.n + ' (' + p.gm + ') ' + U.m(p.sal26)) + '</option>'; }).join('') + '</select></label></div><div id="dc-out" class="small muted">Dropping a player keeps 50% of each remaining season\'s salary on your cap (commissioner, 2026-09-25).</div></div>';
      h += '</div>';
      el.innerHTML = h;

      // league table
      var rows = E.teams.map(function (tm) { var c = E.teamCap(tm); return { t: tm, c: c }; });
      ui.table(U.qs('#cap-league', el), {
        rows: rows, sort: 'y0', csv: 'league-cap.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<a href="' + U.hash('cap', null, { team: r.t }) + '"><b>' + esc(U.teamName(r.t)) + '</b></a>'; } }]
          .concat(E.YEARS.map(function (y, i) {
            return { k: 'y' + i, l: y, cls: 'num', v: function (r) { return r.c[i].total; }, f: function (r) { var v = r.c[i].total; return '<span class="' + (v > E.CAP ? 'bad' : '') + '">' + U.m(v, 1) + '</span><br><span class="small faint">' + U.m(E.CAP - v, 1) + ' space</span>'; }, csv: function (r) { return r.c[i].total.toFixed(2); } };
          })).concat([{ k: 'n', l: 'Players', cls: 'num', v: function (r) { return E.rosters[r.t].length; } }])
      });
      var sc = E.P.filter(function (p) { return p.gm && p.ct !== 'MNR' && p.r && p.sal26 > 0; });
      U.qs('#cap-scatter', el).innerHTML = C.scatter(sc.map(function (p) {
        return { x: p.sal26, y: p.WAR, hl: p.gm === me, pid: p.id, label: p.n, tip: '<div class="tv">' + esc(p.n) + '</div><div class="tl">' + esc(p.gm) + ' · ' + U.m(p.sal26) + ' · WAR ' + U.fmt(p.WAR, 1) + ' · surplus ' + U.sm(p.surplus) + '</div>' };
      }), { width: 980, height: 380, xFmt: function (v) { return '$' + v + 'M'; }, yFmt: function (v) { return U.fmt(v); }, xLabel: '2026-27 salary', yLabel: 'Projected WAR', line: { a: -E.RULES.minSalary / E.dollarPerWAR, b: 1 / E.dollarPerWAR, label: 'market rate' }, title: 'Salary vs WAR',
        legend: me ? '<span><span class="k" style="background:var(--accent);border-radius:50%"></span>' + esc(U.teamName(me)) + '</span><span><span class="k" style="background:var(--s1);border-radius:50%"></span>other teams</span>' : '' });
      // team chart
      function chart(tm) {
        var cap = E.teamCap(tm), types = ['BID', 'RFA1', 'ELC1', 'FA', 'MNR'];
        var series = types.map(function (ty, k) { return { name: ty, values: cap.map(function (y) { return y.byType[ty] || 0; }), color: C.SERIES[k] }; }).filter(function (s) { return s.values.some(function (v) { return v > 0; }); });
        U.qs('#cap-chart', el).innerHTML = C.stacked(E.YEARS.map(function (y) { return y.slice(2); }), series, { refLine: E.CAP, refLabel: '$' + E.CAP + 'M cap', fmt: function (v) { return U.m(v); }, tickFmt: function (v) { return '$' + v + 'M'; }, title: 'Committed cap' }) +
          '<p class="small muted">' + esc(U.teamName(tm)) + ': ' + U.m(cap[0].total) + ' committed in 2026-27, ' + U.m(cap[1].total) + ' in 2027-28 before re-signings and ELC graduations.</p>';
      }
      chart(t);
      U.qs('#cap-team', el).addEventListener('change', function (e) { chart(e.target.value); U.setQuery({ team: e.target.value }); });
      // extension calc
      function ext() {
        var pid = U.qs('#ext-p', el).value, p = pid ? E.byId[pid] : null;
        var S = p ? p.sal26 : +U.qs('#ext-s', el).value || 0, sc = E.RULES[U.qs('#ext-scale', el).value];
        if (p) U.qs('#ext-s', el).value = S.toFixed(2);
        var prices = E.extPrices(S, sc), hh = '<div class="tbl-wrap"><table class="t"><thead><tr><th>Term</th><th class="num">AAV</th><th class="num">Total</th>' + (p ? '<th class="num">Proj. market (avg)</th><th class="num">Surplus (disc.)</th>' : '') + '</tr></thead><tbody>';
        var best = null;
        prices.forEach(function (pr, i) {
          var yrs = i + 1, cells = '';
          if (p) {
            var start = Math.max(1, lastYear(p) + 1), mk = 0, sur = 0;
            for (var y = 0; y < yrs; y++) {
              var yi = Math.min(6, start + y), m = E.RULES.minSalary + Math.max(0, p.yWar[yi]) * E.dollarPerWAR;
              mk += m; sur += Math.pow(E.DISCOUNT, yi) * (m - pr);
            }
            if (!best || sur > best.s) best = { i: i, s: sur };
            cells = '<td class="num">' + U.m(mk / yrs) + '</td><td class="num">' + ui.delta(sur, 1) + '</td>';
          }
          hh += '<tr><td>' + yrs + ' yr' + (yrs > 1 ? 's' : '') + '</td><td class="num"><b>' + U.m(pr) + '</b></td><td class="num">' + U.m(pr * yrs, 1) + '</td>' + cells + '</tr>';
        });
        hh += '</tbody></table></div>';
        if (p && best) hh += '<p class="small">' + (best.s > 0 ? 'Best value: <b>' + (best.i + 1) + '-year</b> extension (projected surplus ' + U.sm(best.s) + ', discounted).' : '<b class="bad">Every length projects negative surplus. Consider letting him go.</b>') + ' Market = $1M + projected WAR × ' + U.m(E.dollarPerWAR, 2) + '.</p>';
        U.qs('#ext-out', el).innerHTML = hh;
      }
      ['#ext-s', '#ext-scale', '#ext-p'].forEach(function (s) { U.qs(s, el).addEventListener('input', ext); U.qs(s, el).addEventListener('change', ext); });
      ext();
      // expiring
      var exp = E.P.filter(function (p) { return p.gm && p.ct !== 'MNR' && lastYear(p) >= 0; });
      ui.table(U.qs('#cap-exp', el), {
        rows: exp, sort: 'last', desc: false, csv: 'expiring-contracts.csv', search: function (p) { return p.n + ' ' + p.gm; },
        filters: [{ l: 'Team', opts: [['', 'All']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: me || '', fn: function (p, v) { return p.gm === v; } },
          { l: 'Next', opts: [['', 'All'], ['RFA', 'RFA'], ['UFA', 'UFA']], fn: function (p, v) { return nextStatus(p) === v; } }],
        cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'gm', l: 'Team', v: function (p) { return p.gm; } }, { k: 'ct', l: 'Contract', v: function (p) { return p.ct; }, f: function (p) { return ui.pill(p.ct); } },
          { k: 'sal', l: 'Salary', cls: 'num', v: function (p) { return p.sal26; }, f: function (p) { return U.m(p.sal26); } },
          { k: 'last', l: 'Last season', cls: 'num', v: function (p) { return lastYear(p); }, f: function (p) { return E.YEARS[lastYear(p)]; } },
          { k: 'next', l: 'Then', v: function (p) { return nextStatus(p) || ''; }, f: function (p) { var s = nextStatus(p); return s === 'RFA' ? '<span class="badge warn">RFA</span>' : s === 'UFA' ? '<span class="badge bad">UFA</span>' : '<span class="faint">–</span>'; } },
          { k: 'WAR', l: 'WAR', cls: 'num', v: function (p) { return p.WAR; }, f: function (p) { return ui.warCell(p.WAR); } },
          { k: 'DV', l: 'Dynasty', cls: 'num', v: function (p) { return p.DV; }, f: function (p) { return U.fmt(p.DV, 1); } }]
      });
      // action list
      DP.actionTable(U.qs('#cap-act', el));
      U.qs('#dc-p', el).addEventListener('change', function (e) {
        var p = E.byId[e.target.value]; if (!p) return;
        var d = E.deadCap(p);
        U.qs('#dc-out', el).innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th></th>' + E.YEARS.map(function (y) { return '<th class="num">' + y.slice(2) + '</th>'; }).join('') + '<th class="num">Total</th></tr></thead><tbody><tr><td>Salary</td>' + p.cy.map(function (v) { return '<td class="num">' + (typeof v === 'number' ? U.m(v) : '<span class="faint">' + esc(v || '–') + '</span>') + '</td>'; }).join('') + '<td></td></tr><tr><td><b>Dead cap if dropped</b></td>' + d.map(function (v) { return '<td class="num bad">' + (v ? U.m(v) : '–') + '</td>'; }).join('') + '<td class="num bad"><b>' + U.m(E.sum(d)) + '</b></td></tr><tr><td>Cap saved</td>' + p.cy.map(function (v, i) { return '<td class="num good">' + (typeof v === 'number' && v ? U.m(v - d[i]) : '–') + '</td>'; }).join('') + '<td></td></tr></tbody></table></div><p class="small muted">' + esc(p.n) + ' projects ' + U.fmt(p.WAR, 1) + ' WAR (market ' + U.m(p.mkt) + '). Dropping frees ' + U.m(p.sal26 - d[0]) + ' this season.</p>';
      });
    }
  };

  DP.actionTable = function (box, team) {
    var E = DP.E, acts = (DP.offseason.act27 || []).filter(function (a) { return !team || a.gm === team; });
    var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); };
    var rows = acts.map(function (a) { var p = E.P.find(function (x) { return norm(x.n) === norm(a.name) && x.gm; }) || E.P.find(function (x) { return norm(x.n) === norm(a.name); }); return { a: a, p: p }; });
    ui.table(box, {
      rows: rows, sort: 'gm', desc: false, csv: '2027-offseason-actions.csv',
      cols: [{ k: 'n', l: 'Player', v: function (r) { return r.a.name; }, f: function (r) { return r.p ? ui.pcell(r.p) : esc(r.a.name); } }, { k: 'gm', l: 'GM', v: function (r) { return r.p && r.p.gm ? r.p.gm : r.a.gm; } },
        { k: 'ct', l: 'Contract', v: function (r) { return r.a.ct; }, f: function (r) { return ui.pill(r.a.ct); } },
        { k: 'sal', l: 'Salary', cls: 'num', v: function (r) { return r.a.sal; }, f: function (r) { return U.m(r.a.sal / 1e6); } },
        { k: 'to', l: '2027-28', v: function (r) { return r.a.y2728; } }]
        .concat([1, 2, 3, 4, 5, 6].map(function (y, i) { return { k: 'e' + y, l: y + 'yr', cls: 'num', v: function (r) { return r.a.ext[i]; }, f: function (r) { return r.a.ext[i] !== null && r.a.ext[i] !== undefined ? U.m(+r.a.ext[i]) : '–'; } }; }))
        .concat([{ k: 'war', l: 'WAR 27-28', cls: 'num', v: function (r) { return r.p ? r.p.yWar[1] : null; }, f: function (r) { return r.p ? U.fmt(r.p.yWar[1], 1) : '–'; } },
          { k: 'rec', l: 'Model call', v: function (r) { return r.p ? DP.resignCall(r.p, r.a).label : ''; }, f: function (r) { if (!r.p) return '–'; var c = DP.resignCall(r.p, r.a); return '<span class="badge ' + c.cls + '">' + esc(c.label) + '</span>'; } }])
    });
  };

  // best extension length (or drop) for a 2027 action player: discounted surplus vs market by term
  DP.resignCall = function (p, a) {
    var E = DP.E, S = a && a.sal ? a.sal / 1e6 : p.sal26, prices = E.extPrices(S, E.RULES.ext2027), best = { i: -1, s: 0 };
    prices.forEach(function (pr, i) {
      var sur = 0;
      for (var y = 0; y <= i; y++) { var yi = Math.min(6, 1 + y), m = E.RULES.minSalary + Math.max(0, p.yWar[yi]) * E.dollarPerWAR; sur += Math.pow(E.DISCOUNT, yi) * (m - pr); }
      if (sur > best.s) best = { i: i, s: sur, price: pr };
    });
    if (best.i < 0) return { label: 'Drop / let walk', cls: 'bad', s: 0 };
    return { label: 'Re-sign ' + (best.i + 1) + 'yr @ ' + U.m(best.price), cls: best.s > 3 ? 'good' : 'warn', s: best.s, yrs: best.i + 1, price: best.price };
  };

  // ------------------------------------------------------------ 2027 Offseason planner
  DP.pages.offseason = {
    title: '2027 Offseason',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, t = hsh.q.team || me;
      var h = '<div class="page-head"><h1>2027 Offseason Planner</h1><p class="sub">Re-sign or drop decisions using the 2027 extension formulas and projected value, MNR graduation and ELC calls, and a preview of next summer\'s UFA auction.</p></div>';
      h += '<div class="controls"><label>Team ' + ui.teamSelect('os-team', t, 'All teams') + '</label></div>';
      h += '<div class="card"><h2>Re-sign or drop (2027 action list)</h2><div class="hint">Model call = the extension length with the best discounted surplus (projected market value minus formula price), or drop if none is positive.</div><div id="os-act"></div></div>';
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>MNR graduations & ELC calls</h2><div class="hint">Players who have reached, or are projected to reach, 82 career NHL GP (41 for goalies) this season. Each needs an ELC ($1.5M, 2 years, then RFA) or a drop. Sign if 2027-28 projected value beats $1.5M.</div><div id="os-elc"></div></div>';
      h += '<div class="card"><h2>2027 cap outlook</h2><div class="hint">2027-28 commitments, planned ELCs and the recommended re-signings from above.</div><div id="os-cap"></div></div></div>';
      h += '<div class="card" style="margin-top:14px"><h2>2027 UFA auction preview</h2><div class="hint">Contracts ending after 2026-27 that go back to the auction ("UFA | BID"), with projected 2027-28 WAR and market value. Useful for planning cap space and bids.</div><div id="os-ufa"></div></div>';
      el.innerHTML = h;
      U.qs('#os-team', el).addEventListener('change', function (e) { DP.go('offseason', null, { team: e.target.value }); });
      DP.actionTable(U.qs('#os-act', el), t);
      var grads = E.P.filter(function (p) { return p.gm && p.ct === 'MNR' && (!t || p.gm === t); }).map(function (p) { return { p: p, g: E.graduation(p) }; }).filter(function (x) { return x.g.status === 'graduated' || x.g.week !== null; });
      ui.table(U.qs('#os-elc', el), {
        rows: grads, sort: 'wk', desc: false, page: 30,
        cols: [{ k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p); } }, { k: 'gm', l: 'GM', v: function (x) { return x.p.gm; } },
          { k: 'gp', l: 'Career GP', cls: 'num', v: function (x) { return x.g.cgp; }, f: function (x) { return x.g.cgp + '/' + x.g.thr; } },
          { k: 'wk', l: 'Grad week', cls: 'num', v: function (x) { return x.g.week === null ? -1 : x.g.week; }, f: function (x) { return x.g.status === 'graduated' ? 'already' : 'wk ' + (x.g.week + 1); } },
          { k: 'w27', l: 'WAR 27-28', cls: 'num', v: function (x) { return x.p.yWar[1]; }, f: function (x) { return U.fmt(x.p.yWar[1], 1); } },
          { k: 'call', l: 'Call', v: function (x) { return x.p.yWar[1] * E.dollarPerWAR + 1 - 1.5; }, f: function (x) { var v = E.RULES.minSalary + Math.max(0, x.p.yWar[1]) * E.dollarPerWAR; return v >= 1.5 || x.p.DV > 1 ? '<span class="badge good">Sign ELC</span>' : '<span class="badge warn">Borderline</span>'; } }]
      });
      // cap outlook
      var teams = t ? [t] : E.teams;
      var capRows = teams.map(function (tm) {
        var c = E.teamCap(tm), elc = grads.filter(function (x) { return x.p.gm === tm; }).length * E.RULES.elcSalary;
        var res = (DP.offseason.act27 || []).filter(function (a) { return a.gm === tm; }).map(function (a) { var p = E.P.find(function (x) { return x.n === a.name; }); return p ? DP.resignCall(p, a) : null; }).filter(function (c2) { return c2 && c2.price; });
        var re = E.sum(res.map(function (r) { return r.price; }));
        return { t: tm, base: c[1].total, elc: elc, re: re, tot: c[1].total + elc + re };
      });
      U.qs('#os-cap', el).innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">Committed 27-28</th><th class="num">+ ELCs</th><th class="num">+ re-signs</th><th class="num">Total</th><th class="num">Space</th></tr></thead><tbody>' + capRows.sort(function (a, b) { return a.tot - b.tot; }).map(function (r) {
        return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td><b>' + esc(r.t) + '</b></td><td class="num">' + U.m(r.base, 1) + '</td><td class="num">' + U.m(r.elc, 1) + '</td><td class="num">' + U.m(r.re, 1) + '</td><td class="num"><b>' + U.m(r.tot, 1) + '</b></td><td class="num ' + (E.CAP - r.tot < 0 ? 'bad' : 'good') + '">' + U.m(E.CAP - r.tot, 1) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Cap assumed flat at $' + E.CAP + 'M. ELC count uses this season\'s projected graduations.</p>';
      // UFA preview
      var ufa = E.P.filter(function (p) { return p.gm && (!t || p.gm === t) && lastYear(p) === 0 && nextStatus(p) === 'UFA'; });
      ui.table(U.qs('#os-ufa', el), {
        rows: ufa, sort: 'w27', csv: '2027-ufa-preview.csv', search: function (p) { return p.n + ' ' + p.gm; },
        cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'gm', l: 'Current GM', v: function (p) { return p.gm; } }, { k: 'sal', l: '2026-27 salary', cls: 'num', v: function (p) { return p.sal26; }, f: function (p) { return U.m(p.sal26); } },
          { k: 'age', l: 'Age next fall', cls: 'num', v: function (p) { return (p.age || 0) + 1; }, f: function (p) { return U.fmt((p.age || 0) + 1, 0); } },
          { k: 'w27', l: 'Proj WAR 27-28', cls: 'num', v: function (p) { return p.yWar[1]; }, f: function (p) { return U.fmt(p.yWar[1], 1); } },
          { k: 'mk', l: 'Proj market', cls: 'num', v: function (p) { return E.RULES.minSalary + Math.max(0, p.yWar[1]) * E.dollarPerWAR; }, f: function (p) { return U.m(E.RULES.minSalary + Math.max(0, p.yWar[1]) * E.dollarPerWAR); } }]
      });
    }
  };
})();
