/* Dynasty Puck HQ - Punt Planner: what a build that gives up one to three categories looks like. Player values: each
   player's 2026-27 projected WAR is already a sum over the categories (E.warOf: category total above replacement x the
   value of one unit in category wins), so his value without the punted categories = WAR minus those parts. The weekly
   cost: the chance to win each category against the average opponent (Category Outlook, next lock) is set to 0 for the
   punted ones, and the chance to win the week (8+ of 15, a 7.5 tie counted half; categories independent) compared. The
   "uplift needed" is how much every other category's chance would have to rise, all by the same amount, to get the
   weekly odds back. A strategy tool: the projections and the categories stay what they are. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var MAXP = 3;

  // chance to win the week from 15 independent category chances (8+ wins; exactly half counts half)
  function weekWin(ps) {
    var d = [1];
    ps.forEach(function (p) { var nd = new Array(d.length + 1).fill(0); d.forEach(function (x, k) { nd[k] += x * (1 - p); nd[k + 1] += x * p; }); d = nd; });
    var n = ps.length, w = 0; d.forEach(function (x, k) { if (2 * k > n) w += x; else if (2 * k === n) w += x / 2; });
    return w;
  }
  DP.weekWin = weekWin;

  // value without the punted categories (keys of E.CATS)
  DP.puntValue = function (p, punt) {
    var w = p.war; if (!w || !p.r) return null;
    var v = w.total; punt.forEach(function (k) { if (w[k] !== undefined) v -= w[k]; });
    return v;
  };

  // weekly effect for a team: {base, after, need (uniform uplift that restores base), exp0, exp1}
  DP.puntWeek = function (ps, puntIdx) {
    var base = weekWin(ps), cut = ps.map(function (p, c) { return puntIdx.indexOf(c) >= 0 ? 0 : p; }), after = weekWin(cut);
    var lo = 0, hi = 1, need = null;
    if (after < base) {
      var at = function (u) { return weekWin(cut.map(function (p, c) { return puntIdx.indexOf(c) >= 0 ? 0 : Math.min(1, p + u); })); };
      if (at(1) >= base) { for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (at(m) >= base) hi = m; else lo = m; } need = hi; }
    } else need = 0;
    return { base: base, after: after, need: need, exp0: DP.E.sum(ps), exp1: DP.E.sum(cut) };
  };

  DP.pages.punt = {
    title: 'Punt Planner',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = q.team || DP.state.team;
      var punt = (q.p ? q.p.split(',') : []).filter(function (k) { return E.CATS.some(function (c) { return c.k === k; }); }).slice(0, MAXP);
      var h = '<div class="page-head"><h1>🎯 Punt Planner</h1><p class="sub">Some teams win by giving up a category or two on purpose and stacking the rest. Pick up to ' + MAXP + ' categories to punt: every player is re-valued without them (who becomes a bargain for your build, who to sell), and you see what it costs your weekly odds and how much the other categories would have to improve to make up for it.</p></div>';
      h += '<div class="controls punt-pick" role="group" aria-label="Categories to punt">' + E.CATS.map(function (c) { var on = punt.indexOf(c.k) >= 0; return '<button class="btn sm' + (on ? ' on' : '') + '" data-pk="' + esc(c.k) + '" aria-pressed="' + on + '" title="' + esc(c.name) + '">' + esc(c.l) + '</button>'; }).join('') + (punt.length ? ' <button class="btn sm ghost" data-pk="">Clear</button>' : '') + '</div>';
      el.innerHTML = h + '<div class="lz"><p class="small muted">Projecting next week\'s lineups…</p></div>';
      U.qsa('[data-pk]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.dataset.pk, P = punt.slice();
          if (!k) P = []; else if (P.indexOf(k) >= 0) P.splice(P.indexOf(k), 1); else { if (P.length >= MAXP) P.shift(); P.push(k); }
          DP.go('punt', null, { p: P.length ? P.join(',') : undefined, team: q.team });
        });
      });
      setTimeout(function () {
        var box = U.qs('.lz', el); if (!box) return;
        var hh = '', lw = E.lockWeek(), idx = punt.map(function (k) { return E.CATS.map(function (c) { return c.k; }).indexOf(k); });
        // the team's category picture and the weekly cost
        if (me && E.rosters[me] && lw !== null && DP.outlookData) {
          var O = DP.outlookData(lw), M = O.by[me];
          if (M) {
            var weak = M.p.map(function (x, c) { return { c: c, x: x }; }).sort(function (a, b) { return a.x - b.x; }).slice(0, 3);
            hh += '<div class="card"><h2>' + U.teamBadge(me) + ' ' + esc(U.teamName(me)) + ' next week</h2><div class="hint">Chance to win each category against the average opponent (Category Outlook, week ' + (lw + 1) + '). Your three weakest: ' + weak.map(function (x) { return '<b>' + esc(E.CATS[x.c].l) + '</b> ' + U.pct(x.x); }).join(', ') + ' <button class="btn sm" id="pp-weak">Punt these</button></div>' +
              '<div class="punt-cats">' + M.p.map(function (x, c) { var pu = idx.indexOf(c) >= 0; return '<span class="pc' + (pu ? ' pu' : '') + '" style="--v:' + x.toFixed(2) + '"><b>' + esc(E.CATS[c].l) + '</b>' + (pu ? 'punt' : U.pct(x)) + '</span>'; }).join('') + '</div>';
            if (punt.length) {
              var W = DP.puntWeek(M.p, idx);
              hh += '<p style="margin-top:10px">Chance to win the week: <b>' + U.pct(W.base) + '</b> with every category → <b>' + U.pct(W.after) + '</b> giving up ' + punt.map(function (k) { return esc(E.CATS[idx[punt.indexOf(k)]].l); }).join(', ') + ' outright (expected categories ' + U.fmt(W.exp0, 1) + ' → ' + U.fmt(W.exp1, 1) + ').' +
                (W.need === null ? ' Even winning every other category for sure would not get it back.' : W.need > 0 ? ' To get back to ' + U.pct(W.base) + ', each of the other ' + (E.NC - punt.length) + ' categories would need about <b>+' + Math.round(W.need * 100) + ' points</b> of win chance: that is what the value freed up by the punt has to buy.' : '') + '</p>';
            }
            hh += '</div>';
          }
        } else if (!me) hh += '<div class="callout">Pick your team (top right) to see your categories and the weekly cost.</div>';
        // player values without the punted categories
        var rows = E.P.filter(function (p) { return p.r && p.war && (p.gm || p.WAR > 0.3); }).map(function (p) { var v = DP.puntValue(p, punt); return { p: p, w: p.WAR, v: v, d: v - p.WAR, share: p.WAR > 0.05 ? (p.WAR - v) / p.WAR : 0 }; });
        var rk = rows.slice().sort(function (a, b) { return b.w - a.w; }); rk.forEach(function (r, i) { r.r0 = i + 1; });
        rk.sort(function (a, b) { return b.v - a.v; }); rk.forEach(function (r, i) { r.r1 = i + 1; });
        if (punt.length && me && E.rosters[me]) {
          var mine = rows.filter(function (r) { return r.p.gm === me && r.w - r.v > 0.2; }).sort(function (a, b) { return (b.w - b.v) - (a.w - a.v); }).slice(0, 5);
          var tg = rows.filter(function (r) { return r.p.gm !== me && r.r1 <= 150 && r.r0 - r.r1 >= 10; }).sort(function (a, b) { return (b.r0 - b.r1) - (a.r0 - a.r1); }).slice(0, 8);
          hh += '<div class="grid g2" style="margin-top:14px"><div class="card"><h3>📤 Your players who lose the most</h3><div class="hint">Projected value that comes from the punted categories: these players are worth more to a team that wants those categories.</div>' + (mine.length ? '<ul class="list-plain uslist">' + mine.map(function (r) { return '<li><span class="us-p">' + ui.pcell(r.p, { pos: 1 }) + '</span><span class="us-o small muted">' + U.fmt(r.w, 1) + ' → ' + U.fmt(r.v, 1) + ' WAR</span><span class="us-v num"><b class="bad">−' + U.fmt(r.w - r.v, 1) + '</b> <a class="small" href="' + U.hash('finder', null, { mode: 'give', p: r.p.id }) + '" title="Who could you get for him?">shop →</a></span></li>'; }).join('') + '</ul>' : '<p class="small muted">None of your players lean on these categories.</p>') + '</div>' +
            '<div class="card"><h3>📥 Who climbs for your build</h3><div class="hint">Players on other teams or free agents who move up 10+ places into the top 150 once the punted categories don\'t count.</div>' + (tg.length ? '<ul class="list-plain uslist">' + tg.map(function (r) { return '<li><span class="us-p">' + ui.pcell(r.p, { pos: 1 }) + '</span><span class="us-o small">' + ui.owner(r.p) + '</span><span class="us-v num"><b class="good">#' + r.r0 + ' → #' + r.r1 + '</b> <a class="small" href="' + U.hash('finder', null, { mode: 'get', p: r.p.id }) + '" title="What would it take to get him?">deal →</a></span></li>'; }).join('') + '</ul>' : '<p class="small muted">Nobody jumps 10+ places into the top 150.</p>') + '</div></div>';
        }
        hh += '<div id="pp-t" style="margin-top:14px"></div><p class="small muted">WAR = 2026-27 projected category wins above a replacement player (Rules &amp; Methods), split by category; "Without" drops the punted categories from the sum. This season only: dynasty values, contracts and age are on the player pages.</p>';
        box.innerHTML = hh;
        var wb = U.qs('#pp-weak', box); if (wb) wb.addEventListener('click', function () { DP.go('punt', null, { p: weak.map(function (x) { return E.CATS[x.c].k; }).join(','), team: q.team }); });
        ui.table(U.qs('#pp-t', box), {
          rows: rows, sort: punt.length ? 'v' : 'w', csv: 'punt-planner.csv', search: function (r) { return r.p.n + ' ' + (r.p.gm || ''); },
          rowCls: function (r) { return r.p.gm && r.p.gm === me ? 'mine' : ''; },
          filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], def: q.owner || '', fn: function (r, v) { return v === 'mine' ? r.p.gm === me : v === 'owned' ? !!r.p.gm : !r.p.gm; } },
            { l: 'Position', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']], fn: function (r, v) { return v === 'G' ? r.p.G : v === 'D' ? r.p.pos === 'D' : !r.p.G && r.p.pos !== 'D'; } }],
          cols: [
            { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
            { k: 'own', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); }, asc: true },
            { k: 'w', l: 'WAR', cls: 'num', v: function (r) { return r.w; }, f: function (r) { return U.fmt(r.w, 1) + ' <span class="faint small">#' + r.r0 + '</span>'; } },
            { k: 'v', l: punt.length ? 'Without ' + punt.map(function (k) { return E.CATS[idx[punt.indexOf(k)]].l; }).join(', ') : 'Without punts', cls: 'num', v: function (r) { return r.v; }, f: function (r) { return '<b>' + U.fmt(r.v, 1) + '</b> <span class="faint small">#' + r.r1 + '</span>'; } },
            { k: 'mv', l: 'Rank change', cls: 'num', v: function (r) { return r.r0 - r.r1; }, f: function (r) { var d = r.r0 - r.r1; return d ? '<span class="' + (d > 0 ? 'good' : 'bad') + '">' + (d > 0 ? '▲' : '▼') + Math.abs(d) + '</span>' : '<span class="faint">–</span>'; } },
            { k: 'share', l: 'From punted', cls: 'num', v: function (r) { return r.w - r.v; }, f: function (r) { return punt.length ? U.fmt(r.w - r.v, 1) : '–'; }, title: 'Projected WAR that came from the punted categories (negative = he was below replacement in them)' },
            { k: 'dv', l: 'Dynasty', cls: 'num', v: function (r) { return r.p.DV; }, f: function (r) { return U.fmt(r.p.DV, 1); } }
          ]
        });
      }, 30);
    }
  };
})();
