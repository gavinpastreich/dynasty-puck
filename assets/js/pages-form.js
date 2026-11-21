/* Dynasty Puck HQ - Hot & Cold: every player's last 14 days of NHL games (real stats, published nightly as p.l14)
   against his own projection, valued in this league's categories. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var MIN_S = 3, MIN_G = 2;

  // category value of a skater's per-game rates [PtD, G, A, PIM, SOG, STP, Hit, Blk, Tk, Cor], with the weekly
  // category weights the lineup optimizer uses (so a hit and a goal are weighed the way this league scores them)
  function skValue(r) {
    var w = DP.E.W8;
    return w.PtD * r[0] + w.G * r[1] + w.A * r[2] + w.GA2 * (2 * r[1] + r[2]) + w.PIM * r[3] + w.SOG * r[4] + w.STP * r[5] + w.Hit * r[6] + w.Blk * r[7] + w.Tk * r[8] + w.Cor * r[9];
  }
  function rates(a) { var gp = a[0] || 0; return gp ? a.slice(1, 11).map(function (x) { return x / gp; }) : null; }
  // the projection he is measured against: the preseason one when the season has started (p.pre), else p26
  function projOf(p) { return p.pre || p.p26; }
  DP.formOf = function (p) {
    if (!p.l14) return null;
    var L = p.l14, P = projOf(p);
    if (p.G) {
      if (L[0] < MIN_G || !P || !P[0]) return null;
      // no usable projected save % (e.g. no projection this season): measure him against the league average instead
      var svP = P[3] > 1 ? P[3] / 1000 : P[3], lgAvg = !(svP > 0.8 && svP < 1), sa = L[6] || 0, sv = L[3];
      if (lgAvg) svP = DP.E.lg.sv;
      return { kind: 'G', gp: L[0], w: L[1], gaa: L[2], sv: sv, sho: L[4], sa: sa, svP: svP, lgAvg: lgAvg, gaaP: P[2] > 0 ? P[2] : DP.E.lg.gaa, gsax: sa * (sv - svP), pct: sv - svP };
    }
    if (L[0] < MIN_S || !P || !P[0]) return null;
    var r14 = rates(L), rP = rates(P), v14 = skValue(r14), vP = skValue(rP);
    return { kind: 'S', gp: L[0], r14: r14, rP: rP, v14: v14, vP: vP, pct: vP > 0 ? v14 / vP - 1 : null, extra: (v14 - vP) * L[0] };
  };
  DP.formBadge = function (p) {
    var f = DP.formOf(p); if (!f) return '';
    if (f.kind === 'S') return f.gp >= 4 && f.pct >= 0.4 ? '<span class="badge warn" title="Last 14 days ' + U.pct(f.pct) + ' above his projection in our categories">🔥 hot</span>' : f.gp >= 4 && f.pct <= -0.4 && f.vP > 0 ? '<span class="badge info" title="Last 14 days ' + U.pct(-f.pct) + ' below his projection in our categories">🧊 cold</span>' : '';
    return f.gp >= 3 && f.gsax >= 4 ? '<span class="badge warn">🔥 hot</span>' : f.gp >= 3 && f.gsax <= -4 ? '<span class="badge info">🧊 cold</span>' : '';
  };
  var LBL = ['Pt-D', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
  DP.formLine = function (p) {
    var L = p.l14, F = DP.league.form; if (!L || !F) return '';
    var span = U.date(new Date(F.from + 'T12:00:00Z')) + ' – ' + U.date(new Date(F.to + 'T12:00:00Z')), f = DP.formOf(p);
    var line = p.G ? L[0] + ' GP, ' + L[1] + ' W, ' + (L[2] || 0).toFixed(2) + ' GAA, ' + U.rate(L[3]) + ' SV%, ' + L[4] + ' SO'
      : L[0] + ' GP, ' + L[2] + ' G, ' + L[3] + ' A, ' + L[5] + ' SOG, ' + L[7] + ' Hit, ' + L[8] + ' Blk, ' + L[4] + ' PIM' + (L[6] ? ', ' + L[6] + ' STP' : '');
    var vs = !f ? '' : f.kind === 'S' && f.pct !== null ? ' · <b class="' + (f.pct > 0 ? 'good' : 'bad') + '">' + U.sgn(f.pct * 100, 0) + '%</b> vs his projection in our categories' : f.kind === 'G' ? ' · <b class="' + (f.gsax > 0 ? 'good' : 'bad') + '">' + U.sgn(f.gsax, 1) + '</b> goals saved vs his projected SV%' : '';
    return '<p class="small" style="margin-top:8px"><b>Last 14 days</b> (' + esc(span) + '): ' + line + vs + ' ' + DP.formBadge(p) + ' <a href="#/form">Hot & Cold →</a></p>';
  };

  DP.pages.form = {
    title: 'Hot & Cold',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, F = DP.league.form, q = hsh.q, k = q.k === 'G' ? 'G' : 'S';
      var h = '<div class="page-head"><h1>🔥 Hot & Cold</h1><p class="sub">Every player\'s last 14 days of NHL games against his own projection, weighed in this league\'s 15 categories (a hit and a goal count the way our categories score them). Real NHL stats; Cor estimated from shot attempts as everywhere on the site.</p></div>';
      if (!F) { el.innerHTML = h + '<div class="callout">No recent games published yet. This fills in with the nightly build once games are played.</div>'; return; }
      h += '<div class="callout small">Window: <b>' + esc(U.date(new Date(F.from + 'T12:00:00Z'))) + ' – ' + esc(U.date(new Date(F.to + 'T12:00:00Z'))) + '</b> (' + F.n + ' players with games). Two weeks is a small sample: most streaks fade. For whether a scoring run is shooting luck, see <a href="#/luck">Buy Low / Sell High</a>; for next week\'s adds, the <a href="#/pickup">Pickup Planner</a>.</div>';
      h += '<div class="controls"><div class="seg" role="tablist"><button data-k="S" class="' + (k === 'S' ? 'on' : '') + '">Skaters</button><button data-k="G" class="' + (k === 'G' ? 'on' : '') + '">Goalies</button></div></div>';
      var rows = E.P.map(function (p) { var f = DP.formOf(p); return f && f.kind === k ? { p: p, f: f } : null; }).filter(Boolean);
      var line = function (r) {
        var f = r.f, p = r.p;
        if (k === 'G') return '<span class="small muted">' + f.gp + ' GP · ' + U.rate(f.sv) + ' SV% (' + (f.lgAvg ? 'league ' : 'proj ') + U.rate(f.svP) + ') · ' + (f.gaa || 0).toFixed(2) + ' GAA · ' + f.w + ' W</span>';
        var L = p.l14;
        return '<span class="small muted">' + f.gp + ' GP · ' + L[2] + 'G ' + L[3] + 'A · ' + L[5] + ' SOG · ' + L[7] + ' Hit · ' + L[8] + ' Blk</span>';
      };
      var score = function (r) { return k === 'G' ? r.f.gsax : r.f.extra; };
      var right = function (r) { return k === 'G' ? '<b class="' + (r.f.gsax > 0 ? 'good' : 'bad') + '">' + U.sgn(r.f.gsax, 1) + '</b><br><span class="small muted">goals saved</span>' : (r.f.pct === null ? '<b>new</b><br><span class="small muted">no projection</span>' : '<b class="' + (r.f.pct > 0 ? 'good' : 'bad') + '">' + U.sgn(r.f.pct * 100, 0) + '%</b><br><span class="small muted">vs projection</span>'); };
      var li = function (r) { return '<li><div class="fml">' + ui.pcell(r.p, { pos: 1 }) + '<div class="fmd">' + line(r) + (r.p.gm && r.p.gm !== me ? ' · ' + U.teamLabel(r.p.gm) : '') + '</div></div><span class="num fmr">' + right(r) + '</span></li>'; };
      var card = function (title, hint, list, extra) { return '<div class="card"><h2>' + title + '</h2><div class="hint">' + hint + '</div>' + (list.length ? '<ul class="list-plain fmlist">' + list.map(li).join('') + '</ul>' : '<p class="small muted">Nobody yet.</p>') + (extra || '') + '</div>'; };
      var meaningful = function (r) { return k === 'G' || r.f.vP >= 0.05; };
      var hot = rows.filter(function (r) { return score(r) > 0; }).sort(function (a, b) { return score(b) - score(a); });
      var cold = rows.filter(function (r) { return score(r) < 0 && meaningful(r) && r.f.gp >= (k === 'G' ? MIN_G : 4); }).sort(function (a, b) { return score(a) - score(b); });
      h += '<div class="grid g2">';
      h += card('🔥 Hottest', k === 'G' ? 'Goals saved above what his projected save % would allow on the shots he faced.' : 'Most category value above his own projection over the stretch (rate gap × games).', hot.slice(0, 10));
      h += card('🧊 Coldest', k === 'G' ? 'Goals allowed above his projected save %.' : 'Furthest below his projection, among regulars (4+ games).', cold.slice(0, 10));
      h += card('🛒 Hot free agents', 'Unowned and running above projection. Next week\'s best adds against your opponent are on the Pickup Planner.', hot.filter(function (r) { return !r.p.gm; }).slice(0, 10), '<p class="small"><a href="#/pickup">Pickup Planner →</a></p>');
      if (me) {
        var mine = rows.filter(function (r) { return r.p.gm === me; }).sort(function (a, b) { return score(b) - score(a); });
        h += card(U.teamBadge(me) + ' Your roster', 'Everyone on ' + esc(U.teamName(me)) + ' with ' + (k === 'G' ? MIN_G : MIN_S) + '+ games in the window, hottest first.', mine);
      }
      h += '</div><div class="card flush" style="margin-top:14px"><h2>Everyone</h2><div class="hint">Per-game numbers over the last 14 days next to his projection (the preseason projection once the season has started).</div><div id="fm-t" style="padding:0 12px 12px"></div></div>';
      el.innerHTML = h;
      U.qsa('[data-k]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('form', null, { k: b.dataset.k === 'G' ? 'G' : undefined }); }); });
      var pg = function (r, i, d) { return U.fmt(r.f.r14[i], d === undefined ? 2 : d) + ' <span class="faint small">' + U.fmt(r.f.rP[i], d === undefined ? 2 : d) + '</span>'; };
      var colsS = [
        { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
        { k: 'gm', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); }, asc: true },
        { k: 'gp', l: 'GP', cls: 'num', v: function (r) { return r.f.gp; } },
        { k: 'g', l: 'G/gp', cls: 'num', v: function (r) { return r.f.r14[1]; }, f: function (r) { return pg(r, 1); }, title: 'Last 14 days per game, then his projection per game' },
        { k: 'a', l: 'A/gp', cls: 'num', v: function (r) { return r.f.r14[2]; }, f: function (r) { return pg(r, 2); } },
        { k: 'sog', l: 'SOG/gp', cls: 'num', v: function (r) { return r.f.r14[4]; }, f: function (r) { return pg(r, 4, 1); } },
        { k: 'hit', l: 'Hit/gp', cls: 'num', v: function (r) { return r.f.r14[6]; }, f: function (r) { return pg(r, 6, 1); } },
        { k: 'blk', l: 'Blk/gp', cls: 'num', v: function (r) { return r.f.r14[7]; }, f: function (r) { return pg(r, 7, 1); } },
        { k: 'toi', l: 'TOI', cls: 'num', v: function (r) { return r.p.i14 ? r.p.i14[0] : -1; }, f: function (r) { var o = DP.iceOf ? DP.iceOf(r.p) : null; return o && o.toi14 !== null ? DP.mmss(o.toi14) + ' <span class="faint small">' + DP.mmss(o.toi) + '</span>' : '<span class="faint">–</span>'; }, title: 'Ice time per game, last 14 days, then his season average' },
        { k: 'pct', l: 'vs proj', cls: 'num', v: function (r) { return r.f.pct; }, f: function (r) { return r.f.pct === null ? '–' : '<b class="' + (r.f.pct > 0 ? 'good' : 'bad') + '">' + U.sgn(r.f.pct * 100, 0) + '%</b>'; }, title: 'Category value per game, last 14 days vs his projection' },
        { k: 'extra', l: 'Form', cls: 'num', v: function (r) { return r.f.extra; }, f: function (r) { return ui.delta(r.f.extra * 10, 1); }, title: 'Category value above projection over the stretch (×10)' }
      ];
      var colsG = [
        { k: 'n', l: 'Goalie', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
        { k: 'gm', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); }, asc: true },
        { k: 'gp', l: 'GP', cls: 'num', v: function (r) { return r.f.gp; } },
        { k: 'w', l: 'W', cls: 'num', v: function (r) { return r.f.w; } },
        { k: 'gaa', l: 'GAA', cls: 'num', v: function (r) { return -r.f.gaa; }, f: function (r) { return (r.f.gaa || 0).toFixed(2) + ' <span class="faint small">' + (r.f.gaaP || 0).toFixed(2) + '</span>'; } },
        { k: 'sv', l: 'SV%', cls: 'num', v: function (r) { return r.f.sv; }, f: function (r) { return U.rate(r.f.sv) + ' <span class="faint small">' + U.rate(r.f.svP) + '</span>'; } },
        { k: 'gsax', l: 'Goals saved vs proj', cls: 'num', v: function (r) { return r.f.gsax; }, f: function (r) { return '<b>' + ui.delta(r.f.gsax, 1) + '</b>'; } }
      ];
      ui.table(U.qs('#fm-t', el), {
        rows: rows, sort: k === 'G' ? 'gsax' : 'extra', csv: 'hot-cold-' + (k === 'G' ? 'goalies' : 'skaters') + '.csv', search: function (r) { return r.p.n + ' ' + r.p.t; },
        rowCls: function (r) { return r.p.gm && r.p.gm === me ? 'mine' : ''; },
        filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], fn: function (r, v) { return v === 'mine' ? r.p.gm === me : v === 'owned' ? !!r.p.gm : !r.p.gm; } }]
          .concat(k === 'S' ? [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D']], fn: function (r, v) { return v === 'D' ? r.p.D || r.p.fd : !r.p.D; } }] : []),
        cols: k === 'G' ? colsG : colsS
      });
    }
  };
})();
