/* Dynasty Puck HQ - Schedule tools, Injuries & depth, Rules & Methods, Data & updates. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  // ------------------------------------------------------------ Schedule tools
  DP.pages.schedule = {
    title: 'Schedule Tools',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, tab = q.tab || 'heat', me = DP.state.team;
      var h = '<div class="page-head"><h1>Schedule Tools</h1><p class="sub">Real 2026-27 NHL schedule (84 games per team, Sep 29 – Apr 10) mapped onto the league\'s fantasy weeks. With a weekly lineup lock, games per week drive everything.</p></div>';
      h += '<div class="tabs">' + [['heat', 'NHL games per week'], ['sos', 'Fantasy schedule strength'], ['goalie', 'Goalie planner'], ['stream', 'Best pickups by week']].map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="sc-body"></div>';
      el.innerHTML = h;
      U.qsa('[data-tab]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('schedule', null, { tab: b.dataset.tab }); }); });
      var body = U.qs('#sc-body', el), W = E.weeks, teams = Object.keys(E.wg).sort();
      var wkLab = function (w, i) { return w.po ? 'P' + w.po : String(w.n); };
      if (tab === 'heat') {
        var hh = '<p class="small muted">Games per NHL team per fantasy week (P1–P3 = playoff weeks; week 19 spans two weeks around the February break). More intense shading = more games. Hover a cell for dates and back-to-backs.</p><div class="tbl-wrap"><table class="t heat"><thead><tr><th>Team</th>' + W.map(function (w, i) { return '<th class="num" title="' + esc(w.start + ' to ' + w.end) + '">' + wkLab(w, i) + '</th>'; }).join('') + '<th class="num">Tot</th><th class="num" title="Games in the three playoff weeks">PO</th></tr></thead><tbody>';
        teams.forEach(function (t) {
          var g = E.wg[t];
          hh += '<tr><td><b>' + esc(t) + '</b></td>' + g.map(function (x, i) {
            var avg = E.avgWeekGames[i], tt = U.clamp((x - avg + 1.5) / 3, 0, 1);
            return '<td class="hc" style="background:' + C.heat(tt) + ';color:' + C.heatInk(tt) + '" data-tip="' + esc('<div class="tv">' + x + ' games</div><div class="tl">' + t + ' · ' + (W[i].po ? 'Playoffs R' + W[i].po : 'Week ' + W[i].n) + ' · league avg ' + avg.toFixed(1) + (E.b2b[t][i] ? ' · ' + E.b2b[t][i] + ' back-to-back' : '') + '</div>') + '">' + x + '</td>';
          }).join('') + '<td class="num">' + E.sum(g) + '</td><td class="num"><b>' + E.sum(g.slice(E.REG_WEEKS)) + '</b></td></tr>';
        });
        body.innerHTML = hh + '</tbody></table></div>';
      } else if (tab === 'sos') {
        var rows = E.teams.map(function (t) {
          var games = [], exp = [];
          for (var wi = 0; wi < E.NW; wi++) {
            var agg = E.baseline[t][wi];
            games.push(E.sum(agg.lu.F.concat(agg.lu.D).map(function (x) { return E.games(x.p, wi).m; })));
          }
          var opp = DP.meta.h2h.filter(function (m) { return m[1] === t || m[2] === t; }).map(function (m) { return m[1] === t ? m[2] : m[1]; });
          var st = {}; E.expStandings.forEach(function (r) { st[r.t] = r.pct; });
          return { t: t, g: games, reg: E.sum(games.slice(0, E.REG_WEEKS)), po: E.sum(games.slice(E.REG_WEEKS)), opp: E.sum(opp.map(function (o) { return st[o]; })) / opp.length };
        });
        var avgReg = E.sum(rows.map(function (r) { return r.reg; })) / rows.length;
        body.innerHTML = '<p class="small muted">Expected skater-games from each team\'s optimal lineup (games × availability) by week, and the average projected win% of its 24 scheduled opponents. More games = more counting stats; tougher opponents = fewer category wins.</p><div id="sos-t"></div><div class="card" style="margin-top:14px"><h3>Starter games by week</h3><div id="sos-heat"></div></div>';
        ui.table(U.qs('#sos-t', body), {
          rows: rows, sort: 'reg', csv: 'schedule-strength.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
          cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<b>' + esc(U.teamName(r.t)) + '</b>'; } },
            { k: 'reg', l: 'Starter games (reg. season)', cls: 'num', v: function (r) { return r.reg; }, f: function (r) { return U.fmt(r.reg, 0) + ' ' + ui.delta(r.reg - avgReg, 0); } },
            { k: 'po', l: 'Playoff weeks', cls: 'num', v: function (r) { return r.po; }, f: function (r) { return U.fmt(r.po, 0); } },
            { k: 'opp', l: 'Opponent avg win%', cls: 'num', v: function (r) { return r.opp; }, f: function (r) { return U.rate(r.opp); } }]
        });
        var hh2 = '<div class="tbl-wrap"><table class="t heat"><thead><tr><th>Team</th>' + W.map(function (w, i) { return '<th class="num">' + wkLab(w, i) + '</th>'; }).join('') + '</tr></thead><tbody>';
        var all = []; rows.forEach(function (r) { all = all.concat(r.g); });
        var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
        rows.forEach(function (r) { hh2 += '<tr class="' + (r.t === me ? 'mine' : '') + '"><td>' + esc(r.t) + '</td>' + r.g.map(function (x, i) { var tt = (x - lo) / (hi - lo || 1); return '<td class="hc" style="background:' + C.heat(tt) + ';color:' + C.heatInk(tt) + '" data-tip="' + esc('<div class="tv">' + x.toFixed(1) + '</div><div class="tl">' + U.teamName(r.t) + ', week ' + (i + 1) + '</div>') + '">' + Math.round(x) + '</td>'; }).join('') + '</tr>'; });
        U.qs('#sos-heat', body).innerHTML = hh2 + '</tbody></table></div>';
      } else if (tab === 'goalie') {
        var t = q.team || me;
        var gh = '<div class="controls"><label>Team ' + ui.teamSelect('gp-team', t, 'Choose a team…') + '</label></div>';
        if (!t) { body.innerHTML = gh; U.qs('#gp-team', body).addEventListener('change', function (e) { DP.go('schedule', null, { tab: 'goalie', team: e.target.value }); }); return; }
        var gs = E.rosters[t].filter(function (p) { return p.G; }).sort(U.by(function (p) { return p.projGP; }, true));
        gh += '<p class="small muted">League rule: fewer than 2 goalie GP in a week loses all four goalie categories. Expected starts = team games × projected start share (proj GP ÷ 84). The weekly lock means the two goalies you start are fixed for the week. B2B = back-to-backs, when a starter often sits.</p><div class="tbl-wrap"><table class="t"><thead><tr><th>Week</th>' + gs.map(function (p) { return '<th class="num">' + ui.plink(p) + '<br><span class="faint small">' + esc(p.t) + ' · ' + U.pct(p.avail) + ' share</span></th>'; }).join('') + '<th class="num">Starters exp. GP</th><th class="num">P(≥2 GP)</th></tr></thead><tbody>';
        W.forEach(function (w, wi) {
          var agg = E.baseline[t][wi], starters = agg.lu.G.map(function (x) { return x.p.id; });
          gh += '<tr><td>' + (w.po ? 'Playoffs R' + w.po : 'Week ' + w.n) + '</td>' + gs.map(function (p) {
            var g = E.games(p, wi), on = starters.indexOf(p.id) >= 0;
            return '<td class="num" style="' + (on ? 'background:var(--good-bg)' : '') + '">' + g.N + 'G · ' + g.m.toFixed(1) + (E.b2b[p.nt26] && E.b2b[p.nt26][wi] ? ' <span class="badge warn" title="back-to-backs">B2B×' + E.b2b[p.nt26][wi] + '</span>' : '') + '</td>';
          }).join('') + '<td class="num">' + agg.m.GGP.toFixed(1) + '</td><td class="num ' + (agg.r.gFail > 0.1 ? 'bad' : '') + '">' + U.pct(1 - agg.r.gFail) + '</td></tr>';
        });
        body.innerHTML = gh + '</tbody></table></div><p class="small muted">Green = the two goalies the optimizer starts that week.</p>';
        U.qs('#gp-team', body).addEventListener('change', function (e) { DP.go('schedule', null, { tab: 'goalie', team: e.target.value }); });
      } else {
        var wsel = +(q.w || DP.currentWeek()), wi2 = wsel - 1;
        var fas = E.P.filter(function (p) { return !p.gm && p.r && p.nt26; }).map(function (p) { return { p: p, g: E.games(p, wi2), v: E.weeklyValue(p, wi2) }; }).filter(function (x) { return x.g.N > 0; });
        var sh = '<div class="controls"><label>Week <select id="st-w">' + W.map(function (w, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === wsel ? ' selected' : '') + '>' + (w.po ? 'Playoffs R' + w.po : 'Week ' + w.n) + ' · ' + U.date(new Date(w.start + 'T12:00:00Z')) + '</option>'; }).join('') + '</select></label></div>';
        var big = teams.filter(function (t) { return E.wg[t][wi2] >= Math.max(4, Math.ceil(E.avgWeekGames[wi2] + 0.5)); });
        sh += '<p>Teams with a heavy week: ' + (big.map(function (t) { return '<b>' + esc(t) + '</b> (' + E.wg[t][wi2] + ')'; }).join(', ') || '<span class="muted">none above average</span>') + '. League average ' + E.avgWeekGames[wi2].toFixed(1) + ' games.</p><div id="st-t"></div>';
        body.innerHTML = sh;
        U.qs('#st-w', body).addEventListener('change', function (e) { DP.go('schedule', null, { tab: 'stream', w: e.target.value }); });
        ui.table(U.qs('#st-t', body), {
          rows: fas, sort: 'v', csv: 'pickups-week-' + wsel + '.csv', search: function (x) { return x.p.n + ' ' + x.p.t; },
          filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (x, v) { return x.p.slot === v; } }],
          cols: [{ k: 'n', l: 'Free agent', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p); } }, { k: 'pos', l: 'Pos', v: function (x) { return x.p.slot; }, f: function (x) { return ui.pos(x.p); } },
            { k: 'N', l: 'NHL games', cls: 'num', v: function (x) { return x.g.N; } }, { k: 'v', l: 'Week value', cls: 'num', title: 'Expected category-win value this week (lineup units)', v: function (x) { return x.v; }, f: function (x) { return U.fmt(x.v, 2); } },
            { k: 'WAR', l: 'Season WAR', cls: 'num', v: function (x) { return x.p.WAR; }, f: function (x) { return U.fmt(x.p.WAR, 1); } }]
        });
      }
    }
  };

  // ------------------------------------------------------------ Injuries & depth
  DP.pages.injuries = {
    title: 'Injuries & Depth',
    render: function (el) {
      var E = DP.E, R = DP.research || {}, inj = (R.injuries && R.injuries.items) || [], dep = R.depth || null, me = DP.state.team;
      var h = '<div class="page-head"><h1>Injuries & Depth</h1><p class="sub">Preseason injury report and depth notes from public sources, each with a source and date. Owned players are flagged with their Dynasty Puck team.</p></div>';
      if (!inj.length && !dep) { el.innerHTML = h + '<div class="callout warn">Injury research is compiled at build time (tools/research/injuries.json) and will appear here once available.</div>'; return; }
      var norm = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); };
      var idx = {}; E.P.forEach(function (p) { idx[norm(p.n)] = p; });
      inj.forEach(function (x) { x.p = x.id && E.byId[x.id] ? E.byId[x.id] : idx[norm(x.name)]; });
      h += '<div class="card flush"><h2>Injury report</h2><div class="hint">' + esc((R.injuries && R.injuries.note) || '') + ' Compiled ' + esc((R.injuries && R.injuries.updated) || '') + '.</div><div id="inj" style="padding:0 12px 12px"></div></div>';
      if (dep && dep.teams) h += '<div class="card" style="margin-top:14px"><h2>Depth notes: power play & goalie tandems</h2><div class="hint">' + esc(dep.note || '') + ' Compiled ' + esc(dep.updated || '') + '.</div><div id="dep"></div></div>';
      el.innerHTML = h;
      ui.table(U.qs('#inj', el), {
        rows: inj, sort: 'own', search: function (x) { return x.name + ' ' + x.team + ' ' + (x.injury || ''); }, csv: 'injury-report.csv',
        filters: [{ l: 'Show', opts: [['', 'All'], ['owned', 'Owned in league'], ['mine', 'My team']], fn: function (x, v) { return v === 'owned' ? x.p && x.p.gm : x.p && x.p.gm === me; } }],
        rowCls: function (x) { return x.p && x.p.gm === me && me ? 'mine' : ''; },
        cols: [{ k: 'name', l: 'Player', v: function (x) { return x.name; }, f: function (x) { return x.p ? ui.plink(x.p) : esc(x.name); } }, { k: 'team', l: 'NHL', v: function (x) { return x.team; } },
          { k: 'own', l: 'League', v: function (x) { return x.p && x.p.gm ? x.p.gm : 'zz'; }, f: function (x) { return x.p ? ui.owner(x.p) : '<span class="faint">–</span>'; }, asc: true },
          { k: 'status', l: 'Status', v: function (x) { return x.status; }, f: function (x) { return '<span class="badge ' + (/out|ir|lt/i.test(x.status) ? 'bad' : 'warn') + '">' + esc(x.status) + '</span>'; } },
          { k: 'injury', l: 'Injury', v: function (x) { return x.injury; } }, { k: 'ret', l: 'Expected return', v: function (x) { return x.ret || ''; } },
          { k: 'war', l: 'WAR', cls: 'num', v: function (x) { return x.p ? x.p.WAR : null; }, f: function (x) { return x.p && x.p.r ? U.fmt(x.p.WAR, 1) : '–'; } },
          { k: 'src', l: 'Source', v: null, f: function (x) { return '<span class="small">' + (x.url ? '<a target="_blank" rel="noopener" href="' + esc(x.url) + '">' + esc(x.source || 'link') + '</a>' : esc(x.source || '')) + (x.date ? ' · ' + esc(x.date) : '') + '</span>'; } }]
      });
      if (dep && dep.teams) {
        U.qs('#dep', el).innerHTML = '<div class="grid g3">' + Object.keys(dep.teams).sort().map(function (t) {
          var d = dep.teams[t], nm = function (n) { var p = idx[norm(n)]; return p ? ui.plink(p) + (p.gm ? ' <span class="faint small">' + esc(p.gm) + '</span>' : '') : esc(n); };
          return '<div class="card"><h3>' + esc(t) + '</h3>' + (d.pp1 ? '<p class="small"><b>PP1:</b> ' + d.pp1.map(nm).join(', ') + '</p>' : '') + (d.pp2 ? '<p class="small"><b>PP2:</b> ' + d.pp2.map(nm).join(', ') + '</p>' : '') + (d.goalies ? '<p class="small"><b>Goalies:</b> ' + d.goalies.map(nm).join(' / ') + '</p>' : '') + (d.note ? '<p class="small muted">' + esc(d.note) + '</p>' : '') + (d.url ? '<p class="small"><a target="_blank" rel="noopener" href="' + esc(d.url) + '">source</a></p>' : '') + '</div>';
        }).join('') + '</div>';
      }
    }
  };

  // ------------------------------------------------------------ Rules & Methods
  DP.pages.rules = {
    title: 'Rules & Methods',
    render: function (el) {
      var E = DP.E, M = DP.meta, R = E.RULES, f = E.fitLeagueLens();
      var sig = E.CATS.map(function (c, i) { return '<tr><td><b>' + esc(c.l) + '</b></td><td>' + esc(c.name) + '</td><td class="num">' + (c.ratio ? E.sigTeamMu[i].toFixed(3) : U.fmt(E.sigTeamMu[i], 1)) + '</td><td class="num">' + (c.ratio ? E.SIG[i].toFixed(3) : U.fmt(E.SIG[i], 1)) + '</td><td class="num">' + (E.W8[c.k] < 0.01 ? E.W8[c.k].toFixed(4) : E.W8[c.k].toFixed(3)) + '</td></tr>'; }).join('');
      var h = '<div class="page-head"><h1>Rules & Methods</h1><p class="sub">League rules as this app understands them, how every number is calculated, where the data comes from, and every assumption. If something here is wrong, tell the commissioner and it gets fixed at the source.</p></div>';
      h += '<div class="grid g2"><div class="card"><h2>League rules (as modeled)</h2><ul>' +
        '<li>14 teams, Fantrax head-to-head <b>categories</b>, 15 per week. Skaters: Pt-D (points by defensemen), G, A, 2G+A, PIM, SOG, STP (PPP+SHP), Hit, Blk, Tk (takeaways), Cor (Corsi). Goalies: W, GAA (lower wins), SV%, SHO.</li>' +
        '<li>Each week yields a category W-L-T record; <b>season standings = total category W-L-T</b> (ties count half for win%).</li>' +
        '<li>Lineups <b>lock weekly</b>: 12 F / 6 D / 2 G starters + 3 bench. Only starters count. MNR players can be started.</li>' +
        '<li><b>Goalie minimum:</b> fewer than ' + R.goalieMinGP + ' goalie GP in a week loses all four goalie categories (commissioner, 2026-09-25). If both teams miss, both take the losses (assumption).</li>' +
        '<li>Schedule: the real 2026-27 Fantrax H2H schedule, 24 regular-season periods (period 19 spans Feb 1–14). <b>Playoffs: 8 teams, no byes; the two division winners are seeds 1-2</b>, everyone else by category win% (commissioner, 2026-09-26): 1v8, 4v5, 3v6, 2v7 (Mar 22–28), then winners meet (Mar 29–Apr 4), final Apr 5–10. A tied playoff matchup goes to the higher seed (assumption).</li>' +
        '<li><b>Cap by season:</b> ' + E.YEARS.map(function (y, i) { return y.slice(2) + ' $' + E.capY(i) + 'M'; }).join(', ') + '. ' + esc(DP.meta.capNote || '') + ' Contracts: BID, RFA1, ELC1 ($' + R.elcSalary + 'M), MNR ($0), FA. Minimum salary $' + R.minSalary + 'M. The market price of a win is scaled with the cap each season.</li>' +
        '<li><b>Auction (UFA bidding):</b> the winning bid sets the term. 2026 and 2027 offseasons ($104M bands): $1.0-2.9M 1 yr · $3.0-4.4M 2 · $4.5-7.4M 3 · $7.5-9.9M 4 · $10.0-13.9M 5 · $14.0M+ 6. 2025 initial auction ($95.5M): $1-2.49M 1 · $2.5-3.99M 2 · $4-6.49M 3 · $6.5-8.99M 4 · $9-12.5M 5 · $12.5M+ 6. These bands stay in place (no scaling with the cap) until the commissioner adds a new set in config/league.json.</li>' +
        '<li><b>When an ELC is up:</b> release (UFA) · 2 yrs $2.5M · 3 yrs $4.0M · 4 yrs $5.5M · 5 yrs $7.0M · 6 yrs $9.0M · or one more ELC year at $1.75M, after which he forfeits RFA status and goes to the auction.</li>' +
        '<li><b>When a post-ELC RFA contract is up:</b> if he is under 27 on June 30 he can be re-signed for 2-6 years at a 1.5x premium (2-4 yrs) or 1.75x (5-6 yrs) on the base, and the base can\'t go down (e.g. a 2-yr $2.5M deal becomes 2 yrs $3.75M or 6 yrs $15.75M; a 6-yr $9M base stays $9M × premium). Or accept an offer sheet, or drop to the auction. 27 or older: straight to the auction.</li>' +
        '<li><b>Auction-contract RFAs</b> (BID deals and the RFA1 deals signed off them, e.g. Neighbours, Peterka): the constitution\'s premium rule doesn\'t apply; they are priced with the league sheet formula from this past summer (S = salary): 1yr S+1, 2yr 1.5S+1, 3yr 1.5S+2, 4yr 1.5S+3, 5yr 1.75S+4, 6yr 1.75S+5. The contract sheet\'s 2027 tab drafts a +$1.5M version; the final numbers are still to be set (commissioner, 2026-09-26).</li>' +
        '<li><b>Offer sheets:</b> for post-ELC RFAs, other teams can submit offers and trade packages for his rights; there is no set compensation.</li>' +
        '<li><b>Hometown discount:</b> a team that had the player on its roster continuously from the trade deadline to the end of the season pays ' + Math.round((R.htdPct || 0.1) * 100) + '% less than its winning bid at the auction; the bid still sets the term (e.g. a $3.1M bid is a 2-year band, paid $2.79M, like Evangelista).' + (E.deadlineText() ? ' Trade deadline: <b>' + esc(E.deadlineText()) + '</b>.' : ' Until the trade deadline date is set, the current owner is assumed eligible.') + '</li>' +
        '<li><b>ELCs:</b> ' + esc(R.elcNote || '') + ' The model uses 2 years at $' + R.elcSalary + 'M.</li>' +
        '<li><b>How the model decides:</b> at every ELC/RFA expiry it prices each option, projects the player\'s market value (projected WAR × $/win at that season\'s cap), keeps the option with the best discounted surplus, or lets him walk if none is positive.</li>' +
        (R.irCapExempt !== false ? '<li><b>Injured reserve:</b> a player in an IR slot in Fantrax doesn\'t count against the current season\'s cap. Moving him back to the active roster puts his salary back on the cap, so you need the room. Future seasons still count.</li>' : '') +
        '<li><b>Dead cap:</b> dropping a BID, RFA1 or ELC contract keeps 50% of its salary for every remaining contract season; dropping an FA contract costs nothing. Existing penalties are on the Contracts & Cap page.</li>' +
        '<li><b>MNR graduation:</b> career NHL regular-season GP ≥ ' + R.gradSkater + ' (skaters) / ' + R.gradGoalie + ' (goalies), from the NHL API career totals (goalies included). ' + esc(R.gradNote || '') + ' The ELC is ' + (R.elcYears || 2) + ' years at $' + R.elcSalary + 'M. One not graduated by the end of the regular season stays at $0.</li>' +
        '<li><b>League draft:</b> 3 rounds; picks exist through 2029, and a new year is added after each draft. Order = reverse standings (worst picks 1st, champion 14th). Ownership is replayed from the trade log.</li></ul></div>';
      h += '<div class="card"><h2>Data sources</h2><ul>' + M.sources.map(function (s) { return '<li>' + esc(s.name) + (s.url ? ' · <a target="_blank" rel="noopener" href="' + esc(s.url) + '" style="word-break:break-all">' + esc(s.url.replace(/^https:\/\//, '').replace(/\?.*$/, '')) + '</a>' : ' · <code>' + esc(s.file) + '</code>') + '</li>'; }).join('') +
        '<li>League trade history (Fantrax export, Nov 2025 – Aug 2026), 2025 initial rookie & minors draft, 2026 rookie draft.</li>' +
        '<li>2026 pre-draft scouting notes: prospect-app/draft_2026.csv (old Prospect app).</li>' +
        '<li>2027–2029 draft boards, injuries and depth notes: public web research (sources listed on each row).</li></ul>' +
        '<p class="small muted">Data built ' + esc(M.built) + '. Fantrax 2025-26 stats were cross-checked against the NHL API (G, A, STP, Tk match 100%; PIM/SOG/Hit/Blk ≥ 99.5%). The build report (tools/build_report.txt) lists every mismatch, such as players newer than the contract sheet.</p></div>';
      h += '<div class="card span2"><h2>How the numbers are made</h2>' +
        '<h3>1 · Projections</h3><p>2026-27 per-game rates = Fantrax 2026-27 projection ÷ projected GP. Fantrax projects <b>Tk and Cor as 0</b>, so this app projects them:</p><ul>' +
        '<li><b>Cor:</b> Fantrax "Cor" is not the NHL\'s 5-on-5 SAT differential. Fitted on 2025-26: Fantrax Cor ≈ ' + M.corModel[0] + ' × SAT(5v5) + ' + M.corModel[1] + ' × PP minutes ' + (M.corModel[2] < 0 ? '− ' + Math.abs(M.corModel[2]) : '+ ' + M.corModel[2]) + ' × SH minutes ' + (M.corModel[3] < 0 ? '− ' + Math.abs(M.corModel[3]) : '+ ' + M.corModel[3]) + ' × GP (R² 0.975). This translates 2022-23 to 2024-25 NHL data into Fantrax-equivalent Cor.</li>' +
        '<li><b>Tk</b> = NHL takeaways (matches Fantrax exactly).</li>' +
        '<li>Per-GP rate = Marcel-style blend (weights 1.0 / 0.8 / 0.6 for 2025-26 / 24-25 / 23-24), shrunk toward a <b>role prior</b> (regression of Tk/GP and Cor/GP on G, A, SOG, Hit, Blk, PIM, STP per game, by F/D) with k = 30 GP (Tk) and 40 GP (Cor). Projection = rate × projected GP.</li></ul>' +
        '<h3>2 · Weekly model</h3><p>Expected games = NHL games that fantasy week × availability (projected GP ÷ 84). Variance per game uses dispersion (variance ÷ mean): G/A/STP/Pt-D 1.0, SOG 1.2, Hit 1.5, Blk 1.3, Tk 1.2, PIM 3.0; Cor variance 34 per game; 2G+A variance = 4·var(G)+var(A); plus the variance of games played. Goalies: W and SHO per start, GA = GAA per game, SA = GA ÷ (1−SV%); team GAA and SV% use the delta method. Goalie GP is a sum of binomials, used for the 2-GP minimum.</p>' +
        '<p><b>Weekly lock optimizer:</b> each week, pick the best 12F/6D/2G by weekly category value, where one unit of a stat is worth φ(0)/σ<sub>c</sub> category wins (dual F/D players can fill either slot). <b>Win probability:</b> normal approximation of the weekly difference with a ±0.5 continuity correction for counts (so ties are possible); ratio categories have no ties.</p>' +
        '<div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th>Meaning</th><th class="num">Avg team / week</th><th class="num">σ weekly diff</th><th class="num">Wins per unit</th></tr></thead><tbody>' + sig + '</tbody></table></div>' +
        '<h3>3 · Player value: WAR in category wins</h3><p>WAR = expected <b>season category wins above replacement</b>: Σ over categories of (season total − replacement total) × φ(0)/σ<sub>c</sub>. Goalie GAA and SV% contributions are scaled by each goalie\'s share of a team\'s goalie games. Replacement = the average of the ' + E.repl.F.n + ' forwards past the ' + E.repl.F.cut + '-starter cutoff (' + E.repl.D.n + ' D past ' + E.repl.D.cut + ', ' + E.repl.G.n + ' G past ' + E.repl.G.cut + ').</p>' +
        '<p><b>$ per WAR = ' + U.m(E.dollarPerWAR, 3) + '</b>: league salary spent above the $1M minimum on BID/RFA1/FA/ELC contracts ÷ their positive WAR. Market value = $1M + WAR × $/WAR. Surplus = market − salary.</p>' +
        '<h3>4 · Dynasty value</h3><p>For each season 2026-27 → 2032-33: projected WAR (age curves: forwards peak 25-27, D 26-29, G 27-31, faster decline after 31-33; growth capped at 1.8×) and contract cost under the league rules (current deal → at each ELC/RFA expiry the option with the best projected surplus, or release → UFA ends control; 27+ on June 30 means no RFA rights; MNR at $0 through the season they graduate, then a 2-year $1.5M ELC from the next offseason). Season value = WAR − λ × (cost − $1M) ÷ $/WAR (with $/WAR scaled to that season\'s cap), with λ = ' + E.LAMBDA + '. Teams decline bad RFA prices, and a bad contract can be cut for 50% dead cap. Dynasty value = Σ discount<sup>year</sup> × season value, discount ' + E.DISCOUNT + '. During the season, 2026-27 counts only the share of NHL games still ahead of the next lineup lock (now ' + U.pct(E.remFrac(), 0) + '), so a veteran\'s value falls as the season runs out while a prospect\'s barely moves.</p>' +
        '<p><b>Prospects:</b> peak scoring = 55% age-adjusted NHLe (league factors: AHL .389, KHL .77, SHL .57, Liiga .44, NCAA .19, OHL/WHL .14, QMJHL .11, USHL .09, J20 .05, plus approximate values for other leagues) × (1 + 0.5 per year younger than 22) + 45% draft-slot prior. That peak is translated to WAR over a lognormal spread of outcomes (upside matters), × P(becoming an NHL regular) by draft slot, starting at an ETA based on league and age.</p>' +
        '<h3>5 · Draft picks & trades</h3><p>Pick value = today\'s dynasty value of the player the league actually took at that slot in the 2026 rookie draft (smoothed, non-increasing), averaged over the team\'s simulated 2027 draft-slot distribution (later years regress toward an average slot), discounted per year. <b>League-implied lens:</b> a grid search over cap weight, patience, pick weight and win-now weight finds the setting under which the league\'s ' + f.n + ' real trades look most even: cap ' + Math.round(f.lam * 100) + '%, discount ' + Math.round((1 - f.disc) * 100) + '%/yr, picks ×' + f.pick + ', this season ×' + f.now + '.</p>' +
        '<p><b>Market value vs team context.</b> Market value (the lenses) is the same for every team. <b>Use value</b> is what a deal is worth to one team: in 2026-27, the change in its expected category wins with weekly lineups re-optimised (so depth, position and category needs count: a 13th forward adds little, a missing third goalie a lot); in later seasons, the change in its best projected 12 F / 6 D / 2 G; each season minus the cap cost (λ) and multiplied by the team\'s <b>win-now weight</b>; picks at market value. Win-now weight: in the season sim, title odds behave like a softmax of team strength, so the value of one more category win is proportional to p(1 − p) (p = title odds). Relative to the league average that is steep for the few real contenders and near zero for everyone else; a floor of ×' + E.CONTEND.floor + ' keeps some credit because this-season production can be flipped at the deadline. Later seasons use the same curve on each roster\'s projected strength (softmax slope fitted to this season\'s sim, currently ' + U.fmt(E.contention()._beta, 3) + ' per WAR), keeping ' + Math.round(E.CONTEND.shrink * 100) + '% of the gap to ×1 for next season (' + Math.round(E.CONTEND.shrink * E.CONTEND.shrink * 100) + '% the season after) because rosters turn over. Status: contender ≥ ×' + E.CONTEND.contender + ', bubble ≥ ×' + E.CONTEND.bubble + ', otherwise not contending. The Trade Finder ranks deals by min(your gain, their gain) + ¼ × (sum), among deals close in market value; Team Hub buy/sell lists show the biggest value gaps. It ignores that extra wins cost a bad team draft position.</p>' +
        '<h3>6 · Simulations</h3><p>Season sim: every category of every weekly matchup is drawn from its projected distribution (G and A drawn separately so 2G+A stays consistent; goalie GP drawn for the minimum rule), plus a season-long team strength shock (±3.5% default) for projection error and injuries. Standings by category win%; the 8-team bracket is simulated in weeks 25-27. MNR graduation week = the week expected cumulative NHL GP (team games × availability) reaches the threshold; P(graduate) treats projected GP as normal with SD 30% + 4.</p>' +
        '<h3>Known limits</h3><ul><li>Projections are Fantrax\'s; the app does not re-project goals or assists.</li><li>No in-season injuries beyond the season-level noise; weekly lineups assume healthy players unless you remove them in the Matchup page.</li><li>Caps after 2028-29 are held at $127.5M (no published projection); 2026-27 cap transfers ("Salary Cap: $X" in old trades) are not applied.</li><li>Six $1M BID signings aren\'t on the contract sheet; the $104M auction bands make any $1.0-2.9M bid a 1-year deal.</li><li>Projected auction prices are calibrated on one auction (2026, 62 players, no true stars), so treat them as a rough guide, especially for stars.</li></ul></div></div>';
      el.innerHTML = h;
    }
  };

  // ------------------------------------------------------------ Data & updates
  var OV_KEY = 'overrides_v1';
  DP.applyOverrides = function () {
    var ov = U.store.get(OV_KEY, null), E = DP.E;
    if (!ov) return false;
    var byId = {}; DP.players.forEach(function (p) { byId[p.id] = p; });
    Object.keys(ov.players || {}).forEach(function (id) {
      var o = ov.players[id], p = byId[id];
      if (!p) return;
      if (o.gm !== undefined) p.gm = o.gm || null;
      if (o.wv !== undefined) p.wv = o.wv;
      if (o.ct) p.ct = o.ct;
      if (o.sal !== undefined) { p.sal = o.sal; if (p.c && p.c.y && typeof p.c.y[0] === 'number' && p.gm) p.c.y[0] = o.sal / 1e6; }
      if (o.s25) p.s25 = o.s25;
      if (o.p26) p.p26 = o.p26;
    });
    if (ov.h2h) DP.meta.h2h = ov.h2h;
    E.init();
    DP.overrideInfo = ov;
    return true;
  };

  DP.pages.data = {
    title: 'Data & Updates',
    render: function (el) {
      var E = DP.E, ov = DP.overrideInfo;
      var h = '<div class="page-head"><h1>Data & Updates</h1><p class="sub">Refresh the app during the season without waiting for a rebuild: drop new Fantrax CSV exports here. Changes stay in <b>this browser only</b> (for everyone, the commissioner runs the build; see below).</p></div>';
      if (ov) h += '<div class="callout warn">Using your uploaded data from ' + esc(ov.when) + ' (' + esc(ov.what.join(', ')) + '). <button class="btn sm" id="ov-reset">Reset to published data</button></div>';
      h += '<div class="card" style="margin-bottom:14px" id="fx-panel">' + (DP.live ? DP.live.panel() : '') + '<p class="small muted">Rosters, contracts, salaries, lineup slots, standings and future picks come straight from Fantrax: every night into the published data (a GitHub Action), and again live each time the app opens. The CSV upload below is only needed for projections and stats.</p></div>';
      h += '<div class="grid g2"><div class="card"><h2>1 · Drop Fantrax CSVs</h2><div class="hint">Fantrax → Players → (Skaters or Goalies) → export CSV. Choose what the file contains, then drop it. Rosters, contracts and salaries update from the Status/Contract/Salary columns.</div>' +
        '<div class="controls"><label>This file is <select id="up-kind"><option value="p26">2026-27 projections</option><option value="s25">2025-26 season stats</option><option value="roster">Rosters & salaries only</option></select></label></div>' +
        '<div class="drop" id="drop" tabindex="0" role="button" aria-label="Drop CSV files or click to choose">Drop Fantrax CSV files here or <u>click to choose</u><input type="file" id="up-file" accept=".csv" multiple hidden></div><div id="up-log" class="small" style="margin-top:8px"></div></div>';
      h += '<div class="card"><h2>2 · Paste the H2H schedule</h2><div class="hint">Copy the Fantrax schedule page (League → Schedule) and paste it here, in the same format the commissioner used. Team names are matched to GMs.</div><textarea id="sch-text" placeholder="Scoring Period 1&#10;(Tue Sep 29, 2026 - Sun Oct 4, 2026)&#10;nebsnave&#10;vs&#10;Worcester Gators&#10;…"></textarea><div class="controls" style="margin-top:8px"><button class="btn" id="sch-apply">Apply schedule</button><span id="sch-log" class="small"></span></div></div>';
      h += '<div class="card"><h2>3 · Export</h2><p>Download the current model (projections, values, contracts) as CSV for spreadsheets.</p><button class="btn" id="exp-all">⬇ All players (values)</button> <button class="btn" id="exp-json">⬇ Raw data (JSON)</button></div>';
      h += '<div class="card"><h2>For the commissioner: full rebuild</h2><ol class="small"><li>Put new exports in <code>raw/2026-27/</code> (same file names), the contract sheet as <code>Contract Sheet 2026-27.xlsx</code>, trades in <code>raw/2026-27/league/</code>.</li><li>Run <code>UPDATE_DATA.bat</code> (Windows) or <code>python tools/build_data.py</code>. It fetches NHL data (cached in tools/cache), rebuilds <code>data/*.js</code> and writes <code>tools/build_report.txt</code> with the sanity checks.</li><li>Commit and push to <code>main</code>; GitHub Pages redeploys in about a minute.</li></ol><p class="small muted">Build: ' + esc(DP.meta.built) + ' · ' + E.P.length + ' players · engine init ' + E.initMs + ' ms.</p></div></div>';
      el.innerHTML = h;
      var rs = U.qs('#ov-reset', el); if (rs) rs.addEventListener('click', function () { U.store.del(OV_KEY); location.reload(); });
      var drop = U.qs('#drop', el), file = U.qs('#up-file', el), logEl = U.qs('#up-log', el);
      drop.addEventListener('click', function () { file.click(); });
      drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') file.click(); });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
      drop.addEventListener('drop', function (e) { handle(e.dataTransfer.files); });
      file.addEventListener('change', function () { handle(file.files); });
      function handle(files) {
        var kind = U.qs('#up-kind', el).value;
        Array.prototype.forEach.call(files, function (f) {
          var rd = new FileReader();
          rd.onload = function () {
            try {
              var rows = U.parseCSV(rd.result), res = ingest(rows, kind);
              logEl.innerHTML += '<div>✓ ' + esc(f.name) + ': ' + res + '</div>';
            } catch (err) { logEl.innerHTML += '<div class="bad">✗ ' + esc(f.name) + ': ' + esc(err.message) + '</div>'; }
          };
          rd.readAsText(f);
        });
      }
      function num(x) { var v = parseFloat(String(x || '').replace(/[,%$]/g, '')); return isNaN(v) ? 0 : v; }
      function ingest(rows, kind) {
        if (!rows.length || !rows[0].ID) throw new Error('not a Fantrax player export (no ID column)');
        var goalie = rows[0].W !== undefined && rows[0]['Pt-D'] === undefined;
        var ov2 = U.store.get(OV_KEY, null) || { players: {}, what: [], when: '' };
        var byId = {}; DP.players.forEach(function (p) { byId[p.id] = p; });
        var n = 0, rosterChanges = 0;
        rows.forEach(function (r) {
          var p = byId[r.ID]; if (!p) return;
          var o = ov2.players[r.ID] || {};
          var st = (r.Status || '').trim(), wv = /small|^W </.test(st), gm = st === 'FA' || wv ? null : st;
          if (gm !== p.gm) rosterChanges++;
          o.gm = gm; o.wv = wv ? 1 : 0; o.ct = (r.Contract || p.ct).trim(); o.sal = num(r.Salary);
          if (kind !== 'roster') {
            var arr = goalie ? ['GP', 'W', 'GAA', 'SV%', 'SHO'].map(function (k) { return num(r[k]); }) : ['GP', 'Pt-D', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'].map(function (k) { return num(r[k]); });
            if (kind === 'p26' && !goalie && arr[9] === 0 && arr[10] === 0) { arr[9] = p.p26[9] / Math.max(1, p.p26[0]) * arr[0]; arr[10] = p.p26[10] / Math.max(1, p.p26[0]) * arr[0]; }
            o[kind] = arr;
          }
          ov2.players[r.ID] = o; n++;
        });
        ov2.what = U.uniq(ov2.what.concat([(goalie ? 'goalies ' : 'skaters ') + kind]));
        ov2.when = new Date().toLocaleString();
        U.store.set(OV_KEY, ov2);
        DP.applyOverrides(); DP._ts = null; DP.simCache = null;
        return n + ' players matched, ' + rosterChanges + ' roster changes. Model recomputed.' + (kind === 'p26' && !goalie ? ' Tk/Cor rates carried over from the build (Fantrax projects them as 0).' : '');
      }
      U.qs('#sch-apply', el).addEventListener('click', function () {
        var txt = U.qs('#sch-text', el).value, games = [], cur = null, names = {};
        DP.meta.gms.forEach(function (g) { names[g.name.toLowerCase()] = g.code; names[g.code.toLowerCase()] = g.code; });
        var lines = txt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean), pend = [];
        lines.forEach(function (l) {
          var m = l.match(/^Scoring Period (\d+)/i);
          if (m) { cur = +m[1]; pend = []; return; }
          if (/^Playoffs/i.test(l)) { cur = null; return; }
          if (!cur) return;
          if (/ vs /i.test(l)) { var ab = l.split(/ vs /i); pend = [ab[0], ab[1]]; }
          else if (names[l.toLowerCase()]) pend.push(l);
          if (pend.length === 2) { var a = names[pend[0].toLowerCase()], b = names[pend[1].toLowerCase()]; if (a && b) games.push([cur, a, b]); pend = []; }
        });
        var log2 = U.qs('#sch-log', el);
        if (games.length < 50) { log2.innerHTML = '<span class="bad">Only ' + games.length + ' matchups recognized. Check the format.</span>'; return; }
        var ov3 = U.store.get(OV_KEY, null) || { players: {}, what: [], when: '' };
        ov3.h2h = games; ov3.what = U.uniq(ov3.what.concat(['H2H schedule'])); ov3.when = new Date().toLocaleString();
        U.store.set(OV_KEY, ov3); DP.applyOverrides(); DP._ts = null; DP.simCache = null;
        log2.innerHTML = '<span class="good">✓ ' + games.length + ' matchups applied.</span>';
      });
      U.qs('#exp-all', el).addEventListener('click', function () {
        var cols = [{ l: 'Fantrax ID', v: function (p) { return p.id; } }, { l: 'NHL ID', v: function (p) { return p.nhl || ''; } }, { l: 'Player', v: function (p) { return p.n; } }, { l: 'NHL team', v: function (p) { return p.t; } }, { l: 'Pos', v: function (p) { return p.slot; } }, { l: 'Owner', v: function (p) { return p.gm || 'FA'; } }, { l: 'Contract', v: function (p) { return p.ct; } }, { l: 'Salary $M', v: function (p) { return p.sal26; } }, { l: 'Age', v: function (p) { return p.age; } }, { l: 'Proj GP', v: function (p) { return p.projGP; } }, { l: 'Proj Tk', v: function (p) { return p.G ? '' : p.p26[9]; } }, { l: 'Proj Cor', v: function (p) { return p.G ? '' : p.p26[10]; } }, { l: 'WAR', v: function (p) { return p.WAR; } }, { l: 'Market $M', v: function (p) { return p.mkt; } }, { l: 'Surplus $M', v: function (p) { return p.surplus; } }, { l: 'Dynasty value', v: function (p) { return p.DV; } }, { l: 'Career NHL GP', v: function (p) { return p.cgp || 0; } }];
        U.download('dynasty-puck-model.csv', U.csv(E.P, cols));
      });
      U.qs('#exp-json', el).addEventListener('click', function () { U.download('dynasty-puck-data.json', JSON.stringify({ meta: DP.meta, players: DP.players, league: DP.league }), 'application/json'); });
    }
  };
})();
