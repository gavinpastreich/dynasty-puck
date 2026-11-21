/* Dynasty Puck HQ - Weekly Calendar: a team's players day by day for one fantasy week, from the NHL schedule
   (DP.nhl.sched): each game with the opponent (vs = home, @ = away), back-to-backs marked, games per player and the
   number of the team's projected starters playing each night. Starters = the optimal lineup by games played
   (E.baseline), the same one the Team Hub shows. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  DP.calendarData = function (t, wi) {
    var E = DP.E, w = E.weeks[wi]; if (!w) return null;
    var d0 = E.dayIndex(w.start), d1 = E.dayIndex(w.end), days = []; for (var d = d0; d <= d1; d++) days.push(d);
    var lu = E.baseline[t] && E.baseline[t][wi] ? E.baseline[t][wi].lu : null, start = {};
    if (lu) lu.F.concat(lu.D, lu.G).forEach(function (x) { start[x.p.id] = 1; });
    var rows = (E.rosters[t] || []).filter(function (p) { return p.fs !== 'IR' || start[p.id]; }).map(function (p) {
      var sc = p.nt26 && DP.nhl.sched[p.nt26], by = {}, has = {};
      (sc || []).forEach(function (r) { has[r[0]] = 1; if (r[0] >= d0 && r[0] <= d1) by[r[0]] = r; });
      var g = days.filter(function (d) { return by[d]; });
      return { p: p, start: !!start[p.id], by: by, b2b: g.filter(function (d) { return has[d - 1]; }), n: g.length };
    }).sort(function (a, b) { return (b.start - a.start) || ((a.p.G ? 2 : a.p.pos === 'D' ? 1 : 0) - (b.p.G ? 2 : b.p.pos === 'D' ? 1 : 0)) || b.n - a.n || (b.p.WAR || 0) - (a.p.WAR || 0); });
    var perDay = days.map(function (d) { return rows.filter(function (r) { return r.start && r.by[d]; }).length; });
    return { w: w, wi: wi, days: days, rows: rows, perDay: perDay, starts: E.sum(rows.filter(function (r) { return r.start && !r.p.G; }).map(function (r) { return r.n; })) };
  };

  DP.pages.calendar = {
    title: 'Weekly Calendar',
    render: function (el, hsh) {
      var E = DP.E, t = hsh.q.team || DP.state.team, wi0 = Math.max(0, E.nowWeek()), wi = hsh.q.w ? +hsh.q.w - 1 : wi0;
      var h = '<div class="page-head"><h1>📆 Weekly Calendar</h1><p class="sub">A team\'s players night by night for one fantasy week, from the NHL schedule: who plays when, back-to-backs (⚡, the second night, when goalies often sit) and how many of the projected starters play each night.</p></div>';
      h += '<div class="controls"><label>Team ' + ui.teamSelect('cl-team', t, 'Choose a team…') + '</label><label>Week <select id="cl-w">' + E.weeks.map(function (w, i) { return '<option value="' + (i + 1) + '"' + (i === wi ? ' selected' : '') + '>' + (w.po ? 'Playoffs ' + w.po : 'Week ' + w.n) + (i === wi0 ? ' (now)' : '') + '</option>'; }).join('') + '</select></label></div>';
      if (!t) { el.innerHTML = h + '<div class="callout">Pick a team.</div>'; U.qs('#cl-team', el).addEventListener('change', function (e) { DP.go('calendar', null, { team: e.target.value }); }); return; }
      var C = DP.calendarData(t, wi);
      var dayLab = function (d) { var x = new Date(E.seasonStart + d * 864e5); return '<span>' + x.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) + '</span><b>' + (x.getUTCMonth() + 1) + '/' + x.getUTCDate() + '</b>'; };
      var row = function (r) {
        return '<tr class="' + (r.start ? '' : 'cal-bench') + '"><td class="nw">' + ui.pos(r.p) + ui.plink(r.p) + (r.p.inj ? ' ' + ui.injBadge(r.p) : '') + (r.start ? '' : ' <span class="faint small">' + (r.p.fs === 'M' ? 'minors' : 'bench') + '</span>') + '</td><td class="num"><b>' + r.n + '</b></td>' +
          C.days.map(function (d) { var g = r.by[d]; return g ? '<td class="cal-g' + (r.b2b.indexOf(d) >= 0 ? ' b2b' : '') + '" title="' + esc((g[2] ? 'vs ' : '@ ') + g[1]) + (r.b2b.indexOf(d) >= 0 ? ' (second night of a back-to-back)' : '') + '">' + (g[2] ? '' : '@') + esc(g[1]) + (r.b2b.indexOf(d) >= 0 ? '⚡' : '') + '</td>' : '<td class="cal-x"></td>'; }).join('') + '</tr>';
      };
      h += '<div class="card flush"><div class="tbl-wrap"><table class="t small cal"><thead><tr><th>' + U.teamBadge(t) + ' ' + esc(U.teamName(t)) + '</th><th class="num">GP</th>' + C.days.map(function (d) { return '<th class="cal-d">' + dayLab(d) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        '<tr class="cal-sum"><td><b>Projected starters playing</b></td><td class="num"><b>' + C.starts + '</b></td>' + C.perDay.map(function (n) { return '<td class="num"><b>' + n + '</b></td>'; }).join('') + '</tr>' +
        C.rows.filter(function (r) { return r.start; }).map(row).join('') + '<tr><td colspan="' + (C.days.length + 2) + '" class="small muted" style="padding-top:10px">Bench, minors and IR</td></tr>' + C.rows.filter(function (r) { return !r.start; }).map(row).join('') + '</tbody></table></div></div>';
      h += '<p class="small muted">GP in the starters row = skater games from the projected starters (goalies left out). Starters = the optimal lineup by games played, as on the Team Hub; your Fantrax lineup may differ.</p>';
      el.innerHTML = h;
      U.qs('#cl-team', el).addEventListener('change', function (e) { DP.go('calendar', null, { team: e.target.value, w: hsh.q.w }); });
      U.qs('#cl-w', el).addEventListener('change', function (e) { DP.go('calendar', null, { team: hsh.q.team, w: +e.target.value === wi0 + 1 ? undefined : e.target.value }); });
    }
  };
})();
