/* Dynasty Puck HQ - development curve for young skaters (player pages): each season's scoring translated to the NHL
   (NHLe: points per game x the league factor x 82) and the age-adjusted peak estimate the prospect model draws from it
   (NHLe x the age factor: 1 + 0.5 per year under 22 for junior, college and European lines, 1 + 0.12 per year under 25
   for NHL lines; the same factors as E.nhleBlend). A player whose age-adjusted estimate climbs from one season to the
   next is developing faster than the age curve expects: "ahead of the curve". From the NHL API career lines (p.car). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;

  function ageOn(dob, iso) { return dob ? (Date.parse(iso + 'T00:00:00Z') - Date.parse(dob + 'T00:00:00Z')) / (365.25 * 864e5) : null; }
  DP.devCurve = function (p) {
    var E = DP.E; if (!p || p.G || !p.car || !p.car.length) return null;
    var by = {};
    p.car.forEach(function (s) {
      var f = E.nhleFactor(s[1]); if (f === null || f === undefined || !(s[3] > 0)) return;
      var o = by[s[0]] || (by[s[0]] = { season: s[0], gp: 0, np: 0, lg: [], nhlGp: 0 });
      o.gp += s[3]; o.np += s[6] * f; if (o.lg.indexOf(s[1]) < 0) o.lg.push(s[1]); if (s[1] === 'NHL') o.nhlGp += s[3];
    });
    var rows = Object.keys(by).map(function (k) { return by[k]; }).filter(function (o) { return o.gp >= 10; }).sort(function (a, b) { return a.season - b.season; });
    rows.forEach(function (o) {
      o.pace = o.np / o.gp * 82;
      var age = ageOn(p.dob, String(Math.floor(o.season / 10000)) + '-12-31'); o.age = age === null ? null : age;
      var nhl = o.nhlGp >= o.gp / 2, a = o.age === null ? 22 : o.age; o.nhl = nhl;
      o.mult = nhl ? Math.min(2, 1 + 0.12 * Math.max(0, 25 - a)) : Math.min(3.3, 1 + 0.5 * Math.max(0, 22 - a));
      o.adj = o.pace * o.mult;
    });
    rows = rows.slice(-6);
    if (rows.length < 2) return rows.length ? { rows: rows, trend: null } : null;
    // ahead / behind only between two seasons at the same level: the age factors for NHL and non-NHL lines differ, so a
    // jump to the NHL is its own milestone
    var b = rows[rows.length - 1], a = null;
    for (var i = rows.length - 2; i >= 0; i--) if (rows[i].nhl === b.nhl) { a = rows[i]; break; }
    var jump = !rows[rows.length - 2].nhl && b.nhl ? rows[rows.length - 2] : null;
    if (!a) return { rows: rows, trend: jump ? { label: 'jump', from: jump, to: b } : null };
    var d = b.adj - a.adj, rel = a.adj > 1 ? d / a.adj : 0;
    var label = rel >= 0.15 ? 'ahead' : rel <= -0.15 ? 'behind' : 'on';
    return { rows: rows, trend: { from: a, to: b, d: d, rel: rel, label: label, jump: jump } };
  };
  DP.devCurveCard = function (p) {
    var D = DP.devCurve(p); if (!D || !D.rows.length || (p.age || 30) > 25.99) return '';
    var C = DP.C, labs = D.rows.map(function (o) { return U.season(o.season); });
    var h = '<div class="card"><h3>🌱 Development curve</h3><div class="hint">Scoring translated to the NHL (NHLe, points per 82 games) and the age-adjusted peak estimate the prospect model reads from it. An estimate that climbs season over season = developing faster than his age alone would explain.</div>';
    if (C && C.lines && D.rows.length >= 2) h += C.lines(labs, [{ name: 'NHLe pts/82', values: D.rows.map(function (o) { return +o.pace.toFixed(1); }) }, { name: 'Age-adjusted peak estimate', values: D.rows.map(function (o) { return +o.adj.toFixed(1); }), color: 'var(--s3)' }], { height: 160, title: 'Development curve' });
    if (D.trend) {
      var t = D.trend;
      if (t.label === 'jump') h += '<p class="small" style="margin:6px 0"><span class="badge good">Made the jump</span> ' + U.fmt(t.to.pace, 0) + ' NHLe pts/82 in the NHL in ' + esc(U.season(t.to.season)) + (t.to.age ? ' at ' + Math.floor(t.to.age) : '') + ', after ' + U.fmt(t.from.pace, 0) + ' in ' + esc(t.from.lg.join(' + ')) + '. Junior and pro lines use different age factors, so the two estimates aren\'t compared.</p>';
      else h += '<p class="small" style="margin:6px 0">' + (t.label === 'ahead' ? '<span class="badge good">Ahead of the curve</span> ' : t.label === 'behind' ? '<span class="badge warn">Behind the curve</span> ' : '<span class="badge info">On the curve</span> ') +
        'Age-adjusted estimate ' + U.fmt(t.from.adj, 0) + ' → <b>' + U.fmt(t.to.adj, 0) + '</b> pts/82 from ' + esc(U.season(t.from.season)) + ' to ' + esc(U.season(t.to.season)) + ' (' + (t.d >= 0 ? '+' : '') + Math.round(t.rel * 100) + '%), ' + esc(t.to.lg.join(' + ')) + ', ' + t.to.gp + ' GP.' + (t.jump ? ' He has since made the jump to the NHL.' : '') + '</p>';
    }
    h += '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Season</th><th class="num">Age</th><th>Leagues</th><th class="num">GP</th><th class="num">NHLe</th><th class="num">× age</th><th class="num">Estimate</th></tr></thead><tbody>' + D.rows.map(function (o) {
      return '<tr><td>' + esc(U.season(o.season)) + '</td><td class="num">' + (o.age === null ? '–' : U.fmt(o.age, 1)) + '</td><td class="small">' + esc(o.lg.join(', ')) + '</td><td class="num">' + o.gp + '</td><td class="num">' + U.fmt(o.pace, 1) + '</td><td class="num">' + U.fmt(o.mult, 2) + '</td><td class="num"><b>' + U.fmt(o.adj, 0) + '</b></td></tr>';
    }).join('') + '</tbody></table></div></div>';
    return h;
  };
})();
