/* Dynasty Puck HQ - Players database, Free-agent finder, Compare, Leaderboards. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  // ------------------------------------------------------------ Players database
  DP.pages.players = {
    title: 'Players',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, view = q.view || 'value';
      var h = '<div class="page-head"><h1>Players</h1><p class="sub">Every rostered player plus every free agent with 2025-26 NHL games or a 2026-27 projection (' + E.P.length + ' players). Click a name for the full card. Values are model estimates (see Rules & Methods).</p></div>';
      h += '<div class="controls"><div class="seg" role="tablist">' + [['value', 'Value & contract'], ['proj', '2026-27 projection'], ['last', '2025-26 actual'], ['rates', 'Per-game rates']].map(function (v) { return '<button data-view="' + v[0] + '" class="' + (view === v[0] ? 'on' : '') + '">' + v[1] + '</button>'; }).join('') + '</div></div><div id="pl-t"></div>';
      el.innerHTML = h;
      U.qsa('[data-view]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('players', null, { view: b.dataset.view }); }); });
      var ownerF = { l: 'Owner', opts: [['', 'All'], ['__owned', 'Owned'], ['__fa', 'Free agents']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), fn: function (p, v) { return v === '__owned' ? !!p.gm : v === '__fa' ? !p.gm : p.gm === v; } };
      if (view === 'value') { DP.rosterTable(U.qs('#pl-t', el), E.P, { csv: 'dynasty-puck-players.csv', extraFilters: [ownerF] }); return; }
      var skCols = function (arr, per) {
        var f = function (i, d) { return function (p) { var v = p[arr][i]; if (per) v = p[arr][0] ? v / p[arr][0] : null; return v; }; };
        var fmt = function (d) { return function (x) { return x === null || x === undefined ? '–' : U.fmt(x, d); }; };
        var labs = ['GP', 'Pt-D', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
        return labs.map(function (l, i) {
          if (per && i === 0) return { k: arr + i, l: l, cls: 'num', v: function (p) { return p[arr][0]; } };
          var g = f(i), d = per ? (i === 10 ? 1 : 2) : 0;
          return { k: arr + i, l: l, cls: 'num', v: function (p) { return p.G ? null : g(p); }, f: function (p) { return p.G ? '<span class="faint">–</span>' : fmt(d)(g(p)); } };
        }).concat([{ k: arr + 'ga', l: '2G+A', cls: 'num', v: function (p) { if (p.G) return null; var v = 2 * p[arr][2] + p[arr][3]; return per ? (p[arr][0] ? v / p[arr][0] : null) : v; }, f: function (p) { if (p.G) return '<span class="faint">–</span>'; var v = 2 * p[arr][2] + p[arr][3]; return per ? (p[arr][0] ? U.fmt(v / p[arr][0], 2) : '–') : U.fmt(v); } },
          { k: arr + 'w', l: 'W', cls: 'num', v: function (p) { return p.G ? p[arr][1] : null; }, f: function (p) { return p.G ? U.fmt(p[arr][1]) : ''; } },
          { k: arr + 'gaa', l: 'GAA', cls: 'num', asc: true, v: function (p) { return p.G && p[arr][0] ? p[arr][2] : null; }, f: function (p) { return p.G && p[arr][0] ? p[arr][2].toFixed(2) : ''; } },
          { k: arr + 'sv', l: 'SV%', cls: 'num', v: function (p) { return p.G && p[arr][0] ? p[arr][3] : null; }, f: function (p) { return p.G && p[arr][0] ? U.rate(p[arr][3]) : ''; } },
          { k: arr + 'sho', l: 'SHO', cls: 'num', v: function (p) { return p.G ? p[arr][4] : null; }, f: function (p) { return p.G ? U.fmt(p[arr][4]) : ''; } }]);
      };
      var arr = view === 'last' ? 's25' : 'p26';
      ui.table(U.qs('#pl-t', el), {
        rows: E.P.filter(function (p) { return p[arr][0] > 0; }), sort: arr + '1' === arr + '1' ? (view === 'rates' ? 'p262' : arr + '2') : null, csv: 'dynasty-puck-' + view + '.csv',
        search: function (p) { return p.n + ' ' + p.t + ' ' + (p.gm || ''); },
        filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (p, v) { return p.slot === v; } }, ownerF],
        rowCls: function (p) { return DP.state.team && p.gm === DP.state.team ? 'mine' : ''; },
        cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'pos', l: 'Pos', v: function (p) { return p.slot; }, f: ui.pos }, { k: 'gm', l: 'Owner', v: function (p) { return p.gm || 'zz'; }, f: ui.owner }]
          .concat(skCols(arr, view === 'rates')).concat([{ k: 'WAR', l: 'WAR', cls: 'num', v: function (p) { return p.r ? p.WAR : null; }, f: function (p) { return p.r ? ui.warCell(p.WAR) : '–'; } }])
      });
    }
  };

  // ------------------------------------------------------------ Free-agent finder
  DP.pages.fa = {
    title: 'Free Agents',
    render: function (el, hsh) {
      var E = DP.E, me = hsh.q.team || DP.state.team;
      var fas = E.P.filter(function (p) { return !p.gm && p.r && p.projGP >= 5; });
      var h = '<div class="page-head"><h1>Free-Agent Finder</h1><p class="sub">' + fas.length + ' unowned players with a 2026-27 projection' + (me ? ', ranked by fit for <b>' + esc(U.teamName(me)) + '</b>: the change in your expected 2026-27 category wins if you add the player (your lineup re-optimized every week, replacing whoever he bumps).' : '. Pick a team to rank them by fit.') + '</p></div>';
      h += '<div class="controls"><label>Fit for ' + ui.teamSelect('fa-team', me, 'No team (rank by WAR)') + '</label><span class="small muted" id="fa-status"></span></div>';
      if (me) {
        var s = DP.teamSummary()[me], order = E.CATS.map(function (c, i) { return i; }).sort(function (a, b) { return s.z[a] - s.z[b]; });
        h += '<div class="callout">Weakest categories for ' + esc(me) + ': ' + order.slice(0, 5).map(function (c) { return '<b>' + esc(E.CATS[c].l) + '</b> (' + U.ord(s.rank[c]) + ')'; }).join(', ') + '. The fit score already weights these by how often they swing your matchups.</div><div id="fa-ctx"></div>';
      }
      h += '<div id="fa-t"></div>';
      el.innerHTML = h;
      if (me) DP.getSim(function () {
        var box = U.qs('#fa-ctx', el), c = E.contention()[me]; if (!box || !c) return;
        box.innerHTML = c.tier === 'contender' ? '<div class="callout good">' + DP.tierBadge(me) + ' ' + esc(me) + ' has ' + U.pct(c.champ, 1) + ' title odds: every 2026-27 category win here is worth ×' + U.fmt(c.k[0], 1) + ' the league average, so stream aggressively.</div>'
          : '<div class="callout">' + DP.tierBadge(me) + ' ' + esc(me) + ' has ' + U.pct(c.champ, 1) + ' title odds, so a 2026-27 category win is worth ×' + U.fmt(c.k[0], 1) + ' the league average to you. Use roster spots on players with a future (try the <b>Age ≤ 23</b> filter) unless the pickup is cheap to cut. <a href="#/windows">Why →</a></div>';
      }, 1500);
      U.qs('#fa-team', el).addEventListener('change', function (e) { DP.go('fa', null, { team: e.target.value }); });
      var draw = function () {
        ui.table(U.qs('#fa-t', el), {
          rows: fas, sort: me ? 'fit' : 'WAR', csv: 'free-agents' + (me ? '-' + me : '') + '.csv', search: function (p) { return p.n + ' ' + p.t; },
          filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (p, v) { return p.slot === v || (v === 'D' && p.fd); } },
            { l: 'Status', opts: [['', 'All'], ['wv', 'On waivers'], ['young', 'Age ≤ 23']], fn: function (p, v) { return v === 'wv' ? p.wv : (p.age || 30) <= 23; } }],
          cols: [
            { k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'pos', l: 'Pos', v: function (p) { return p.slot; }, f: ui.pos },
            me ? { k: 'fit', l: 'Fit (Δ cat W)', cls: 'num', title: 'Change in expected 2026-27 category wins for your team', v: function (p) { return p._fit !== undefined ? p._fit : p._q; }, f: function (p) { return p._fit !== undefined ? '<b>' + ui.delta(p._fit, 1) + '</b>' : '<span class="faint">~' + U.fmt(p._q, 1) + '</span>'; } } : null,
            me ? { k: 'helps', l: 'Helps most', v: null, f: function (p) { if (!p._by) return ''; return '<span class="small">' + p._by.map(function (x, c) { return [c, x]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).filter(function (x) { return x[1] > 0.05; }).map(function (x) { return esc(E.CATS[x[0]].l); }).join(', ') + '</span>'; } } : null,
            { k: 'WAR', l: 'WAR', cls: 'num', v: function (p) { return p.WAR; }, f: function (p) { return ui.warCell(p.WAR); } },
            { k: 'gp', l: 'Proj GP', cls: 'num', v: function (p) { return p.projGP; } },
            { k: 'g', l: 'G', cls: 'num', v: function (p) { return p.G ? p.p26[1] : p.p26[2]; }, title: 'Goals (goalies: wins)' },
            { k: 'a', l: 'A', cls: 'num', v: function (p) { return p.G ? null : p.p26[3]; } },
            { k: 'hit', l: 'Hit', cls: 'num', v: function (p) { return p.G ? null : p.p26[7]; } },
            { k: 'blk', l: 'Blk', cls: 'num', v: function (p) { return p.G ? null : p.p26[8]; } },
            { k: 'age', l: 'Age', cls: 'num', v: function (p) { return p.age; }, f: function (p) { return U.fmt(p.age, 1); } },
            { k: 'mkt', l: 'Market $', cls: 'num', v: function (p) { return p.mkt; }, f: function (p) { return U.m(p.mkt); } }
          ].filter(Boolean)
        });
      };
      if (!me) { draw(); return; }
      // quick linear ranking, then an exact re-optimized pass for the top 80
      fas.forEach(function (p) { p._q = E.quickGain(me, p); delete p._fit; delete p._by; });
      draw();
      U.qs('#fa-status', el).textContent = 'Computing exact fit…';
      setTimeout(function () {
        fas.slice().sort(U.by(function (p) { return p._q; }, true)).slice(0, 80).forEach(function (p) { var g = E.gain(me, [p], []); p._fit = g.total; p._by = g.byCat; });
        draw();
        var st = U.qs('#fa-status', el); if (st) st.textContent = 'Exact fit for the top 80; others show a quick estimate (~).';
      }, 40);
    }
  };

  // ------------------------------------------------------------ Compare
  DP.pages.compare = {
    title: 'Compare',
    render: function (el, hsh) {
      var E = DP.E;
      var ids = (hsh.q.ids ? hsh.q.ids.split(',') : DP.cmp).filter(function (id) { return E.byId[id]; }).slice(0, 4);
      var ps = ids.map(function (id) { return E.byId[id]; });
      var h = '<div class="page-head"><h1>Compare players</h1><p class="sub">Up to four players side by side. Add from any player card (＋ Compare) or search here.</p></div>';
      h += '<div class="controls"><label>Add player <input type="search" id="c-q" placeholder="Type a name…" list="c-list" aria-label="Add player to compare"></label><datalist id="c-list">' + E.P.slice().sort(U.by(function (p) { return p.WAR; }, true)).slice(0, 900).map(function (p) { return '<option value="' + esc(p.n) + '">'; }).join('') + '</datalist>' +
        '<button class="btn sm ghost" id="c-clear">Clear</button>' + (ps.length ? '<button class="btn sm" id="c-share">🔗 Copy link</button>' : '') + '</div>';
      if (!ps.length) { el.innerHTML = h + '<div class="callout">Nothing to compare yet. Add players above.</div>'; wire(); return; }
      var row = function (label, f, best) {
        var vals = ps.map(f), nums = vals.map(function (v) { return typeof v === 'number' ? v : null; });
        var valid = nums.filter(function (v) { return v !== null; }), top = best === 'min' ? Math.min.apply(null, valid) : Math.max.apply(null, valid);
        return '<tr><td>' + esc(label) + '</td>' + vals.map(function (v, i) {
          var isBest = best && valid.length > 1 && nums[i] === top;
          return '<td class="num' + (isBest ? ' hot' : '') + '">' + (typeof v === 'number' ? U.fmt(v, Math.abs(v) < 10 && v % 1 ? (label.indexOf('SV') >= 0 ? 3 : 1) : 0) : (v || '–')) + '</td>';
        }).join('') + '</tr>';
      };
      h += '<div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th></th>' + ps.map(function (p) { return '<th class="num" style="min-width:150px">' + DP.headshot(p, 46) + '<br>' + ui.plink(p) + '<br><span class="faint small">' + esc(p.slot + ' · ' + (p.gm || 'FA')) + '</span> <button class="btn sm ghost" data-rmc="' + esc(p.id) + '" aria-label="Remove">✕</button></th>'; }).join('') + '</tr></thead><tbody>';
      h += row('Age', function (p) { return p.age ? +p.age.toFixed(1) : null; }) + row('Contract', function (p) { return p.ct + (p.gm ? ' ' + U.m(p.sal26) : ''); }) +
        row('WAR (2026-27)', function (p) { return p.r ? +p.WAR.toFixed(1) : null; }, 'max') + row('Market value $M', function (p) { return +p.mkt.toFixed(2); }, 'max') +
        row('Surplus $M', function (p) { return +p.surplus.toFixed(2); }, 'max') + row('Dynasty value', function (p) { return +p.DV.toFixed(1); }, 'max') + row('Dynasty (league lens)', function (p) { return +E.dvWith(p, E.fitLeagueLens()).toFixed(1); }, 'max') +
        row('Career NHL GP', function (p) { return p.cgp || 0; }) + row('Proj GP', function (p) { return p.projGP; }, 'max');
      var skaters = ps.filter(function (p) { return !p.G; }).length, goalies = ps.length - skaters;
      if (skaters) {
        ['Pt-D', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'].forEach(function (l, j) {
          var i = j + 1;
          h += row(l + ' (proj)', function (p) { return p.G ? null : Math.round(p.p26[i]); }, 'max');
        });
        h += row('2G+A (proj)', function (p) { return p.G ? null : Math.round(2 * p.p26[2] + p.p26[3]); }, 'max');
      }
      if (goalies) {
        h += row('W (proj)', function (p) { return p.G ? p.p26[1] : null; }, 'max') + row('GAA (proj)', function (p) { return p.G ? p.p26[2] : null; }, 'min') + row('SV% (proj)', function (p) { return p.G ? p.p26[3] : null; }, 'max') + row('SHO (proj)', function (p) { return p.G ? p.p26[4] : null; }, 'max');
      }
      h += '</tbody></table></div><p class="small muted">Green = best in the row.</p></div>';
      h += '<div class="card" style="margin-top:14px"><h2>Dynasty curves</h2><div class="hint">Projected WAR per season.</div>' + C.lines(E.YEARS.map(function (y) { return y.slice(2); }), ps.map(function (p, i) { return { name: p.n, values: p.yWar.map(function (x) { return +x.toFixed(2); }), color: C.SERIES[i] }; }), { height: 240, width: 900, title: 'Projected WAR by season' }) + '</div>';
      el.innerHTML = h;
      wire();
      function wire() {
        var inp = U.qs('#c-q', el);
        inp.addEventListener('change', function () {
          var p = E.P.find(function (x) { return x.n.toLowerCase() === inp.value.trim().toLowerCase(); });
          if (p) { if (DP.cmp.indexOf(p.id) < 0) DP.cmp.push(p.id); if (DP.cmp.length > 4) DP.cmp.shift(); U.store.set('cmp', DP.cmp); DP.go('compare'); DP.render(); }
        });
        U.qs('#c-clear', el).addEventListener('click', function () { DP.cmp = []; U.store.set('cmp', []); DP.go('compare'); DP.render(); });
        var sh = U.qs('#c-share', el);
        if (sh) sh.addEventListener('click', function () { var url = location.href.split('#')[0] + U.hash('compare', null, { ids: ids.join(',') }); U.copy(url, 'Link copied'); });
        el.addEventListener('click', function (e) { var b = e.target.closest('[data-rmc]'); if (!b) return; DP.cmp = DP.cmp.filter(function (x) { return x !== b.dataset.rmc; }); U.store.set('cmp', DP.cmp); DP.go('compare'); DP.render(); });
      }
    }
  };

  // ------------------------------------------------------------ Leaderboards
  DP.pages.leaders = {
    title: 'Leaderboards',
    render: function (el) {
      var E = DP.E, TS = DP.teamSummary(), me = DP.state.team;
      var owned = E.P.filter(function (p) { return p.gm; });
      var h = '<div class="page-head"><h1>Leaderboards</h1><p class="sub">Contracts, dynasty value, prospect pools, roster age and cap efficiency across the league.</p></div><div class="grid g2">';
      var top = function (title, hint, rows, f) { return '<div class="card"><h2>' + title + '</h2><div class="hint">' + hint + '</div><ol class="list-plain">' + rows.map(function (p, i) { return '<li><span class="rank">' + (i + 1) + '</span>' + f(p) + '</li>'; }).join('') + '</ol></div>'; };
      var pl = function (right) { return function (p) { return ui.pos(p) + '<span>' + ui.pcell(p) + '<br><span class="small muted">' + esc(p.gm || 'FA') + ' · ' + ui.pill(p.ct) + ' ' + U.m(p.sal26) + '</span></span><span class="num" style="margin-left:auto">' + right(p) + '</span>'; }; };
      h += top('Best contracts (surplus)', 'Market value minus 2026-27 salary. MNR at $0 excluded.', owned.filter(function (p) { return p.ct !== 'MNR'; }).sort(U.by(function (p) { return p.surplus; }, true)).slice(0, 10), pl(function (p) { return '<b class="good">' + U.sm(p.surplus) + '</b>'; }));
      h += top('Most valuable MNR contracts', 'MNR players produce at $0 until they graduate; ranked by this-season WAR.', owned.filter(function (p) { return p.ct === 'MNR' && p.r; }).sort(U.by(function (p) { return p.WAR; }, true)).slice(0, 10), pl(function (p) { return '<b>' + U.fmt(p.WAR, 1) + '</b> WAR'; }));
      h += top('Dynasty value', 'Discounted category wins over 7 seasons net of cap cost.', E.P.slice().sort(U.by(function (p) { return p.DV; }, true)).slice(0, 10), pl(function (p) { return '<b>' + U.fmt(p.DV, 1) + '</b>'; }));
      h += top('Cap efficiency', 'WAR per $1M of salary (min $3M salary).', owned.filter(function (p) { return p.sal26 >= 3 && p.r; }).sort(U.by(function (p) { return p.WAR / p.sal26; }, true)).slice(0, 10), pl(function (p) { return '<b>' + U.fmt(p.WAR / p.sal26, 2) + '</b> /$M'; }));
      var teams = E.teams.map(function (t) { return TS[t]; });
      var tt = function (title, hint, key, fmt, asc) {
        var rows = teams.slice().sort(function (a, b) { return asc ? a[key] - b[key] : b[key] - a[key]; });
        return '<div class="card"><h2>' + title + '</h2><div class="hint">' + hint + '</div>' + C.hbars(rows.map(function (r) { return { label: U.teamName(r.t), value: r[key], hl: r.t === me }; }), { fmt: fmt, labelW: 150, title: title }) + '</div>';
      };
      teams.forEach(function (r) {
        var ros = E.rosters[r.t];
        r.effic = r.war / Math.max(1, r.pay);
        r.rosterAge = E.sum(ros.map(function (p) { return p.age || 25; })) / ros.length;
      });
      h += tt('Prospect pools', 'Sum of dynasty value of each team\'s MNR players.', 'pros', function (v) { return U.fmt(v, 1); });
      h += tt('Team dynasty value', 'Sum of every owned player\'s dynasty value.', 'dv', function (v) { return U.fmt(v, 0); });
      h += tt('Youngest rosters', 'Average age of all owned players (ascending).', 'rosterAge', function (v) { return U.fmt(v, 1); }, true);
      h += tt('Cap efficiency', 'Starter WAR per $1M of payroll.', 'effic', function (v) { return U.fmt(v, 2); });
      h += '</div>';
      el.innerHTML = h;
    }
  };
})();
