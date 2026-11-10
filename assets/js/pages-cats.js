/* Dynasty Puck HQ - Category Insights: how every team stacks up in each of the 15 categories (what the locked lineups
 * actually did, the rest-of-season projection, or a blend), category records, a drill-down per category, and a
 * trade-partner view for all 13 other teams with the players who move the categories you need. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  var MODES = [['blend', 'Blend'], ['proj', 'Rest of season'], ['act', 'Season so far']];
  function fmt(c, v) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    if (c === 12) return v.toFixed(2);
    if (c === 13) return U.rate(v);
    return U.fmt(v, Math.abs(v) >= 100 ? 0 : 1);
  }
  function recTxt(r) { return r ? r[0] + '-' + r[1] + (r[2] ? '-' + r[2] : '') : '–'; }
  // diverging fill: blue = stronger than the league, orange = weaker, neutral in the middle (same pair as the Team Hub profile)
  function cellBg(z) {
    var a = Math.min(1, Math.abs(z) / 1.8), pct = Math.round(8 + a * 50);
    if (Math.abs(z) < 0.2) return 'var(--card2)';
    return 'color-mix(in srgb, ' + (z > 0 ? 'var(--s1)' : 'var(--s2)') + ' ' + pct + '%, var(--card2))';
  }
  function modeNote(S) {
    var H = S.hist;
    if (S.mode === 'act') return H.nReg ? 'What each team\'s locked lineups actually put up over ' + H.nReg + ' week' + (H.nReg > 1 ? 's' : '') + ' (per-week average).' : 'No finished weeks yet, so this shows the projection.';
    if (S.mode === 'proj') return 'Rest of season on today\'s rosters: best weekly lineups, projections already blended with this season\'s play.';
    return H.nReg ? 'Blend: ' + Math.round(S.wA * 100) + '% what has happened (' + H.nReg + ' weeks) + ' + Math.round((1 - S.wA) * 100) + '% rest-of-season projection. The actual side counts more every week.' : 'No finished weeks yet, so this is the projection.';
  }

  // league players' weekly category contributions (rest of season), standardised per category so they can be mixed
  function contribs() {
    var E = DP.E, key = E.version + ':' + E.openFrom();
    if (DP._cc && DP._cc.k === key) return DP._cc.d;
    var rows = E.P.filter(function (p) { return p.r && p.projGP > 0; }).map(function (p) {
      var cc = E.catContrib(p), v = cc.v.slice();
      if (p.G) { v[12] = (E.lg.gaa - p.r.gaa) * cc.g; v[13] = (p.r.sv - E.lg.sv) * cc.g; }
      return { p: p, g: cc.g, v: v, raw: cc.v };
    });
    var sd = [];
    for (var c = 0; c < E.NC; c++) {
      var goalie = E.CATS[c].grp === 'G', vals = rows.filter(function (r) { return r.p.gm && r.p.G === goalie && r.g > 0.5; }).map(function (r) { return r.v[c] || 0; });
      var m = E.sum(vals) / (vals.length || 1);
      sd.push(Math.sqrt(E.sum(vals.map(function (x) { return (x - m) * (x - m); })) / (vals.length || 1)) || 1);
    }
    rows.forEach(function (r) { r.z = r.v.map(function (x, c) { return (x || 0) / sd[c]; }); });
    DP._cc = { k: key, d: rows };
    return rows;
  }
  // market value above which a player is a franchise piece, not a category fix (the league's 40 most valuable players)
  function coreCut() {
    var E = DP.E, k = 'cut' + E.version;
    if (!DP._cut || DP._cut.k !== k) { var v = E.P.filter(function (p) { return p.gm; }).map(function (p) { return p.DV; }).sort(function (a, b) { return b - a; }); DP._cut = { k: k, v: v[Math.min(39, v.length - 1)] }; }
    return DP._cut.v;
  }
  // players on `from` who do the most for a set of weighted categories (franchise pieces left out: nobody trades
  // Makar to fix a category)
  function movers(from, cats, n) {
    var E = DP.E, cut = coreCut();
    return contribs().filter(function (r) { return r.p.gm === from && r.g > 0.8 && r.p.DV < cut; }).map(function (r) {
      var s = 0, best = [];
      cats.forEach(function (x) { var goalie = E.CATS[x.c].grp === 'G'; if (r.p.G !== goalie) return; var z = r.z[x.c] * (0.5 + x.w); s += z; best.push([x.c, r.z[x.c]]); });
      best.sort(function (a, b) { return b[1] - a[1]; });
      return { p: r.p, s: s, top: best.filter(function (b) { return b[1] > 0.4; }).slice(0, 3).map(function (b) { return b[0]; }) };
    }).filter(function (x) { return x.s > 0.6 && x.top.length; }).sort(function (a, b) { return b.s - a.s; }).slice(0, n || 3);
  }

  DP.pages.cats = {
    title: 'Category Insights',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = q.team || DP.state.team, mode = MODES.some(function (m) { return m[0] === q.v; }) ? q.v : 'blend';
      var show = q.show === 'val' || q.show === 'rec' ? q.show : 'rank';
      var S = E.catStrength(mode), H = S.hist, P = S.proj, nT = E.teams.length;
      if (mode === 'act' && !H.nReg) show = show === 'rec' ? 'rank' : show;
      var state = function (o) { return Object.assign({ v: mode, show: show, cat: q.cat, team: q.team }, o || {}); };
      var h = '<div class="page-head"><h1>🧩 Category Insights</h1><p class="sub">Where every team is strong and weak across the 15 categories, and who lines up as a trade partner. ' +
        (H.nReg ? 'Actual numbers are rebuilt from each week\'s locked Fantrax lineup and NHL stats (' + H.nReg + ' week' + (H.nReg > 1 ? 's' : '') + ' played).' : 'Actual results appear after Week 1.') + '</p></div>';
      h += '<div class="controls"><div class="seg" role="tablist" aria-label="Basis">' + MODES.map(function (m) { return '<button data-mode="' + m[0] + '" class="' + (m[0] === mode ? 'on' : '') + '">' + esc(m[1]) + '</button>'; }).join('') + '</div>' +
        '<label>Cells show <select id="ct-show"><option value="rank"' + (show === 'rank' ? ' selected' : '') + '>Rank (1 = best)</option><option value="val"' + (show === 'val' ? ' selected' : '') + '>Per-week number</option>' + (H.nReg ? '<option value="rec"' + (show === 'rec' ? ' selected' : '') + '>Category record (W-L-T)</option>' : '') + '</select></label>' +
        '<label>My team ' + ui.teamSelect('ct-team', me, 'Nobody') + '</label></div>';
      h += '<p class="small muted" style="margin-top:-6px">' + esc(modeNote(S)) + '</p>';

      // ---------------- league matrix
      var order = E.teams.slice().sort(function (a, b) { return E.sum(S.rank[a]) - E.sum(S.rank[b]); });
      var valOf = function (t, c) { return mode === 'act' && H.nReg ? H.avg[t][c] : P.avg[t][c]; };
      h += '<div class="card flush"><h2>League by category</h2><div class="hint">Blue = stronger than the league, orange = weaker. Teams are sorted by average rank. Hover or tap a cell for the details; tap a category name to drill in.</div>' +
        '<div class="tbl-wrap" style="padding:0 12px 12px"><table class="t heat catmx"><thead><tr><th>Team</th>' + E.CATS.map(function (cat, c) { return '<th class="num"><a href="' + U.hash('cats', null, state({ cat: c })) + '" title="' + esc(cat.name) + '">' + esc(cat.l) + '</a></th>'; }).join('') + '<th class="num" title="Average rank across the 15 categories">Avg</th></tr></thead><tbody>' +
        order.map(function (t) {
          var avgR = E.sum(S.rank[t]) / E.NC;
          return '<tr class="' + (t === me ? 'mine' : '') + '"><td><a href="#/team/' + encodeURIComponent(t) + '"><b>' + esc(t) + '</b></a></td>' + E.CATS.map(function (cat, c) {
            var tip = '<div class="tv">' + esc(U.teamName(t)) + ' · ' + esc(cat.l) + '</div><div class="tl">' + esc(MODES.filter(function (m) { return m[0] === mode; })[0][1]) + ': ' + U.ord(S.rank[t][c]) + ' of ' + nT +
              (H.nReg ? '<br>So far: ' + fmt(c, H.avg[t][c]) + (E.CATS[c].ratio ? '' : '/wk') + ' (' + U.ord(H.rank[t][c]) + '), record ' + recTxt(H.rec[t][c]) + ', beats ' + U.pct(H.ap[t][c]) + ' of the league' : '') +
              '<br>Rest of season: ' + fmt(c, P.avg[t][c]) + (E.CATS[c].ratio ? '' : '/wk') + ' (' + U.ord(P.rank[t][c]) + ')</div>';
            var txt = show === 'rank' ? S.rank[t][c] : show === 'val' ? fmt(c, valOf(t, c)) : recTxt(H.rec[t][c]);
            return '<td class="hc" style="background:' + cellBg(S.z[t][c]) + '" data-tip="' + esc(tip) + '">' + txt + '</td>';
          }).join('') + '<td class="num"><b>' + U.fmt(avgR, 1) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>' +
        (H.check ? '<p class="small muted" style="padding:0 14px 12px;margin:0">Check: the rebuilt category records differ from the Fantrax standings on ' + H.check.diff + ' of ' + H.check.of + ' team-category decisions (Cor is estimated, so near-ties in Cor can flip).</p>' : '') + '</div>';

      // ---------------- my team
      if (me && E.rosters[me]) h += myTeam(me, S) + partners(me, S);
      else h += '<div class="callout" style="margin-top:14px">Pick your team above to see your category report and how all 13 other teams line up as trade partners.</div>';

      // ---------------- drill-down
      var cat = q.cat !== undefined && q.cat !== '' && E.CATS[+q.cat] ? +q.cat : (me && E.rosters[me] ? S.rank[me].indexOf(Math.max.apply(null, S.rank[me])) : 0);
      h += drill(cat, S, me, state);
      el.innerHTML = h;

      U.qsa('[data-mode]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('cats', null, state({ v: b.dataset.mode })); }); });
      U.qs('#ct-show', el).addEventListener('change', function (e) { DP.go('cats', null, state({ show: e.target.value })); });
      U.qs('#ct-team', el).addEventListener('change', function (e) { DP.go('cats', null, state({ team: e.target.value })); });
      var cs = U.qs('#ct-cat', el); if (cs) cs.addEventListener('change', function (e) { DP.go('cats', null, state({ cat: e.target.value })); });
      if (q.cat !== undefined && q.cat !== '' && !q.keep) { var d = U.qs('#ct-drill', el); if (d && d.scrollIntoView) setTimeout(function () { d.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); }, 30); }
    }
  };

  // ------------------------------------------------------------ your team, category by category
  function myTeam(me, S) {
    var E = DP.E, H = S.hist, P = S.proj, nT = E.teams.length, strongN = Math.ceil(nT * 0.3), weakN = nT - strongN + 1;
    var rows = E.CATS.map(function (cat, c) { return { c: c, cat: cat, r: S.rank[me][c] }; });
    var h = '<div class="card" style="margin-top:14px"><h2>' + esc(U.teamName(me)) + ', category by category</h2><div class="hint">Verdict uses the basis chosen above. "Who to call" lists the teams strongest where you need help (when you need it) or weakest where you have plenty (when it\'s a strength).</div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>Category</th><th>Verdict</th>' + (H.nReg ? '<th class="num">So far /wk</th><th class="num">Rank</th><th class="num">Record</th><th class="num" title="Share of the league your weekly number would have beaten">Beats</th>' : '') + '<th class="num">Rest of season /wk</th><th class="num">Rank</th><th>Who to call</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var c = x.c, v = x.r <= strongN ? ['good', 'Strength'] : x.r >= weakN ? ['bad', 'Need'] : ['info', 'Middle'];
        var others = E.teams.filter(function (t) { return t !== me; });
        var call = x.r >= weakN ? others.slice().sort(function (a, b) { return S.rank[a][c] - S.rank[b][c]; }).slice(0, 3).map(function (t) { return esc(t) + ' <span class="faint">' + U.ord(S.rank[t][c]) + '</span>'; }).join(', ')
          : x.r <= strongN ? others.slice().sort(function (a, b) { return S.rank[b][c] - S.rank[a][c]; }).slice(0, 3).map(function (t) { return esc(t) + ' <span class="faint">' + U.ord(S.rank[t][c]) + '</span>'; }).join(', ') : '';
        return '<tr><td><a href="' + U.hash('cats', null, { v: S.mode, cat: c, team: me }) + '"><b>' + esc(x.cat.l) + '</b></a> <span class="faint small">' + esc(x.cat.name) + '</span></td><td><span class="badge ' + v[0] + '">' + v[1] + ' · ' + U.ord(x.r) + '</span></td>' +
          (H.nReg ? '<td class="num">' + fmt(c, H.avg[me][c]) + '</td><td class="num">' + U.ord(H.rank[me][c]) + '</td><td class="num">' + recTxt(H.rec[me][c]) + '</td><td class="num">' + U.pct(H.ap[me][c]) + '</td>' : '') +
          '<td class="num">' + fmt(c, P.avg[me][c]) + '</td><td class="num">' + U.ord(P.rank[me][c]) + '</td><td class="small">' + (call ? (x.r >= weakN ? 'has it: ' : 'needs it: ') + call : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (H.nReg) {
      var w = H.wl[me], lk = H.luck[me];
      h += '<p class="small muted">Rebuilt record ' + w.W + '-' + w.L + '-' + w.T + ' over ' + H.nReg + ' weeks. Against the whole league each week you would have averaged ' + U.fmt(H.allPlay[me] / H.nReg, 1) + ' category wins a week; the schedule has been worth ' + U.sgn(lk, 1) + ' category wins to you so far (' + (lk > 1.5 ? 'lucky draws' : lk < -1.5 ? 'tough draws' : 'about neutral') + ').</p>';
    }
    return h + '</div>';
  }

  // ------------------------------------------------------------ all 13 trade partners
  function partners(me, S) {
    var E = DP.E, fits = E.teams.filter(function (t) { return t !== me; }).map(function (t) { return E.partnerFit(me, t, S); }).sort(function (a, b) { return b.score - a.score; });
    var max = Math.max.apply(null, fits.map(function (f) { return f.score; })) || 1;
    var chip = function (x, mine) { return '<span class="catchip" title="' + esc(E.CATS[x.c].name + ': they rank ' + U.ord(x.theirs) + ', you rank ' + U.ord(x.mine)) + '"><b>' + esc(E.CATS[x.c].l) + '</b> ' + U.ord(mine ? x.mine : x.theirs) + '</span>'; };
    var pl = function (m) { return ui.plink(m.p) + ' <span class="faint small">' + m.top.map(function (c) { return esc(E.CATS[c].l); }).join(', ') + ' · ' + U.fmt(m.p.DV, 1) + '</span>'; };
    var h = '<div class="card" style="margin-top:14px"><h2>Trade partners: all ' + fits.length + ' teams</h2><div class="hint">Fit = how well the two teams\' category strengths complement each other on the basis chosen above. It uses ranks, so it stays informative early in the season, and a real fit has to run both ways: a team that needs everything but has nothing you need ranks low. "They have" = categories where they are top-5 and you are bottom half; "They need" = the reverse. Players listed do the most for those categories over the rest of the season (the league\'s 40 most valuable players are left out as untouchable); the number is market value.</div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th style="min-width:90px">Fit</th><th>They have what you need <span class="faint small">their rank</span></th><th>They need what you have <span class="faint small">your rank</span></th><th>Their players to ask about</th><th>Your players they\'d want</th><th></th></tr></thead><tbody>' +
      fits.map(function (f) {
        var theirs = f.get.length ? movers(f.t, f.get, 3) : [], mine = f.give.length ? movers(me, f.give, 3) : [];
        var a = ['p:' + (theirs[0] ? theirs[0].p.id : '') + '>' + me, 'p:' + (mine[0] ? mine[0].p.id : '') + '>' + f.t].filter(function (x) { return x.indexOf('p:>') !== 0; }).join('|');
        return '<tr><td><a href="#/team/' + encodeURIComponent(f.t) + '"><b>' + esc(U.teamName(f.t)) + '</b></a><br>' + (DP.tierBadge ? DP.tierBadge(f.t) : '') + '</td>' +
          '<td>' + ui.meter(f.score / max, f.score / max > 0.66 ? 'good' : '', 'Fit ' + U.fmt(f.score, 1)) + '<span class="faint small">' + U.fmt(f.score, 1) + '</span></td>' +
          '<td>' + (f.get.map(function (x) { return chip(x, false); }).join(' ') || '<span class="faint small">nothing clear</span>') + '</td>' +
          '<td>' + (f.give.map(function (x) { return chip(x, true); }).join(' ') || '<span class="faint small">nothing clear</span>') + '</td>' +
          '<td class="small">' + (theirs.map(pl).join('<br>') || '') + '</td><td class="small">' + (mine.map(pl).join('<br>') || '') + '</td>' +
          '<td><a class="btn sm" href="' + U.hash('trade', null, a ? { t: me + ',' + f.t, a: a } : { t: me + ',' + f.t }) + '">Build trade</a></td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">"Build trade" opens the Trade Machine with the first player from each side loaded; it then shows market value, what the deal is worth to each team, and the cap.</p></div>';
    return h;
  }

  // ------------------------------------------------------------ one category across the league
  function drill(c, S, me, state) {
    var E = DP.E, H = S.hist, P = S.proj, cat = E.CATS[c], goalie = cat.grp === 'G', nT = E.teams.length;
    var teams = E.teams.slice().sort(function (a, b) { return S.rank[a][c] - S.rank[b][c]; });
    var span = function (get) { var vs = teams.map(get).filter(function (x) { return x !== null && !isNaN(x); }); return [Math.min.apply(null, vs), Math.max.apply(null, vs)]; };
    var bar = function (v, rng) { if (v === null || isNaN(v)) return ''; var f = rng[1] === rng[0] ? 0.5 : (v - rng[0]) / (rng[1] - rng[0]); if (cat.low) f = 1 - f; return ui.meter(0.08 + 0.92 * f); };
    var ra = H.nReg ? span(function (t) { return H.avg[t][c]; }) : null, rp = span(function (t) { return P.avg[t][c]; });
    var h = '<div class="card" style="margin-top:14px" id="ct-drill"><h2>Category drill-down <select id="ct-cat" aria-label="Category" style="margin-left:8px">' + E.CATS.map(function (x, i) { return '<option value="' + i + '"' + (i === c ? ' selected' : '') + '>' + esc(x.l + ' · ' + x.name) + '</option>'; }).join('') + '</select></h2>' +
      '<div class="grid g2"><div><h3>Every team in ' + esc(cat.l) + '</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Team</th>' + (H.nReg ? '<th class="num">So far' + (cat.ratio ? '' : ' /wk') + '</th><th style="min-width:70px"></th><th class="num">Record</th>' : '') + '<th class="num">Rest of season' + (cat.ratio ? '' : ' /wk') + '</th><th style="min-width:70px"></th></tr></thead><tbody>' +
      teams.map(function (t) {
        return '<tr class="' + (t === me ? 'mine' : '') + '"><td class="num">' + S.rank[t][c] + '</td><td><a href="#/team/' + encodeURIComponent(t) + '">' + esc(U.teamName(t)) + '</a></td>' +
          (H.nReg ? '<td class="num">' + fmt(c, H.avg[t][c]) + '</td><td>' + bar(H.avg[t][c], ra) + '</td><td class="num">' + recTxt(H.rec[t][c]) + '</td>' : '') +
          '<td class="num">' + fmt(c, P.avg[t][c]) + '</td><td>' + bar(P.avg[t][c], rp) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Ranked on the basis chosen at the top (' + esc(MODES.filter(function (m) { return m[0] === S.mode; })[0][1].toLowerCase()) + ').' + (cat.low ? ' Lower is better.' : '') + '</p></div>';
    // players who move this category
    var all = contribs().filter(function (r) { return r.p.G === goalie && r.g > 0.8; }).sort(function (a, b) { return b.z[c] - a.z[c]; });
    var unit = cat.ratio ? '' : '/wk', val = function (r) { return cat.ratio ? fmt(c, r.raw[c]) : U.fmt(r.raw[c], 1); };
    var row = function (r, extra) { return '<tr class="' + (r.p.gm === me && me ? 'mine' : '') + '"><td>' + ui.pcell(r.p) + '</td><td>' + (r.p.gm ? esc(r.p.gm) : '<span class="muted">FA</span>') + '</td><td class="num"><b>' + val(r) + '</b></td><td class="num">' + U.fmt(r.g, 1) + '</td>' + (extra || '') + '</tr>'; };
    var surplus = function (t) { return S.rank[t][c] <= Math.ceil(nT * 0.36); };
    var owned = all.filter(function (r) { return r.p.gm && r.p.gm !== me; }).slice(0, 12), fa = all.filter(function (r) { return !r.p.gm; }).slice(0, 6), mine = me ? all.filter(function (r) { return r.p.gm === me; }).slice(0, 5) : [];
    var head = '<thead><tr><th>Player</th><th>Team</th><th class="num">' + esc(cat.l) + unit + '</th><th class="num" title="Expected NHL games per week, rest of season">GP/wk</th>';
    h += '<div><h3>Players who move ' + esc(cat.l) + ' <span class="faint small">rest of season</span></h3>' +
      '<div class="tbl-wrap"><table class="t small">' + head + '<th>Their team in ' + esc(cat.l) + '</th></tr></thead><tbody>' +
      owned.map(function (r) { return row(r, '<td class="small">' + U.ord(S.rank[r.p.gm][c]) + (surplus(r.p.gm) ? ' <span class="badge good" title="His team is strong here, so it can spare some">can spare</span>' : '') + '</td>'); }).join('') + '</tbody></table></div>' +
      (fa.length ? '<h3 style="margin-top:12px">Best free agents for ' + esc(cat.l) + '</h3><div class="tbl-wrap"><table class="t small">' + head + '</tr></thead><tbody>' + fa.map(function (r) { return row(r); }).join('') + '</tbody></table></div>' : '') +
      (mine.length ? '<h3 style="margin-top:12px">Your top ' + esc(cat.l) + ' players</h3><div class="tbl-wrap"><table class="t small">' + head + '</tr></thead><tbody>' + mine.map(function (r) { return row(r); }).join('') + '</tbody></table></div>' : '') +
      '<p class="small muted">' + (cat.ratio ? 'Goalies ranked by how far their projected ' + esc(cat.l) + ' beats the league average, weighted by starts.' : 'Projected ' + esc(cat.l) + ' per week = per-game rate × NHL games per week × availability.') + ' <a href="#/fa">Free-Agent Finder →</a></p></div></div></div>';
    void state;
    return h;
  }

  // top partners for the Team Hub card
  DP.partnersBrief = function (me, n) {
    var E = DP.E, S = E.catStrength('blend');
    return E.teams.filter(function (t) { return t !== me; }).map(function (t) { return E.partnerFit(me, t, S); }).sort(function (a, b) { return b.score - a.score; }).slice(0, n || 3);
  };
})();
