/* Dynasty Puck HQ - Category Outlook: for the next lineup lock, every team's chance to win each of the 15 categories
   against the average opponent (E.matchupProbs against each of the other 13 teams, averaged; a tie counts half), from
   the projected optimal lineups (games, injuries benched as on the Weekly Matchup page). Darker = stronger. Your own
   row also lists the categories to shore up before the lock, and the actual opponent's row sits next to it. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  DP.outlookData = function (wi) {
    var E = DP.E, T = E.teams, W = {};
    T.forEach(function (t) { W[t] = E.teamWeek(E.rosters[t], wi, { injuries: true }); });
    var rows = T.map(function (t) {
      var acc = new Array(E.NC).fill(0);
      T.forEach(function (u) { if (u === t) return; E.matchupProbs(W[t], W[u]).forEach(function (x, c) { acc[c] += x.w + x.t / 2; }); });
      var p = acc.map(function (x) { return x / (T.length - 1); });
      return { t: t, p: p, exp: E.sum(p) };
    }).sort(function (a, b) { return b.exp - a.exp; });
    return { wi: wi, rows: rows, by: rows.reduce(function (o, r) { o[r.t] = r; return o; }, {}) };
  };

  DP.pages.outlook = {
    title: 'Category Outlook',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, lw = E.lockWeek();
      var h = '<div class="page-head"><h1>🌡️ Category Outlook</h1><p class="sub">Next week, category by category: each team\'s chance to win every category against the average opponent, from its projected optimal lineup (games played, injured players benched). Darker = stronger. Use it to see where your lineup is thin before the lock, and who is strong where.</p></div>';
      if (lw === null) { el.innerHTML = h + '<div class="callout">No lineup locks left this season.</div>'; return; }
      var wi = hsh.q.w ? +hsh.q.w - 1 : lw;
      h += '<div class="controls"><label>Week <select id="ol-w">' + E.weeks.map(function (w, i) { return i < lw ? '' : '<option value="' + (i + 1) + '"' + (i === wi ? ' selected' : '') + '>' + (w.po ? 'Playoffs ' + w.po : 'Week ' + w.n) + (i === lw ? ' (next lock)' : '') + '</option>'; }).join('') + '</select></label></div>';
      el.innerHTML = h + '<div class="lz"><p class="small muted">Projecting every lineup…</p></div>';
      U.qs('#ol-w', el).addEventListener('change', function (e) { DP.go('outlook', null, { w: +e.target.value === lw + 1 ? undefined : e.target.value }); });
      setTimeout(function () {
        var box = U.qs('.lz', el); if (!box) return;
        var D = DP.outlookData(wi), opp = null;
        if (me) { var g = DP.meta.h2h.filter(function (m) { return m[0] === wi + 1 && (m[1] === me || m[2] === me); })[0]; if (g) opp = g[1] === me ? g[2] : g[1]; }
        var hh = '';
        if (me && D.by[me]) {
          var M = D.by[me], weak = M.p.map(function (x, c) { return { c: c, x: x }; }).sort(function (a, b) { return a.x - b.x; }).slice(0, 4), strong = M.p.map(function (x, c) { return { c: c, x: x }; }).sort(function (a, b) { return b.x - a.x; }).slice(0, 3);
          var vs = opp ? E.matchupProbs(E.teamWeek(E.rosters[me], wi, { injuries: true }), E.teamWeek(E.rosters[opp], wi, { injuries: true })) : null;
          hh += '<div class="callout info"><b>' + esc(U.teamName(me)) + '</b>: expected ' + U.fmt(M.exp, 1) + ' of 15 categories against the average team (' + U.ord(D.rows.indexOf(M) + 1) + '). Thinnest: ' + weak.map(function (x) { return '<b>' + esc(E.CATS[x.c].l) + '</b> ' + U.pct(x.x); }).join(', ') + '. Strongest: ' + strong.map(function (x) { return esc(E.CATS[x.c].l) + ' ' + U.pct(x.x); }).join(', ') + '.' +
            (vs ? ' Against <b>' + esc(U.teamName(opp)) + '</b>: ' + U.fmt(E.sum(vs.map(function (x) { return x.w + x.t / 2; })), 1) + ' expected; the closest are ' + vs.map(function (x, c) { return { c: c, w: x.w + x.t / 2 }; }).sort(function (a, b) { return Math.abs(a.w - 0.5) - Math.abs(b.w - 0.5); }).slice(0, 4).map(function (x) { return esc(E.CATS[x.c].l) + ' ' + U.pct(x.w); }).join(', ') + '. <a href="' + U.hash('pickup', null, { cat: weak[0].c }) + '">Pickups for ' + esc(E.CATS[weak[0].c].l) + ' →</a>' : '') + '</div>';
        }
        hh += '<div class="card flush"><div class="tbl-wrap"><table class="t small olk"><thead><tr><th>Team</th><th class="num" title="Expected categories against the average team">Exp.</th>' + E.CATS.map(function (c) { return '<th class="num" title="' + esc(c.name) + '">' + esc(c.l) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          D.rows.map(function (r) {
            return '<tr class="' + (r.t === me ? 'mine' : r.t === opp ? 'opp' : '') + '"><td class="nw">' + U.teamChip(r.t, { link: 1 }) + (r.t === opp ? ' <span class="badge warn">opponent</span>' : '') + '</td><td class="num"><b>' + U.fmt(r.exp, 1) + '</b></td>' + r.p.map(function (x) {
              return '<td class="olc" style="--v:' + x.toFixed(2) + '">' + Math.round(x * 100) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div></div><p class="small muted">Numbers are percentages: the chance to win that category against a team picked at random (a tie counts half). Goalie categories include the chance of missing the ' + (E.RULES.goalieMinGP || 2) + '-GP goalie minimum.</p>';
        box.innerHTML = hh;
      }, 30);
    }
  };
})();
