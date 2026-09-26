/* Dynasty Puck HQ - Weekly Matchup, Season Simulator, Offseason Signing Simulator. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  function weekOptions(sel) {
    return DP.E.weeks.map(function (w, i) {
      var lab = w.po ? 'Playoffs R' + w.po : 'Week ' + w.n;
      return '<option value="' + (i + 1) + '"' + (i + 1 === sel ? ' selected' : '') + '>' + lab + ' · ' + U.date(new Date(w.start + 'T12:00:00Z')) + '–' + U.date(new Date(w.end + 'T12:00:00Z')) + '</option>';
    }).join('');
  }
  function currentWeek() { // the week in progress, or week 1 before the season
    var nw = DP.E.nowWeek(); return nw < 0 ? 1 : nw + 1;
  }
  DP.currentWeek = currentWeek;
  function catFmt(c, v) {
    if (v === null || v === undefined) return '–';
    if (c === 12) return v.toFixed(2);
    if (c === 13) return U.rate(v);
    return U.fmt(v, v < 10 ? 1 : 0);
  }

  // ------------------------------------------------------------ Weekly matchup
  DP.pages.matchup = {
    title: 'Weekly Matchup',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team;
      var w = +(q.w || currentWeek()), wi = w - 1;
      var games = DP.meta.h2h.filter(function (g) { return g[0] === w; });
      var a = q.a || me, b = q.b;
      if (a && !b) { var g0 = games.find(function (g) { return g[1] === a || g[2] === a; }); if (g0) b = g0[1] === a ? g0[2] : g0[1]; }
      if (!a || !b) { a = a || (games[0] ? games[0][1] : E.teams[0]); b = b || (games[0] ? games[0][2] : E.teams[1]); }
      if (a === b) b = E.teams.find(function (t) { return t !== a; });
      var excl = {}; (q.x || '').split(',').filter(Boolean).forEach(function (id) { excl[id] = 1; });
      var autoInj = q.inj !== '0', useSet = q.set === '1';
      var h = '<div class="page-head"><h1>Weekly Matchup Simulator</h1><p class="sub">Weekly lineup lock: each team starts its best 12F / 6D / 2G for the whole week. Real 2026-27 NHL schedule (games per team per fantasy week) and the real Fantrax H2H schedule.</p></div>';
      h += '<div class="controls"><label>Week <select id="m-w">' + weekOptions(w) + '</select></label><label>Team A <select id="m-a">' + U.teamOptions(a) + '</select></label><span class="muted">vs</span><label>Team B <select id="m-b">' + U.teamOptions(b) + '</select></label>' +
        '<button class="btn sm" id="m-sched">Use scheduled opponent</button><label title="Bench players listed OUT / on IR / holding out on Daily Faceoff for the weeks their status implies"><input type="checkbox" id="m-inj"' + (autoInj ? ' checked' : '') + '> Auto-bench injured (DFO list)</label>' +
        '<label title="Use the lineups each team has set in Fantrax (Active slots) instead of the optimal lineup"><input type="checkbox" id="m-set"' + (useSet ? ' checked' : '') + '> Lineups as set in Fantrax</label></div>';
      var oA = { exclude: excl, injuries: autoInj, only: useSet ? E.setLineupIds(a) : null }, oB = { exclude: excl, injuries: autoInj, only: useSet ? E.setLineupIds(b) : null };
      var A = E.teamWeek(E.rosters[a], wi, oA), B = E.teamWeek(E.rosters[b], wi, oB);
      if (useSet && (!oA.only || !oB.only)) h += '<div class="callout warn small">' + [a, b].filter(function (t) { return !E.setLineupIds(t); }).map(esc).join(' and ') + ' has no Fantrax lineup set; using the optimal lineup.</div>';
      var pr = E.matchupProbs(A, B), ca = E.catVec(A), cb = E.catVec(B);
      var expA = E.sum(pr.map(function (x) { return x.w + x.t / 2; })), mc = E.simWeek(A, B, 6000, w * 31 + 7);
      var wk = E.weeks[wi];
      h += '<div class="stats">' + DP.statTile(esc(a) + ' expected cats', U.fmt(expA, 1), 'of 15') + DP.statTile(esc(b) + ' expected cats', U.fmt(15 - expA, 1), 'of 15') +
        DP.statTile(esc(a) + ' wins the week', U.pct(mc.win), 'Monte Carlo, 6,000 sims') + DP.statTile(esc(b) + ' wins the week', U.pct(mc.loss), 'tie ' + U.pct(mc.tie)) +
        DP.statTile('Week length', wk.days + ' days', U.date(new Date(wk.start + 'T12:00:00Z')) + ' – ' + U.date(new Date(wk.end + 'T12:00:00Z'))) + '</div>';
      if (Object.keys(excl).length) h += '<div class="callout warn">What-if: ' + Object.keys(excl).map(function (id) { return ui.plink(E.byId[id]); }).join(', ') + ' removed from lineups. <a href="' + U.hash('matchup', null, { w: w, a: a, b: b }) + '">Reset</a></div>';
      h += '<div class="grid g2"><div class="card"><h2>Category win probabilities</h2><div class="hint">Normal approximation on each weekly difference (±0.5 continuity correction for count stats). Goalie rule: fewer than 2 goalie GP loses all four goalie categories.</div>';
      h += '<div class="legend"><span><span class="k" style="background:var(--s1)"></span>' + esc(a) + ' wins</span><span><span class="k" style="background:var(--line)"></span>tie</span><span><span class="k" style="background:var(--s2)"></span>' + esc(b) + ' wins</span></div>';
      pr.forEach(function (x, c) {
        var cat = E.CATS[c];
        var tip = '<div class="tv">' + esc(a) + ' ' + U.pct(x.w) + ' · tie ' + U.pct(x.t) + ' · ' + esc(b) + ' ' + U.pct(x.l) + '</div><div class="tl">' + esc(cat.name) + ': ' + catFmt(c, ca.mu[c]) + ' vs ' + catFmt(c, cb.mu[c]) + '</div>';
        h += '<div class="probrow" data-tip="' + esc(tip) + '"><b>' + esc(cat.l) + '</b><div class="probbar"><span style="width:' + (x.w * 100).toFixed(1) + '%;background:var(--s1)"></span><span style="width:' + (x.t * 100).toFixed(1) + '%;background:var(--line)"></span><span style="width:' + (x.l * 100).toFixed(1) + '%;background:var(--s2)"></span></div><span class="num small">' + catFmt(c, ca.mu[c]) + ' – ' + catFmt(c, cb.mu[c]) + '</span></div>';
      });
      h += '<p class="small muted">Goalie minimum risk: ' + esc(a) + ' ' + U.pct(ca.gFail) + ' · ' + esc(b) + ' ' + U.pct(cb.gFail) + ' chance of fewer than 2 goalie GP.</p>';
      var dist = Object.keys(mc.dist).map(function (k) { return [k, mc.dist[k]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 6);
      h += '<p class="small muted">Most likely final scores (' + esc(a) + '–' + esc(b) + '): ' + dist.map(function (d) { return d[0] + ' (' + U.pct(d[1] / 6000) + ')'; }).join(', ') + '</p></div>';
      h += '<div class="card"><h2>Locked lineups</h2><div class="hint">G = NHL games that week. Click ✕ to take a player out (injury what-if).</div><div class="grid g2">' + side(A, a, wi, excl, q) + side(B, b, wi, excl, q) + '</div></div></div>';
      // all matchups this week
      h += '<div class="card" style="margin-top:14px"><h2>All ' + (wk.po ? 'playoff' : 'Week ' + w) + ' matchups</h2>';
      if (wk.po) h += '<p class="muted">Playoff pairings depend on final seeding; see the <a href="#/season">Season Sim</a> for odds.</p>';
      else h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Away</th><th class="num">Exp cats</th><th></th><th class="num">Exp cats</th><th>Home</th><th class="num">Away NHL games</th><th class="num">Home NHL games</th><th></th></tr></thead><tbody>' + games.map(function (g) {
        var x = E.baseline[g[1]][wi], y = E.baseline[g[2]][wi], p2 = E.matchupProbs(x, y), ea = E.sum(p2.map(function (z) { return z.w + z.t / 2; }));
        var ng = function (agg) { return E.sum(agg.lu.F.concat(agg.lu.D).map(function (s) { return E.games(s.p, wi).N; })); };
        return '<tr class="' + (g[1] === me || g[2] === me ? 'mine' : '') + '"><td><b>' + esc(U.teamName(g[1])) + '</b></td><td class="num">' + U.fmt(ea, 1) + '</td><td class="muted">vs</td><td class="num">' + U.fmt(15 - ea, 1) + '</td><td><b>' + esc(U.teamName(g[2])) + '</b></td><td class="num">' + ng(x) + '</td><td class="num">' + ng(y) + '</td><td><a class="btn sm" href="' + U.hash('matchup', null, { w: w, a: g[1], b: g[2] }) + '">Open</a></td></tr>';
      }).join('') + '</tbody></table></div>';
      h += '</div>';
      el.innerHTML = h;
      var go = function (o) { DP.go('matchup', null, Object.assign({ w: w, a: a, b: b, x: q.x, inj: q.inj, set: q.set }, o)); };
      U.qs('#m-w', el).addEventListener('change', function (e) { go({ w: e.target.value, b: '', x: '' }); });
      U.qs('#m-a', el).addEventListener('change', function (e) { go({ a: e.target.value, b: '' }); });
      U.qs('#m-b', el).addEventListener('change', function (e) { go({ b: e.target.value }); });
      U.qs('#m-sched', el).addEventListener('click', function () { go({ b: '' }); });
      U.qs('#m-inj', el).addEventListener('change', function (e) { go({ inj: e.target.checked ? '' : '0' }); });
      U.qs('#m-set', el).addEventListener('change', function (e) { go({ set: e.target.checked ? '1' : '' }); });
      el.addEventListener('click', function (e) {
        var x = e.target.closest('[data-out]'); if (!x) return;
        var ids = Object.keys(excl); ids.push(x.dataset.out); go({ x: ids.join(',') });
      });
    }
  };
  function side(agg, t, wi, excl, q) {
    var E = DP.E, lu = agg.lu;
    var row = function (x) {
      var g = E.games(x.p, wi);
      return '<div class="slot">' + ui.pos(x.p) + ui.plink(x.p) + ui.injBadge(x.p) + '<span class="gms">' + g.N + 'G</span><button class="btn sm ghost" style="padding:0 5px;min-height:20px" data-out="' + esc(x.p.id) + '" title="Take out of the lineup" aria-label="Remove ' + esc(x.p.n) + '">✕</button></div>';
    };
    var ng = E.sum(lu.F.concat(lu.D).map(function (x) { return E.games(x.p, wi).N; }));
    return '<div><h3>' + esc(U.teamName(t)) + '</h3><p class="small muted">' + ng + ' skater games · goalies ' + U.fmt(agg.m.GGP, 1) + ' exp GP</p><div class="lineup" style="grid-template-columns:1fr">' + lu.F.concat(lu.D, lu.G).map(row).join('') + '</div></div>';
  }

  // ------------------------------------------------------------ Season simulator
  DP.pages.season = {
    title: 'Season Simulator',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team;
      var n = +(q.n || 2000), po = +(q.po || 8), noise = q.noise !== undefined ? +q.noise : 3.5;
      var h = '<div class="page-head"><h1>Season Simulator</h1><p class="sub">Monte Carlo of the full 24-week Fantrax schedule and an 8-team playoff (1v8, 4v5, 3v6, 2v7; weeks 25-27). Each week every category is drawn from its projected distribution; standings = total category W-L-T. A per-team strength shock (± projection error) is drawn each season.</p></div>';
      h += '<div class="controls"><label>Simulations <select id="s-n">' + [500, 1000, 2000, 5000].map(function (x) { return '<option' + (x === n ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
        '<label>Playoff teams <select id="s-po">' + [[8, '8 (league format)'], [6, '6 (what-if: top-2 byes)'], [4, '4 (what-if)']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === po ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        '<label title="Standard deviation of a season-long team strength shock">Projection uncertainty <select id="s-noise">' + [[0, 'none'], [2, 'low'], [3.5, 'medium'], [6, 'high']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === noise ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        '<button class="btn primary" id="s-run">Run again</button><span class="small muted" id="s-status"></span></div>';
      h += '<div class="card flush"><h2>Projected standings & odds</h2><div class="hint">Win% counts ties as half. Draft slot = expected 2027 league-draft pick (reverse standings; playoff teams pick 7-14 by elimination round, champion 14th).</div><div id="s-table" style="padding:0 12px 12px"><p class="muted">Simulating…</p></div></div>';
      h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>Seed distribution</h2><div class="hint">Share of simulations finishing in each regular-season position.</div><div id="s-seeds"></div></div>';
      h += '<div class="card"><h2>' + (me ? esc(U.teamName(me)) + ' week by week' : 'Pick your team for a week-by-week view') + '</h2><div id="s-weeks"></div></div></div>';
      el.innerHTML = h;
      var run = function () {
        U.qs('#s-status', el).textContent = 'Running ' + n + ' seasons…';
        setTimeout(function () {
          var t0 = Date.now(), res = E.simSeason({ n: n, playoffTeams: po, noise: noise / 100, seed: (Date.now() % 100000) });
          if (po === 8 && n >= 1500 && noise === 3.5) DP.simCache = { v: E.version, n: n, res: res };
          U.qs('#s-status', el).textContent = n + ' seasons in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
          ui.table(U.qs('#s-table', el), {
            rows: res, sort: 'pct', csv: 'season-sim.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
            cols: [
              { k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<a href="#/team/' + encodeURIComponent(r.t) + '"><b>' + esc(U.teamName(r.t)) + '</b></a>'; } },
              { k: 'rec', l: 'Avg W-L-T', v: function (r) { return r.W; }, f: function (r) { return U.fmt(r.W, 0) + '-' + U.fmt(r.L, 0) + '-' + U.fmt(r.T, 0); }, cls: 'num' },
              { k: 'pct', l: 'Win%', v: function (r) { return r.pct; }, f: function (r) { return U.rate(r.pct); }, cls: 'num' },
              { k: 'avgSeed', l: 'Avg seed', v: function (r) { return r.avgSeed; }, f: function (r) { return U.fmt(r.avgSeed, 1); }, cls: 'num', asc: true },
              { k: 'first', l: '1st place', v: function (r) { return r.first; }, f: function (r) { return U.pct(r.first, 1); }, cls: 'num' },
              { k: 'po', l: 'Playoffs', v: function (r) { return r.po; }, f: function (r) { return '<div class="pbar">' + ui.meter(r.po, r.po > .75 ? 'good' : r.po < .25 ? 'bad' : '') + '<span class="num" style="width:40px">' + U.pct(r.po) + '</span></div>'; } },
              { k: 'r2', l: 'Semis', v: function (r) { return r.r2; }, f: function (r) { return U.pct(r.r2); }, cls: 'num' },
              { k: 'fin', l: 'Final', v: function (r) { return r.fin; }, f: function (r) { return U.pct(r.fin, 1); }, cls: 'num' },
              { k: 'champ', l: 'Champion', v: function (r) { return r.champ; }, f: function (r) { return '<b>' + U.pct(r.champ, 1) + '</b>'; }, cls: 'num' },
              { k: 'last', l: 'Last', v: function (r) { return r.last; }, f: function (r) { return U.pct(r.last, 1); }, cls: 'num' },
              { k: 'slot', l: '2027 pick', title: 'Expected league-draft slot', v: function (r) { return E.sum(r.slot.map(function (x, k) { return x * (k + 1); })); }, f: function (r) { return '#' + U.fmt(E.sum(r.slot.map(function (x, k) { return x * (k + 1); })), 1); }, cls: 'num' }
            ]
          });
          var nt = E.teams.length, sh = '<div class="tbl-wrap"><table class="t heat"><thead><tr><th>Team</th>' + E.teams.map(function (_, k) { return '<th class="num">' + (k + 1) + '</th>'; }).join('') + '</tr></thead><tbody>';
          res.forEach(function (r) {
            sh += '<tr class="' + (r.t === me ? 'mine' : '') + '"><td class="nowrap">' + esc(r.t) + '</td>' + r.seed.map(function (x, k) {
              var t = Math.min(1, x / 0.45);
              return '<td class="hc" style="background:' + C.heat(t) + ';color:' + C.heatInk(t) + '" data-tip="' + esc('<div class="tv">' + U.pct(x, 1) + '</div><div class="tl">' + U.teamName(r.t) + ' finishes ' + U.ord(k + 1) + '</div>') + '">' + (x >= 0.005 ? Math.round(x * 100) : '') + '</td>';
            }).join('') + '</tr>';
            void nt;
          });
          U.qs('#s-seeds', el).innerHTML = sh + '</tbody></table></div><p class="small muted">Cells show % of seasons; darker = more likely. Top ' + po + ' make the playoffs.</p>';
        }, 30);
      };
      run();
      if (me) {
        var rows = DP.meta.h2h.filter(function (g) { return g[1] === me || g[2] === me; }).map(function (g) {
          var opp = g[1] === me ? g[2] : g[1], p2 = E.matchupProbs(E.baseline[me][g[0] - 1], E.baseline[opp][g[0] - 1]);
          var ex = E.sum(p2.map(function (z) { return z.w + z.t / 2; }));
          var myG = E.sum(E.baseline[me][g[0] - 1].lu.F.concat(E.baseline[me][g[0] - 1].lu.D).map(function (s) { return E.games(s.p, g[0] - 1).N; }));
          return { w: g[0], opp: opp, ex: ex, g: myG };
        });
        U.qs('#s-weeks', el).innerHTML = C.lines(rows.map(function (r) { return 'W' + r.w; }), [{ name: 'Expected categories won', values: rows.map(function (r) { return r.ex; }) }], { height: 170, min: 0, max: 15, title: 'Expected cats per week' }) +
          '<div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th>Wk</th><th>Opponent</th><th class="num">Skater games</th><th class="num">Exp cats</th></tr></thead><tbody>' + rows.map(function (r) {
            return '<tr><td>' + r.w + '</td><td><a href="' + U.hash('matchup', null, { w: r.w, a: me, b: r.opp }) + '">' + esc(U.teamName(r.opp)) + '</a></td><td class="num">' + r.g + '</td><td class="num ' + (r.ex >= 8 ? 'good' : r.ex < 7 ? 'bad' : '') + '">' + U.fmt(r.ex, 1) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      } else ui.needTeam(U.qs('#s-weeks', el), 'your weekly outlook');
      var go = function (o) { DP.go('season', null, Object.assign({ n: n, po: po, noise: noise }, o)); };
      U.qs('#s-n', el).addEventListener('change', function (e) { go({ n: e.target.value }); });
      U.qs('#s-po', el).addEventListener('change', function (e) { go({ po: e.target.value }); });
      U.qs('#s-noise', el).addEventListener('change', function (e) { go({ noise: e.target.value }); });
      U.qs('#s-run', el).addEventListener('click', run);
    }
  };

  // ------------------------------------------------------------ Offseason signing simulator
  DP.pages.signing = {
    title: 'Signing Simulator',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, t = q.team || DP.state.team;
      var h = '<div class="page-head"><h1>Offseason Signing Simulator</h1><p class="sub">Plan signings and drops, then compare cap, roster and category ranks before and after. Free agents and your own MNR/ELC players are in separate lists. Every add takes a custom salary.</p></div>';
      h += '<div class="controls"><label>Team ' + ui.teamSelect('g-team', t, 'Choose a team…') + '</label></div>';
      if (!t) { el.innerHTML = h + '<div class="callout">Choose a team to start.</div>'; U.qs('#g-team', el).addEventListener('change', function (e) { DP.go('signing', null, { team: e.target.value }); }); return; }
      var st = U.store.get('sign_' + t, { adds: [], drops: [] });
      var ros = E.rosters[t];
      var fas = E.P.filter(function (p) { return !p.gm; }).sort(U.by(function (p) { return p.WAR; }, true));
      var own = ros.filter(function (p) { return p.ct === 'MNR' || p.ct === 'ELC1'; }).sort(U.by(function (p) { return p.DV; }, true));
      var opt = function (p, extra) { return '<option value="' + esc(p.id) + '">' + esc(p.n + ' (' + p.slot + ', ' + (p.t || '') + ') · WAR ' + U.fmt(p.WAR, 1) + (extra ? ' · ' + extra : '')) + '</option>'; };
      h += '<div class="grid g3">';
      h += '<div class="card"><h3>1 · Sign a free agent</h3><div class="hint">All unowned players (incl. waivers), best first. Default salary = model market value.</div><select id="g-fa" style="width:100%">' + fas.slice(0, 600).map(function (p) { return opt(p, U.m(p.mkt)); }).join('') + '</select><div class="controls" style="margin-top:8px"><label>Salary $M <input type="number" id="g-fa-sal" step="0.1" min="0" value=""></label><button class="btn primary" id="g-fa-add">Add</button></div></div>';
      h += '<div class="card"><h3>2 · Sign / re-sign your MNR & ELC players</h3><div class="hint">MNR players who graduated (82 career GP skaters / 41 goalies) sign an ELC at $1.5M in the offseason or are dropped; non-graduated MNR stay at $0.</div><select id="g-own" style="width:100%">' + own.map(function (p) { var g = E.graduation(p); return opt(p, p.ct === 'MNR' ? (p.cgp || 0) + '/' + p.gradThr + ' GP' + (g.status === 'graduated' ? ' GRADUATED' : g.week !== null ? ' grad ~wk ' + (g.week + 1) : '') : 'ELC'); }).join('') + '</select><div class="controls" style="margin-top:8px"><label>Salary $M <input type="number" id="g-own-sal" step="0.1" min="0" value=""></label><button class="btn primary" id="g-own-add">Set salary</button></div></div>';
      h += '<div class="card"><h3>3 · Drop a player</h3><div class="hint">Dead cap: 50% of each remaining contract year for BID, RFA1 and ELC deals; dropping an FA contract is free.</div><select id="g-drop" style="width:100%">' + ros.slice().sort(U.by(function (p) { return p.surplus; })).map(function (p) { return opt(p, ui.pill ? p.ct + ' ' + U.m(p.sal26) : ''); }).join('') + '</select><div class="controls" style="margin-top:8px"><button class="btn" id="g-drop-add">Drop</button><button class="btn ghost" id="g-reset">Reset plan</button></div></div>';
      h += '</div><div id="g-out" style="margin-top:14px"></div>';
      el.innerHTML = h;
      U.qs('#g-team', el).addEventListener('change', function (e) { DP.go('signing', null, { team: e.target.value }); });
      var faSel = U.qs('#g-fa', el), ownSel = U.qs('#g-own', el);
      var setDef = function () {
        var p = E.byId[faSel.value]; if (p) U.qs('#g-fa-sal', el).value = Math.max(1, Math.round(p.mkt * 10) / 10).toFixed(1);
        var o = E.byId[ownSel.value]; if (o) { var g = E.graduation(o); U.qs('#g-own-sal', el).value = (o.ct === 'ELC1' ? o.sal26 : (g.status === 'graduated' || g.week !== null ? 1.5 : 0)).toFixed(1); }
      };
      faSel.addEventListener('change', setDef); ownSel.addEventListener('change', setDef); setDef();
      var save = function () { U.store.set('sign_' + t, st); out(); };
      U.qs('#g-fa-add', el).addEventListener('click', function () { if (!st.adds.some(function (a) { return a.id === faSel.value; })) st.adds.push({ id: faSel.value, sal: +U.qs('#g-fa-sal', el).value || 0, kind: 'fa' }); save(); });
      U.qs('#g-own-add', el).addEventListener('click', function () { st.adds = st.adds.filter(function (a) { return a.id !== ownSel.value; }); st.adds.push({ id: ownSel.value, sal: +U.qs('#g-own-sal', el).value || 0, kind: 'own' }); save(); });
      U.qs('#g-drop-add', el).addEventListener('click', function () { var id = U.qs('#g-drop', el).value; if (st.drops.indexOf(id) < 0) st.drops.push(id); save(); });
      U.qs('#g-reset', el).addEventListener('click', function () { st = { adds: [], drops: [] }; save(); });
      U.qs('#g-out', el).addEventListener('click', function (e) {
        var r = e.target.closest('[data-rm]'); if (!r) return;
        var id = r.dataset.rm; st.adds = st.adds.filter(function (a) { return a.id !== id; }); st.drops = st.drops.filter(function (d) { return d !== id; }); save();
      });
      function out() {
        var box = U.qs('#g-out', el);
        st.adds = st.adds.filter(function (a) { return E.byId[a.id]; }); st.drops = st.drops.filter(function (d) { return E.byId[d]; });
        var drops = st.drops.map(function (id) { return E.byId[id]; });
        var faAdds = st.adds.filter(function (a) { return a.kind === 'fa'; }).map(function (a) { return E.byId[a.id]; });
        var after = ros.filter(function (p) { return st.drops.indexOf(p.id) < 0; }).concat(faAdds);
        // cap before/after (custom salaries for this season; FA signings treated as 1-year deals)
        var capB = E.teamCap(t), dead = drops.map(function (p) { return { amt: E.deadCap(p) }; });
        var capA = E.teamCap(t, ros.filter(function (p) { return st.drops.indexOf(p.id) < 0; }), dead);
        st.adds.forEach(function (a) {
          var p = E.byId[a.id];
          if (a.kind === 'fa') { capA[0].total += a.sal; capA[0].n++; }
          else { capA[0].total += a.sal - (typeof p.cy[0] === 'number' ? p.cy[0] : 0); if (a.sal > 0 && p.ct === 'MNR') { capA[1].total += a.sal; } }
        });
        var winsB = E.baseWins(t), winsA = E.seasonCatWins(t, after);
        var wb = {}; wb[t] = E.baseline[t];
        var weeksA = {}; E.teams.forEach(function (u) { weeksA[u] = E.baseline[u]; }); weeksA[t] = E.weeks.map(function (_, wi) { return E.teamWeek(after, wi); });
        var catsB = E.teamCats(), catsA = E.teamCats(weeksA);
        var stA = E.expectedStandings(weeksA), rB = E.expStandings.find(function (r) { return r.t === t; }), rA = stA.find(function (r) { return r.t === t; });
        var h2 = '<div class="grid g2"><div class="card"><h2>Your plan</h2>';
        if (!st.adds.length && !st.drops.length) h2 += '<p class="muted">No moves yet. Add signings or drops above.</p>';
        h2 += '<ul class="list-plain">' + st.adds.map(function (a) { var p = E.byId[a.id]; return '<li>' + ui.pos(p) + '<span>' + (a.kind === 'fa' ? 'Sign ' : 'Re-sign ') + ui.plink(p) + ' <span class="muted small">WAR ' + U.fmt(p.WAR, 1) + '</span></span><span class="num" style="margin-left:auto">' + U.m(a.sal) + '</span><button class="btn sm ghost" data-rm="' + esc(a.id) + '" aria-label="Remove">✕</button></li>'; }).join('') +
          drops.map(function (p) { return '<li>' + ui.pos(p) + '<span>Drop ' + ui.plink(p) + ' <span class="muted small">dead cap ' + U.m(E.deadCap(p)[0]) + ' this season</span></span><span class="num bad" style="margin-left:auto">−' + U.m(p.sal26) + '</span><button class="btn sm ghost" data-rm="' + esc(p.id) + '" aria-label="Remove">✕</button></li>'; }).join('') + '</ul>';
        h2 += '<div class="stats" style="margin-top:12px">' + DP.statTile('Cap 2026-27', U.m(capA[0].total), 'was ' + U.m(capB[0].total) + ' · space ' + U.m(capA[0].space)) +
          DP.statTile('Cap 2027-28', U.m(capA[1].total), 'was ' + U.m(capB[1].total)) +
          DP.statTile('Roster', String(after.length), 'was ' + ros.length) +
          DP.statTile('Exp. cat wins', U.fmt(winsA.total, 1), ui.delta(winsA.total - winsB.total, 1).replace(/<[^>]+>/g, '') + ' vs now') +
          DP.statTile('Projected finish', U.ord(rA.rank), 'was ' + U.ord(rB.rank)) + '</div>';
        if (capA[0].space < 0) h2 += '<div class="callout bad">Over the $' + capA[0].cap + 'M cap by ' + U.m(-capA[0].space) + '.</div>';
        h2 += '</div><div class="card"><h2>Category ranks before → after</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th class="num">Before</th><th class="num">After</th><th class="num">Δ exp. wins</th></tr></thead><tbody>' +
          E.CATS.map(function (c, i) { var b = catsB.rank[t][i], a2 = catsA.rank[t][i]; return '<tr><td><b>' + esc(c.l) + '</b></td><td class="num">' + U.ord(b) + '</td><td class="num ' + (a2 < b ? 'good' : a2 > b ? 'bad' : '') + '">' + U.ord(a2) + '</td><td class="num">' + ui.delta(winsA.byCat[i] - winsB.byCat[i], 2) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>';
        box.innerHTML = h2;
      }
      out();
    }
  };
})();
