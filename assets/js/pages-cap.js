/* Dynasty Puck HQ - Contracts & Cap, 2027 Offseason Planner. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  function lastYear(p) { var i = p.cy.map(function (x) { return typeof x === 'number'; }).lastIndexOf(true); return i; }
  function nextStatus(p) { var i = lastYear(p); return i >= 0 && i < 6 ? p.cy[i + 1] : null; }
  var KIND = { elcUp: 'ELC up', rfaInit: 'RFA (sheet formula)', rfaElc: 'RFA (post-ELC)' };
  DP.KIND = KIND;
  // what happens when a player's current deal ends, per league rules + the model's choice
  DP.nextLabel = function (p) {
    var d = DP.E.nextDecision(p);
    if (d && d.why === 'age') return { t: 'UFA (27+)', cls: 'bad', d: d };
    if (d) return { t: KIND[d.kind] || 'RFA', cls: 'warn', d: d };
    var i = lastYear(p);
    return i >= 0 && i < 6 && p.yStatus && p.yStatus[i + 1] === 'UFA' ? { t: 'UFA', cls: 'bad' } : { t: '', cls: '' };
  };
  DP.decisionHtml = function (p, opts) {
    var E = DP.E; if (!p.gm || !p.yDec) return '';
    var d = E.nextDecision(p), h = '', yr = function (y) { return 'summer ' + (2026 + y); };
    if (!d) {
      var i = p.yStatus.indexOf('UFA');
      if (i < 0) return '';
      var ap1 = i === 1 ? E.auctionPrice(p, 1) : null;
      return '<div class="callout small">Contract ends after ' + E.YEARS[i - 1] + ': goes back to the UFA auction in ' + yr(i) + '.' + (ap1 ? ' Projected auction price ~<b>' + U.m(ap1.mid) + '</b> (' + U.m(ap1.lo) + '–' + U.m(ap1.hi) + ', a ' + ap1.term + '-year band).' : '') + '</div>';
    }
    h += '<div class="card" style="margin-top:12px"><h3>Next contract decision · ' + esc(yr(d.y)) + '</h3>';
    if (d.why === 'age') {
      h += '<p class="small">Turns 27 before June 30, ' + (2026 + d.y) + ', so there are no RFA rights: he goes to the UFA auction.</p>';
    } else {
      h += '<div class="hint">' + (d.kind === 'elcUp' ? 'ELC expires. League options: 2y $2.5M, 3y $4.0M, 4y $5.5M, 5y $7.0M, 6y $9.0M, one more ELC year at $1.75M (then UFA), or release.'
        : d.kind === 'rfaElc' ? 'RFA contract (signed off an ELC) is up and he is under 27 on June 30: re-sign 2-6 years at 1.5x (2-4 yrs) or 1.75x (5-6 yrs) of the base; the base can\'t drop.'
          : 'Initial-auction RFA, priced with the contract-sheet formula (premium × current salary + add-on by length).') + ' Surplus = projected market value − AAV over the term, discounted.</div>';
      h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Option</th><th class="num">AAV</th><th class="num">Total</th><th class="num">Surplus</th></tr></thead><tbody>' + d.opts.map(function (o) {
        var on = d.pick && d.pick === o;
        return '<tr class="' + (on ? 'mine' : '') + '"><td>' + esc(o.label) + (on ? ' <span class="badge good">model pick</span>' : '') + '</td><td class="num">' + U.m(o.price) + '</td><td class="num">' + U.m(o.price * o.L, 1) + '</td><td class="num">' + ui.delta(o.v, 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      if (!d.pick) h += '<p class="small bad">No option projects positive surplus: the model lets him walk.</p>';
    }
    var ap = d.y === 1 ? E.auctionPrice(p, 1) : null;
    if (ap) h += '<p class="small muted">If he reaches the 2027 UFA auction instead: ~<b>' + U.m(ap.mid) + '</b> (middle half of outcomes ' + U.m(ap.lo) + '–' + U.m(ap.hi) + ', a ' + ap.term + '-year band).</p>';
    return h + '</div>';
  };
  function bandsTable(y) {
    var E = DP.E, b = E.bands(y);
    return '<div class="tbl-wrap"><table class="t"><thead><tr><th>Winning bid</th><th class="num">Term</th></tr></thead><tbody>' + b.map(function (r) {
      return '<tr><td>' + U.m(r[0]) + (r[1] === null ? '+' : ' – ' + U.m(r[1])) + '</td><td class="num">' + r[2] + ' yr' + (r[2] > 1 ? 's' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  DP.bandsTable = bandsTable;

  // ------------------------------------------------------------ Contracts & Cap
  DP.pages.cap = {
    title: 'Contracts & Cap',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, t = hsh.q.team || me || E.teams[0];
      var h = '<div class="page-head"><h1>Contracts & Cap</h1><p class="sub">Cap by season: ' + E.YEARS.slice(0, 4).map(function (y, i) { return y + ' <b>$' + E.capY(i) + 'M</b>'; }).join(' · ') + ' (' + esc(DP.meta.capNote || '') + ') 2026-27 salaries from Fantrax; later seasons from the contract sheet. Contract types: BID, RFA1, ELC1 ($1.5M), MNR ($0), FA. Dropped contracts leave 50% dead cap for each remaining year.</p></div>';
      h += '<div class="card flush"><h2>League cap table</h2><div class="hint">Committed salary by season. Red = over the cap. Click a team for its chart.</div><div id="cap-league" style="padding:0 12px 12px"></div></div>';
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>Team cap by season</h2><div class="controls"><label>Team ' + ui.teamSelect('cap-team', t) + '</label></div><div id="cap-chart"></div></div>';
      h += '<div class="card"><h2>Contract option calculator</h2><div class="hint">Pick a player to see every option at his next decision (ELC up, RFA re-sign, or auction) with the model\'s pick. Or price an initial-auction RFA by salary with the sheet formula (2027: 1yr S+1.5, 2yr 1.5S+1.5, 3yr 1.5S+3, 4yr 1.5S+4, 5yr 1.75S+5, 6yr 1.75S+6).</div>' +
        '<div class="controls"><label>Salary $M <input type="number" id="ext-s" step="0.1" min="0" value="3.0"></label><label>Scale <select id="ext-scale"><option value="ext2027">2027 offseason</option><option value="ext2026">2026 (old +1.0 bases)</option></select></label></div>' +
        '<div class="controls"><label>or player <select id="ext-p"><option value="">–</option>' + E.P.filter(function (p) { return p.gm && E.nextDecision(p); }).sort(U.by(function (p) { return p.n; })).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.n + ' (' + p.gm + ', ' + U.m(p.sal26) + ')') + '</option>'; }).join('') + '</select></label></div><div id="ext-out"></div></div>';
      h += '<div class="card span2"><h2>Salary vs value</h2><div class="hint">Every owned non-MNR contract: 2026-27 salary vs projected WAR. The dashed line is what the league pays per win (' + U.m(E.dollarPerWAR, 2) + '/WAR above the $1M minimum). Above the line = bargain, below = overpay. Your team in orange. Click a dot for the player.</div><div id="cap-scatter"></div></div>';
      h += '<div class="card"><h2>Auction bands (2026 & 2027 offseasons)</h2><div class="hint">The winning bid sets the contract length. Commissioner, 2026-09-26 ($104M-cap bands; the 2025 initial auction used $95.5M bands: $1-2.49M 1 yr … $12.5M+ 6 yrs).</div>' + bandsTable(1) + '</div>';
      h += '<div class="card"><h2>2027 auction market</h2><div class="hint">Projected price model, calibrated on the 2026 offseason auction.</div><div id="cap-mkt"></div></div>';
      h += '<div class="card span2"><h2>Expiring contracts & RFA / UFA timeline</h2><div class="hint">Last season of each current deal and what happens next under league rules: <b>ELC up</b> (ELC menu), <b>RFA</b> (under 27 on June 30: re-sign at formula prices), <b>UFA</b> (back to the auction; 27+ lose RFA rights). The model call is the option with the best projected surplus.</div><div id="cap-exp"></div></div>';
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
            return { k: 'y' + i, l: y, cls: 'num', v: function (r) { return r.c[i].total; }, f: function (r) { var v = r.c[i].total; return '<span class="' + (r.c[i].space < 0 ? 'bad' : '') + '">' + U.m(v, 1) + '</span><br><span class="small faint">' + U.m(r.c[i].space, 1) + ' of $' + r.c[i].cap + 'M</span>'; }, csv: function (r) { return r.c[i].total.toFixed(2); } };
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
        U.qs('#cap-chart', el).innerHTML = C.stacked(E.YEARS.map(function (y) { return y.slice(2); }), series, { refLine: cap.map(function (y) { return y.cap; }), refLabel: 'cap', fmt: function (v) { return U.m(v); }, tickFmt: function (v) { return '$' + v + 'M'; }, title: 'Committed cap' }) +
          '<p class="small muted">' + esc(U.teamName(tm)) + ': ' + U.m(cap[0].total) + ' committed in 2026-27, ' + U.m(cap[1].total) + ' of $' + cap[1].cap + 'M in 2027-28 before re-signings and ELC graduations.</p>';
      }
      chart(t);
      U.qs('#cap-team', el).addEventListener('change', function (e) { chart(e.target.value); U.setQuery({ team: e.target.value }); });
      // extension calc
      function ext() {
        var pid = U.qs('#ext-p', el).value, p = pid ? E.byId[pid] : null;
        if (p) { U.qs('#ext-out', el).innerHTML = DP.decisionHtml(p) || '<p class="small muted">No decision in the window.</p>'; return; }
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
          { l: 'Next', opts: [['', 'All'], ['RFA', 'RFA / ELC up'], ['UFA', 'UFA']], fn: function (p, v) { var t = DP.nextLabel(p).t; return v === 'UFA' ? t.indexOf('UFA') === 0 : t && t.indexOf('UFA') !== 0; } }],
        cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'gm', l: 'Team', v: function (p) { return p.gm; } }, { k: 'ct', l: 'Contract', v: function (p) { return p.ct; }, f: function (p) { return ui.pill(p.ct); } },
          { k: 'sal', l: 'Salary', cls: 'num', v: function (p) { return p.sal26; }, f: function (p) { return U.m(p.sal26); } },
          { k: 'last', l: 'Last season', cls: 'num', v: function (p) { return lastYear(p); }, f: function (p) { return E.YEARS[lastYear(p)]; } },
          { k: 'next', l: 'Then', v: function (p) { return DP.nextLabel(p).t; }, f: function (p) { var x = DP.nextLabel(p); return x.t ? '<span class="badge ' + x.cls + '">' + esc(x.t) + '</span>' : '<span class="faint">–</span>'; } },
          { k: 'call', l: 'Model call', v: function (p) { var d = E.nextDecision(p); return d && d.pick ? d.pick.price : -1; }, f: function (p) { var d = E.nextDecision(p); if (!d || d.why) return '<span class="faint">–</span>'; return d.pick ? '<span class="small">' + d.pick.L + 'y @ ' + U.m(d.pick.price) + '</span>' : '<span class="small bad">let walk</span>'; } },
          { k: 'WAR', l: 'WAR', cls: 'num', v: function (p) { return p.WAR; }, f: function (p) { return ui.warCell(p.WAR); } },
          { k: 'DV', l: 'Dynasty', cls: 'num', v: function (p) { return p.DV; }, f: function (p) { return U.fmt(p.DV, 1); } }]
      });
      // action list
      DP.actionTable(U.qs('#cap-act', el));
      U.qs('#cap-mkt', el).innerHTML = DP.marketHtml();
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
    var d0 = DP.E.nextDecision(p);
    if (d0 && d0.y === 1) {
      if (d0.why === 'age') return { label: 'UFA (27+)', cls: 'bad', s: 0 };
      if (!d0.pick) return { label: 'Drop / let walk', cls: 'bad', s: 0 };
      return { label: (d0.pick.label.indexOf('ELC extension') >= 0 ? '1-yr ELC ext' : 'Re-sign ' + d0.pick.L + 'yr') + ' @ ' + U.m(d0.pick.price), cls: d0.pick.v > 3 ? 'good' : 'warn', s: d0.pick.v, yrs: d0.pick.L, price: d0.pick.price };
    }
    var E = DP.E, S = a && a.sal ? a.sal / 1e6 : p.sal26, prices = E.extPrices(S, E.RULES.ext2027), best = { i: -1, s: 0 };
    prices.forEach(function (pr, i) {
      var sur = 0;
      for (var y = 0; y <= i; y++) { var yi = Math.min(6, 1 + y), m = E.RULES.minSalary + Math.max(0, p.yWar[yi]) * E.dollarPerWAR; sur += Math.pow(E.DISCOUNT, yi) * (m - pr); }
      if (sur > best.s) best = { i: i, s: sur, price: pr };
    });
    if (best.i < 0) return { label: 'Drop / let walk', cls: 'bad', s: 0 };
    return { label: 'Re-sign ' + (best.i + 1) + 'yr @ ' + U.m(best.price), cls: best.s > 3 ? 'good' : 'warn', s: best.s, yrs: best.i + 1, price: best.price };
  };

  // 2027 auction market summary
  DP.marketHtml = function () {
    var E = DP.E, A = E.auction; if (!A) return '';
    return '<div class="stats" style="margin:0 0 8px">' + DP.statTile('2026 auction', U.m(A.spent, 0), A.n + ' players · ' + U.m(A.space26, 0) + ' of space') +
      DP.statTile('2027 space (proj.)', U.m(A.space27, 0), 'cap $' + E.capY(1) + 'M × 14 − commitments − modeled ELC/RFA deals') +
      DP.statTile('Price level vs 2026', '×' + U.fmt(A.scale27, 2), A.n27 + ' rostered players projected to hit the market') + '</div>' +
      '<p class="small muted">Price = $1M + ' + U.fmt(A.k, 3) + ' × (value over the next 3 seasons, in WAR, discounted) × price level. Fit on the 62 BID contracts signed in the 2026 auction: owners paid about 3–4× more per projected win for players under 27 than for 31+ veterans, which the 3-season value captures. Price level = (league cap space ÷ 2026 space) ÷ (value on the market ÷ 2026 market). Range = middle half of 2026 prices relative to the model. The 2026 auction had no true stars, so projected star prices are likely low (the 2025 initial auction, when every team had full cap room, paid $17.4M for McDavid).</p>';
  };

  // ------------------------------------------------------------ 2027 Offseason planner
  DP.pages.offseason = {
    title: '2027 Offseason',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, t = hsh.q.team || me;
      var h = '<div class="page-head"><h1>2027 Offseason Planner</h1><p class="sub">Every contract decision coming next summer under the league rules (ELC menu, RFA formulas, the 27-and-over UFA cutoff), the model\'s call on each, MNR graduations and ELCs, the 2027-28 cap ($' + E.capY(1) + 'M), and a priced preview of the 2027 UFA auction.</p></div>';
      h += '<div class="controls"><label>Team ' + ui.teamSelect('os-team', t, 'All teams') + '</label></div>';
      h += '<div class="card"><h2>Decisions for summer 2027</h2><div class="hint">Players whose current deal ends after 2026-27. <b>ELC up</b>: 2y $2.5M · 3y $4.0M · 4y $5.5M · 5y $7.0M · 6y $9.0M · 1 more ELC year at $1.75M (then UFA) · release. <b>RFA (sheet formula)</b>: initial-auction players, priced like the contract sheet\'s 2027 tab. <b>UFA (27+)</b>: 27 or older on June 30, 2027, so no RFA rights. Model call = the option with the best projected surplus (market value − AAV, discounted); click a player for the full option table.</div><div id="os-dec"></div></div>';
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>MNR graduations & ELCs</h2><div class="hint">Players who have reached, or are projected to reach, 82 career NHL GP (41 for goalies) this season. They stay at $0 for the rest of 2026-27 and sign a $1.5M ELC this coming offseason (or are dropped). 🔒 = in an Active slot in Fantrax now: if he graduates there, he can\'t be moved back down to the minors.</div><div id="os-elc"></div></div>';
      h += '<div class="card"><h2>2027-28 cap outlook</h2><div class="hint">Committed deals + new ELCs + the model\'s re-sign calls, against the $' + E.capY(1) + 'M cap.</div><div id="os-cap"></div></div></div>';
      h += '<div class="card" style="margin-top:14px"><h2>2027 UFA auction preview</h2><div class="hint">Rostered players whose rights end after this season (contract up, 27+, or projected to be let go), with a projected auction price and the band term that price implies. Plus the ' + E.P.filter(function (p) { return !p.gm && p.r; }).length + ' players unowned today, who are also in the pool.</div>' + DP.marketHtml() + '<div id="os-ufa"></div></div>';
      el.innerHTML = h;
      U.qs('#os-team', el).addEventListener('change', function (e) { DP.go('offseason', null, { team: e.target.value }); });
      var mine = function (p) { return p.gm && (!t || p.gm === t); };

      // decisions
      var dec = E.P.filter(function (p) { var d = E.nextDecision(p); return mine(p) && d && d.y === 1; });
      ui.table(U.qs('#os-dec', el), {
        rows: dec, sort: 'war', csv: '2027-decisions.csv', search: function (p) { return p.n + ' ' + p.gm; },
        cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'gm', l: 'GM', v: function (p) { return p.gm; } },
          { k: 'now', l: 'Now', v: function (p) { return p.sal26; }, f: function (p) { return ui.pill(p.ct) + ' ' + U.m(p.sal26); } },
          { k: 'age', l: 'Age 6/30/27', cls: 'num', v: function (p) { return E.ageJune30(p, 1); }, f: function (p) { var a = E.ageJune30(p, 1); return '<span class="' + (a >= 27 ? 'bad' : '') + '">' + U.fmt(a, 1) + '</span>'; } },
          { k: 'kind', l: 'Situation', v: function (p) { return DP.nextLabel(p).t; }, f: function (p) { var x = DP.nextLabel(p); return '<span class="badge ' + x.cls + '">' + esc(x.t) + '</span>'; } },
          { k: 'war', l: 'WAR 27-28', cls: 'num', v: function (p) { return p.yWar[1]; }, f: function (p) { return U.fmt(p.yWar[1], 1); } },
          { k: 'call', l: 'Model call', v: function (p) { var d = E.nextDecision(p); return d.pick ? d.pick.v : -1; }, f: function (p) { var c = DP.resignCall(p); return '<span class="badge ' + c.cls + '">' + esc(c.label) + '</span>'; } },
          { k: 'sur', l: 'Surplus', cls: 'num', v: function (p) { var d = E.nextDecision(p); return d.pick ? d.pick.v : 0; }, f: function (p) { var d = E.nextDecision(p); return d.pick ? ui.delta(d.pick.v, 1) : '–'; } },
          { k: 'auc', l: 'If auctioned', cls: 'num', title: 'Projected 2027 auction price if he is let go', v: function (p) { var a = E.auctionPrice(p, 1); return a ? a.mid : 0; }, f: function (p) { var a = E.auctionPrice(p, 1); return a ? U.m(a.mid) + ' <span class="faint small">' + a.term + 'y</span>' : '–'; } }]
      });

      // graduations
      var grads = E.P.filter(function (p) { return mine(p) && p.ct === 'MNR'; }).map(function (p) { return { p: p, g: E.graduation(p) }; }).filter(function (x) { return x.g.status === 'graduated' || x.g.week !== null; });
      ui.table(U.qs('#os-elc', el), {
        rows: grads, sort: 'wk', desc: false, page: 30,
        cols: [{ k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p) + (x.p.fs === 'A' ? ' <span title="Active in Fantrax now: locked to the active roster once he graduates">🔒</span>' : ''); } }, { k: 'gm', l: 'GM', v: function (x) { return x.p.gm; } },
          { k: 'gp', l: 'Career GP', cls: 'num', v: function (x) { return x.g.cgp; }, f: function (x) { return x.g.cgp + '/' + x.g.thr; } },
          { k: 'wk', l: 'Grad week', cls: 'num', v: function (x) { return x.g.week === null ? -1 : x.g.week; }, f: function (x) { return x.g.status === 'graduated' ? 'already' : 'wk ' + (x.g.week + 1); } },
          { k: 'w27', l: 'WAR 27-28', cls: 'num', v: function (x) { return x.p.yWar[1]; }, f: function (x) { return U.fmt(x.p.yWar[1], 1); } },
          { k: 'call', l: 'Call', v: function (x) { return x.p.DV; }, f: function (x) { return x.p.DV > 0.5 || E.RULES.minSalary + Math.max(0, x.p.yWar[1]) * E.dpwY(1) >= E.RULES.elcSalary ? '<span class="badge good">Sign ELC</span>' : '<span class="badge warn">Borderline</span>'; } }]
      });

      // cap outlook
      var teams = t ? [t] : E.teams;
      var capRows = teams.map(function (tm) {
        var ros = E.rosters[tm], base = 0, elc = 0, re = 0;
        ros.forEach(function (p) {
          var c = p.yCost[1]; if (typeof c !== 'number') return;
          var st = p.yStatus[1];
          if (st === 'ELC' && p.ct === 'MNR') elc += c; else if (/^(RFA|ELC ext)/.test(st) && E.nextDecision(p) && E.nextDecision(p).y === 1) re += c; else base += c;
        });
        var tot = base + elc + re;
        return { t: tm, base: base, elc: elc, re: re, tot: tot, space: E.capY(1) - tot };
      });
      U.qs('#os-cap', el).innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">Committed</th><th class="num">+ ELCs</th><th class="num">+ re-signs</th><th class="num">Total</th><th class="num">Space</th></tr></thead><tbody>' + capRows.sort(function (a, b) { return b.space - a.space; }).map(function (r) {
        return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td><b>' + esc(r.t) + '</b></td><td class="num">' + U.m(r.base, 1) + '</td><td class="num">' + U.m(r.elc, 1) + '</td><td class="num">' + U.m(r.re, 1) + '</td><td class="num"><b>' + U.m(r.tot, 1) + '</b></td><td class="num ' + (r.space < 0 ? 'bad' : 'good') + '">' + U.m(r.space, 1) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">2027-28 cap $' + E.capY(1) + 'M (NHL/NHLPA agreement). ELCs follow this season\'s projected graduations; re-signs follow the model calls above.</p>';

      // UFA preview
      var ufa = E.P.filter(function (p) { return mine(p) && p.yStatus && p.yStatus[1] === 'UFA'; });
      ui.table(U.qs('#os-ufa', el), {
        rows: ufa, sort: 'auc', csv: '2027-ufa-preview.csv', search: function (p) { return p.n + ' ' + p.gm; },
        cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'gm', l: 'Current GM', v: function (p) { return p.gm; } }, { k: 'sal', l: '2026-27', cls: 'num', v: function (p) { return p.sal26; }, f: function (p) { return ui.pill(p.ct) + ' ' + U.m(p.sal26); } },
          { k: 'why', l: 'Why', v: function (p) { var d = E.nextDecision(p); return d ? (d.why === 'age' ? 'age' : 'walk') : 'ends'; }, f: function (p) { var d = E.nextDecision(p); return d && d.y === 1 ? (d.why === 'age' ? '<span class="small">27+</span>' : '<span class="small">model lets go</span>') : '<span class="small">UFA | BID</span>'; } },
          { k: 'age', l: 'Age next fall', cls: 'num', v: function (p) { return (p.age || 0) + 1; }, f: function (p) { return U.fmt((p.age || 0) + 1, 0); } },
          { k: 'w27', l: 'Proj WAR 27-28', cls: 'num', v: function (p) { return p.yWar[1]; }, f: function (p) { return U.fmt(p.yWar[1], 1); } },
          { k: 'auc', l: 'Proj price', cls: 'num', v: function (p) { return E.auctionPrice(p, 1).mid; }, f: function (p) { var a = E.auctionPrice(p, 1); return '<b>' + U.m(a.mid) + '</b><br><span class="faint small">' + U.m(a.lo) + '–' + U.m(a.hi) + '</span>'; } },
          { k: 'term', l: 'Band', cls: 'num', v: function (p) { return E.auctionPrice(p, 1).term; }, f: function (p) { return E.auctionPrice(p, 1).term + ' yr'; } }]
      });
    }
  };
})();
