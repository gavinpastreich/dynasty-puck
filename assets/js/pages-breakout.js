/* Dynasty Puck HQ - Breakout Watch: young skaters (25 and under) showing the signs that come before a breakout. A
   documented signal, not a forecast: it adds up
     production: half of this season's per-game value in our categories minus the preseason projection's, in Player
                 Rater units (clipped to -2.5..+2.5);
     role now:   Daily Faceoff depth chart today (top-six forward or top-pair defense +1, first power-play unit +1,
                 second unit +0.5);
     role trend: net line and power-play moves in the last 30 days (+1 a promotion, -1 a demotion);
     form:       the last 14 days against his projection (Hot & Cold), clipped to -1..+1;
     ice time:   minutes a game more than last season, halved and clipped to -1..+1 (0 with no NHL season of 10+ games
                 last year: rookies are judged on the rest).
   Weighted 1 / 0.75 / 0.75 / 1 / 0.75. Needs 5+ NHL games this season. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var MAX_AGE = 25.99, MIN_GP = 5, Wt = { prod: 1, role: 0.75, trend: 0.75, form: 1, ice: 0.75 };
  DP.BREAKOUT = { maxAge: 25, minGP: MIN_GP, w: Wt };
  var RANK = { F1: 1, F2: 2, F3: 3, F4: 4, D1: 1, D2: 2, D3: 3, PP1: 1, PP2: 2 };
  var clip = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  DP.breakoutData = function (L) {
    var E = DP.E, R = DP.raterData ? DP.raterData() : null; if (!R) return [];
    var net = {};
    if (L && L.events && DP.lineEvents && DP.lineNet) DP.lineNet(DP.lineEvents(L, 30).filter(function (e) { return e.p; })).forEach(function (e) {
      var up = e.up ? 1 : -1, top = (e.k === 'pp' && (e.to === 'PP1' || e.from === 'PP1')) || (e.k === 'line' && (['F1', 'F2', 'D1'].indexOf(e.to) >= 0 || ['F1', 'F2', 'D1'].indexOf(e.from) >= 0));
      if (e.k === 'g' || !top) return;
      var o = net[e.p.id] || (net[e.p.id] = { v: 0, ev: [] }); o.v += up; o.ev.push(e);
    });
    return R.rows.filter(function (r) { return r.kind === 'S' && r.p.age && r.p.age <= MAX_AGE && r.gp >= MIN_GP && r.vs !== null && r.vs !== undefined; }).map(function (r) {
      var p = r.p, dep = p.dep || {}, role = (dep.ln === 'F1' || dep.ln === 'F2' || dep.ln === 'D1' ? 1 : 0) + (dep.pp === 1 ? 1 : dep.pp === 2 ? 0.5 : 0);
      var f = DP.formOf ? DP.formOf(p) : null, form = f && f.pct !== null && f.pct !== undefined ? clip(f.pct, -1, 1) : 0, tr = net[p.id] ? clip(net[p.id].v, -2, 2) : 0, prod = clip(r.vs / 2, -2.5, 2.5);
      var io = DP.iceOf ? DP.iceOf(p) : null, ice = io && io.dS !== null ? clip(io.dS / 2, -1, 1) : 0;
      return { r: r, p: p, prod: prod, role: role, trend: tr, form: form, ice: ice, io: io, ev: net[p.id] ? net[p.id].ev : [], score: Wt.prod * prod + Wt.role * role + Wt.trend * tr + Wt.form * form + Wt.ice * ice };
    }).sort(function (a, b) { return b.score - a.score; });
  };

  DP.pages.breakout = {
    title: 'Breakout Watch',
    render: function (el, hsh) {
      var me = DP.state.team, q = hsh.q;
      var h = '<div class="page-head"><h1>🚀 Breakout Watch</h1><p class="sub">Young skaters (25 and under, 5+ NHL games) showing the signs that come before a breakout: producing above their preseason projection in our categories, a bigger role on the depth chart, promotions in the last 30 days, more ice time than last season and a hot last two weeks. A documented signal to look closer at, not a forecast (the weights are under the table).</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the depth charts…</p></div>';
      DP.loadDepthLog(function (L) {
        var box = U.qs('.lz', el); if (!box) return;
        var B = DP.breakoutData(L);
        box.innerHTML = '<div id="bo-t"></div><p class="small muted">Signal = ' + Wt.prod + ' × production vs projection (half the Player Rater difference per game, −2.5 to +2.5) + ' + Wt.role + ' × role now (top-six / top pair +1, PP1 +1, PP2 +½) + ' + Wt.trend + ' × role trend (net promotions to PP1, the top six or the top pair in the last 30 days) + ' + Wt.form + ' × the last 14 days against his projection (−100% to +100%) + ' + Wt.ice + ' × ice time (minutes a game more than last season, halved, −1 to +1; 0 without 10+ NHL games last season). Rookies with no projection are measured against the average regular at their position.</p>' +
          '<h2 style="margin-top:22px">🌱 Ahead of the development curve</h2><p class="small muted">The other early sign, for prospects too: skaters 25 and under whose age-adjusted scoring estimate (the development curve on their player page) rose 15% or more from their last season at the same level (from an estimate of 10+), with 20+ games in the newer one; biggest gain in points per 82 first. Junior, college and European lines are translated to the NHL with the league factors.</p><div id="bo-dev"></div>';
        ui.table(U.qs('#bo-t', el), {
          rows: B, sort: 'score', csv: 'breakout-watch.csv', search: function (x) { return x.p.n + ' ' + (x.p.nt || '') + ' ' + (x.p.gm || ''); },
          rowCls: function (x) { return x.p.gm && x.p.gm === me ? 'mine' : ''; },
          filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], def: q.owner || '', fn: function (x, v) { return v === 'mine' ? x.p.gm === me : v === 'owned' ? !!x.p.gm : !x.p.gm; } },
            { l: 'Position', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense']], fn: function (x, v) { return v === 'D' ? x.p.pos === 'D' : x.p.pos !== 'D'; } }],
          cols: [
            { k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p, { pos: 1 }); } },
            { k: 'own', l: 'Owner', v: function (x) { return x.p.gm || 'zz'; }, f: function (x) { return ui.owner(x.p); }, asc: true },
            { k: 'age', l: 'Age', cls: 'num', v: function (x) { return x.p.age; }, f: function (x) { return String(Math.floor(x.p.age)); } },
            { k: 'score', l: 'Signal', cls: 'num', v: function (x) { return x.score; }, f: function (x) { return '<b>' + U.fmt(x.score, 1) + '</b>'; } },
            { k: 'prod', l: 'vs proj.', cls: 'num', v: function (x) { return x.prod; }, f: function (x) { return ui.delta(x.prod, 1); } },
            { k: 'role', l: 'Role', v: function (x) { return x.role; }, f: function (x) { var d = x.p.dep || {}; return '<span class="small">' + esc([d.ln, d.pp ? 'PP' + d.pp : ''].filter(Boolean).join(' · ') || '–') + '</span>'; } },
            { k: 'trend', l: '30-day moves', v: function (x) { return x.trend; }, f: function (x) { return x.ev.length ? x.ev.map(function (e) { return '<span class="lchip ' + (e.up ? 'up' : 'dn') + '">' + esc(e.from || 'out') + ' → <b>' + esc(e.to || 'out') + '</b></span>'; }).join(' ') : '<span class="faint">–</span>'; } },
            { k: 'ice', l: 'Ice vs LY', cls: 'num', v: function (x) { return x.io && x.io.dS !== null ? x.io.dS : -99; }, f: function (x) { return x.io && x.io.dS !== null ? '<span class="' + (x.io.dS >= 1 ? 'good' : x.io.dS <= -1 ? 'bad' : 'muted') + '">' + (x.io.dS >= 0 ? '+' : '−') + DP.mmss(Math.abs(x.io.dS)) + '</span> <span class="faint small">' + DP.mmss(x.io.toi) + '</span>' : '<span class="faint">–</span>'; }, title: 'Ice time per game, this season minus last season, then this season' },
            { k: 'form', l: 'Last 14 d', cls: 'num', v: function (x) { return x.form; }, f: function (x) { return x.form ? ui.delta(x.form * 100, 0) + '%' : '<span class="faint">–</span>'; } },
            { k: 'dv', l: 'Dynasty', cls: 'num', v: function (x) { return x.p.DV; }, f: function (x) { return U.fmt(x.p.DV, 1); } }
          ]
        });
        if (DP.devLeaders && U.qs('#bo-dev', el)) ui.table(U.qs('#bo-dev', el), {
          rows: DP.devLeaders(), sort: 'd', csv: 'ahead-of-the-curve.csv', page: 25, search: function (x) { return x.p.n + ' ' + (x.p.gm || '') + ' ' + x.d.trend.to.lg.join(' '); },
          rowCls: function (x) { return x.p.gm && x.p.gm === me ? 'mine' : ''; },
          filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], fn: function (x, v) { return v === 'mine' ? x.p.gm === me : v === 'owned' ? !!x.p.gm : !x.p.gm; } },
            { l: 'Level', opts: [['', 'Any level'], ['nhl', 'In the NHL'], ['pro', 'Not in the NHL yet']], fn: function (x, v) { return v === 'nhl' ? x.d.trend.to.nhl : !x.d.trend.to.nhl; } }],
          cols: [
            { k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p, { pos: 1 }); } },
            { k: 'own', l: 'Owner', v: function (x) { return x.p.gm || 'zz'; }, f: function (x) { return ui.owner(x.p); }, asc: true },
            { k: 'age', l: 'Age', cls: 'num', v: function (x) { return x.p.age; }, f: function (x) { return String(Math.floor(x.p.age)); } },
            { k: 'lg', l: 'Now', v: function (x) { return x.d.trend.to.lg.join(' + '); }, f: function (x) { return '<span class="small">' + esc(x.d.trend.to.lg.join(' + ')) + ' · ' + x.d.trend.to.gp + ' GP</span>'; } },
            { k: 'from', l: 'Estimate then', cls: 'num', v: function (x) { return x.d.trend.from.adj; }, f: function (x) { return U.fmt(x.d.trend.from.adj, 0) + ' <span class="faint small">' + esc(U.season(x.d.trend.from.season).slice(2)) + '</span>'; } },
            { k: 'to', l: 'Estimate now', cls: 'num', v: function (x) { return x.d.trend.to.adj; }, f: function (x) { return '<b>' + U.fmt(x.d.trend.to.adj, 0) + '</b> <span class="faint small">' + esc(U.season(x.d.trend.to.season).slice(2)) + '</span>'; } },
            { k: 'd', l: 'Gain', cls: 'num', v: function (x) { return x.d.trend.d; }, f: function (x) { return '<b class="good">+' + U.fmt(x.d.trend.d, 0) + '</b>'; }, title: 'Points per 82 games added to the age-adjusted estimate' },
            { k: 'rel', l: '%', cls: 'num', v: function (x) { return x.d.trend.rel; }, f: function (x) { return '<span class="good">+' + Math.round(x.d.trend.rel * 100) + '%</span>'; } },
            { k: 'dv', l: 'Dynasty', cls: 'num', v: function (x) { return x.p.DV; }, f: function (x) { return U.fmt(x.p.DV, 1); } }
          ]
        });
      });
    }
  };
})();
