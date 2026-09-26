/* Dynasty Puck HQ - extras: Trade Value Chart, Contention Windows, Weekly Preview (+ hooks used by other pages). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  // ------------------------------------------------------------ Trade Value Chart
  DP.pages.values = {
    title: 'Trade Value Chart',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team, LS = DP.lenses(q), lensKey = q.lens || 'league', L = LS[lensKey] || LS.league;
      var assets = E.P.filter(function (p) { return p.gm || (p.r && p.projGP >= 20); }).map(function (p) { return { kind: 'player', p: p, v: E.dvWith(p, L) }; })
        .concat((DP.league.picks || []).filter(function (pk) { return pk.year >= 2027; }).map(function (pk) { return { kind: 'pick', pk: pk, v: E.pickValue(pk, L) }; }))
        .filter(function (a) { return a.v > 0.2; }).sort(function (a, b) { return b.v - a.v; });
      var top = assets.length ? assets[0].v : 1;
      // tiers: new tier when value drops more than 12% below the tier's first asset
      var tier = 1, head = assets.length ? assets[0].v : 0;
      assets.forEach(function (a, i) { if (a.v < head * 0.88 && i > 0) { tier++; head = a.v; } a.tier = tier; a.pts = Math.round(a.v / top * 1000) / 10; a.rank = i + 1; });
      var h = '<div class="page-head"><h1>Dynasty Trade Value Chart</h1><p class="sub">Every player and future pick on one scale (100 = most valuable asset). Tiers break when value falls 12% below the top of the tier. Default lens: <b>league-implied</b>, fitted to the league\'s real trades; switch to the model lens to compare.</p></div>';
      h += '<div class="controls"><label>Lens <select id="v-lens">' + ['league', 'model'].map(function (k) { return '<option value="' + k + '"' + (k === lensKey ? ' selected' : '') + '>' + esc(LS[k].name) + '</option>'; }).join('') + '</select></label><span class="small muted">' + esc(DP.lensText(L)) + '</span></div><div id="v-t"></div>';
      el.innerHTML = h;
      U.qs('#v-lens', el).addEventListener('change', function (e) { DP.go('values', null, { lens: e.target.value }); });
      ui.table(U.qs('#v-t', el), {
        rows: assets, sort: 'rank', desc: false, page: 100, csv: 'trade-value-chart.csv',
        search: function (a) { return a.kind === 'player' ? a.p.n + ' ' + (a.p.gm || 'FA') : E.pickLabel(a.pk) + ' pick ' + a.pk.owner; },
        filters: [{ l: 'Type', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies'], ['pick', 'Picks'], ['mnr', 'MNR prospects']], fn: function (a, v) { return v === 'pick' ? a.kind === 'pick' : a.kind === 'player' && (v === 'mnr' ? a.p.ct === 'MNR' : a.p.slot === v); } },
          { l: 'Owner', opts: [['', 'All'], ['__fa', 'Free agents']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: '', fn: function (a, v) { var o = a.kind === 'pick' ? a.pk.owner : a.p.gm; return v === '__fa' ? !o : o === v; } }],
        rowCls: function (a) { var o = a.kind === 'pick' ? a.pk.owner : a.p.gm; return (o === me && me ? 'mine' : '') + (a.rank > 1 && assets[a.rank - 2] && assets[a.rank - 2].tier !== a.tier ? ' sep' : ''); },
        cols: [{ k: 'rank', l: '#', cls: 'num', v: function (a) { return a.rank; } },
          { k: 'tier', l: 'Tier', cls: 'num', v: function (a) { return a.tier; }, f: function (a) { return '<span class="badge info">T' + a.tier + '</span>'; } },
          { k: 'asset', l: 'Asset', v: function (a) { return a.kind === 'player' ? a.p.n : E.pickLabel(a.pk); }, f: function (a) { return a.kind === 'player' ? ui.pos(a.p) + ' ' + ui.pcell(a.p) : '<span class="pos">PK</span> <b>' + esc(a.pk.year + ' Round ' + a.pk.round) + '</b> <span class="small muted">' + esc(U.teamName(a.pk.orig)) + '\'s · ~#' + E.pickOverall(a.pk) + '</span>'; } },
          { k: 'owner', l: 'Owner', v: function (a) { return a.kind === 'pick' ? a.pk.owner : (a.p.gm || 'zz'); }, f: function (a) { return a.kind === 'pick' ? U.teamLabel(a.pk.owner) : ui.owner(a.p); } },
          { k: 'ct', l: 'Contract', v: function (a) { return a.kind === 'player' ? a.p.ct : 'pick'; }, f: function (a) { return a.kind === 'player' ? ui.pill(a.p.ct) + ' ' + (a.p.gm ? U.m(a.p.sal26) : '') : ''; } },
          { k: 'age', l: 'Age', cls: 'num', v: function (a) { return a.kind === 'player' ? a.p.age : null; }, f: function (a) { return a.kind === 'player' && a.p.age ? U.fmt(a.p.age, 1) : ''; } },
          { k: 'pts', l: 'Value (100 = top)', cls: 'num', v: function (a) { return a.pts; }, f: function (a) { return '<div class="pbar">' + ui.meter(a.pts / 100) + '<b class="num" style="width:40px">' + U.fmt(a.pts, 1) + '</b></div>'; } }]
      });
    }
  };

  // ------------------------------------------------------------ Contention windows
  DP.pages.windows = {
    title: 'Contention Windows',
    render: function (el) {
      var E = DP.E, me = DP.state.team, CT = E.contention();
      var rows = E.teams.map(function (t) { var c = CT[t], s = c.strength; return { t: t, c: c, s: s, now: s[0], avg3: (s[0] + s[1] + s[2]) / 3 }; });
      var all = []; rows.forEach(function (r) { all = all.concat(r.s); });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      var avgY = E.YEARS.map(function (_, y) { return E.sum(rows.map(function (r) { return r.s[y]; })) / rows.length; });
      var sdY = E.YEARS.map(function (_, y) { return Math.sqrt(E.sum(rows.map(function (r) { return Math.pow(r.s[y] - avgY[y], 2); })) / rows.length); });
      var nC = rows.filter(function (r) { return r.c.tier === 'contender'; }).length, nB = rows.filter(function (r) { return r.c.tier === 'bubble'; }).length;
      var topShare = E.sum(rows.map(function (r) { return r.c.tier === 'contender' ? r.c.champ : 0; }));
      var h = '<div class="page-head"><h1>Contention Windows</h1><p class="sub">Who is really playing for the 2026-27 title, and who is built for later. Status comes from the season sim\'s title odds; the heat map is each roster\'s projected strength by season (best 12 F / 6 D / 2 G by projected WAR, counting only seasons the team still controls the player). Signings, trades and drafts will change it.</p></div>';
      h += '<div class="stats">' + DP.statTile('Contenders', String(nC), U.pct(topShare, 0) + ' of the title odds between them') + DP.statTile('On the bubble', String(nB), 'one big move from contending') + DP.statTile('Not contending', String(rows.length - nC - nB), 'better off selling 2026-27 value') + '</div>';
      h += '<div class="card"><div class="tbl-wrap"><table class="t heat"><thead><tr><th>Team</th><th>Status</th><th class="num">Title odds</th><th class="num" title="What one 2026-27 category win is worth to this team vs the league average">Win-now weight</th>' + E.YEARS.map(function (y) { return '<th class="num">' + y + '</th>'; }).join('') + '<th>Window</th><th>Strategy</th></tr></thead><tbody>';
      rows.sort(function (a, b) { return b.c.k[0] - a.c.k[0] || b.avg3 - a.avg3; }).forEach(function (r) {
        // window: compare the roster's standing vs the league now and in two seasons (every roster shrinks as deals expire)
        var c = r.c, z = function (y) { return (r.s[y] - avgY[y]) / (sdY[y] || 1); }, fade = z(2) < z(0) - 0.8;
        var label = c.tier === 'contender' ? (fade ? 'Now; core ages out fast' : 'Now, and built to last')
          : c.rise ? 'Core peaks vs league ' + E.YEARS[c.rise] : c.tier === 'bubble' ? 'On the bubble' : 'Rebuild';
        h += '<tr class="' + (r.t === me ? 'mine' : '') + '"><td><a href="#/team/' + encodeURIComponent(r.t) + '"><b>' + esc(U.teamName(r.t)) + '</b></a></td><td>' + DP.tierBadge(r.t) + '</td><td class="num">' + U.pct(c.champ, 1) + '</td><td class="num">×' + U.fmt(c.k[0], 2) + '</td>' + r.s.map(function (v, y) {
          var t = (v - lo) / (hi - lo || 1);
          return '<td class="hc" style="background:' + C.heat(t) + ';color:' + C.heatInk(t) + '" data-tip="' + esc('<div class="tv">' + U.fmt(v, 0) + ' WAR</div><div class="tl">' + U.teamName(r.t) + ' · ' + E.YEARS[y] + (y ? ' · projected title share on this roster ' + U.pct(c.share[y], 0) : '') + '</div>') + '">' + U.fmt(v, 0) + '</td>';
        }).join('') + '<td class="small" style="min-width:150px">' + esc(label) + '</td><td class="small" style="min-width:120px"><b>' + esc(DP.strategy(r.t).short) + '</b></td></tr>';
      });
      h += '</tbody></table></div><p class="small muted">More intense shading = stronger roster that season. <b>Win-now weight</b>: title odds rise steeply with strength only near the top, so an extra 2026-27 category win is worth several times more to a contender than to the league average, and little to a team out of the race (floor ×' + E.CONTEND.floor + ': that production can still be flipped at the deadline). Contender = weight ≥ ×' + E.CONTEND.contender + ', bubble ≥ ×' + E.CONTEND.bubble + '. Later seasons use the same curve on each roster\'s projected strength, pulled halfway toward average per year because rosters change. The Trade Machine and Trade Finder use these weights.</p></div>';
      if (me) {
        var mine = rows.find(function (r) { return r.t === me; }), avg = avgY;
        h += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>' + esc(U.teamName(me)) + ': ' + esc(DP.strategy(me).short) + '</h2><p>' + esc(DP.strategy(me).text) + '</p><p class="small"><a href="#/team/' + encodeURIComponent(me) + '">Buy and sell targets on your Team Hub →</a></p></div>' +
          '<div class="card"><h2>' + esc(U.teamName(me)) + ' vs the league</h2>' + C.lines(E.YEARS.map(function (y) { return y.slice(2); }), [{ name: U.teamName(me), values: mine.s.map(function (v) { return +v.toFixed(1); }), color: 'var(--accent)' }, { name: 'League average', values: avg.map(function (v) { return +v.toFixed(1); }), color: 'var(--s1)', dash: true }], { height: 220, width: 900, title: 'Window vs league average' }) + '</div></div>';
      }
      el.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ Weekly preview (copy-ready for the league chat)
  // ------------------------------------------------------------ Standings (Fantrax, live) + projected finish
  DP.pages.standings = {
    title: 'Standings',
    render: function (el) {
      var E = DP.E, act = E.actual(), FX = DP.league.fantrax || {}, div = FX.divisions || {}, me = DP.state.team;
      var h = '<div class="page-head"><h1>Standings</h1><p class="sub">Category W-L-T straight from Fantrax (' + (DP.live.state === 'ok' ? 'live' : 'nightly sync') + '), with projected final records and odds from the season sim, which starts from the real standings and simulates only the weeks left.</p></div>';
      if (!act) h += '<div class="callout">No matchups completed yet. ' + esc(DP.lockText(0) ? 'Week 1 ' + DP.lockText(0) + '.' : '') + ' Until then this page shows projections only.</div>';
      else if (act.odd) h += '<div class="callout warn">The Fantrax standings don\'t add up to 15 categories per week, so the sim is projecting from scratch.</div>';
      else h += '<div class="callout">' + act.done + ' of ' + E.REG_WEEKS + ' regular-season weeks played.</div>';
      h += '<div class="card flush"><div id="st-table" style="padding:12px"></div></div><div class="grid g2" style="margin-top:14px" id="st-divs"></div>';
      el.innerHTML = h;
      var rows = E.teams.map(function (t) { var a = act && !act.odd ? act.rec[t] : null; return { t: t, a: a, div: div[t] || '', pct: a ? (a.W + a.T / 2) / Math.max(1, a.W + a.L + a.T) : null }; });
      var tbl = ui.table(U.qs('#st-table', el), {
        rows: rows, sort: act && !act.odd ? 'pct' : 'proj', csv: 'dynasty-puck-standings.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [
          { k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<a href="#/team/' + encodeURIComponent(r.t) + '"><b>' + esc(U.teamName(r.t)) + '</b></a> <span class="faint small">' + esc(r.t) + '</span>'; } },
          { k: 'div', l: 'Div', v: function (r) { return r.div; } },
          { k: 'rec', l: 'W-L-T', cls: 'num', v: function (r) { return r.pct; }, f: function (r) { return r.a ? r.a.W + '-' + r.a.L + '-' + r.a.T : '0-0-0'; } },
          { k: 'pct', l: 'Win%', cls: 'num', v: function (r) { return r.pct; }, f: function (r) { return r.a ? U.rate(r.pct) : '–'; } },
          { k: 'gb', l: 'GB', cls: 'num', v: function (r) { return r.a ? r.a.gb : null; }, f: function (r) { return r.a && r.a.gb ? U.fmt(r.a.gb, 1) : '–'; }, title: 'Games back (Fantrax)' },
          { k: 'proj', l: 'Proj final', cls: 'num', v: function (r) { return r.sim ? r.sim.pct : null; }, f: function (r) { return r.sim ? U.fmt(r.sim.W, 0) + '-' + U.fmt(r.sim.L, 0) + '-' + U.fmt(r.sim.T, 0) : '…'; } },
          { k: 'seed', l: 'Avg seed', cls: 'num', v: function (r) { return r.sim ? -r.sim.avgSeed : null; }, f: function (r) { return r.sim ? U.fmt(r.sim.avgSeed, 1) : '…'; } },
          { k: 'po', l: 'Playoffs', cls: 'num', v: function (r) { return r.sim ? r.sim.po : null; }, f: function (r) { return r.sim ? U.pct(r.sim.po) : '…'; } },
          { k: 'champ', l: 'Title', cls: 'num', v: function (r) { return r.sim ? r.sim.champ : null; }, f: function (r) { return r.sim ? U.pct(r.sim.champ, 1) : '…'; } },
          { k: 'p1', l: '#1 pick', cls: 'num', v: function (r) { return r.sim ? r.sim.slot[0] : null; }, f: function (r) { return r.sim ? U.pct(r.sim.slot[0], 1) : '…'; }, title: 'Chance of the worst record = first pick in the 2027 league draft' }
        ]
      });
      DP.getSim(function (sim) {
        var by = {}; sim.forEach(function (r) { by[r.t] = r; });
        rows.forEach(function (r) { r.sim = by[r.t]; });
        tbl.update();
        var box = U.qs('#st-divs', el); if (!box) return;
        var divs = U.uniq(rows.map(function (r) { return r.div; }).filter(Boolean)).sort();
        box.innerHTML = divs.map(function (d) {
          var rs = rows.filter(function (r) { return r.div === d; }).sort(function (a, b) { return (b.pct || 0) - (a.pct || 0) || b.sim.pct - a.sim.pct; });
          return '<div class="card"><h2>' + esc(d) + ' division</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">W-L-T</th><th class="num">Proj final</th><th class="num">Playoffs</th></tr></thead><tbody>' + rs.map(function (r) {
            return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td>' + esc(U.teamName(r.t)) + '</td><td class="num">' + (r.a ? r.a.W + '-' + r.a.L + '-' + r.a.T : '0-0-0') + '</td><td class="num">' + U.fmt(r.sim.W, 0) + '-' + U.fmt(r.sim.L, 0) + '-' + U.fmt(r.sim.T, 0) + '</td><td class="num">' + U.pct(r.sim.po) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>';
        }).join('') + (divs.length ? '<p class="small muted span2">Divisions come from Fantrax. Playoffs: 8 teams, no byes; the two division winners are seeds 1-2, everyone else by category win%.</p>' : '');
      }, 1500);
    }
  };

  DP.pages.preview = {
    title: 'Weekly Preview',
    render: function (el, hsh) {
      var E = DP.E, w = +(hsh.q.w || DP.currentWeek()), wi = w - 1, wk = E.weeks[wi];
      var h = '<div class="page-head"><h1>Weekly Preview</h1><p class="sub">Auto-written previews of every matchup: favorite, win probability, the categories most likely to swing, schedule edges, injuries and graduation watch. Copy the text version into the league chat.</p></div>';
      h += '<div class="controls"><label>Week <select id="pv-w">' + E.weeks.map(function (x, i) { return x.po ? '' : '<option value="' + (i + 1) + '"' + (i + 1 === w ? ' selected' : '') + '>Week ' + x.n + ' · ' + U.date(new Date(x.start + 'T12:00:00Z')) + '</option>'; }).join('') + '</select></label><button class="btn" id="pv-copy">📋 Copy text version</button></div><div id="pv-out"><p class="muted">Writing previews…</p></div>';
      el.innerHTML = h;
      U.qs('#pv-w', el).addEventListener('change', function (e) { DP.go('preview', null, { w: e.target.value }); });
      if (wk.po) { U.qs('#pv-out', el).innerHTML = '<p class="muted">Playoff weeks depend on seeding.</p>'; return; }
      setTimeout(function () {
        var games = DP.meta.h2h.filter(function (g) { return g[0] === w; }), cards = [], text = ['Dynasty Puck: Week ' + w + ' preview (' + U.date(new Date(wk.start + 'T12:00:00Z')) + ' – ' + U.date(new Date(wk.end + 'T12:00:00Z')) + ')', ''];
        var gradsThisWeek = E.P.filter(function (p) { return p.gm && p.ct === 'MNR'; }).map(function (p) { return [p, E.graduation(p)]; }).filter(function (x) { return x[1].week === wi; });
        games.forEach(function (g, gi) {
          var A = E.teamWeek(E.rosters[g[1]], wi, { injuries: true }), B = E.teamWeek(E.rosters[g[2]], wi, { injuries: true });
          var pr = E.matchupProbs(A, B), mc = E.simWeek(A, B, 3000, w * 97 + gi), ea = E.sum(pr.map(function (x) { return x.w + x.t / 2; }));
          var fav = mc.win >= mc.loss ? g[1] : g[2], favP = Math.max(mc.win, mc.loss);
          var swing = pr.map(function (x, c) { return [c, Math.abs(x.w - x.l)]; }).sort(function (x, y) { return x[1] - y[1]; }).slice(0, 3).map(function (x) { return E.CATS[x[0]].l; });
          var edgeA = pr.map(function (x, c) { return [c, x.w - x.l]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 3).map(function (x) { return E.CATS[x[0]].l; });
          var edgeB = pr.map(function (x, c) { return [c, x.l - x.w]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 3).map(function (x) { return E.CATS[x[0]].l; });
          var ng = function (agg) { return E.sum(agg.lu.F.concat(agg.lu.D).map(function (x) { return E.games(x.p, wi).N; })); };
          var gA = ng(A), gB = ng(B);
          var inj = E.rosters[g[1]].concat(E.rosters[g[2]]).filter(function (p) { return p.inj && p.r && p.WAR > 2 && E.injuredOut(p, wi); });
          var tone = favP > 0.75 ? 'strong favorite' : favP > 0.6 ? 'favorite' : 'coin flip';
          var lines = [
            (gi + 1) + '. ' + U.teamName(g[1]) + ' at ' + U.teamName(g[2]) + ': ' + (tone === 'coin flip' ? 'coin flip, ' + U.pct(mc.win) + ' / ' + U.pct(mc.loss) : U.teamName(fav) + ' ' + tone + ' (' + U.pct(favP) + ')') + ', expected cats ' + U.fmt(ea, 1) + '-' + U.fmt(15 - ea, 1) + '.',
            '   Edges: ' + g[1] + ' in ' + edgeA.join('/') + '; ' + g[2] + ' in ' + edgeB.join('/') + '. Swing cats: ' + swing.join(', ') + '.',
            '   Skater games: ' + gA + ' vs ' + gB + (Math.abs(gA - gB) >= 5 ? ' (big schedule edge to ' + (gA > gB ? g[1] : g[2]) + ')' : '') + '.' + (A.r.gFail > 0.12 || B.r.gFail > 0.12 ? ' Goalie-minimum risk: ' + g[1] + ' ' + U.pct(A.r.gFail) + ', ' + g[2] + ' ' + U.pct(B.r.gFail) + '.' : '')
          ];
          if (inj.length) lines.push('   Missing: ' + inj.map(function (p) { return p.n + ' (' + p.gm + ')'; }).join(', ') + '.');
          text = text.concat(lines);
          cards.push('<div class="card" style="margin-bottom:12px"><h3>' + esc(U.teamName(g[1])) + ' <span class="muted">at</span> ' + esc(U.teamName(g[2])) + ' <span class="badge ' + (tone === 'coin flip' ? 'warn' : 'good') + '">' + esc(tone === 'coin flip' ? 'coin flip' : fav + ' ' + U.pct(favP)) + '</span> <a class="btn sm" style="margin-left:auto" href="' + U.hash('matchup', null, { w: w, a: g[1], b: g[2] }) + '">Open matchup</a></h3>' +
            '<p class="small">' + lines.map(function (l) { return esc(l.trim()); }).join('<br>') + '</p></div>');
        });
        if (gradsThisWeek.length) {
          var gl = 'Graduation watch: ' + gradsThisWeek.map(function (x) { return x[0].n + ' (' + x[0].gm + ', ' + x[1].cgp + '/' + x[1].thr + ')'; }).join(', ') + ' projected to cross the career-GP line this week.';
          text.push('', gl); cards.push('<div class="callout warn">' + esc(gl) + '</div>');
        }
        text.push('', 'Generated by Dynasty Puck HQ: https://gavinpastreich.github.io/dynasty-puck/');
        var out = U.qs('#pv-out', el);
        if (!out) return;
        // lineup watch: every team's Fantrax lineup vs optimal (only for the week lineups are being set for)
        var watch = '';
        if (E.lockWeek() === wi) {
          var rows = E.teams.map(function (t) { return { t: t, c: E.lineupCheck(t, wi) }; });
          watch = '<div class="card" style="margin-bottom:12px"><h3>🔒 Lineup watch <span class="muted small">' + esc(DP.lockText(wi)) + '</span></h3><div class="hint">Each team\'s lineup as set in Fantrax vs its optimal weekly lineup: expected category wins left on the table.</div><div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">Set</th><th class="num">Optimal</th><th class="num">Gap</th><th>Swaps</th></tr></thead><tbody>' +
            rows.sort(function (x, y) { return (y.c ? y.c.eOpt - y.c.eSet : 9) - (x.c ? x.c.eOpt - x.c.eSet : 9); }).map(function (r) {
              var c = r.c, gap = c ? c.eOpt - c.eSet : null;
              return '<tr class="' + (r.t === DP.state.team ? 'mine' : '') + '"><td><a href="#/team/' + encodeURIComponent(r.t) + '">' + esc(U.teamName(r.t)) + '</a></td>' + (c ? '<td class="num">' + U.fmt(c.eSet, 1) + '</td><td class="num">' + U.fmt(c.eOpt, 1) + '</td><td class="num ' + (gap > 0.3 ? 'bad' : gap > 0.05 ? 'warn' : 'good') + '">' + (gap > 0.05 ? U.fmt(gap, 2) : '✓') + '</td><td class="small">' + (c.start.length ? c.start.length + ' (' + c.start.slice(0, 2).map(function (x) { return esc(x.p.n); }).join(', ') + (c.start.length > 2 ? '…' : '') + ')' : '–') + '</td>' : '<td colspan="4" class="muted small">no lineup set in Fantrax</td>') + '</tr>';
            }).join('') + '</tbody></table></div></div>';
        }
        out.innerHTML = watch + cards.join('') + '<details><summary>Text version</summary><textarea id="pv-text" rows="18">' + esc(text.join('\n')) + '</textarea></details>';
        U.qs('#pv-copy', el).onclick = function () { U.copy(text.join('\n'), 'Preview copied. Paste it in the league chat.'); };
      }, 30);
    }
  };
})();
