/* Dynasty Puck HQ - Player Rater: who has actually produced the most in our categories this season. Real 2026-27 NHL
   stats (p.ytd, from the NHL stats API in the nightly build), each category turned into a z-score against the regulars
   (skaters with 10+ GP; Pt-D only for defensemen, the only ones who score it), summed. Goalies: wins and shutouts as
   totals, GAA and save % as goals prevented against the league rate (so a goalie with more games counts more). Season
   totals or per game. A record of what happened, not a projection. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var SKC = [['PtD', 'Pt-D', 1], ['G', 'G', 2], ['A', 'A', 3], ['GA2', '2G+A', -1], ['PIM', 'PIM', 4], ['SOG', 'SOG', 5], ['STP', 'STP', 6], ['Hit', 'Hit', 7], ['Blk', 'Blk', 8], ['Tk', 'Tk', 9], ['Cor', 'Cor', 10]];
  var GKC = [['W', 'W'], ['SHO', 'SHO'], ['GAA', 'GAA'], ['SV', 'SV%']];
  var MIN_REF = 10, MIN_SHOW = 3, cache = {};
  function sk(p, i) { var y = p.ytd; return i === -1 ? 2 * y[2] + y[3] : y[i] || 0; }
  function stats(xs) { var n = xs.length || 1, m = xs.reduce(function (a, b) { return a + b; }, 0) / n; return { m: m, sd: Math.sqrt(xs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / n) || 1 }; }

  DP.raterData = function () {
    var E = DP.E; if (cache.v === E.version) return cache.d;
    var S = E.P.filter(function (p) { return !p.G && p.ytd && p.ytd[0] >= MIN_SHOW; }), G = E.P.filter(function (p) { return p.G && p.ytd && p.ytd[0] >= MIN_SHOW; });
    var refS = S.filter(function (p) { return p.ytd[0] >= MIN_REF; }), refD = refS.filter(function (p) { return p.pos === 'D'; });
    var st = {}, stg = {};
    SKC.forEach(function (c) {
      var pool = c[0] === 'PtD' ? refD : refS;
      st[c[0]] = { tot: stats(pool.map(function (p) { return sk(p, c[2]); })), pg: stats(pool.map(function (p) { return sk(p, c[2]) / p.ytd[0]; })) };
    });
    var rows = S.map(function (p) {
      var gp = p.ytd[0], z = {}, zp = {};
      SKC.forEach(function (c) {
        if (c[0] === 'PtD' && p.pos !== 'D') { z.PtD = 0; zp.PtD = 0; return; }
        var x = sk(p, c[2]); z[c[0]] = (x - st[c[0]].tot.m) / st[c[0]].tot.sd; zp[c[0]] = (x / gp - st[c[0]].pg.m) / st[c[0]].pg.sd;
      });
      var pr = p.p26 && p.p26[0] > 0 ? p.p26 : null, projPg = 0;
      if (pr) SKC.forEach(function (c) { if (c[0] === 'PtD' && p.pos !== 'D') return; var x = c[2] === -1 ? 2 * pr[2] + pr[3] : pr[c[2]] || 0; projPg += (x / pr[0] - st[c[0]].pg.m) / st[c[0]].pg.sd; });
      var pgS = E.sum(Object.keys(zp).map(function (k) { return zp[k]; }));
      return { p: p, gp: gp, z: z, zp: zp, tot: E.sum(Object.keys(z).map(function (k) { return z[k]; })), pg: pgS, projPg: projPg, hasProj: !!pr, vs: pgS - projPg, kind: 'S' };
    });
    // goalies: [GP, W, GAA, SV%, SHO]; shots against estimated from GAA and SV% (GA = GAA x GP, SA = GA / (1 - SV%))
    var refG = G.filter(function (p) { return p.ytd[0] >= 5; });
    var lgSA = 0, lgGA = 0, lgGP = 0;
    refG.forEach(function (p) { var y = p.ytd, ga = y[2] * y[0]; lgGA += ga; lgSA += y[3] < 1 ? ga / Math.max(0.01, 1 - y[3]) : 0; lgGP += y[0]; });
    var lgSV = lgSA ? 1 - lgGA / lgSA : 0.9, lgGAA = lgGP ? lgGA / lgGP : 3;
    var gx = function (p) { var y = p.ytd, ga = y[2] * y[0], sa = y[3] < 1 ? ga / Math.max(0.01, 1 - y[3]) : 0; return { W: y[1], SHO: y[4], GAA: (lgGAA - y[2]) * y[0], SV: (y[3] - lgSV) * sa }; };
    GKC.forEach(function (c) { stg[c[0]] = { tot: stats(refG.map(function (p) { return gx(p)[c[0]]; })), pg: stats(refG.map(function (p) { return gx(p)[c[0]] / p.ytd[0]; })) }; });
    G.forEach(function (p) {
      var x = gx(p), gp = p.ytd[0], z = {}, zp = {};
      GKC.forEach(function (c) { z[c[0]] = (x[c[0]] - stg[c[0]].tot.m) / stg[c[0]].tot.sd; zp[c[0]] = (x[c[0]] / gp - stg[c[0]].pg.m) / stg[c[0]].pg.sd; });
      var pr = p.p26 && p.p26[0] > 0 && p.p26[3] > 0 && p.p26[3] < 1 ? p.p26 : null, projPg = 0;
      if (pr) { var pga = pr[2], psa = pga / Math.max(0.01, 1 - pr[3]), px = { W: pr[1] / pr[0], SHO: pr[4] / pr[0], GAA: lgGAA - pga, SV: (pr[3] - lgSV) * psa }; GKC.forEach(function (c) { projPg += (px[c[0]] - stg[c[0]].pg.m) / stg[c[0]].pg.sd; }); }
      var pgG = E.sum(Object.keys(zp).map(function (k) { return zp[k]; }));
      rows.push({ p: p, gp: gp, z: z, zp: zp, tot: E.sum(Object.keys(z).map(function (k) { return z[k]; })), pg: pgG, projPg: projPg, hasProj: !!pr, vs: pgG - projPg, kind: 'G' });
    });
    ['tot', 'pg'].forEach(function (k) { ['S', 'G'].forEach(function (kind) { rows.filter(function (r) { return r.kind === kind; }).sort(function (a, b) { return b[k] - a[k]; }).forEach(function (r, i) { r[k + 'Rank'] = i + 1; }); }); });
    cache = { v: E.version, d: { rows: rows, lgSV: lgSV, lgGAA: lgGAA } };
    return cache.d;
  };
  function best(r, per) {
    var z = per ? r.zp : r.z, L = r.kind === 'G' ? GKC : SKC;
    return L.map(function (c) { return { l: c[1], z: z[c[0]] }; }).filter(function (x) { return x.z > 0.5; }).sort(function (a, b) { return b.z - a.z; }).slice(0, 3);
  }

  DP.pages.rater = {
    title: 'Player Rater',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team, per = q.per === '1', D = DP.raterData();
      var h = '<div class="page-head"><h1>⭐ Player Rater</h1><p class="sub">Who has actually produced the most in our categories this season: real 2026-27 NHL stats, each category scored against the league\'s regulars (a z-score) and added up. ' + (per ? 'Per game, so part-timers and injured players are judged on their games.' : 'Season totals, so games played count.') + ' A record of what happened, not a projection: the dynasty values look ahead. <b>vs preseason</b> = value per game minus what the preseason projection implied per game, on the same scale: sort by it for the season\'s over- and under-achievers.</p></div>';
      h += '<div class="controls"><div class="seg"><button data-per="0" class="' + (per ? '' : 'on') + '">Season totals</button><button data-per="1" class="' + (per ? 'on' : '') + '">Per game</button></div><span class="small muted">Skaters with ' + MIN_SHOW + '+ GP; z-scores against skaters with ' + MIN_REF + '+ GP. League save % ' + U.rate(D.lgSV) + ', GAA ' + U.fmt(D.lgGAA, 2) + '.</span></div><div id="rt-t"></div>';
      el.innerHTML = h;
      U.qsa('[data-per]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('rater', null, { per: b.dataset.per === '1' ? '1' : undefined }); }); });
      var k = per ? 'pg' : 'tot';
      ui.table(U.qs('#rt-t', el), {
        rows: D.rows, sort: k, csv: 'player-rater.csv', search: function (r) { return r.p.n + ' ' + (r.p.nt || '') + ' ' + (r.p.gm || ''); },
        rowCls: function (r) { return r.p.gm && r.p.gm === me ? 'mine' : ''; },
        filters: [{ l: 'Players', opts: [['S', 'Skaters'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']], def: q.pos || 'S', fn: function (r, v) { return v === 'G' ? r.kind === 'G' : r.kind === 'S' && (v === 'S' || (v === 'D' ? r.p.pos === 'D' : r.p.pos !== 'D')); } },
          { l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], def: q.owner || '', fn: function (r, v) { return v === 'mine' ? r.p.gm === me : v === 'owned' ? !!r.p.gm : !r.p.gm; } }],
        cols: [
          { k: 'rk', l: '#', cls: 'num', v: function (r) { return r[k + 'Rank']; } },
          { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
          { k: 'own', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); }, asc: true },
          { k: 'gp', l: 'GP', cls: 'num', v: function (r) { return r.gp; } },
          { k: k, l: per ? 'Value / game' : 'Value', cls: 'num', v: function (r) { return r[k]; }, f: function (r) { return '<b>' + U.fmt(r[k], 1) + '</b>'; } },
          { k: 'vs', l: 'vs preseason', cls: 'num', v: function (r) { return r.vs; }, f: function (r) { return (r.hasProj ? '' : '<span class="faint small" title="No preseason projection: measured against the average regular">*</span> ') + ui.delta(r.vs, 1); } },
          { k: 'best', l: 'Best categories', v: function (r) { return best(r, per).length; }, f: function (r) { return best(r, per).map(function (x) { return '<span class="mw-cat W">' + esc(x.l) + ' ' + U.sgn(x.z, 1) + '</span>'; }).join(' '); } },
          { k: 'war', l: 'Proj. WAR', cls: 'num', v: function (r) { return r.p.WAR; }, f: function (r) { return r.p.r ? ui.warCell(r.p.WAR) : '–'; } },
          { k: 'dv', l: 'Dynasty', cls: 'num', v: function (r) { return r.p.DV; }, f: function (r) { return U.fmt(r.p.DV, 1); } }
        ]
      });
    }
  };
})();
