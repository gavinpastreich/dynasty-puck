/* Dynasty Puck HQ - Rankings Hub: every ranking the site keeps, side by side, with a consensus. Standings (the weekly
   category results), Power Rankings, Elo, playoff and title odds (season simulation), the GM report card, total
   dynasty value, schedule luck and the schedule left (Season Grid). Consensus = the average of the four "how good is
   this team this season" ranks: standings, power, Elo and playoff odds. Each column links to its page. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var rankBy = function (rows, k, asc) { rows.slice().sort(function (a, b) { var x = a[k], y = b[k]; if (x === null || x === undefined) return 1; if (y === null || y === undefined) return -1; return asc ? x - y : y - x; }).forEach(function (r, i) { r[k + 'R'] = r[k] === null || r[k] === undefined ? null : i + 1; }); };

  DP.rankingsData = function (sim, report) {
    var E = DP.E, H = E.history(), fin = H.weeks.filter(function (w) { return w.games && w.games.length; }), last = fin.length ? fin[fin.length - 1].n : 0;
    var st = last && DP._weekly ? DP._weekly.standingsAfter(H, last).by : {}, P = last && DP.powerAfter ? DP.powerAfter(last) : null, EL = DP.eloData ? DP.eloData() : null, TS = DP.teamSummary(), G = DP.gridData ? DP.gridData() : null;
    var S = {}; (sim || []).forEach(function (r) { S[r.t] = r; });
    var rows = E.teams.map(function (t) {
      var g = G ? G.rows.filter(function (r) { return r.t === t; })[0] : null;
      return { t: t, pts: st[t] ? st[t].W + st[t].T / 2 : null, rec: st[t] || null, pw: P && P.by[t] ? -P.by[t].rank : null, elo: EL ? EL.by[t].r : null, po: S[t] ? S[t].po : null, ch: S[t] ? S[t].champ : null,
        gpa: report && report.by[t] ? report.by[t].gpa : null, grade: report && report.by[t] ? report.by[t].overall : null, dv: TS[t] ? TS[t].dv : null, luck: EL ? EL.by[t].luck : null, sos: g ? g.sos : null };
    });
    rankBy(rows, 'pts'); rankBy(rows, 'pw'); rankBy(rows, 'elo'); rankBy(rows, 'po'); rankBy(rows, 'ch'); rankBy(rows, 'gpa'); rankBy(rows, 'dv'); rankBy(rows, 'luck'); rankBy(rows, 'sos');
    rows.forEach(function (r) { var ks = ['ptsR', 'pwR', 'eloR', 'poR'].map(function (k) { return r[k]; }).filter(function (x) { return x !== null; }); r.cons = ks.length ? E.sum(ks) / ks.length : null; });
    rows.sort(function (a, b) { return (a.cons === null ? 99 : a.cons) - (b.cons === null ? 99 : b.cons) || (b.po || 0) - (a.po || 0); });
    rows.forEach(function (r, i) { r.consR = i + 1; });
    return rows;
  };

  DP.pages.rankings = {
    title: 'Rankings Hub',
    render: function (el) {
      var E = DP.E, me = DP.state.team;
      var h = '<div class="page-head"><h1>🧭 Rankings Hub</h1><p class="sub">Every ranking on the site in one table. Consensus = the average of the four "how good is this team this season" ranks (standings, power rankings, Elo, playoff odds). The others add context: the GM report card, total dynasty value (the long game), schedule luck so far and how hard the schedule left is. Each heading links to its page.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Simulating the season and loading the history…</p></div>';
      var ns = E.history().weeks.filter(function (w) { return w.games && w.games.length; }).map(function (w) { return w.n; });
      DP.getSim(function (sim) { DP.loadValues(function () { DP.loadWeeks(ns, function (details) {
        var box = U.qs('.lz', el); if (!box) return;
        var R = DP.rankingsData(sim, DP.gmReport ? DP.gmReport(details) : null);
        var rk = function (r, k) { var v = r[k + 'R']; return v === null || v === undefined ? '<span class="faint">–</span>' : '<span class="rk-n' + (v <= 3 ? ' top' : v >= E.teams.length - 2 ? ' bot' : '') + '">' + v + '</span>'; };
        var th = function (l, href, title) { return '<th class="num"><a href="' + href + '" title="' + esc(title) + '">' + l + '</a></th>'; };
        box.innerHTML = '<div class="card flush"><div class="tbl-wrap"><table class="t rkhub"><thead><tr><th class="num">#</th><th>Team</th><th class="num" title="Average of standings, power, Elo and playoff-odds ranks">Consensus</th>' +
          th('Standings', '#/standings', 'Category points (W + ½T) from the weekly results') + th('Power', '#/power', 'This week\'s Power Rankings') + th('Elo', '#/elo', 'Elo rating from results only') + th('Playoffs', '#/playoffs', 'Playoff odds, season simulation') + th('Title', '#/playoffs', 'Title odds') +
          th('Report card', '#/grades', 'GM report card') + th('Dynasty', '#/movers', 'Total dynasty value of the roster') + th('Luck', '#/elo', 'Schedule luck: points got minus all-play points') + th('Easiest left', '#/fixtures', 'Average projected chance to win the matchups left') + '</tr></thead><tbody>' +
          R.map(function (r) {
            return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td class="num">' + r.consR + '</td><td>' + U.teamChip(r.t, { link: 1 }) + '</td><td class="num"><b>' + (r.cons === null ? '–' : U.fmt(r.cons, 1)) + '</b></td>' +
              '<td class="num">' + rk(r, 'pts') + (r.rec ? ' <span class="faint small">' + r.rec.W + '-' + r.rec.L + '-' + r.rec.T + '</span>' : '') + '</td><td class="num">' + rk(r, 'pw') + '</td><td class="num">' + rk(r, 'elo') + (r.elo !== null ? ' <span class="faint small">' + Math.round(r.elo) + '</span>' : '') + '</td>' +
              '<td class="num">' + rk(r, 'po') + (r.po !== null ? ' <span class="faint small">' + U.pct(r.po) + '</span>' : '') + '</td><td class="num">' + rk(r, 'ch') + (r.ch !== null ? ' <span class="faint small">' + U.pct(r.ch, 1) + '</span>' : '') + '</td>' +
              '<td class="num">' + rk(r, 'gpa') + (r.grade ? ' ' + DP.gradeChip(r.grade) : '') + '</td><td class="num">' + rk(r, 'dv') + '</td><td class="num">' + rk(r, 'luck') + (r.luck !== null ? ' <span class="faint small">' + U.sgn(r.luck, 1) + '</span>' : '') + '</td><td class="num">' + rk(r, 'sos') + (r.sos !== null ? ' <span class="faint small">' + U.pct(r.sos) + '</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div></div><p class="small muted">Ranks: 1 = best (for luck, 1 = luckiest; for the schedule left, 1 = easiest). Green = top three, red = bottom three.</p>';
      }); }); });
    }
  };
})();
