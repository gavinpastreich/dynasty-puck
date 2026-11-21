/* Dynasty Puck HQ - age drift (Aging Curves page): how much each roster's category totals would change next season
   from aging alone. Every rostered skater's projected totals (p.p26) are scaled by the average change from his age to
   the next for his position (DP.agingNext, the delta-method curves from data/aging.js); the team's drift in a category =
   next season's total / this season's - 1. Same roster, same roles: no trades, no prospects arriving (players with no
   NHL projection add nothing), so it isolates the age effect. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  // our category -> p26 index and the aging-curve key
  var MAP = [['PtD', 1, 'pts'], ['G', 2, 'g'], ['A', 3, 'a'], ['PIM', 4, 'pim'], ['SOG', 5, 'sog'], ['STP', 6, 'stp'], ['Hit', 7, 'hit'], ['Blk', 8, 'blk'], ['Tk', 9, 'tk']];
  DP.AGEDRIFT_MAP = MAP;

  // {t: {k: drift}} plus .avg (mean over categories)
  DP.ageDrift = function (CV) {
    var E = DP.E, out = {};
    E.teams.forEach(function (t) {
      var now = {}, nxt = {};
      MAP.forEach(function (m) { now[m[0]] = 0; nxt[m[0]] = 0; });
      (E.rosters[t] || []).forEach(function (p) {
        if (p.G || !p.p26 || !(p.p26[0] > 0)) return;
        var nx = DP.agingNext(p, CV);
        MAP.forEach(function (m) { var v = p.p26[m[1]] || 0, r = nx && nx[m[2]] ? nx[m[2]] : 1; now[m[0]] += v; nxt[m[0]] += v * r; });
      });
      var d = {}, s = 0, n = 0;
      MAP.forEach(function (m) { d[m[0]] = now[m[0]] > 0 ? nxt[m[0]] / now[m[0]] - 1 : 0; if (now[m[0]] > 0) { s += d[m[0]]; n++; } });
      d.avg = n ? s / n : 0;
      out[t] = d;
    });
    return out;
  };

  DP.ageDriftCard = function (CV, me) {
    var E = DP.E, D = DP.ageDrift(CV), lab = {}; E.CATS.forEach(function (c) { lab[c.k] = c.l; });
    var rows = E.teams.slice().sort(function (a, b) { return D[b].avg - D[a].avg; });
    var cell = function (x) { var p = x * 100, a = Math.min(1, Math.abs(p) / 6); return '<td class="num adr" style="--a:' + a.toFixed(2) + ';--c:' + (p >= 0 ? 'var(--good)' : 'var(--bad)') + '">' + (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%</td>'; };
    var mine = me && D[me] ? MAP.map(function (m) { return { k: m[0], d: D[me][m[0]] }; }).sort(function (a, b) { return a.d - b.d; }) : null;
    return '<div class="card flush" style="margin-top:14px"><h3 style="padding:12px 14px 0">⏳ Age drift: next season from age alone</h3><div class="hint" style="padding:0 14px">Each roster\'s projected category totals with every skater one year older (the curves above), same roster and roles. Young cores drift up, veteran rosters down.' +
      (mine ? ' <b>' + esc(U.teamName(me)) + '</b>: ' + U.sgn(D[me].avg * 100, 1) + '% on average; most at risk ' + mine.slice(0, 2).map(function (x) { return esc(lab[x.k]) + ' ' + U.sgn(x.d * 100, 1) + '%'; }).join(', ') + '.' : '') + '</div>' +
      '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Team</th><th class="num">Avg</th>' + MAP.map(function (m) { return '<th class="num">' + esc(lab[m[0]]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (t) { return '<tr class="' + (t === me ? 'mine' : '') + '"><td class="nw">' + U.teamChip(t, { link: 1 }) + '</td>' + cell(D[t].avg) + MAP.map(function (m) { return cell(D[t][m[0]]); }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="small muted" style="padding:0 14px 12px">Per-game change for a typical player of the same position and age, applied to each skater\'s projected totals. No trades, no call-ups, no prospects arriving: it isolates what one more year does to the same roster.</p></div>';
  };
})();
