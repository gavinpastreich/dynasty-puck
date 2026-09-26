/* Dynasty Puck HQ - Live Scoreboard: the fantasy week in progress. Category totals so far come from the nightly build
 * (each team's Fantrax-Active players x their NHL stats this week); the rest of the week is simulated. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function fmt(c, v) {
    if (v === null || v === undefined) return '–';
    if (c === 12) return v.toFixed(2);
    if (c === 13) return U.rate(v);
    return U.fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
  }
  DP.liveOddsCache = {};
  DP.liveOdds = function (a, b) {
    var sc = DP.league.score, E = DP.E, k = a + '|' + b + '|' + E.version;
    if (!sc || !sc.teams) return null;
    if (!DP.liveOddsCache[k]) DP.liveOddsCache[k] = E.liveOdds(a, b, sc, 3000);
    return DP.liveOddsCache[k];
  };

  DP.pages.live = {
    title: 'Live Scoreboard',
    render: function (el) {
      var E = DP.E, sc = DP.league.score, me = DP.state.team;
      var h = '<div class="page-head"><h1>📺 Live Scoreboard</h1><p class="sub">The week being played: category totals so far for each team\'s Fantrax-Active players (weekly lock), then the rest of the week simulated from each player\'s remaining NHL games. Updates overnight after games end (about 1 AM and 6 AM ET).</p></div>';
      if (!sc || !sc.week) {
        h += '<div class="callout">The scoreboard starts once Week 1 is underway. ' + esc(DP.lockText(0) ? 'Week 1 ' + DP.lockText(0) + '.' : '') + ' The first totals appear the morning after opening night. Meanwhile, see the <a href="#/preview">Weekly Preview</a>.</div>';
        el.innerHTML = h; return;
      }
      var wi = sc.week - 1, w = E.weeks[wi];
      h += '<div class="callout small">' + (w.po ? 'Playoffs round ' + w.po : 'Week ' + w.n) + ' (' + esc(w.start) + ' to ' + esc(w.end) + ') · ' + (sc.to ? 'games through <b>' + esc(sc.to) + '</b>' : 'no games completed yet') + ' · updated ' + esc((sc.asOf || '').replace('T', ' ')) + ' UTC' + (sc.test ? ' · <b class="bad">TEST DATA</b>' : '') + '. Cor is estimated from NHL shot attempts (model, R² 0.975 vs Fantrax); Fantrax is the official score.</div>';
      var games = w.po ? [] : DP.meta.h2h.filter(function (g) { return g[0] === w.n; });
      games.sort(function (x, y) { return (y[1] === me || y[2] === me ? 1 : 0) - (x[1] === me || x[2] === me ? 1 : 0); });
      if (!games.length) h += '<p class="muted">Playoff pairings come from the final standings; open a matchup from the Weekly Matchup page.</p>';
      h += '<div id="live-games"><p class="muted">Simulating the rest of the week…</p></div>';
      el.innerHTML = h;
      setTimeout(function () {
        var box = U.qs('#live-games', el); if (!box) return;
        box.innerHTML = games.map(function (g) { return card(g[1], g[2], sc, me); }).join('');
      }, 20);
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lines]'); if (!b) return;
        var d = U.qs('#' + b.dataset.lines, el); if (d) d.hidden = !d.hidden;
      });
    }
  };

  function card(a, b, sc, me) {
    var E = DP.E, o = DP.liveOdds(a, b), sNow = E.liveScore(o), id = 'l' + Math.random().toString(36).slice(2, 7);
    var h = '<div class="card' + (a === me || b === me ? ' mine-card' : '') + '" style="margin-bottom:12px"><h2 style="flex-wrap:wrap">' + esc(U.teamName(a)) + ' <span class="num">' + sNow[0] + '</span><span class="muted">–</span><span class="num">' + sNow[1] + '</span> ' + esc(U.teamName(b)) + (sNow[2] ? ' <span class="small muted">(' + sNow[2] + ' tied)</span>' : '') +
      '<span class="badge ' + (Math.abs(o.win - o.loss) < 0.2 ? 'warn' : 'good') + '" style="margin-left:auto">' + esc(o.win >= o.loss ? a : b) + ' ' + U.pct(Math.max(o.win, o.loss)) + ' to win</span></h2>';
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th class="num">' + esc(a) + ' now</th><th class="num">proj</th><th style="min-width:120px">' + esc(a) + ' wins cat</th><th class="num">proj</th><th class="num">' + esc(b) + ' now</th></tr></thead><tbody>' +
      o.cats.map(function (x, c) {
        var cat = E.CATS[c], lead = x.a === null || x.b === null || x.a === x.b ? 0 : ((cat.low ? x.a < x.b : x.a > x.b) ? 1 : -1);
        return '<tr><td><b>' + esc(cat.l) + '</b></td><td class="num ' + (lead > 0 ? 'good' : '') + '">' + fmt(c, x.a) + '</td><td class="num muted">' + fmt(c, x.pa) + '</td><td>' + ui.meter(x.pw, x.pw >= 0.6 ? 'good' : x.pw <= 0.4 ? 'bad' : '', U.pct(x.pw)) + '</td><td class="num muted">' + fmt(c, x.pb) + '</td><td class="num ' + (lead < 0 ? 'good' : '') + '">' + fmt(c, x.b) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var gm = E.RULES.goalieMinGP;
    h += '<p class="small muted">Goalie GP so far: ' + esc(a) + ' ' + o.ggpA + ', ' + esc(b) + ' ' + o.ggpB + ' (minimum ' + gm + '). Tie odds ' + U.pct(o.tie) + '. <button class="btn sm ghost" data-lines="' + id + '">Player lines</button> <a class="btn sm ghost" href="' + U.hash('matchup', null, { w: sc.week, a: a, b: b, set: '1' }) + '">Full matchup</a></p>';
    h += '<div id="' + id + '" hidden>' + lines(a, sc) + lines(b, sc) + '</div>';
    return h + '</div>';
  }

  function lines(t, sc) {
    var E = DP.E, T = sc.teams[t]; if (!T) return '';
    var rows = Object.keys(T.pl || {}).map(function (id) { return [E.byId[id], T.pl[id]]; }).filter(function (x) { return x[0]; });
    var sk = rows.filter(function (x) { return !x[0].G; }), gk = rows.filter(function (x) { return x[0].G; });
    return '<h3 class="small">' + esc(U.teamName(t)) + '</h3><div class="tbl-wrap"><table class="t small"><thead><tr><th>Skater</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">PIM</th><th class="num">SOG</th><th class="num">STP</th><th class="num">Hit</th><th class="num">Blk</th><th class="num">Tk</th><th class="num">Cor*</th></tr></thead><tbody>' +
      sk.map(function (x) { return '<tr><td>' + ui.plink(x[0]) + '</td>' + x[1].map(function (v) { return '<td class="num">' + U.fmt(v, 0) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>' + (gk.length ? '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Goalie</th><th class="num">GP</th><th class="num">W</th><th class="num">GA</th><th class="num">SA</th><th class="num">SHO</th><th class="num">Min</th></tr></thead><tbody>' +
      gk.map(function (x) { return '<tr><td>' + ui.plink(x[0]) + '</td>' + x[1].map(function (v) { return '<td class="num">' + U.fmt(v, 0) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '');
  }
})();
