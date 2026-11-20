/* Dynasty Puck HQ - Record Book: this season's records from the real weekly results (each team's locked Fantrax lineup x
   NHL stats): best single weeks by category, matchup records, all-play bests, streaks, and individual weekly highs from
   the locked starters' lines (data/weeks/wNN.js). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  DP.recordData = function () {
    var E = DP.E, H = E.history(), W = H.weeks.filter(function (w) { return w.games && w.games.length; }), minG = E.RULES.goalieMinGP || 2;
    var cats = E.CATS.map(function (cat, c) {
      var best = null, sum = 0, n = 0;
      W.forEach(function (w) {
        E.teams.forEach(function (t) {
          var v = w.vec[t][c], tot = w.tot[t];
          if (v === null || v === undefined || isNaN(v)) return;
          if (cat.grp === 'G' && (tot.GGP || 0) < minG) return;   // a week under the goalie minimum doesn't count for goalie records
          sum += v; n++;
          if (!best || (cat.low ? v < best.v : v > best.v)) best = { v: v, t: t, n: w.n };
        });
      });
      return { c: c, best: best, avg: n ? sum / n : null };
    });
    var games = [];
    W.forEach(function (w) { w.games.forEach(function (g) { games.push({ n: w.n, g: g, margin: Math.abs(g.sa.W - g.sb.W), top: Math.max(g.sa.W, g.sb.W), ties: g.sa.T }); }); });
    var ap = [];
    W.forEach(function (w) { E.teams.forEach(function (t) { var a = w.ap && w.ap[t]; if (a) ap.push({ t: t, n: w.n, v: E.sum(a) / a.length }); }); });
    ap.sort(function (a, b) { return b.v - a.v; });
    // streaks of matchup results (W / L / T) from each team's weeks
    var streaks = E.teams.map(function (t) {
      var R = DP.seasonRows ? DP.seasonRows(t) : [], bestW = 0, bestL = 0, cur = 0, curK = null, runW = 0, runL = 0;
      R.forEach(function (r) {
        runW = r.res === 'W' ? runW + 1 : 0; runL = r.res === 'L' ? runL + 1 : 0;
        bestW = Math.max(bestW, runW); bestL = Math.max(bestL, runL);
      });
      for (var i = R.length - 1; i >= 0; i--) { if (curK === null) curK = R[i].res; if (R[i].res !== curK) break; cur++; }
      return { t: t, bestW: bestW, bestL: bestL, cur: cur, curK: curK };
    });
    return { weeks: W, cats: cats, games: games, ap: ap, streaks: streaks };
  };
  // individual weekly highs from the locked starters' lines
  var SKI = [['Goals', 1], ['Assists', 2], ['Points', -1], ['Shots', 4], ['Hits', 6], ['Blocks', 7], ['PIM', 3], ['Special-teams points', 5], ['Takeaways', 8]];
  DP.playerRecords = function (details) {
    var E = DP.E, sk = SKI.map(function (x) { return { l: x[0], i: x[1], top: [] }; }), gk = [{ l: 'Goalie wins', top: [] }, { l: 'Saves', top: [] }, { l: 'Shutouts', top: [] }, { l: 'Save % (2+ GP)', top: [] }];
    var push = function (rec, v, row) { if (!(v > 0)) return; rec.top.push(Object.assign({ v: v }, row)); };
    details.forEach(function (d) {
      Object.keys(d.teams || {}).forEach(function (t) {
        var T = d.teams[t], act = {}; (T.active || []).forEach(function (id) { act[id] = 1; });
        Object.keys(T.pl || {}).forEach(function (id) {
          if (!act[id]) return;                                   // starters only: the lines that counted
          var l = T.pl[id], p = E.byId[id], row = { id: id, p: p, t: t, n: d.n, l: l };
          if (!p) return;
          if (p.G) {
            push(gk[0], l[1], row); push(gk[1], (l[3] || 0) - (l[2] || 0), row); push(gk[2], l[4], row);
            if (l[0] >= 2 && l[3] > 0) push(gk[3], 1 - l[2] / l[3], row);
          } else sk.forEach(function (r) { push(r, r.i < 0 ? l[1] + l[2] : l[r.i], row); });
        });
      });
    });
    sk.concat(gk).forEach(function (r) { r.top.sort(function (a, b) { return b.v - a.v; }); r.top = r.top.slice(0, 3); });
    return { sk: sk, gk: gk };
  };

  // best single-day team totals (data/weeks/dNN.js: each day of each week scored on its own)
  var DAYCATS = [['PtD', 'Pt-D'], ['G', 'G'], ['A', 'A'], ['GA2', '2G+A'], ['PIM', 'PIM'], ['SOG', 'SOG'], ['STP', 'STP'], ['Hit', 'Hit'], ['Blk', 'Blk'], ['Tk', 'Tk'], ['Cor', 'Cor'], ['W', 'W'], ['SHO', 'SHO']];
  DP.dayRecords = function (weeks) {
    var out = DAYCATS.map(function (c) { return { k: c[0], l: c[1], best: null, sum: 0, n: 0 }; });
    weeks.forEach(function (W) {
      (W.days || []).forEach(function (x) {
        Object.keys(x.teams).forEach(function (t) {
          var T = x.teams[t];
          out.forEach(function (r) { var v = T[r.k] || 0; r.sum += v; r.n++; if (!r.best || v > r.best.v) { r.best = { v: v, t: t, d: x.d, n: W.n }; r.ties = 1; } else if (v === r.best.v) r.ties++; });
        });
      });
    });
    out.forEach(function (r) { r.avg = r.n ? r.sum / r.n : 0; });
    return out;
  };

  DP.pages.records = {
    title: 'Record Book',
    render: function (el) {
      var E = DP.E, me = DP.state.team, R = DP.recordData();
      var h = '<div class="page-head"><h1>📚 Record Book</h1><p class="sub">This season\'s records from the real weekly results: each team\'s locked Fantrax lineup × NHL stats, ' + R.weeks.length + ' week' + (R.weeks.length === 1 ? '' : 's') + ' so far. Updated every night.</p></div>';
      if (!R.weeks.length) { el.innerHTML = h + '<div class="callout">Records start after week 1.</div>'; return; }
      var fmtV = function (c, v) { return c === 12 ? v.toFixed(2) : c === 13 ? U.rate(v) : c === 10 ? U.fmt(v, 0) : U.fmt(v, 0); };
      var wk = function (n) { return '<a href="' + U.hash('weekly', null, { w: n }) + '">week ' + n + '</a>'; };
      h += '<div class="card"><h2>🏆 Best single week, by category</h2><div class="hint">The best team week in each category (goalie categories only from weeks that met the ' + (E.RULES.goalieMinGP || 2) + '-GP minimum), next to the average team week.</div><div class="recgrid">' +
        R.cats.map(function (x) {
          var b = x.best; if (!b) return '';
          return '<div class="rec' + (b.t === me ? ' mine' : '') + '"><div class="rl">' + esc(E.CATS[x.c].l) + '</div><div class="rv num">' + fmtV(x.c, b.v) + '</div><div class="rt">' + U.teamChip(b.t, { link: 1 }) + '</div><div class="small muted">' + wk(b.n) + ' · avg ' + fmtV(x.c, x.avg) + '</div></div>';
        }).join('') + '</div></div>';
      var gl = function (x, label) { var g = x.g; return '<li>' + U.teamChip(g.sa.W >= g.sb.W ? g.a : g.b, { link: 1, b: 1 }) + ' <span class="num">' + Math.max(g.sa.W, g.sb.W) + '-' + Math.min(g.sa.W, g.sb.W) + '</span> <span class="muted small">vs</span> ' + U.teamChip(g.sa.W >= g.sb.W ? g.b : g.a, { link: 1 }) + '<span class="small muted" style="margin-left:auto">' + label + ' · ' + wk(x.n) + '</span></li>'; };
      var blow = R.games.slice().sort(function (a, b) { return b.margin - a.margin || b.top - a.top; }).slice(0, 5);
      var ties = R.games.slice().sort(function (a, b) { return b.ties - a.ties; }).slice(0, 3);
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>💥 Biggest wins</h2><div class="hint">Widest category margins in a matchup.</div><ul class="list-plain">' + blow.map(function (x) { return gl(x, 'by ' + x.margin); }).join('') + '</ul>' +
        '<h3 class="small" style="margin-top:12px">Most tied categories</h3><ul class="list-plain">' + ties.map(function (x) { return gl(x, x.ties + ' tied'); }).join('') + '</ul></div>';
      var apl = function (x) { return '<li>' + U.teamChip(x.t, { link: 1 }) + '<span class="small muted" style="margin-left:auto">' + wk(x.n) + ' · beat <b class="num">' + U.pct(x.v) + '</b> of the league</span></li>'; };
      h += '<div class="card"><h2>📊 Best and worst weeks (all-play)</h2><div class="hint">A team week\'s 15 categories against every other team\'s that week: the share it would have beaten.</div><ul class="list-plain">' + R.ap.slice(0, 5).map(apl).join('') + '</ul><h3 class="small" style="margin-top:12px">Toughest weeks</h3><ul class="list-plain">' + R.ap.slice(-3).reverse().map(apl).join('') + '</ul></div></div>';
      var st = R.streaks.slice().sort(function (a, b) { return b.bestW - a.bestW; });
      var cur = R.streaks.filter(function (x) { return x.cur >= 2 && x.curK !== 'T'; }).sort(function (a, b) { return b.cur - a.cur; });
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>🔥 Streaks</h2><div class="hint">Matchup results in a row (won or lost the week).</div><ul class="list-plain">' +
        st.slice(0, 4).map(function (x) { return '<li>' + U.teamChip(x.t, { link: 1 }) + '<span class="small muted" style="margin-left:auto">longest winning streak <b class="num">' + x.bestW + '</b></span></li>'; }).join('') + '</ul>' +
        '<h3 class="small" style="margin-top:12px">On a run right now</h3>' + (cur.length ? '<ul class="list-plain">' + cur.map(function (x) { return '<li>' + U.teamChip(x.t, { link: 1 }) + '<span class="small ' + (x.curK === 'W' ? 'good' : 'bad') + '" style="margin-left:auto">' + (x.curK === 'W' ? 'won ' : 'lost ') + x.cur + ' straight</span></li>'; }).join('') + '</ul>' : '<p class="small muted">Nobody has two in a row right now.</p>') + '</div>';
      h += '<div class="card"><h2>⭐ Individual weekly highs</h2><div class="hint">The best single weeks by players in a locked starting lineup (the lines that counted).</div><div id="rb-ind"><p class="small muted">Loading the weekly lines…</p></div></div></div>';
      h += '<div class="card" style="margin-top:14px"><h2>📅 Best single days</h2><div class="hint">The best one-day team total in each counting category (one NHL game day, the locked starters), next to the average team day.</div><div id="rb-days"><p class="small muted">Loading the days…</p></div></div>';
      el.innerHTML = h;
      DP.loadWeeks(R.weeks.map(function (w) { return w.n; }), function (details) {
        var box = U.qs('#rb-ind', el); if (!box) return;
        var P = DP.playerRecords(details);
        var one = function (r, fmt) { return r.top.length ? '<li><span class="rk">' + esc(r.l) + '</span><span class="who">' + r.top.map(function (x, i) { return (i ? '<span class="faint small">' : '<b>') + '<span class="num">' + (fmt ? fmt(x.v) : x.v) + '</span> ' + ui.plink(x.p) + ' <span class="small muted">' + esc(x.t) + ', wk ' + x.n + '</span>' + (i ? '</span>' : '</b>'); }).join('<br>') + '</span></li>' : ''; };
        box.innerHTML = '<ul class="list-plain recind">' + P.sk.map(function (r) { return one(r); }).join('') + P.gk.map(function (r, i) { return one(r, i === 3 ? U.rate : null); }).join('') + '</ul>';
        if (!DP.loadDays) return;
        var ns = R.weeks.map(function (w) { return w.n; }), sc = DP.league.score; if (sc && sc.week && ns.indexOf(sc.week) < 0) ns.push(sc.week);
        var got = [], i = 0;
        (function next() {
          if (i < ns.length) return DP.loadDays(ns[i++], function (D) { if (D) got.push(D); next(); });
          var db = U.qs('#rb-days', el); if (!db) return;
          if (!got.length) { db.innerHTML = '<p class="small muted">Day-by-day numbers aren\'t published yet.</p>'; return; }
          db.innerHTML = '<div class="recgrid">' + DP.dayRecords(got).map(function (r) {
            var b = r.best; if (!b) return '';
            return '<div class="rec' + (b.t === me ? ' mine' : '') + '"><div class="rl">' + esc(r.l) + '</div><div class="rv num">' + U.fmt(b.v, r.k === 'Cor' ? 1 : 0) + '</div><div class="rt">' + U.teamChip(b.t, { link: 1 }) + '</div><div class="small muted">' + esc(U.date(new Date(b.d + 'T12:00:00Z'))) + (r.ties > 1 ? ' (first of ' + r.ties + ')' : '') + ' · avg ' + U.fmt(r.avg, 1) + '</div></div>';
          }).join('') + '</div>';
        })();
      });
    }
  };
})();
