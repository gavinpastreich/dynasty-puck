/* Dynasty Puck HQ - Ice Time: how much each skater plays, from the NHL stats API "timeonice" report in the nightly
   build. p.ice = [TOI per game this season, PP TOI per game, last season's TOI per game, PP per game, GP] (minutes; last
   season only with 10+ GP), p.i14 = [TOI per game, PP per game] over the last 14 days (the Hot & Cold window). More ice
   time, and power-play time above all, usually comes before more points: the coach sees something. A record of usage,
   not a projection. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var MIN_GP = 5;

  // minutes -> "18:24"
  DP.mmss = function (m) {
    if (m === null || m === undefined || isNaN(m)) return '–';
    var s = Math.round(Math.abs(m) * 60), mm = Math.floor(s / 60), ss = s % 60;
    return (m < 0 ? '−' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  };
  var dmm = function (d) { return d === null || d === undefined ? '' : (d >= 0 ? '+' : '−') + DP.mmss(Math.abs(d)); };
  var dcell = function (d, big) {
    if (d === null || d === undefined) return '<span class="faint">–</span>';
    var cls = d >= big ? 'good' : d <= -big ? 'bad' : 'muted';
    return '<span class="' + cls + '">' + dmm(d) + '</span>';
  };

  // { toi, pp, last, lastPp, lastGp, toi14, pp14, dS, dPp, d14, dPp14 } or null
  DP.iceOf = function (p) {
    var I = p && p.ice; if (!I || p.G || !p.ytd || p.ytd[0] < 1) return null;
    var o = { gp: p.ytd[0], toi: I[0], pp: I[1], last: I.length > 2 ? I[2] : null, lastPp: I.length > 3 ? I[3] : null, lastGp: I.length > 4 ? I[4] : null,
      toi14: p.i14 ? p.i14[0] : null, pp14: p.i14 ? p.i14[1] : null, gp14: p.l14 ? p.l14[0] : 0 };
    o.dS = o.last === null ? null : o.toi - o.last;
    o.dPp = o.lastPp === null ? null : o.pp - o.lastPp;
    o.d14 = o.toi14 === null ? null : o.toi14 - o.toi;
    o.dPp14 = o.pp14 === null ? null : o.pp14 - o.pp;
    return o;
  };

  // one line for the player page
  DP.iceLine = function (p) {
    var o = DP.iceOf(p); if (!o) return '';
    var bits = ['<b>' + DP.mmss(o.toi) + '</b> a game (power play ' + DP.mmss(o.pp) + ')'];
    if (o.toi14 !== null && o.gp14 >= 2) bits.push('last 14 days ' + DP.mmss(o.toi14) + ' ' + dcell(o.d14, 1) + ', PP ' + DP.mmss(o.pp14));
    if (o.last !== null) bits.push(U.season(DP.meta.seasonId - 10001) + ': ' + DP.mmss(o.last) + ' (PP ' + DP.mmss(o.lastPp) + ') ' + dcell(o.dS, 1));
    return '<p class="small" style="margin-top:6px"><b>🕒 Ice time</b>: ' + bits.join(' · ') + ' <a href="#/usage">Ice Time →</a></p>';
  };

  DP.usageData = function () {
    return DP.E.P.filter(function (p) { return !p.G && p.ice && p.ytd && p.ytd[0] >= MIN_GP; }).map(function (p) { return { p: p, o: DP.iceOf(p) }; }).filter(function (x) { return x.o; });
  };

  function topList(rows, key, n, fmt) {
    var R = rows.filter(function (x) { return x.o[key] !== null && x.o[key] !== undefined; }).sort(function (a, b) { return b.o[key] - a.o[key]; }).slice(0, n);
    if (!R.length) return '<p class="small muted">Nothing yet.</p>';
    return '<ol class="list-plain uslist">' + R.map(function (x) {
      return '<li class="' + (x.p.gm && x.p.gm === DP.state.team ? 'mine' : '') + '"><span class="us-p">' + ui.pcell(x.p, { pos: 1 }) + '</span><span class="us-o small">' + ui.owner(x.p) + '</span><span class="us-v num">' + fmt(x) + '</span></li>';
    }).join('') + '</ol>';
  }

  DP.pages.usage = {
    title: 'Ice Time',
    render: function (el, hsh) {
      var me = DP.state.team, q = hsh.q, R = DP.usageData(), last = U.season(DP.meta.seasonId - 10001);
      var h = '<div class="page-head"><h1>🕒 Ice Time</h1><p class="sub">How much every skater plays: time on ice per game this season, on the power play, over the last 14 days and against last season. More minutes, and power-play minutes above all, often come before more points. From the NHL\'s time-on-ice report, updated nightly.</p></div>';
      if (!R.length) { el.innerHTML = h + '<div class="callout">Ice time arrives with the next nightly update.</div>'; return; }
      var fa = R.filter(function (x) { return !x.p.gm; }), young = R.filter(function (x) { return x.p.age && x.p.age < 26; });
      h += '<div class="grid g3">' +
        '<div class="card"><h3>📈 More ice than last season</h3><div class="hint">Time on ice per game, this season minus ' + esc(last) + ' (10+ GP then).</div>' + topList(R, 'dS', 8, function (x) { return '<b class="good">' + dmm(x.o.dS) + '</b> <span class="faint small">' + DP.mmss(x.o.toi) + '</span>'; }) + '</div>' +
        '<div class="card"><h3>🔥 Rising in the last 14 days</h3><div class="hint">Last 14 days minus his season average (2+ games in the stretch).</div>' + topList(R.filter(function (x) { return x.o.gp14 >= 2; }), 'd14', 8, function (x) { return '<b class="good">' + dmm(x.o.d14) + '</b> <span class="faint small">' + DP.mmss(x.o.toi14) + '</span>'; }) + '</div>' +
        '<div class="card"><h3>🛒 Free agents on the power play</h3><div class="hint">Unowned skaters with the most power-play time per game, last 14 days (season if no games).</div>' + topList(fa.map(function (x) { return { p: x.p, o: Object.assign({}, x.o, { ppk: x.o.gp14 >= 2 && x.o.pp14 !== null ? x.o.pp14 : x.o.pp }) }; }), 'ppk', 8, function (x) { return '<b>' + DP.mmss(x.o.ppk) + '</b> <span class="faint small">PP/gp</span>'; }) + '</div>' +
        '</div>';
      h += '<div class="card"><h3>🌱 Young players getting more power-play time</h3><div class="hint">25 and under: power-play time per game this season minus ' + esc(last) + '. One of the signals Breakout Watch adds up.</div>' + topList(young, 'dPp', 10, function (x) { return '<b class="good">' + dmm(x.o.dPp) + '</b> <span class="faint small">PP ' + DP.mmss(x.o.pp) + '</span>'; }) + '</div>';
      el.innerHTML = h + '<div id="us-t" style="margin-top:14px"></div><p class="small muted">Minutes:seconds per game. Δ = change; green = up a minute or more (a game), red = down a minute or more. Last season needs 10+ games then; the last 14 days needs 2+ games.</p>';
      ui.table(U.qs('#us-t', el), {
        rows: R, sort: q.sort || 'toi', csv: 'ice-time.csv', search: function (x) { return x.p.n + ' ' + (x.p.nt || '') + ' ' + (x.p.gm || ''); },
        rowCls: function (x) { return x.p.gm && x.p.gm === me ? 'mine' : ''; },
        filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], def: q.owner || '', fn: function (x, v) { return v === 'mine' ? x.p.gm === me : v === 'owned' ? !!x.p.gm : !x.p.gm; } },
          { l: 'Position', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense']], fn: function (x, v) { return v === 'D' ? x.p.pos === 'D' : x.p.pos !== 'D'; } },
          { l: 'Age', opts: [['', 'Any age'], ['25', '25 and under']], def: q.age || '', fn: function (x, v) { return x.p.age && x.p.age < 26; } }],
        cols: [
          { k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p, { pos: 1 }); } },
          { k: 'own', l: 'Owner', v: function (x) { return x.p.gm || 'zz'; }, f: function (x) { return ui.owner(x.p); }, asc: true },
          { k: 'gp', l: 'GP', cls: 'num', v: function (x) { return x.o.gp; } },
          { k: 'toi', l: 'TOI/gp', cls: 'num', v: function (x) { return x.o.toi; }, f: function (x) { return '<b>' + DP.mmss(x.o.toi) + '</b>'; } },
          { k: 'dS', l: 'Δ ' + last.slice(-5), cls: 'num', v: function (x) { return x.o.dS === null ? -99 : x.o.dS; }, f: function (x) { return dcell(x.o.dS, 1); }, title: 'This season minus last season, per game' },
          { k: 'toi14', l: '14 d', cls: 'num', v: function (x) { return x.o.toi14 === null ? -1 : x.o.toi14; }, f: function (x) { return x.o.toi14 === null ? '<span class="faint">–</span>' : DP.mmss(x.o.toi14); }, title: 'Last 14 days, per game' },
          { k: 'd14', l: 'Δ 14 d', cls: 'num', v: function (x) { return x.o.d14 === null ? -99 : x.o.d14; }, f: function (x) { return dcell(x.o.d14, 1); }, title: 'Last 14 days minus the season average' },
          { k: 'pp', l: 'PP/gp', cls: 'num', v: function (x) { return x.o.pp; }, f: function (x) { return DP.mmss(x.o.pp); } },
          { k: 'dPp', l: 'Δ PP', cls: 'num', v: function (x) { return x.o.dPp === null ? -99 : x.o.dPp; }, f: function (x) { return dcell(x.o.dPp, 0.5); }, title: 'Power-play time per game, this season minus last' },
          { k: 'pp14', l: 'PP 14 d', cls: 'num', v: function (x) { return x.o.pp14 === null ? -1 : x.o.pp14; }, f: function (x) { return x.o.pp14 === null ? '<span class="faint">–</span>' : DP.mmss(x.o.pp14); } },
          { k: 'dv', l: 'Dynasty', cls: 'num', v: function (x) { return x.p.DV; }, f: function (x) { return U.fmt(x.p.DV, 1); } }
        ]
      });
    }
  };

  // My Page widget: the biggest jumps in ice time per game vs last season (your roster or everyone)
  if (DP.regWidget) DP.regWidget('ice', { name: 'Ice time risers', ic: '🕒', cat: 'players', team: 1, anyTeam: 1, ns: [5, 8, 12], n: 6, desc: 'Skaters playing the most extra minutes a game compared with last season, on your roster or anywhere.', link: function () { return '#/usage?sort=dS'; },
    render: function (box, o, t) {
      var H = DP.myWidgetHelpers, R = DP.usageData().filter(function (x) { return x.o.dS !== null && (o.team === '*' ? true : x.p.gm === t); }).sort(function (a, b) { return b.o.dS - a.o.dS; });
      box.innerHTML = R.length ? H.list(R.slice(0, o.n || 6).map(function (x) { return H.li(ui.plink(x.p) + ' <span class="faint small">' + (o.team === '*' ? esc(x.p.gm || 'FA') + ' · ' : '') + DP.mmss(x.o.toi) + '</span>', '<b class="' + (x.o.dS >= 0 ? 'good' : 'bad') + '">' + dmm(x.o.dS) + '</b>'); })) : '<p class="small muted">No ice-time data yet.</p>';
    } });
})();
