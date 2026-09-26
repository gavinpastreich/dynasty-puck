/* Dynasty Puck HQ - Dashboard and Team Hub. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  // ------------------------------------------------------------ shared: Monte Carlo cache (async)
  DP.simCache = null;
  DP.getSim = function (cb, n) {
    var E = DP.E;
    if (DP.simCache && DP.simCache.v === E.version && DP.simCache.n >= (n || 1500)) return cb(DP.simCache.res);
    setTimeout(function () {
      var res = E.simSeason({ n: n || 1500 });
      DP.simCache = { v: E.version, n: n || 1500, res: res };
      cb(res);
    }, 20);
  };

  // team summaries (payroll, DV, prospects, age) - cached per engine version
  DP.teamSummary = function () {
    var E = DP.E;
    if (DP._ts && DP._ts.v === E.version) return DP._ts.d;
    var cats = E.teamCats(), out = {};
    E.teams.forEach(function (t) {
      var ros = E.rosters[t], cap = E.teamCap(t);
      var lu = E.baseline[t][0].lu, starters = lu.F.concat(lu.D, lu.G).map(function (x) { return x.p; });
      var mnr = ros.filter(function (p) { return p.ct === 'MNR'; });
      out[t] = {
        t: t, n: ros.length, pay: cap[0].total, space: E.CAP - cap[0].total, cap: cap,
        dv: E.sum(ros.map(function (p) { return Math.max(0, p.DV); })),
        war: E.sum(starters.map(function (p) { return p.WAR; })),
        pros: E.sum(mnr.map(function (p) { return Math.max(0, p.DV); })), nMnr: mnr.length,
        age: E.sum(starters.map(function (p) { return p.age || 27; })) / Math.max(1, starters.length),
        cats: cats.avg[t], rank: cats.rank[t], z: cats.z[t]
      };
    });
    var st = {}; E.expStandings.forEach(function (r) { st[r.t] = r; });
    E.teams.forEach(function (t) { out[t].exp = st[t]; });
    // power score: 55% this season (expected cat win%), 35% dynasty value, 10% prospect pool (z-scores)
    var z = function (k) {
      var vals = E.teams.map(function (t) { return k === 'pct' ? out[t].exp.pct : out[t][k]; });
      var m = E.sum(vals) / vals.length, sd = Math.sqrt(E.sum(vals.map(function (v) { return (v - m) * (v - m); })) / vals.length) || 1;
      E.teams.forEach(function (t, i) { out[t]['z_' + k] = (vals[i] - m) / sd; });
    };
    ['pct', 'dv', 'pros'].forEach(z);
    E.teams.forEach(function (t) { var o = out[t]; o.power = 0.55 * o.z_pct + 0.35 * o.z_dv + 0.10 * o.z_pros; });
    var order = E.teams.slice().sort(function (a, b) { return out[b].power - out[a].power; });
    order.forEach(function (t, i) { out[t].prank = i + 1; });
    var pOrder = E.teams.slice().sort(function (a, b) { return out[b].pros - out[a].pros; });
    pOrder.forEach(function (t, i) { out[t].prosRank = i + 1; out[t].prosGrade = ui.gradeOf(1 - i / (E.teams.length - 1)); });
    DP._ts = { v: E.version, d: out, order: order };
    return out;
  };

  function nextMatch(team) {
    var g = DP.meta.h2h.filter(function (m) { return m[1] === team || m[2] === team; });
    return g.length ? g[0] : null;
  }

  // ------------------------------------------------------------ Dashboard
  DP.pages.home = {
    title: 'Dashboard',
    render: function (el) {
      var E = DP.E, me = DP.state.team, TS = DP.teamSummary(), h = '';
      var start = new Date(E.weeks[0].start + 'T00:00:00'), days = Math.ceil((start - new Date()) / 864e5);
      h += '<div class="page-head"><h1>Dynasty Puck HQ</h1><p class="sub">' + esc(DP.meta.season) + ' · 14 teams · 15 weekly H2H categories · weekly lineup lock · ' +
        (days > 0 ? 'Week 1 starts ' + U.date(new Date(E.weeks[0].start + 'T12:00:00Z')) + ' (' + days + ' day' + (days === 1 ? '' : 's') + ')' : 'season underway') + '</p></div>';

      if (me) {
        var s = TS[me], nm = nextMatch(me), opp = nm ? (nm[1] === me ? nm[2] : nm[1]) : null, pr = null;
        if (nm) {
          var probs = E.matchupProbs(E.baseline[me][nm[0] - 1], E.baseline[opp][nm[0] - 1]);
          pr = E.sum(probs.map(function (x) { return x.w + x.t / 2; }));
        }
        h += '<div class="card" style="margin-bottom:14px"><h2>' + esc(U.teamName(me)) + ' <span class="muted small">(' + esc(me) + ')</span> <a class="btn sm" href="#/team/' + encodeURIComponent(me) + '" style="margin-left:auto">Team Hub →</a></h2><div class="stats" style="margin:0">' +
          DP.statTile('Power rank', '#' + s.prank, 'now + dynasty + prospects') +
          DP.statTile('Projected finish', U.ord(s.exp.rank), U.fmt(s.exp.W, 0) + '-' + U.fmt(s.exp.L, 0) + '-' + U.fmt(s.exp.T, 0) + ' cats') +
          '<div class="stat"><div class="l">Playoff odds</div><div class="v" data-sim="po" data-t="' + esc(me) + '">…</div><div class="d">8 of 14 make it</div></div>' +
          DP.statTile('Cap space', U.m(s.space), U.m(s.pay) + ' of ' + U.m(E.CAP, 0)) +
          (nm ? DP.statTile('Week ' + nm[0] + ' opponent', esc(opp), 'expected ' + U.fmt(pr, 1) + ' of 15 cats') : '') +
          '</div><p style="margin:10px 0 0"><a href="' + U.hash('matchup', null, { w: nm ? nm[0] : 1, a: me, b: opp }) + '">Preview the matchup →</a> · <a href="#/fa">Best FA fits →</a> · <a href="#/finder">Trade ideas →</a></p></div>';
        var mine = E.rosters[me].filter(function (p) { return p.ct === 'MNR'; }).map(function (p) { return [p, E.graduation(p)]; })
          .filter(function (x) { return x[1].week !== null && x[1].week < 10; }).sort(function (a, b) { return a[1].week - b[1].week; });
        if (mine.length) h += '<div class="callout warn"><b>Graduation watch:</b> ' + mine.map(function (x) { return ui.plink(x[0]) + ' (' + x[1].cgp + '/' + x[1].thr + ' GP, ~wk ' + (x[1].week + 1) + ')'; }).join(', ') + '. Each must sign an ELC ($1.5M) or be dropped once they cross the line.</div>';
      } else {
        h += '<div class="callout">👋 Welcome! <button class="btn sm primary" data-act="pick-team">Pick your team</button> to get your matchup, needs and targets. Everything else works without it.</div>';
      }

      h += '<div class="grid g2">';
      h += '<div class="card flush span2"><h2>Power rankings & projected standings</h2><div class="hint">Projected category record from every weekly matchup on the real Fantrax schedule (weekly-lock optimal lineups). Playoff and title odds from a Monte Carlo season sim, loading below. Power = 55% this season, 35% dynasty value, 10% prospect pool.</div><div id="pr-table" style="padding:0 12px 12px"></div></div>';
      h += '<div class="card"><h2>🟢 Best bargains</h2><div class="hint">Biggest contract surplus in 2026-27 (market value − salary). MNR players at $0 excluded.</div><div id="bargains"></div></div>';
      h += '<div class="card"><h2>🔴 Toughest contracts</h2><div class="hint">Largest negative surplus in 2026-27. Dropping costs 50% of each remaining year.</div><div id="worst"></div></div>';
      h += '<div class="card"><h2>🎓 About to graduate</h2><div class="hint">MNR players projected to reach 82 career NHL GP (41 for goalies) soonest.</div><div id="grads"></div><p><a href="#/prospects">Full graduation tracker →</a></p></div>';
      h += '<div class="card"><h2>🛒 Top free agents</h2><div class="hint">Unowned players by projected 2026-27 WAR.</div><div id="topfa"></div><p><a href="#/fa">Free-agent finder →</a></p></div>';
      h += '<div class="card span2"><h2>📈 Projected category leaders (2026-27)</h2><div class="hint">Top 5 projected totals in each category (goalies: 30+ GP for GAA/SV%). ★ = owned by your team.</div><div id="leaders" class="grid g4"></div></div>';
      h += '</div>';
      el.innerHTML = h;

      // power table
      var rows = DP._ts.order.map(function (t) { return TS[t]; });
      var tbl = ui.table(U.qs('#pr-table', el), {
        rows: rows, sort: 'prank', desc: false, csv: 'dynasty-puck-power-rankings.csv',
        rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [
          { k: 'prank', l: '#', cls: 'num', v: function (r) { return r.prank; } },
          { k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<a href="#/team/' + encodeURIComponent(r.t) + '"><b>' + esc(U.teamName(r.t)) + '</b></a> <span class="faint small">' + esc(r.t) + '</span>'; } },
          { k: 'rec', l: 'Proj cat W-L-T', v: function (r) { return r.exp.pct; }, f: function (r) { return U.fmt(r.exp.W, 0) + '-' + U.fmt(r.exp.L, 0) + '-' + U.fmt(r.exp.T, 0); }, cls: 'num' },
          { k: 'pct', l: 'Win%', v: function (r) { return r.exp.pct; }, f: function (r) { return U.rate(r.exp.pct); }, cls: 'num' },
          { k: 'po', l: 'Playoffs', v: function (r) { return r.sim ? r.sim.po : null; }, f: function (r) { return r.sim ? U.pct(r.sim.po) : '<span class="faint">…</span>'; }, cls: 'num', title: 'Monte Carlo: probability of a top-8 finish' },
          { k: 'champ', l: 'Title', v: function (r) { return r.sim ? r.sim.champ : null; }, f: function (r) { return r.sim ? U.pct(r.sim.champ, 1) : '<span class="faint">…</span>'; }, cls: 'num' },
          { k: 'war', l: 'Starter WAR', v: function (r) { return r.war; }, f: function (r) { return U.fmt(r.war, 0); }, cls: 'num', title: 'Sum of projected WAR of the week-1 starting lineup' },
          { k: 'dv', l: 'Dynasty', v: function (r) { return r.dv; }, f: function (r) { return U.fmt(r.dv, 0); }, cls: 'num', title: 'Sum of player dynasty values (7 seasons)' },
          { k: 'pros', l: 'Prospects', v: function (r) { return r.pros; }, f: function (r) { return '<b>' + r.prosGrade + '</b> <span class="faint small">#' + r.prosRank + '</span>'; }, cls: 'num' },
          { k: 'space', l: 'Cap space', v: function (r) { return r.space; }, f: function (r) { return '<span class="' + (r.space < 1 ? 'bad' : '') + '">' + U.m(r.space) + '</span>'; }, cls: 'num' },
          { k: 'age', l: 'Age', v: function (r) { return r.age; }, f: function (r) { return U.fmt(r.age, 1); }, cls: 'num', title: 'Average age of starters' }
        ]
      });
      DP.getSim(function (sim) {
        var by = {}; sim.forEach(function (r) { by[r.t] = r; });
        rows.forEach(function (r) { r.sim = by[r.t]; });
        tbl.update();
        U.qsa('[data-sim=po]', el).forEach(function (n) { n.textContent = U.pct(by[n.dataset.t].po); });
      });

      // bargains / worst
      var owned = E.P.filter(function (p) { return p.gm && p.r && p.ct !== 'MNR'; });
      var list = function (arr, f) { return '<ul class="list-plain">' + arr.map(f).join('') + '</ul>'; };
      var li = function (p, right) { return '<li>' + ui.pos(p) + '<span>' + ui.pcell(p) + '<br><span class="small muted">' + esc(p.gm) + ' · ' + ui.pill(p.ct) + ' ' + U.m(p.sal26) + ' · WAR ' + U.fmt(p.WAR, 1) + '</span></span><span style="margin-left:auto" class="num">' + right + '</span></li>'; };
      U.qs('#bargains', el).innerHTML = list(owned.slice().sort(U.by(function (p) { return p.surplus; }, true)).slice(0, 8), function (p) { return li(p, '<b class="good">' + U.sm(p.surplus) + '</b>'); });
      U.qs('#worst', el).innerHTML = list(owned.slice().sort(U.by(function (p) { return p.surplus; })).slice(0, 8), function (p) { return li(p, '<b class="bad">' + U.sm(p.surplus) + '</b>'); });
      var grads = E.P.filter(function (p) { return p.gm && p.ct === 'MNR'; }).map(function (p) { return [p, E.graduation(p)]; })
        .filter(function (x) { return x[1].week !== null; }).sort(function (a, b) { return a[1].week - b[1].week || a[1].need - b[1].need; }).slice(0, 8);
      U.qs('#grads', el).innerHTML = list(grads, function (x) {
        var p = x[0], g = x[1];
        return '<li>' + ui.pos(p) + '<span>' + ui.pcell(p) + '<br><span class="small muted">' + esc(p.gm) + ' · ' + g.cgp + '/' + g.thr + ' career GP · needs ' + g.need + '</span></span><span style="margin-left:auto" class="num"><b>Wk ' + (g.week + 1) + '</b><br><span class="small muted">' + U.date(g.date) + '</span></span></li>';
      });
      var fas = E.P.filter(function (p) { return !p.gm && p.r; }).sort(U.by(function (p) { return p.WAR; }, true)).slice(0, 8);
      U.qs('#topfa', el).innerHTML = list(fas, function (p) { return '<li>' + ui.pos(p) + '<span>' + ui.pcell(p) + '<br><span class="small muted">proj ' + p.projGP + ' GP' + (p.wv ? ' · on waivers' : '') + '</span></span><span style="margin-left:auto" class="num"><b>' + U.fmt(p.WAR, 1) + '</b> WAR</span></li>'; });

      // leaders
      var cats = [['Pt-D', function (p) { return p.D ? p.p26[1] : null; }], ['G', function (p) { return p.p26[2]; }], ['A', function (p) { return p.p26[3]; }], ['2G+A', function (p) { return 2 * p.p26[2] + p.p26[3]; }], ['PIM', function (p) { return p.p26[4]; }], ['SOG', function (p) { return p.p26[5]; }], ['STP', function (p) { return p.p26[6]; }], ['Hit', function (p) { return p.p26[7]; }], ['Blk', function (p) { return p.p26[8]; }], ['Tk', function (p) { return p.p26[9]; }], ['Cor', function (p) { return p.p26[10]; }]];
      var gcats = [['W', function (p) { return p.p26[1]; }], ['GAA', function (p) { return p.p26[0] >= 30 ? -p.p26[2] : null; }, function (v) { return (-v).toFixed(2); }], ['SV%', function (p) { return p.p26[0] >= 30 ? p.p26[3] : null; }, function (v) { return U.rate(v); }], ['SHO', function (p) { return p.p26[4]; }]];
      var lh = '';
      cats.concat(gcats).forEach(function (c, ci) {
        var pool = E.P.filter(function (p) { return ci < cats.length ? !p.G : p.G; });
        var top = pool.map(function (p) { return [p, c[1](p)]; }).filter(function (x) { return x[1] !== null && x[1] > -99; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
        lh += '<div><h3 class="small" style="margin:0 0 4px">' + esc(c[0]) + '</h3><ol class="small" style="margin:0;padding-left:18px">' + top.map(function (x) {
          return '<li>' + ui.plink(x[0]) + (x[0].gm === me && me ? ' ★' : '') + ' <span class="muted">' + (c[2] ? c[2](x[1]) : U.fmt(x[1])) + (x[0].gm ? ' · ' + esc(x[0].gm) : ' · FA') + '</span></li>';
        }).join('') + '</ol></div>';
      });
      U.qs('#leaders', el).innerHTML = lh;
    }
  };

  // ------------------------------------------------------------ Team Hub
  DP.pages.team = {
    title: 'Team Hub',
    render: function (el, hsh) {
      var E = DP.E, t = hsh.arg || DP.state.team;
      if (!t || !E.rosters[t]) {
        el.innerHTML = '<div class="page-head"><h1>Team Hub</h1></div><div class="controls"><label>Team ' + ui.teamSelect('tsel', null, 'Choose a team…') + '</label></div>';
        U.qs('#tsel', el).addEventListener('change', function (e) { DP.go('team', e.target.value); });
        return;
      }
      var TS = DP.teamSummary(), s = TS[t], ros = E.rosters[t], h = '';
      h += '<div class="page-head"><h1>' + esc(U.teamName(t)) + '</h1><label class="small muted">Team ' + ui.teamSelect('tsel', t) + '</label><p class="sub">GM ' + esc(t) + ' · ' + ros.length + ' players (' + s.nMnr + ' MNR) · Power rank #' + s.prank + '</p></div>';
      h += '<div class="stats">' +
        DP.statTile('Projected finish', U.ord(s.exp.rank), U.fmt(s.exp.W, 0) + '-' + U.fmt(s.exp.L, 0) + '-' + U.fmt(s.exp.T, 0) + ' category record') +
        '<div class="stat"><div class="l">Playoff odds</div><div class="v" id="t-po">…</div><div class="d" id="t-champ">title odds …</div></div>' +
        DP.statTile('Payroll 2026-27', U.m(s.pay), 'cap space ' + U.m(s.space)) +
        DP.statTile('Starter WAR', U.fmt(s.war, 1), 'week-1 optimal lineup') +
        DP.statTile('Dynasty value', U.fmt(s.dv, 0), U.ord(Object.keys(TS).filter(function (k) { return TS[k].dv > s.dv; }).length + 1) + ' in league') +
        DP.statTile('Prospect pool', s.prosGrade, '#' + s.prosRank + ' of 14 · ' + s.nMnr + ' MNR') +
        DP.statTile('Starter age', U.fmt(s.age, 1), 'average') + '</div>';
      h += '<div class="grid g2">';
      h += '<div class="card"><h2>Category profile</h2><div class="hint">Average weekly starter totals vs the league (rank of 14). Blue = strength, orange = weakness.</div>' + C.catProfile(s.z, s.rank) + '</div>';
      h += '<div class="card"><h2>What this team should do</h2><div id="recs"><p class="muted">Crunching recommendations…</p></div></div>';
      h += '<div class="card span2"><h2>Roster by slot</h2><div class="hint">Optimal weekly-lock lineup for the selected week (12F / 6D / 2G + 3 bench). Every owned player is eligible, MNR included. G = NHL games that week.</div><div class="controls"><label>Week <select id="t-week">' + E.weeks.map(function (w, i) { return '<option value="' + i + '">' + (w.po ? 'Playoffs R' + w.po : 'Week ' + w.n) + ' (' + U.date(new Date(w.start + 'T12:00:00Z')) + ')</option>'; }).join('') + '</select></label></div><div id="t-lineup"></div></div>';
      h += '<div class="card"><h2>Cap by season</h2><div class="hint">Committed salary by contract type (Fantrax salaries; future years from the contract sheet). Red line = $' + E.CAP + 'M cap (2026-27; future caps assumed flat).</div><div id="t-cap"></div></div>';
      h += '<div class="card"><h2>Age profile & pipeline</h2><div id="t-age"></div></div>';
      h += '<div class="card span2"><h2>Full roster</h2><div id="t-roster"></div></div>';
      h += '</div>';
      el.innerHTML = h;
      U.qs('#tsel', el).addEventListener('change', function (e) { DP.go('team', e.target.value); });

      DP.getSim(function (sim) {
        var r = sim.find(function (x) { return x.t === t; });
        var a = U.qs('#t-po', el), b = U.qs('#t-champ', el);
        if (a) a.textContent = U.pct(r.po); if (b) b.textContent = 'title odds ' + U.pct(r.champ, 1) + ' · avg seed ' + U.fmt(r.avgSeed, 1);
      });

      // lineup
      function lineup(wi) {
        var agg = E.baseline[t][wi], lu = agg.lu;
        var slot = function (x) { var g = E.games(x.p, wi); return '<div class="slot">' + ui.pos(x.p) + ui.plink(x.p) + ' ' + (x.p.ct === 'MNR' ? ui.pill('MNR') : '') + '<span class="gms" title="NHL games this week × availability">' + (g.N || 0) + 'G</span></div>'; };
        var starters = {}; lu.F.concat(lu.D, lu.G, lu.bench).forEach(function (x) { starters[x.p.id] = 1; });
        var rest = ros.filter(function (p) { return !starters[p.id]; });
        U.qs('#t-lineup', el).innerHTML = '<h3 class="small muted">Forwards (12)</h3><div class="lineup">' + lu.F.map(slot).join('') + '</div>' +
          '<h3 class="small muted" style="margin-top:10px">Defense (6)</h3><div class="lineup">' + lu.D.map(slot).join('') + '</div>' +
          '<h3 class="small muted" style="margin-top:10px">Goalies (2)</h3><div class="lineup">' + lu.G.map(slot).join('') + '</div>' +
          '<p class="small ' + (agg.r.gFail > 0.1 ? 'bad' : 'muted') + '">Goalie minimum: ' + U.pct(1 - agg.r.gFail) + ' chance of reaching 2 goalie GP this week (expected ' + U.fmt(agg.m.GGP, 1) + ').</p>' +
          '<h3 class="small muted" style="margin-top:10px">Bench (3)</h3><div class="lineup">' + lu.bench.map(slot).join('') + '</div>' +
          '<details style="margin-top:10px"><summary>Reserves / minors (' + rest.length + ')</summary><div class="lineup" style="margin-top:6px">' + rest.map(function (p) { return '<div class="slot">' + ui.pos(p) + ui.plink(p) + ' ' + ui.pill(p.ct) + '<span class="gms">' + (p.projGP ? p.projGP + ' GP proj' : 'no NHL proj') + '</span></div>'; }).join('') + '</div></details>';
      }
      lineup(0);
      U.qs('#t-week', el).addEventListener('change', function (e) { lineup(+e.target.value); });

      // cap chart
      var types = ['BID', 'RFA1', 'ELC1', 'FA', 'MNR'];
      var series = types.map(function (ty, k) { return { name: ty, values: s.cap.map(function (y) { return y.byType[ty] || 0; }), color: C.SERIES[k] }; }).filter(function (sr) { return sr.values.some(function (v) { return v > 0; }); });
      U.qs('#t-cap', el).innerHTML = C.stacked(E.YEARS.map(function (y) { return y.slice(2); }), series, { refLine: E.CAP, refLabel: 'cap', fmt: function (v) { return U.m(v); }, tickFmt: function (v) { return '$' + v + 'M'; }, title: 'Committed cap by season' }) +
        '<div class="tbl-wrap"><table class="t"><thead><tr><th></th>' + E.YEARS.map(function (y) { return '<th class="num">' + y.slice(2) + '</th>'; }).join('') + '</tr></thead><tbody><tr><td>Committed</td>' + s.cap.map(function (y) { return '<td class="num">' + U.m(y.total, 1) + '</td>'; }).join('') + '</tr><tr><td>Space</td>' + s.cap.map(function (y) { return '<td class="num">' + U.m(E.CAP - y.total, 1) + '</td>'; }).join('') + '</tr><tr><td>Players</td>' + s.cap.map(function (y) { return '<td class="num">' + y.n + '</td>'; }).join('') + '</tr></tbody></table></div>';

      // age & pipeline
      var buckets = [['≤21', 0, 21.99], ['22-24', 22, 24.99], ['25-27', 25, 27.99], ['28-30', 28, 30.99], ['31-33', 31, 33.99], ['34+', 34, 99]];
      var ageData = buckets.map(function (b) { return { label: b[0], value: ros.filter(function (p) { return p.age >= b[1] && p.age <= b[2]; }).length }; });
      var pipe = ros.filter(function (p) { return p.ct === 'MNR'; }).sort(U.by(function (p) { return p.DV; }, true));
      U.qs('#t-age', el).innerHTML = C.hbars(ageData, { title: 'Players by age', labelW: 60, fmt: function (v) { return v + ' players'; }, rowH: 22 }) +
        '<h3 style="margin-top:12px">Top MNR prospects</h3><ul class="list-plain">' + pipe.slice(0, 8).map(function (p) {
          var g = E.graduation(p);
          return '<li>' + ui.pos(p) + '<span>' + ui.pcell(p) + '<br><span class="small muted">' + (p.cgp || 0) + '/' + p.gradThr + ' GP · ' + (g.week !== null ? 'grad ~wk ' + (g.week + 1) : g.status) + '</span></span><span class="num" style="margin-left:auto">DV <b>' + U.fmt(p.DV, 1) + '</b></span></li>';
        }).join('') + '</ul><p><a href="' + U.hash('prospects', null, { team: t }) + '">All ' + pipe.length + ' MNR players →</a></p>';

      // full roster table
      DP.rosterTable(U.qs('#t-roster', el), ros, { csv: 'roster-' + t + '.csv' });

      // recommendations (async: exact FA fits take a moment)
      setTimeout(function () { recs(t, s, U.qs('#recs', el)); }, 30);
    }
  };

  function recs(t, s, box) {
    if (!box) return;
    var E = DP.E, TS = DP.teamSummary(), h = '';
    var order = E.CATS.map(function (c, i) { return i; }).sort(function (a, b) { return s.z[a] - s.z[b]; });
    var weak = order.slice(0, 4), strong = order.slice(-4).reverse();
    h += '<p><b>Strengths:</b> ' + strong.map(function (c) { return E.CATS[c].l + ' (' + U.ord(s.rank[c]) + ')'; }).join(', ') + '<br><b>Weaknesses:</b> ' + weak.map(function (c) { return E.CATS[c].l + ' (' + U.ord(s.rank[c]) + ')'; }).join(', ') + '</p>';
    // FA targets: rank by quick gain, then exact
    var fas = E.P.filter(function (p) { return !p.gm && p.r && p.projGP >= 10; });
    fas.forEach(function (p) { p._q = E.quickGain(t, p); });
    var cand = fas.sort(U.by(function (p) { return p._q; }, true)).slice(0, 40).map(function (p) { return { p: p, g: E.gain(t, [p], []) }; }).sort(function (a, b) { return b.g.total - a.g.total; }).slice(0, 5);
    h += '<h3>Free-agent targets</h3><ul class="list-plain">' + cand.map(function (x) {
      var best = x.g.byCat.map(function (v, c) { return [c, v]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).filter(function (y) { return y[1] > 0.05; });
      return '<li>' + ui.pos(x.p) + '<span>' + ui.pcell(x.p) + '<br><span class="small muted">helps ' + best.map(function (y) { return E.CATS[y[0]].l; }).join(', ') + '</span></span><span class="num" style="margin-left:auto">' + ui.delta(x.g.total, 1) + ' cat W</span></li>';
    }).join('') + '</ul>';
    // trade partners: complementary strengths
    var partners = E.teams.filter(function (u) { return u !== t; }).map(function (u) {
      var z = TS[u].z, sc = 0, give = [], get = [];
      E.CATS.forEach(function (c, i) {
        var a = Math.max(0, -s.z[i]) * Math.max(0, z[i]), b = Math.max(0, s.z[i]) * Math.max(0, -z[i]);
        sc += a + b; if (a > 0.3) get.push(c.l); if (b > 0.3) give.push(c.l);
      });
      return { u: u, sc: sc, get: get, give: give };
    }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 3);
    h += '<h3>Complementary trade partners</h3><ul class="list-plain">' + partners.map(function (x) {
      return '<li><span><a href="#/team/' + encodeURIComponent(x.u) + '"><b>' + esc(U.teamName(x.u)) + '</b></a><br><span class="small muted">they have: ' + esc(x.get.join(', ') || '–') + ' · they need: ' + esc(x.give.join(', ') || '–') + '</span></span><a class="btn sm" style="margin-left:auto" href="' + U.hash('trade', null, { t: t + ',' + x.u }) + '">Build trade</a></li>';
    }).join('') + '</ul>';
    // cap / contract flags
    var flags = [];
    var ros = E.rosters[t];
    var nextYr = s.cap[1];
    if (s.space < 0) flags.push('<span class="bad">Over the cap by ' + U.m(-s.space) + ' in 2026-27.</span>');
    flags.push('2027-28 commitments ' + U.m(nextYr.total) + ' (' + U.m(E.CAP - nextYr.total) + ' space before re-signings).');
    var acts = ros.filter(function (p) { return p.act27; });
    if (acts.length) flags.push(acts.length + ' player' + (acts.length > 1 ? 's' : '') + ' on the 2027 offseason action list: ' + acts.map(function (p) { return ui.plink(p); }).join(', ') + '. <a href="#/offseason">Plan it →</a>');
    var grads = ros.filter(function (p) { return p.ct === 'MNR'; }).map(function (p) { return [p, E.graduation(p)]; }).filter(function (x) { return x[1].week !== null; });
    if (grads.length) flags.push(grads.length + ' MNR player' + (grads.length > 1 ? 's' : '') + ' projected to graduate this season. Each ELC adds $1.5M: ' + U.m(grads.length * 1.5) + ' total.');
    var dead = ros.filter(function (p) { return p.gm && p.r && p.ct === 'BID' && p.surplus < -3; });
    if (dead.length) flags.push('Negative-value contracts: ' + dead.map(function (p) { return ui.plink(p) + ' (' + U.sm(p.surplus) + ')'; }).join(', ') + '.');
    h += '<h3>Cap & contract notes</h3><ul>' + flags.map(function (f) { return '<li class="small">' + f + '</li>'; }).join('') + '</ul>';
    box.innerHTML = h;
  }

  // shared roster table (Team Hub, Players)
  DP.rosterTable = function (el, rows, o) {
    var E = DP.E;
    o = o || {};
    return ui.table(el, {
      rows: rows, sort: o.sort || 'DV', search: function (p) { return p.n + ' ' + p.t + ' ' + (p.gm || ''); }, csv: o.csv || 'players.csv', page: o.page || 60,
      filters: o.filters || [
        { l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (p, v) { return p.slot === v || (v === 'D' && p.fd); } },
        { l: 'Contract', opts: [['', 'All'], ['BID', 'BID'], ['RFA1', 'RFA1'], ['ELC1', 'ELC1'], ['MNR', 'MNR'], ['FA', 'FA']], fn: function (p, v) { return p.ct === v; } }
      ].concat(o.extraFilters || []),
      rowCls: function (p) { return DP.state.team && p.gm === DP.state.team && o.mark !== false ? 'mine' : ''; },
      cols: [
        { k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); }, asc: true },
        { k: 'pos', l: 'Pos', v: function (p) { return p.slot; }, f: function (p) { return ui.pos(p); } },
        o.owner === false ? null : { k: 'gm', l: 'Owner', v: function (p) { return p.gm || 'zz'; }, f: ui.owner },
        { k: 'age', l: 'Age', cls: 'num', v: function (p) { return p.age; }, f: function (p) { return p.age ? U.fmt(p.age, 1) : '–'; } },
        { k: 'ct', l: 'Contract', v: function (p) { return p.ct; }, f: function (p) { return ui.pill(p.ct); } },
        { k: 'sal', l: 'Salary', cls: 'num', v: function (p) { return p.gm ? p.sal26 : null; }, f: function (p) { return p.gm ? U.m(p.sal26) : '–'; } },
        { k: 'thru', l: 'Thru', cls: 'num', title: 'Last season under the current contract', v: function (p) { var i = p.cy.map(function (x) { return typeof x === 'number'; }).lastIndexOf(true); return p.gm ? i : null; }, f: function (p) { var i = p.cy.map(function (x) { return typeof x === 'number'; }).lastIndexOf(true); if (!p.gm || i < 0) return '–'; var nx = p.cy[i + 1]; return E.YEARS[i].slice(5) + (nx === 'RFA' ? ' <span class="small warn">RFA</span>' : nx === 'UFA' ? ' <span class="small muted">UFA</span>' : ''); } },
        { k: 'gp', l: 'GP', cls: 'num', title: 'Projected 2026-27 GP', v: function (p) { return p.projGP; } },
        { k: 'WAR', l: 'WAR', cls: 'num', title: 'Projected 2026-27 category wins above replacement', v: function (p) { return p.r ? p.WAR : null; }, f: function (p) { return p.r ? ui.warCell(p.WAR) : '–'; } },
        { k: 'mkt', l: 'Market', cls: 'num', v: function (p) { return p.mkt; }, f: function (p) { return U.m(p.mkt); } },
        { k: 'sur', l: 'Surplus', cls: 'num', v: function (p) { return p.surplus; }, f: function (p) { return ui.delta(p.surplus, 1); } },
        { k: 'DV', l: 'Dynasty', cls: 'num', title: 'Dynasty value: discounted wins over 7 seasons net of cap cost', v: function (p) { return p.DV; }, f: function (p) { return '<b>' + U.fmt(p.DV, 1) + '</b>'; } },
        { k: 'cgp', l: 'Career GP', cls: 'num', v: function (p) { return p.cgp || 0; }, f: function (p) { return p.ct === 'MNR' ? (p.cgp || 0) + '<span class="faint">/' + p.gradThr + '</span>' : U.fmt(p.cgp || 0); } }
      ].filter(Boolean)
    });
  };
})();
