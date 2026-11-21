/* Dynasty Puck HQ - more My Page widgets for this week's pages (registered through DP.regWidget): Breakout Watch, Elo,
   Player Rater, tonight's games, age drift, what wins each category and the roster's dynasty range. Each one is a
   small view of a page's own numbers; the "open" link goes to that page. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  if (!DP.regWidget) return;
  var reg = DP.regWidget, H = DP.myWidgetHelpers;

  reg('breakout', { name: 'Breakout watch', ic: '🚀', cat: 'players', team: 1, anyTeam: 1, ns: [5, 8, 12], n: 6, desc: 'Young skaters with the strongest signs of a breakout: production above projection, a bigger role, more ice time, a hot two weeks.', link: function () { return '#/breakout'; },
    render: function (box, o, t) {
      if (!DP.breakoutData || !DP.loadDepthLog) { box.innerHTML = H.list([]); return; }
      DP.loadDepthLog(function (L) {
        var B = DP.breakoutData(L).filter(function (x) { return o.team === '*' ? true : x.p.gm === t; });
        box.innerHTML = H.list(B.slice(0, o.n || 6).map(function (x) { return H.li(ui.plink(x.p) + ' <span class="faint small">' + Math.floor(x.p.age) + 'y' + (o.team === '*' ? ' · ' + esc(x.p.gm || 'FA') : '') + '</span>', 'signal <b>' + U.fmt(x.score, 1) + '</b>'); }), o.team === '*' ? 'No signals yet.' : 'None of your young skaters is flashing yet.');
      });
    } });

  reg('elo', { name: 'Elo ratings', ic: '📐', cat: 'league', ns: [5, 8, 14], n: 8, desc: 'Every team rated from its weekly results alone (everyone started at 1,500).', link: function () { return '#/elo'; },
    render: function (box, o) {
      var D = DP.eloData ? DP.eloData() : null;
      if (!D || !D.weeks.length) { box.innerHTML = H.list([], 'After the first week.'); return; }
      box.innerHTML = H.list(D.rows.slice(0, o.n || 8).map(function (r) { return H.li(r.rank + '. ' + U.teamChip(r.t, { link: 1 }), '<b>' + Math.round(r.r) + '</b> ' + (r.d1 >= 0.5 ? '<span class="good">▲' + Math.round(r.d1) + '</span>' : r.d1 <= -0.5 ? '<span class="bad">▼' + Math.round(-r.d1) + '</span>' : ''), r.t === (DP.state || {}).team ? 'mine' : ''); }));
    } });

  reg('rater', { name: 'Top producers', ic: '⭐', cat: 'players', team: 1, anyTeam: 1, ns: [5, 8, 12], n: 6, desc: 'Who has actually produced most in our categories this season (Player Rater, real NHL stats).', link: function () { return '#/rater'; },
    render: function (box, o, t) {
      var R = DP.raterData ? DP.raterData() : null; if (!R) { box.innerHTML = H.list([]); return; }
      var rows = R.rows.filter(function (r) { return o.team === '*' ? true : r.p.gm === t; }).sort(function (a, b) { return b.tot - a.tot; });
      box.innerHTML = H.list(rows.slice(0, o.n || 6).map(function (r) { return H.li(ui.plink(r.p) + (o.team === '*' ? ' <span class="faint small">' + esc(r.p.gm || 'FA') + '</span>' : ''), '<b>' + U.fmt(r.tot, 1) + '</b> <span class="faint">#' + r.totRank + '</span>'); }));
    } });

  reg('tonight', { name: 'Playing tonight', ic: '🌙', cat: 'week', team: 1, ns: [8, 12, 20], n: 12, desc: 'Your players with an NHL game today (Eastern time), projected starters first.', link: function (t) { return U.hash('calendar', null, { team: t && t !== (DP.state || {}).team ? t : undefined }); },
    render: function (box, o, t) {
      var E = DP.E, wi = E.nowWeek(); if (wi === null || wi < 0 || !DP.calendarData) { box.innerHTML = H.list([], 'No fantasy week in progress.'); return; }
      var iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(E.now()), d = E.dayIndex(iso);
      var C = DP.calendarData(t, wi), R = C ? C.rows.filter(function (r) { return r.by[d]; }) : [];
      var nStart = R.filter(function (r) { return r.start; }).length;
      box.innerHTML = (R.length ? '<p class="small muted" style="margin:0 0 4px">' + nStart + ' projected starter' + (nStart === 1 ? '' : 's') + ' and ' + (R.length - nStart) + ' other' + (R.length - nStart === 1 ? '' : 's') + ' play today.</p>' : '') +
        H.list(R.slice(0, o.n || 12).map(function (r) { var g = r.by[d]; return H.li(ui.plink(r.p) + (r.start ? '' : ' <span class="faint small">bench</span>'), esc((g[2] ? 'vs ' : '@ ') + g[1]) + (r.b2b.indexOf(d) >= 0 ? ' ⚡' : '')); }), 'Nobody on this roster plays today.');
    } });

  reg('agedrift', { name: 'Age drift', ic: '⏳', cat: 'team', team: 1, desc: 'Your roster one year older: the change in each category from age alone (Aging Curves).', link: function () { return '#/aging'; },
    render: function (box, o, t) {
      if (!DP.loadAging || !DP.ageDrift) { box.innerHTML = H.list([]); return; }
      DP.loadAging(function (A) {
        if (!A) { box.innerHTML = H.list([], 'The aging data isn\'t loaded yet.'); return; }
        var D = DP.ageDrift(DP.agingCurves(A))[t], E = DP.E, lab = {}; E.CATS.forEach(function (c) { lab[c.k] = c.l; });
        if (!D) { box.innerHTML = H.list([]); return; }
        var ks = DP.AGEDRIFT_MAP.map(function (m) { return m[0]; }).sort(function (a, b) { return D[a] - D[b]; });
        box.innerHTML = '<p class="small" style="margin:0 0 6px">Average <b class="' + (D.avg >= 0 ? 'good' : 'bad') + '">' + U.sgn(D.avg * 100, 1) + '%</b> a year from age alone.</p>' + H.list(ks.map(function (k) { return H.li(esc(lab[k]), '<span class="' + (D[k] >= 0.005 ? 'good' : D[k] <= -0.005 ? 'bad' : 'muted') + '">' + U.sgn(D[k] * 100, 1) + '%</span>'); }));
      });
    } });

  reg('wins', { name: 'What wins each category', ic: '🎯', cat: 'team', team: 1, desc: 'The weekly total that beats half the league in each category, next to your average.', link: function () { return '#/cats'; },
    render: function (box, o, t) {
      var T = DP.catThresholds ? DP.catThresholds() : null; if (!T || !T.weeks) { box.innerHTML = H.list([], 'After the first week.'); return; }
      var m = T.team(t), fmt = function (c, x) { return x === null || x === undefined ? '–' : c.k === 'SV' ? U.rate(x) : c.k === 'GAA' ? x.toFixed(2) : U.fmt(x, x < 10 ? 1 : 0); };
      box.innerHTML = H.list(T.cats.map(function (o2, i) { var b = m[i].beat; return H.li(esc(o2.c.l) + ' <span class="faint small">median ' + fmt(o2.c, o2.q[1]) + '</span>', fmt(o2.c, m[i].avg) + ' <span class="' + (b === null ? 'muted' : b >= 0.6 ? 'good' : b <= 0.4 ? 'bad' : 'muted') + '">' + (b === null ? '' : U.pct(b)) + '</span>'); }));
    } });

  reg('range', { name: 'Dynasty range', ic: '🎲', cat: 'team', team: 1, desc: 'Your roster\'s total dynasty value with a floor and a ceiling, and its rank on each.', link: function () { return '#/windows'; },
    render: function (box, o, t) {
      if (!DP.teamRange) { box.innerHTML = H.list([]); return; }
      var all = DP.E.teams.map(DP.teamRange), me = all.filter(function (r) { return r.t === t; })[0]; if (!me) { box.innerHTML = H.list([]); return; }
      var rk = function (k) { return 1 + all.filter(function (r) { return r[k] > me[k]; }).length; };
      box.innerHTML = H.list([H.li('Floor (bad case)', '<b>' + U.fmt(me.lo, 0) + '</b> <span class="faint">' + U.ord(rk('lo')) + '</span>'), H.li('Expected', '<b>' + U.fmt(me.v, 0) + '</b> <span class="faint">' + U.ord(rk('v')) + '</span>'), H.li('Ceiling (good case)', '<b>' + U.fmt(me.hi, 0) + '</b> <span class="faint">' + U.ord(rk('hi')) + '</span>')]) +
        (me.top.length ? '<p class="small muted" style="margin:6px 0 0">Most upside: ' + me.top.filter(function (x) { return x.up > 0.5; }).map(function (x) { return ui.plink(x.p); }).join(', ') + '</p>' : '');
    } });
})();
