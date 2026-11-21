/* Dynasty Puck HQ - Market Check: our league's categories vs the Fantrax market. p.adp = Fantrax average draft position
   across Fantrax NHL drafts this season (public API getAdp, nightly; only players drafted on average before pick 280).
   Within that drafted pool, every player gets a Fantrax rank (by ADP) and our rank (by 2026-27 projected WAR, the
   category wins above replacement our 15 categories give him). Gap = Fantrax rank - our rank: positive = our categories
   like him more than the typical Fantrax drafter does. "Why" = the categories where he stands out most against the pool
   (z-score of his WAR in that category). ADP is what drafters paid before the season (a redraft price, one season);
   our rank uses the current projection, so part of a gap is the season so far. A market signal, not a model input. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var BIG = 30;

  DP.marketData = function () {
    var E = DP.E; if (DP._mk && DP._mk.v === E.version) return DP._mk.d;
    var pool = E.P.filter(function (p) { return p.adp > 0 && p.war && p.r; });
    if (!pool.length) return { rows: [], n: 0 };
    var byAdp = pool.slice().sort(function (a, b) { return a.adp - b.adp; }), byWar = pool.slice().sort(function (a, b) { return b.WAR - a.WAR; });
    var aR = {}, wR = {}; byAdp.forEach(function (p, i) { aR[p.id] = i + 1; }); byWar.forEach(function (p, i) { wR[p.id] = i + 1; });
    // per-category mean and sd over the pool (skaters and goalies separately: each only plays its own categories)
    var stat = {};
    ['S', 'G'].forEach(function (g) {
      var grp = pool.filter(function (p) { return (g === 'G') === !!p.G; }); stat[g] = {};
      E.CATS.forEach(function (c) {
        var v = grp.map(function (p) { return p.war[c.k] || 0; }), m = v.length ? E.sum(v) / v.length : 0;
        var sd = v.length > 1 ? Math.sqrt(E.sum(v.map(function (x) { return (x - m) * (x - m); })) / (v.length - 1)) : 0;
        stat[g][c.k] = { m: m, sd: sd };
      });
    });
    var rows = pool.map(function (p) {
      var st = stat[p.G ? 'G' : 'S'], z = E.CATS.filter(function (c) { return st[c.k].sd > 1e-9 && (c.grp === 'G') === !!p.G; }).map(function (c) { return { k: c.k, l: c.l, z: ((p.war[c.k] || 0) - st[c.k].m) / st[c.k].sd }; }).sort(function (a, b) { return b.z - a.z; });
      return { p: p, adp: p.adp, aR: aR[p.id], wR: wR[p.id], gap: aR[p.id] - wR[p.id], up: z.slice(0, 2).filter(function (x) { return x.z > 0.5; }), dn: z.slice(-2).reverse().filter(function (x) { return x.z < -0.5; }) };
    });
    DP._mk = { v: E.version, d: { rows: rows, n: pool.length } };
    return DP._mk.d;
  };

  var why = function (r, dir) {
    var L = dir > 0 ? r.up : r.dn; if (!L.length) return '<span class="faint">–</span>';
    return L.map(function (x) { return '<span class="' + (x.z > 0 ? 'good' : 'bad') + '">' + esc(x.l) + '</span>'; }).join(' · ');
  };

  DP.pages.adp = {
    title: 'Market Check',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, q = hsh.q, D = DP.marketData();
      var h = '<div class="page-head"><h1>🏷️ Market Check</h1><p class="sub">Our 15 categories against the Fantrax market. Fantrax publishes the average draft position (ADP) of every player across its NHL drafts; most of those leagues score differently from ours. Players our categories like more than the typical drafter are the ones other managers may undervalue, and the reverse. A market signal from Fantrax, next to our model, not part of it.</p></div>';
      if (!D.n) { el.innerHTML = h + '<div class="callout">The Fantrax ADP arrives with the next nightly update.</div>'; return; }
      var R = D.rows;
      var list = function (rows, dir) {
        return rows.length ? '<ol class="list-plain uslist">' + rows.map(function (r) {
          return '<li class="' + (r.p.gm && r.p.gm === me ? 'mine' : '') + '"><span class="us-p">' + ui.pcell(r.p, { pos: 1 }) + '</span><span class="us-o small">' + ui.owner(r.p) + '</span><span class="us-v num"><b class="' + (dir > 0 ? 'good' : 'bad') + '">' + (dir > 0 ? '+' : '−') + Math.abs(r.gap) + '</b> <span class="faint small">#' + r.aR + ' → #' + r.wR + '</span><span class="mk-why small">' + (dir < 0 && r.dn.length ? 'weak in ' : '') + why(r, dir) + '</span></span></li>';
        }).join('') + '</ol>' : '<p class="small muted">Nobody yet.</p>';
      };
      // players out now (injury list or holdout) have a projection cut for the time they miss: not a category difference
      var out = function (r) { return r.p.inj && (/OUT|IR|Injured/i.test(r.p.inj[0]) || r.p.inj[4]); }, nOut = R.filter(out).length;
      var ours = R.filter(function (r) { return !out(r) && r.gap >= BIG && r.wR <= 150; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 12);
      var theirs = R.filter(function (r) { return !out(r) && r.gap <= -BIG && r.aR <= 150; }).sort(function (a, b) { return a.gap - b.gap; }).slice(0, 12);
      h += '<div class="grid g2"><div class="card"><h3>🟢 Our categories like more</h3><div class="hint">In our top 150 and ranked ' + BIG + '+ places higher by our categories than by Fantrax drafters. Their best categories against the drafted pool are listed.</div>' + list(ours, 1) + '</div>' +
        '<div class="card"><h3>🔴 Fantrax drafters like more</h3><div class="hint">In the Fantrax top 150 and ranked ' + BIG + '+ places lower by our categories. Their weakest categories against the drafted pool are listed.</div>' + list(theirs, -1) + '</div></div>' +
        (nOut ? '<p class="small muted">' + nOut + ' drafted player' + (nOut === 1 ? ' is' : 's are') + ' out right now (injury list or holdout) and left out of these two lists: their projection is cut for the games they miss, which is not a category difference. They are in the table with their OUT badge.</p>' : '');
      el.innerHTML = h + '<div id="mk-t" style="margin-top:14px"></div><p class="small muted">Fantrax rank = place by ADP among the ' + D.n + ' players drafted on average before pick 280 (later than that is rarely or never drafted, so not ranked). Our rank = place by projected 2026-27 WAR in our categories within the same players. Gap = Fantrax rank − our rank. ADP comes from drafts made before the season (one season, redraft); our rank uses the current projection, so part of a gap is the season so far. Dynasty value (age, contract, future seasons) is in its own column.</p>';
      ui.table(U.qs('#mk-t', el), {
        rows: R, sort: q.sort || 'gap', csv: 'market-check.csv', search: function (r) { return r.p.n + ' ' + (r.p.nt || '') + ' ' + (r.p.gm || ''); },
        rowCls: function (r) { return r.p.gm && r.p.gm === me ? 'mine' : ''; },
        filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], def: q.owner || '', fn: function (r, v) { return v === 'mine' ? r.p.gm === me : v === 'owned' ? !!r.p.gm : !r.p.gm; } },
          { l: 'Position', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']], fn: function (r, v) { return v === 'G' ? r.p.G : v === 'D' ? r.p.pos === 'D' : !r.p.G && r.p.pos !== 'D'; } }],
        cols: [
          { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
          { k: 'own', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); }, asc: true },
          { k: 'adp', l: 'ADP', cls: 'num', v: function (r) { return r.adp; }, f: function (r) { return U.fmt(r.adp, 1); }, asc: true, title: 'Fantrax average draft position' },
          { k: 'aR', l: 'Fantrax #', cls: 'num', v: function (r) { return r.aR; }, asc: true },
          { k: 'wR', l: 'Our #', cls: 'num', v: function (r) { return r.wR; }, asc: true, title: 'Rank by projected 2026-27 WAR in our categories, within the drafted players' },
          { k: 'gap', l: 'Gap', cls: 'num', v: function (r) { return r.gap; }, f: function (r) { return r.gap ? '<span class="' + (r.gap >= BIG ? 'good' : r.gap <= -BIG ? 'bad' : 'muted') + '">' + (r.gap > 0 ? '+' : '−') + Math.abs(r.gap) + '</span>' : '<span class="faint">0</span>'; }, title: 'Fantrax rank minus our rank: positive = our categories like him more' },
          { k: 'war', l: 'WAR', cls: 'num', v: function (r) { return r.p.WAR; }, f: function (r) { return U.fmt(r.p.WAR, 1); } },
          { k: 'why', l: 'Stands out in', v: null, f: function (r) { return r.gap < 0 && r.dn.length ? '<span class="small">weak in ' + why(r, -1) + '</span>' : '<span class="small">' + why(r, 1) + '</span>'; } },
          { k: 'dv', l: 'Dynasty', cls: 'num', v: function (r) { return r.p.DV; }, f: function (r) { return U.fmt(r.p.DV, 1); } }
        ]
      });
    }
  };

  // one line for the player page
  DP.adpLine = function (p) {
    if (!(p && p.adp > 0)) return '';
    var D = DP.marketData(), r = D.rows.filter(function (x) { return x.p === p; })[0]; if (!r) return '';
    return '<p class="small" style="margin-top:6px"><b>🏷️ Fantrax ADP</b>: ' + U.fmt(p.adp, 1) + ' (#' + r.aR + ' of ' + D.n + ' drafted) · our categories rank him #' + r.wR + (Math.abs(r.gap) >= BIG ? ' <span class="' + (r.gap > 0 ? 'good' : 'bad') + '">' + (r.gap > 0 ? 'we like him more' : 'drafters like him more') + '</span>' : '') + ' <a href="#/adp">Market Check →</a></p>';
  };
})();
