/* Dynasty Puck HQ - Breakout Watch: young skaters (25 and under) showing the signs that come before a breakout. A
   documented signal, not a forecast: it adds up
     production: half of this season's per-game value in our categories minus the preseason projection's, in Player
                 Rater units (clipped to -2.5..+2.5);
     role now:   Daily Faceoff depth chart today (top-six forward or top-pair defense +1, first power-play unit +1,
                 second unit +0.5);
     role trend: net line and power-play moves in the last 30 days (+1 a promotion, -1 a demotion);
     form:       the last 14 days against his projection (Hot & Cold), clipped to -1..+1.
   Weighted 1 / 0.75 / 0.75 / 1. Needs 5+ NHL games this season. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var MAX_AGE = 25.99, MIN_GP = 5, Wt = { prod: 1, role: 0.75, trend: 0.75, form: 1 };
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
      return { r: r, p: p, prod: prod, role: role, trend: tr, form: form, ev: net[p.id] ? net[p.id].ev : [], score: Wt.prod * prod + Wt.role * role + Wt.trend * tr + Wt.form * form };
    }).sort(function (a, b) { return b.score - a.score; });
  };

  DP.pages.breakout = {
    title: 'Breakout Watch',
    render: function (el, hsh) {
      var me = DP.state.team, q = hsh.q;
      var h = '<div class="page-head"><h1>🚀 Breakout Watch</h1><p class="sub">Young skaters (25 and under, 5+ NHL games) showing the signs that come before a breakout: producing above their preseason projection in our categories, a bigger role on the depth chart, promotions in the last 30 days, and a hot last two weeks. A documented signal to look closer at, not a forecast (the weights are under the table).</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the depth charts…</p></div>';
      DP.loadDepthLog(function (L) {
        var box = U.qs('.lz', el); if (!box) return;
        var B = DP.breakoutData(L);
        box.innerHTML = '<div id="bo-t"></div><p class="small muted">Signal = ' + Wt.prod + ' × production vs projection (half the Player Rater difference per game, −2.5 to +2.5) + ' + Wt.role + ' × role now (top-six / top pair +1, PP1 +1, PP2 +½) + ' + Wt.trend + ' × role trend (net promotions to PP1, the top six or the top pair in the last 30 days) + ' + Wt.form + ' × the last 14 days against his projection (−100% to +100%). Rookies with no projection are measured against the average regular at their position.</p>';
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
            { k: 'form', l: 'Last 14 d', cls: 'num', v: function (x) { return x.form; }, f: function (x) { return x.form ? ui.delta(x.form * 100, 0) + '%' : '<span class="faint">–</span>'; } },
            { k: 'dv', l: 'Dynasty', cls: 'num', v: function (x) { return x.p.DV; }, f: function (x) { return U.fmt(x.p.DV, 1); } }
          ]
        });
      });
    }
  };
})();
