/* Dynasty Puck HQ - GM Report Cards: every GM graded against the other 13 on five things the site already measures.
   Results (season all-play), Lineup calls (category points the best single bench swap would have added, from the lineup
   regrets), Waiver wire (pickups' value now if kept + 0.6 per week started, minus value lost on drops that got away),
   Trades (net dynasty value today from this league year's trades, model lens) and Roster value (change since the first
   night on file). Grades are ranks among the teams graded (no trades = no trade grade), turned into letters; the
   overall grade is the average. Luck (category points vs what the projections expected) is shown, not graded. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var LET = [[0.15, 'A', 4], [0.25, 'A-', 3.7], [0.4, 'B+', 3.3], [0.55, 'B', 3], [0.7, 'B-', 2.7], [0.8, 'C+', 2.3], [0.9, 'C', 2], [1.01, 'D', 1]];
  var GPA = [[3.85, 'A'], [3.5, 'A-'], [3.15, 'B+'], [2.85, 'B'], [2.5, 'B-'], [2.15, 'C+'], [1.85, 'C'], [-1, 'D']];
  var KEYS = [['res', 'Results', '🏒'], ['lin', 'Lineup calls', '🪑'], ['wav', 'Waiver wire', '🛒'], ['trd', 'Trades', '🤝'], ['val', 'Roster value', '📈']];
  DP.GRADE_KEYS = KEYS;
  var WEEK_START = 0.6, YEAR0 = '2026 offseason';

  // letter grades by rank among the teams that have a number (ties share the better rank)
  function grade(rows, k, lowGood) {
    var has = rows.filter(function (r) { return r[k] !== null && r[k] !== undefined; });
    var sorted = has.slice().sort(function (a, b) { return lowGood ? a[k] - b[k] : b[k] - a[k]; }), n = sorted.length;
    sorted.forEach(function (r) {
      var rank = 1 + sorted.filter(function (o) { return lowGood ? o[k] < r[k] - 1e-9 : o[k] > r[k] + 1e-9; }).length, p = n > 1 ? (rank - 1) / (n - 1) : 0;
      var L = LET.filter(function (x) { return p < x[0]; })[0];
      r.g[k] = { l: L[1], pts: L[2], rank: rank, of: n };
    });
  }
  DP.letterFromGpa = function (x) { return GPA.filter(function (g) { return x >= g[0]; })[0][1]; };
  function inYear(tr) { return tr.season === DP.meta.season || tr.season === YEAR0 || (tr.date || '') >= '2026-07-01'; }

  // the whole report: needs data/values.js (DP.values) and the week files (details) loaded
  DP.gmReport = function (details) {
    var E = DP.E, H = E.history(), done = H.weeks.filter(function (w) { return w.games && w.games.length; }), V = DP.values;
    var rows = E.teams.map(function (t) { return { t: t, g: {}, notes: [] }; }), by = {};
    rows.forEach(function (r) { by[r.t] = r; });
    // results: season all-play strength and record
    var st = DP._weekly ? DP._weekly.standingsAfter(H, done.length ? done[done.length - 1].n : 0).by : {};
    rows.forEach(function (r) {
      var a = done.map(function (w) { var x = w.ap && w.ap[r.t]; return x ? E.sum(x) / x.length : null; }).filter(function (x) { return x !== null; });
      r.res = a.length ? E.sum(a) / a.length : null; r.rec = st[r.t] || null;
    });
    // lineup calls: category points the best single swap would have added, per week played
    var nW = 0;
    rows.forEach(function (r) { r.linTot = 0; r.linFlip = 0; r.linWorst = null; });
    done.forEach(function (w) {
      var R = DP.lineupRegrets ? DP.lineupRegrets(w.n) : null; if (!R) return;
      nW++;
      R.forEach(function (x) {
        var r = by[x.t]; if (!r) return;
        r.linTot += x.gain / 2; if (x.flip) r.linFlip++;
        if (!r.linWorst || x.flip > r.linWorst.flip || (x.flip === r.linWorst.flip && x.gain > r.linWorst.gain)) r.linWorst = x;
      });
    });
    rows.forEach(function (r) { r.linWeeks = nW; r.lin = nW ? r.linTot / nW : null; });
    // waiver wire: pickups (value now if still here, weeks started) and the drops that got away
    var X = V && DP.transactions ? DP.transactions(details) : null;
    rows.forEach(function (r) { r.wav = X ? 0 : null; r.adds = 0; r.addWk = 0; r.addVal = 0; r.lost = 0; r.bestAdd = null; r.worstDrop = null; });
    if (X) {
      X.adds.forEach(function (a) {
        var r = by[a.m.to]; if (!r) return;
        var s = (a.kept && a.v1 !== null ? a.v1 : 0) + WEEK_START * (a.st ? a.st.wk : 0);
        r.adds++; r.addWk += a.st ? a.st.wk : 0; r.addVal += a.kept && a.v1 !== null ? a.v1 : 0; r.wav += s;
        if (s > 0 && (!r.bestAdd || s > r.bestAdd.s)) r.bestAdd = { a: a, s: s };
      });
      X.drops.forEach(function (d) {
        var r = by[d.m.from]; if (!r || d.d === null || d.d <= 0 || d.gm === d.m.from) return;
        r.lost += d.d; r.wav -= d.d;
        if (!r.worstDrop || d.d > r.worstDrop.d) r.worstDrop = d;
      });
    }
    // trades this league year: net value today (model lens)
    rows.forEach(function (r) { r.trd = null; r.nTr = 0; r.bestTr = null; r.worstTr = null; });
    (DP.tradeNets ? DP.tradeNets() : []).forEach(function (x) {
      if (!inYear(x.tr)) return;
      Object.keys(x.net).forEach(function (t) {
        var r = by[t]; if (!r) return;
        r.trd = (r.trd || 0) + x.net[t]; r.nTr++;
        var o = { tr: x.tr, v: x.net[t] };
        if (!r.bestTr || o.v > r.bestTr.v) r.bestTr = o;
        if (!r.worstTr || o.v < r.worstTr.v) r.worstTr = o;
      });
    });
    // roster value since the first night on file
    rows.forEach(function (r) { var v = V && V.teams && V.teams[r.t]; r.val = v && v.length > 1 ? v[v.length - 1] - v[0] : null; r.val0 = V ? V.dates[0] : null; });
    // luck (not graded)
    var L = DP.luckMeter ? DP.luckMeter() : null;
    (L || []).forEach(function (x) { if (by[x.t]) by[x.t].luck = x.luck; });

    grade(rows, 'res'); grade(rows, 'lin', true); grade(rows, 'wav'); grade(rows, 'trd'); grade(rows, 'val');
    rows.forEach(function (r) {
      var gs = KEYS.map(function (k) { return r.g[k[0]]; }).filter(Boolean);
      r.gpa = gs.length ? E.sum(gs.map(function (g) { return g.pts; })) / gs.length : null;
      r.overall = r.gpa !== null ? DP.letterFromGpa(r.gpa) : '–';
    });
    rows.sort(function (a, b) { return (b.gpa || 0) - (a.gpa || 0) || (b.res || 0) - (a.res || 0); });
    rows.forEach(function (r, i) { r.rank = i + 1; r.notes = notes(r); });
    return { rows: rows, by: by, weeks: nW, from: V ? V.dates[0] : null };
  };

  function dt(d) { return U.date(new Date(d + 'T12:00:00Z')); }
  function others(tr, t) { return tr.teams.filter(function (x) { return x !== t; }).map(function (x) { return esc(U.teamName(x)); }).join(' and '); }
  // a few lines per GM, all from the numbers above
  function notes(r) {
    var out = [];
    if (r.bestAdd) { var a = r.bestAdd.a; out.push('Best pickup: ' + (a.p ? ui.plink(a.p) : esc(a.m.n)) + ' (' + dt(a.m.d) + (a.kept && a.v1 !== null ? ', worth ' + U.fmt(a.v1, 1) + ' now' : ', since moved on') + (a.st && a.st.wk ? ', started ' + a.st.wk + ' week' + (a.st.wk > 1 ? 's' : '') : '') + ').'); }
    if (r.worstDrop) out.push('Got away: ' + (r.worstDrop.p ? ui.plink(r.worstDrop.p) : esc(r.worstDrop.m.n)) + ', dropped ' + dt(r.worstDrop.m.d) + ', up ' + U.fmt(r.worstDrop.d, 1) + ' in value since.');
    if (r.bestTr && r.bestTr.v >= 0.5) out.push('Best trade: ' + dt(r.bestTr.tr.date) + ' with ' + others(r.bestTr.tr, r.t) + ' (+' + U.fmt(r.bestTr.v, 1) + ' in value today).');
    if (r.worstTr && r.worstTr.v <= -0.5 && r.worstTr !== r.bestTr) out.push('Costliest trade: ' + dt(r.worstTr.tr.date) + ' with ' + others(r.worstTr.tr, r.t) + ' (' + U.fmt(r.worstTr.v, 1) + ').');
    if (r.linWorst) out.push('Costliest lineup call: week ' + r.linWorst.n + ', ' + DP.regretText(r.linWorst, { team: false }));
    else if (r.linWeeks) out.push('No week where a bench swap would have helped. A clean sheet.');
    if (r.luck !== undefined && Math.abs(r.luck) >= 2) out.push((r.luck > 0 ? 'Lucky: ' : 'Unlucky: ') + U.fmt(Math.abs(r.luck), 1) + ' category points ' + (r.luck > 0 ? 'above' : 'below') + ' what the projections expected (not graded).');
    return out;
  }
  function num(r, k) {
    if (k === 'res') return r.res === null ? '–' : U.pct(r.res) + (r.rec ? ' <span class="faint">' + r.rec.W + '-' + r.rec.L + '-' + r.rec.T + '</span>' : '');
    if (k === 'lin') return r.lin === null ? '–' : U.fmt(r.lin, 2) + '<span class="faint">/wk</span>' + (r.linFlip ? ' <span class="faint">' + r.linFlip + ' flip' + (r.linFlip > 1 ? 's' : '') + '</span>' : '');
    if (k === 'wav') return r.wav === null ? '–' : U.sgn(r.wav, 1) + ' <span class="faint">' + r.adds + ' add' + (r.adds === 1 ? '' : 's') + '</span>';
    if (k === 'trd') return r.trd === null ? '<span class="faint">no trades</span>' : U.sgn(r.trd, 1) + ' <span class="faint">' + r.nTr + ' trade' + (r.nTr === 1 ? '' : 's') + '</span>';
    if (k === 'val') return r.val === null ? '–' : U.sgn(r.val, 1);
    return '';
  }
  function gl(g) { return g ? '<span class="gr gr-' + g.l.charAt(0) + '" title="' + U.ord(g.rank) + ' of ' + g.of + '">' + esc(g.l) + '</span>' : '<span class="gr gr-none">–</span>'; }
  DP.gradeChip = function (l) { return '<span class="gr gr-' + esc(String(l).charAt(0)) + '">' + esc(l) + '</span>'; };

  DP.pages.grades = {
    title: 'GM Report Cards',
    render: function (el) {
      var E = DP.E, me = DP.state.team;
      var h = '<div class="page-head"><h1>📝 GM Report Cards</h1><p class="sub">Every GM graded against the other 13 on five things the site measures: results, lineup calls, the waiver wire, trades and roster value. Grades are ranks, not opinions (how each is measured is under the table and on Rules & Methods). Luck is shown but not graded.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the value history and the weekly lines…</p></div>';
      var weeks = E.history().weeks.map(function (w) { return w.n; });
      DP.loadValues(function () {
        DP.loadWeeks(weeks, function (details) {
          var box = U.qs('.lz', el); if (!box) return;
          var G = DP.gmReport(details);
          var hh = '<div class="controls"><button class="btn sm" id="gr-img">🖼️ Share as image</button><button class="btn sm" id="gr-copy">📋 Copy for the chat</button><span class="small muted">' + G.weeks + ' week' + (G.weeks === 1 ? '' : 's') + ' played' + (G.from ? ' · values since ' + dt(G.from) : '') + '</span></div>';
          hh += '<div class="card flush"><div class="tbl-wrap"><table class="t grtab"><thead><tr><th>#</th><th>GM</th><th>Overall</th>' + KEYS.map(function (k) { return '<th>' + k[2] + ' ' + esc(k[1]) + '</th>'; }).join('') + '<th title="Category points vs what the projections expected; not graded">🍀 Luck</th></tr></thead><tbody>' +
            G.rows.map(function (r) {
              return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td class="num">' + r.rank + '</td><td>' + U.teamChip(r.t, { link: 1, b: 1 }) + '</td><td>' + DP.gradeChip(r.overall) + ' <span class="small muted num">' + (r.gpa !== null ? U.fmt(r.gpa, 2) : '') + '</span></td>' +
                KEYS.map(function (k) { return '<td class="nw">' + gl(r.g[k[0]]) + ' <span class="small num">' + num(r, k[0]) + '</span></td>'; }).join('') +
                '<td class="num small">' + (r.luck !== undefined ? ui.delta(r.luck, 1) : '–') + '</td></tr>';
            }).join('') + '</tbody></table></div></div>';
          hh += '<p class="small muted">How it is measured: <b>Results</b> = season all-play (the share of the other teams each week\'s 15 category totals would have beaten). <b>Lineup calls</b> = category points per week the best single bench or minors swap would have added (lower is better; see Lineup regrets). <b>Waiver wire</b> = dynasty value of pickups still on the roster + ' + WEEK_START + ' per week a pickup started, minus value gained since the drop by players who got away. <b>Trades</b> = net dynasty value today from trades since the 2026 offseason (model lens; teams with no trades aren\'t graded). <b>Roster value</b> = change in the team\'s total dynasty value since the first night on file. Letters by rank: top 15% A, then A-, B+, B, B-, C+, C, D; overall = the average.</p>';
          hh += '<div class="grid g2" style="margin-top:14px">' + G.rows.map(function (r) {
            return '<div class="card grcard' + (r.t === me ? ' mine' : '') + '" id="gr-' + esc(r.t) + '" style="--tc:' + U.teamColor(r.t) + '"><h2>' + U.teamChip(r.t, { link: 1, b: 1 }) + '<span style="margin-left:auto">' + DP.gradeChip(r.overall) + '</span></h2>' +
              '<div class="grrow">' + KEYS.map(function (k) { return '<div class="grcell"><span class="small muted">' + k[2] + ' ' + esc(k[1]) + '</span>' + gl(r.g[k[0]]) + '<span class="small num">' + num(r, k[0]) + '</span></div>'; }).join('') + '</div>' +
              (r.notes.length ? '<ul class="small grnotes">' + r.notes.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '') + '</div>';
          }).join('') + '</div>';
          box.innerHTML = hh;
          var txt = function () { return 'Dynasty Puck GM report cards (' + G.weeks + ' weeks)\n' + G.rows.map(function (r) { return r.rank + '. ' + U.teamName(r.t) + ': ' + r.overall + ' (' + KEYS.map(function (k) { return k[1] + ' ' + (r.g[k[0]] ? r.g[k[0]].l : '–'); }).join(', ') + ')'; }).join('\n') + '\n' + location.href; };
          U.qs('#gr-copy', el).addEventListener('click', function () { U.copy(txt(), 'Report cards copied. Paste them in the league chat.'); });
          U.qs('#gr-img', el).addEventListener('click', function () {
            DP.shareCard({ title: 'GM Report Cards', sub: 'results · lineup calls · waiver wire · trades · roster value', rows: G.rows.map(function (r) { return { kind: 'team', t: r.t, text: r.rank + '. ' + U.teamName(r.t), right: r.overall + '  ' + KEYS.map(function (k) { return r.g[k[0]] ? r.g[k[0]].l : '–'; }).join(' ') }; }), foot: ((DP.meta.alerts || {}).siteUrl || '') + '#/grades' }, 'dynasty-puck-report-cards.png');
          });
        });
      });
    }
  };
})();
