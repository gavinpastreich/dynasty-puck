/* Dynasty Puck HQ - team dynasty range: each roster's total dynasty value with a floor and a ceiling, built from every
   player's own range (E.dvRange: the 10th and 90th percentile of the model's outcomes). Player outcomes are treated as
   independent: each player's spread below and above his expected value is read as a normal spread (gap / 1.2816,
   separately for the downside and the upside, since prospects are skewed), the variances add up, and the team's 10th
   and 90th percentile are the total ∓ 1.2816 x the combined spread. So a roster with many long shots has a wide range,
   and one built on established players a narrow one. Shown on Contention Windows. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  var Z = 1.2816;

  DP.teamRange = function (t) {
    var E = DP.E, R = E.rosters[t] || [], v = 0, vlo = 0, vhi = 0, ups = [];
    R.forEach(function (p) {
      var r = E.dvRange(p), dv = p.DV || 0, sl = Math.max(0, dv - r.lo) / Z, sh = Math.max(0, r.hi - dv) / Z;
      v += dv; vlo += sl * sl; vhi += sh * sh; ups.push({ p: p, up: r.hi - dv, lo: r.lo, hi: r.hi });
    });
    ups.sort(function (a, b) { return b.up - a.up; });
    return { t: t, v: v, lo: v - Z * Math.sqrt(vlo), hi: v + Z * Math.sqrt(vhi), n: R.length, top: ups.slice(0, 3) };
  };

  DP.teamRangeCard = function (me) {
    var E = DP.E, rows = E.teams.map(DP.teamRange).sort(function (a, b) { return b.v - a.v; });
    var mx = Math.max.apply(null, rows.map(function (r) { return r.hi; })), mn = Math.min(0, Math.min.apply(null, rows.map(function (r) { return r.lo; })));
    var pos = function (x) { return ((x - mn) / Math.max(1e-9, mx - mn) * 100).toFixed(1); };
    var byHi = rows.slice().sort(function (a, b) { return b.hi - a.hi; }), byLo = rows.slice().sort(function (a, b) { return b.lo - a.lo; });
    return '<div class="card" style="margin-top:14px"><h2>🎯 Dynasty range: floor to ceiling</h2><div class="hint">Each roster\'s total dynasty value (●) with a bad-case floor and a good-case ceiling (10th to 90th percentile), from every player\'s own range. Highest ceiling: <b>' + esc(U.teamName(byHi[0].t)) + '</b>; safest floor: <b>' + esc(U.teamName(byLo[0].t)) + '</b>.</div><ul class="list-plain trg">' +
      rows.map(function (r) {
        return '<li class="' + (r.t === me ? 'mine' : '') + '"><span class="trg-t">' + U.teamChip(r.t, { link: 1 }) + '</span><span class="trg-bar" title="Floor ' + U.fmt(r.lo, 0) + ' · expected ' + U.fmt(r.v, 0) + ' · ceiling ' + U.fmt(r.hi, 0) + '"><span class="trg-r" style="left:' + pos(r.lo) + '%;width:' + (pos(r.hi) - pos(r.lo)).toFixed(1) + '%;--tc:' + U.teamColor(r.t) + '"></span><span class="trg-m" style="left:' + pos(r.v) + '%"></span></span><span class="trg-n small num">' + U.fmt(r.lo, 0) + ' · <b>' + U.fmt(r.v, 0) + '</b> · ' + U.fmt(r.hi, 0) + '</span>' +
          '<span class="trg-up small muted">Most upside: ' + r.top.filter(function (x) { return x.up > 0.5; }).map(function (x) { return DP.ui.plink(x.p) + ' <span class="faint">+' + U.fmt(x.up, 0) + '</span>'; }).join(', ') + '</span></li>';
      }).join('') + '</ul><p class="small muted">Floor · expected · ceiling, in dynasty value. Players are treated as independent (one bust doesn\'t make another likelier), so the team range is narrower than the sum of the players\' ranges. A model estimate: see Rules &amp; Methods.</p></div>';
  };
})();
