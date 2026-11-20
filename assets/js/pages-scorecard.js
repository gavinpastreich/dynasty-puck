/* Dynasty Puck HQ - Model Scorecard: how the site's matchup odds have done. On the last night before every lineup lock
   tools/value_history.js records each matchup's win chance, tie chance and expected categories the way the Weekly
   Matchup page shows them (optimal lineups, injured players benched; that night's rosters, stats and injury list,
   scored with today's model). Here those calls meet the real results (E.history()). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var BINS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0001]];

  // every finished matchup with its pre-lock call, from the favorite's side
  DP.modelCalls = function () {
    var V = DP.values, E = DP.E; if (!V || !V.calls) return null;
    var out = [];
    E.history().weeks.forEach(function (w) {
      var C = V.calls[w.n]; if (!C || !w.games) return;
      w.games.forEach(function (g) {
        var c = C.g.filter(function (x) { return (x[0] === g.a && x[1] === g.b) || (x[0] === g.b && x[1] === g.a); })[0]; if (!c) return;
        var flip = c[0] !== g.a, pW = c[2], pT = c[3], pL = Math.max(0, 1 - pW - pT), ex = c[4];
        var a = { t: g.a, s: g.sa }, b = { t: g.b, s: g.sb };
        var pa = flip ? pL : pW, pb = flip ? pW : pL, exA = flip ? 15 - ex : ex;   // from g.a's side
        var fav = pa >= pb ? a : b, dog = fav === a ? b : a, pf = fav === a ? pa : pb, pd = fav === a ? pb : pa, exF = fav === a ? exA : 15 - exA;
        var res = fav.s.W > fav.s.L ? 1 : fav.s.W < fav.s.L ? 0 : 0.5;
        out.push({ n: w.n, d: C.d, fav: fav.t, dog: dog.t, pf: pf, pd: pd, pt: pT, p: pf + pT / 2, exF: exF, actF: fav.s.W + fav.s.T / 2, res: res, sf: fav.s, sd: dog.s });
      });
    });
    return out;
  };
  DP.modelScore = function (M) {
    if (!M || !M.length) return null;
    var E = DP.E, n = M.length, dec = M.filter(function (m) { return m.res !== 0.5; });
    var brier = E.sum(M.map(function (m) { return (m.p - m.res) * (m.p - m.res); })) / n;
    var bins = BINS.map(function (b) {
      var x = M.filter(function (m) { return m.p >= b[0] && m.p < b[1]; });
      return { lo: b[0], hi: Math.min(1, b[1]), n: x.length, pred: x.length ? E.sum(x.map(function (m) { return m.p; })) / x.length : null, act: x.length ? E.sum(x.map(function (m) { return m.res; })) / x.length : null };
    });
    return {
      n: n, favW: dec.filter(function (m) { return m.res === 1; }).length, dec: dec.length, ties: n - dec.length,
      brier: brier, skill: 1 - brier / 0.25, mae: E.sum(M.map(function (m) { return Math.abs(m.exF - m.actF); })) / n,
      expFav: E.sum(M.map(function (m) { return m.p; })), actFav: E.sum(M.map(function (m) { return m.res; })), bins: bins,
      upsets: M.filter(function (m) { return m.res === 0; }).sort(function (a, b) { return b.p - a.p; })
    };
  };
  function calib(S) {
    var W = 320, H = 240, L = 40, B = 30, T = 10, R = 10, x = function (v) { return L + (v - 0.5) / 0.5 * (W - L - R); }, y = function (v) { return T + (1 - v) * (H - T - B); };
    var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="calib" role="img" aria-label="Calibration: predicted vs actual win rate">';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) { h += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" class="ax">' + Math.round(v * 100) + '%</text>'; });
    [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach(function (v) { h += '<text x="' + x(v) + '" y="' + (H - B + 16) + '" text-anchor="middle" class="ax">' + Math.round(v * 100) + '%</text>'; });
    h += '<line x1="' + x(0.5) + '" y1="' + y(0.5) + '" x2="' + x(1) + '" y2="' + y(1) + '" class="diag"/>';
    S.bins.forEach(function (b) { if (!b.n) return; var r = Math.max(4, Math.min(12, 3 + Math.sqrt(b.n) * 2)); h += '<circle cx="' + x(b.pred) + '" cy="' + y(b.act) + '" r="' + r + '" class="dot"><title>' + Math.round(b.lo * 100) + '–' + Math.round(b.hi * 100) + '% favorites: predicted ' + U.pct(b.pred) + ', won ' + U.pct(b.act) + ' (' + b.n + ' matchups)</title></circle>'; });
    h += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 2) + '" text-anchor="middle" class="ax">model\'s chance for the favorite</text></svg>';
    return h;
  }

  DP.pages.scorecard = {
    title: 'Model Scorecard',
    render: function (el) {
      var E = DP.E;
      var h = '<div class="page-head"><h1>🧮 Model Scorecard</h1><p class="sub">How good are the site\'s matchup odds? On the last night before every lineup lock the nightly job records each matchup\'s win chance the way the Weekly Matchup page shows it. Here those calls meet the real results. Honest numbers, good or bad.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the calls…</p></div>';
      DP.loadValues(function (V) {
        var box = U.qs('.lz', el); if (!box) return;
        var M = DP.modelCalls(), S = DP.modelScore(M);
        if (!S) { box.innerHTML = '<div class="callout">No finished week with a recorded call yet. The nightly job records them before every lineup lock.</div>'; return; }
        var hh = '<div class="stats">' + DP.statTile('Favorites won', S.favW + ' of ' + S.dec, U.pct(S.favW / Math.max(1, S.dec)) + (S.ties ? ' · ' + S.ties + ' tied' : '') + ' · the odds expected ' + U.fmt(S.expFav, 1) + ', they got ' + U.fmt(S.actFav, 1) + ' (tie = ½)') +
          DP.statTile('Brier score', U.fmt(S.brier, 3), (S.skill >= 0 ? U.pct(S.skill) + ' better' : U.pct(-S.skill) + ' worse') + ' than a coin flip (0.250); lower is better') +
          DP.statTile('Categories off by', U.fmt(S.mae, 1), 'average miss on the favorite\'s categories (of 15)') +
          DP.statTile('Matchups scored', String(S.n), M.length ? 'weeks ' + M[0].n + '–' + M[M.length - 1].n : '') + '</div>';
        var gap = S.actFav - S.expFav;
        hh += '<div class="callout ' + (Math.abs(gap) >= 2 ? 'warn' : 'info') + '" style="margin-top:12px">' + (gap <= -2 ? '<b>So far the odds have been too confident.</b> Favorites earned ' + U.fmt(S.actFav, 1) + ' wins (a tie = ½) where the odds expected ' + U.fmt(S.expFav, 1) + ': treat a big favorite as less of a lock than the number says until this evens out.' : gap >= 2 ? '<b>So far the odds have been too cautious.</b> Favorites earned ' + U.fmt(S.actFav, 1) + ' wins where the odds expected ' + U.fmt(S.expFav, 1) + '.' : '<b>So far the odds have been about right.</b> Favorites earned ' + U.fmt(S.actFav, 1) + ' wins; the odds expected ' + U.fmt(S.expFav, 1) + '.') + ' ' + S.n + ' matchups is a small sample: one surprising week moves these numbers a lot.</div>';
        hh += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>Calibration</h2><div class="hint">Each dot: the matchups where the favorite had about that chance (x) and how often it won (y; a tie counts half). On the line = the odds meant what they said. Bigger dot = more matchups. Hover a dot for the numbers.</div>' + calib(S) +
          '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Favorite\'s chance</th><th class="num">Matchups</th><th class="num">Predicted</th><th class="num">Won</th></tr></thead><tbody>' + S.bins.map(function (b) { return '<tr><td>' + Math.round(b.lo * 100) + '–' + Math.round(b.hi * 100) + '%</td><td class="num">' + b.n + '</td><td class="num">' + (b.n ? U.pct(b.pred) : '–') + '</td><td class="num"><b>' + (b.n ? U.pct(b.act) : '–') + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>';
        hh += '<div class="card"><h2>😱 Biggest upsets</h2><div class="hint">Favorites that lost, by how big a favorite they were.</div>' + (S.upsets.length ? '<ul class="list-plain">' + S.upsets.slice(0, 8).map(function (m) {
          return '<li><span class="small">' + U.teamChip(m.dog, { link: 1 }) + ' beat ' + U.teamChip(m.fav, { link: 1 }) + ' ' + m.sd.W + '-' + m.sd.L + (m.sd.T ? '-' + m.sd.T : '') + '</span><span class="small muted" style="margin-left:auto;white-space:nowrap">wk ' + m.n + ' · had a <b>' + U.pct(m.pd) + '</b> chance</span></li>';
        }).join('') + '</ul>' : '<p class="small muted">No favorite has lost yet.</p>') + '</div></div>';
        hh += '<div class="card flush" style="margin-top:14px"><h2>Every call</h2><div class="hint">The favorite, its chance and expected categories the night before the lock, and what happened.</div><div id="sc-t" style="padding:0 12px 12px"></div></div>';
        var open = Object.keys(V.calls || {}).map(Number).filter(function (n) { return !E.history().weeks.some(function (w) { return w.n === n && w.games && w.games.length; }); }).sort(function (a, b) { return a - b; });
        open.forEach(function (up) {
          var C = V.calls[up], lt = E.lockTime(up - 1), locked = !!lt && lt.getTime() <= E.now().getTime();
          hh += '<div class="card" style="margin-top:14px"><h2>Week ' + up + (locked ? ' (being played): the calls at the lock' : ' (next): the calls so far') + '</h2><div class="hint">' + (locked ? 'Recorded ' + esc(U.date(new Date(C.d + 'T12:00:00Z'))) + ', before the lineups locked. They are scored here once the week is final; the Live Scoreboard has the odds as it is played.' : 'As of ' + esc(U.date(new Date(C.d + 'T12:00:00Z'))) + ', updated every night until the lock. The Weekly Matchup page has the live version with any lineup.') + '</div><ul class="list-plain">' + C.g.map(function (g) {
            var pL = Math.max(0, 1 - g[2] - g[3]), favA = g[2] >= pL;
            return '<li><span class="small">' + U.teamChip(favA ? g[0] : g[1], { link: 1 }) + ' over ' + U.teamChip(favA ? g[1] : g[0], { link: 1 }) + '</span><span class="small muted" style="margin-left:auto">' + U.pct(favA ? g[2] : pL) + ' · ' + U.fmt(favA ? g[4] : 15 - g[4], 1) + ' of 15 categories expected</span></li>';
          }).join('') + '</ul><p class="small"><a href="' + (locked ? '#/live' : U.hash('matchup', null, { w: up })) + '">' + (locked ? 'Open the Live Scoreboard →' : 'Open the Weekly Matchup →') + '</a></p></div>';
        });
        hh += '<p class="small muted">How it works: the call is the Weekly Matchup simulation (6,000 weeks, optimal lineups by games played, players on the injury report benched) run on the last nightly snapshot before each lock: that night\'s rosters, stats to date and injury list. Like Market Movers, past nights are re-scored with today\'s model, so the calls show how the current model would have called each week with what was known then. Real lineups can differ from the optimal ones. Brier score = the average squared miss of the favorite\'s chance (win = 1, tie = ½, loss = 0).</p>';
        box.innerHTML = hh;
        ui.table(U.qs('#sc-t', el), {
          rows: M.slice().reverse(), sort: 'n', csv: 'model-calls.csv',
          rowCls: function (m) { return m.fav === DP.state.team || m.dog === DP.state.team ? 'mine' : ''; },
          cols: [
            { k: 'n', l: 'Wk', cls: 'num', v: function (m) { return m.n; } },
            { k: 'fav', l: 'Favorite', v: function (m) { return U.teamName(m.fav); }, f: function (m) { return U.teamChip(m.fav, { link: 1 }); } },
            { k: 'dog', l: 'Underdog', v: function (m) { return U.teamName(m.dog); }, f: function (m) { return U.teamChip(m.dog, { link: 1 }); } },
            { k: 'pf', l: 'Chance', cls: 'num', v: function (m) { return m.pf; }, f: function (m) { return U.pct(m.pf); } },
            { k: 'ex', l: 'Exp. cats', cls: 'num', v: function (m) { return m.exF; }, f: function (m) { return U.fmt(m.exF, 1); } },
            { k: 'res', l: 'Result', v: function (m) { return m.res; }, f: function (m) { return '<span class="' + (m.res === 1 ? 'good' : m.res === 0 ? 'bad' : 'muted') + '">' + (m.res === 1 ? 'Won' : m.res === 0 ? 'Lost' : 'Tied') + ' ' + m.sf.W + '-' + m.sf.L + (m.sf.T ? '-' + m.sf.T : '') + '</span>'; } },
            { k: 'act', l: 'Cats', cls: 'num', v: function (m) { return m.actF; }, f: function (m) { return U.fmt(m.actF, 1); } }
          ]
        });
      });
    }
  };
})();
