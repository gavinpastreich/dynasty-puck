/* Dynasty Puck HQ - in-season tools: IR activation check, trade deadline hub, playoff picture, commissioner checks. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  // ------------------------------------------------------------ IR activation check
  // Players in an IR slot don't count against this season's cap, so bringing one back adds his salary back. Most teams
  // also have all 23 Active + Bench spots full, so activating someone means moving someone else out too.
  // how many of the regular-season weeks still to lock each player starts in the optimal lineup; _n = weeks counted
  DP.lineupUsage = function (team) {
    var E = DP.E, from = E.lockWeek(), st = { _n: 0 };
    if (from === null) from = E.REG_WEEKS;
    for (var wi = from; wi < E.REG_WEEKS; wi++) {
      var lu = E.baseline[team][wi].lu; st._n++;
      lu.F.concat(lu.D, lu.G).forEach(function (x) { st[x.p.id] = (st[x.p.id] || 0) + 1; });
    }
    return st;
  };
  DP.irCheck = function (team) {
    var E = DP.E, ros = E.rosters[team] || [], c0 = E.teamCap(team)[0], space = c0.space, wi = E.lockWeek();
    var lim = ((DP.league.fantrax || {}).roster || {}).maxTotalPlayers || 23;
    var onRoster = ros.filter(function (p) { return p.fs === 'A' || p.fs === 'R'; });
    var asOf = ((DP.research || {}).injuries || {}).updated || null, pct = E.RULES.deadCapPct || 0.5;
    var hurt = function (p) { return p.inj && /OUT|IR|Injured/i.test(p.inj[0]) && !p.inj[4]; };
    var rows = ros.filter(function (p) { return p.fs === 'IR'; }).map(function (p) {
      var add = E.offCap(p) === 'IR' ? p.sal26 || 0 : 0;
      var st = !p.inj ? 'healthy' : /DTD|day-to-day|GTD|game-time/i.test(p.inj[0] + ' ' + p.inj[2]) ? 'soon' : 'out';
      return { p: p, add: add, after: space - add, st: st, g: wi !== null ? E.games(p, wi).N || 0 : null };
    }).sort(function (a, b) { return (a.st === 'healthy' ? 0 : a.st === 'soon' ? 1 : 2) - (b.st === 'healthy' ? 0 : b.st === 'soon' ? 1 : 2) || b.p.WAR - a.p.WAR; });
    // ways to make room: an injured player still on the active roster can go to IR (frees his salary and a spot);
    // otherwise the least-used salaried players: sent to a Minors slot (off this season's cap, if he's eligible) or dropped
    var toIR = onRoster.filter(hurt).map(function (p) { return { p: p, free: p.sal26 || 0 }; });
    var usage = DP.lineupUsage ? DP.lineupUsage(team) : null;
    var low = onRoster.filter(function (p) { return !hurt(p) && p.ct !== 'MNR' && (p.sal26 || 0) > 0; }).map(function (p) {
      var dead = E.deadCapCounts(p) ? pct : 0;
      return { p: p, minors: p.sal26, drop: p.sal26 * (1 - dead), dead: p.sal26 * dead, use: usage ? usage[p.id] || 0 : null, of: usage ? usage._n : null };
    }).sort(function (a, b) { return (a.p.DV || 0) - (b.p.DV || 0) || (a.use === null ? 0 : a.use - b.use); }).slice(0, 4); // cheapest to lose first (dynasty value)
    return { team: team, space: space, n: onRoster.length, lim: lim, full: onRoster.length >= lim, rows: rows, toIR: toIR, low: low, asOf: asOf, wi: wi,
      all: space - E.sum(rows.map(function (r) { return r.add; })) };
  };
  function statusText(r, asOf) {
    var p = r.p;
    if (r.st === 'healthy') return '<span class="badge warn">not on the injury report</span> <span class="small muted">' + (asOf ? 'Daily Faceoff, ' + esc(U.date(new Date(asOf + 'T12:00:00Z'))) : '') + ': may be healthy</span>';
    var ret = p.inj[2] ? ' · ' + esc(p.inj[2]) : '';
    return '<span class="badge ' + (r.st === 'soon' ? 'warn' : 'bad') + '">' + esc(p.inj[0]) + '</span> <span class="small muted">' + esc(p.inj[1] || '') + ret + ' · listed ' + esc(U.date(new Date(p.inj[3] + 'T12:00:00Z'))) + '</span>';
  }
  DP.irCard = function (team) {
    var X = DP.irCheck(team); if (!X.rows.length) return '';
    var h = '<div class="card span2" id="tj-ir"><h2>🩹 IR slots and the cap</h2><div class="hint">Players in an IR slot in Fantrax don\'t count against the 2026-27 cap; activating one adds his salary back. ' +
      'Cap space now <b>' + U.m(X.space) + '</b>. Status from Daily Faceoff\'s injury lists' + (X.asOf ? ' (' + esc(U.date(new Date(X.asOf + 'T12:00:00Z'))) + ')' : '') + '.</div>';
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Player</th><th>Status</th><th class="num">Salary</th><th class="num">Space if activated</th>' + (X.wi !== null ? '<th class="num">Games wk ' + DP.E.weeks[X.wi].n + '</th>' : '') + '</tr></thead><tbody>' +
      X.rows.map(function (r) {
        return '<tr><td>' + ui.pcell(r.p, { pos: 1, team: true }) + '</td><td>' + statusText(r, X.asOf) + '</td><td class="num">' + U.m(r.p.sal26) + '</td><td class="num ' + (r.after < 0 ? 'bad' : '') + '"><b>' + U.m(r.after) + '</b>' + (r.after < 0 ? ' over' : '') + '</td>' + (X.wi !== null ? '<td class="num">' + r.g + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
    if (X.rows.length > 1) h += '<p class="small">Activating all ' + X.rows.length + ' leaves <b class="' + (X.all < 0 ? 'bad' : '') + '">' + U.m(X.all) + '</b> of space.</p>';
    if (X.full) {
      h += '<p class="small"><b>Roster:</b> ' + X.n + ' of ' + X.lim + ' Active + Bench spots are used, so activating anyone also means moving someone out.</p><ul class="small" style="margin:4px 0 0;padding-left:18px">';
      X.toIR.forEach(function (o) { h += '<li>' + ui.plink(o.p) + ' is injured (' + esc(o.p.inj[0]) + ') but on the active roster: moving him to IR frees a spot and ' + U.m(o.free) + ' of cap.</li>'; });
      X.low.forEach(function (o) {
        h += '<li>' + ui.plink(o.p) + ' (' + esc(o.p.ct) + ' ' + U.m(o.p.sal26) + (o.use !== null && o.of ? ', starts ' + o.use + ' of the ' + o.of + ' weeks left in the optimal lineup' : '') + '): a Minors slot (if Fantrax lets him) takes ' + U.m(o.minors) + ' off this season\'s cap; dropping him frees ' + U.m(o.drop) + (o.dead ? ' (' + U.m(o.dead) + ' stays as dead cap every remaining year)' : '') + '.</li>';
      });
      h += '</ul>';
    }
    return h + '</div>';
  };
  // the dashboard's to-do list: IR players who look healthy, and whether bringing them back fits
  DP.irTodo = function (team) {
    var X = DP.irCheck(team);
    return X.rows.filter(function (r) { return r.st !== 'out'; }).map(function (r) {
      return [r.after < 0 ? 'bad' : 'warn', '🩹', esc(r.p.n) + (r.st === 'healthy' ? ' is in an IR slot but not on the injury report' : ' is day-to-day in an IR slot') + ': activating him adds ' + U.m(r.add) + ' (space ' + U.m(r.after) + (r.after < 0 ? ', over the cap' : '') + ')', '#/team/' + encodeURIComponent(team)];
    });
  };
  // the Injuries page: every IR slot in the league
  DP.irLeagueHtml = function () {
    var E = DP.E, me = DP.state.team, rows = [];
    E.teams.forEach(function (t) { DP.irCheck(t).rows.forEach(function (r) { rows.push({ t: t, r: r }); }); });
    if (!rows.length) return '';
    var asOf = ((DP.research || {}).injuries || {}).updated || null;
    return '<div class="card flush" style="margin-bottom:14px"><h2>🩹 IR slots around the league</h2><div class="hint">Every player in a Fantrax IR slot (off this season\'s cap) and what activating him would do to his team\'s cap space. "Not on the injury report" = not on Daily Faceoff\'s lists' + (asOf ? ' as of ' + esc(U.date(new Date(asOf + 'T12:00:00Z'))) : '') + '.</div><div class="tbl-wrap" style="padding:0 12px 12px"><table class="t"><thead><tr><th>Team</th><th>Player</th><th>Status</th><th class="num">Salary</th><th class="num">Team space if activated</th></tr></thead><tbody>' +
      rows.sort(function (a, b) { return a.r.after - b.r.after; }).map(function (x) {
        return '<tr class="' + (x.t === me ? 'mine' : '') + '"><td>' + U.teamChip(x.t, { link: 1 }) + '</td><td>' + ui.pcell(x.r.p, { pos: 1 }) + '</td><td>' + statusText(x.r, asOf) + '</td><td class="num">' + U.m(x.r.p.sal26) + '</td><td class="num ' + (x.r.after < 0 ? 'bad' : '') + '">' + U.m(x.r.after) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  };

  // ------------------------------------------------------------ Trade deadline hub
  function countdown(d) {
    var ms = d - DP.E.now(); if (ms <= 0) return null;
    var dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5);
    return { d: dd, h: hh, text: (dd ? dd + ' day' + (dd === 1 ? '' : 's') + ' ' : '') + hh + ' hour' + (hh === 1 ? '' : 's') };
  }
  // what a player's 10% hometown discount would be worth at the 2027 auction, on the model's price (bid sets the term)
  DP.htdValue = function (p) {
    var E = DP.E, A = E.auctionPrice(p, 1); if (!A) return null;
    var pctOff = E.RULES.htdPct || 0, yrs = A.term || 1;
    return { price: A.mid, lo: A.lo, hi: A.hi, term: yrs, perYr: A.mid * pctOff, total: A.mid * pctOff * yrs };
  };
  DP.pendingUFA = function (p) { return p.yStatus && p.yStatus[1] === 'UFA' && p.ct !== 'MNR'; };
  DP.pages.deadline = {
    title: 'Trade Deadline',
    render: function (el) {
      var E = DP.E, me = DP.state.team, TS = DP.teamSummary(), C = E.contention();
      var dl = E.RULES.tradeDeadline ? new Date(E.RULES.tradeDeadline) : null, cd = dl && !isNaN(dl) ? countdown(dl) : null;
      var h = '<div class="page-head"><h1>⏳ Trade Deadline</h1><p class="sub">Who is buying, who is selling, the rentals on the market and what the hometown discount is worth. Status and odds come from the season sim; auction prices are the Auction War Room\'s model (estimates).</p></div>';
      if (cd) h += '<div class="countdown"><div><div class="cd-n num">' + cd.d + '</div><div class="cd-l">days</div></div><div><div class="cd-n num">' + cd.h + '</div><div class="cd-l">hours</div></div><div class="cd-t">until the deadline: <b>' + esc(E.deadlineText()) + '</b>. ' +
        'Trades made after it wait for the offseason, and a player traded after it loses his new team\'s hometown discount at the 2027 auction.</div></div>';
      else h += DP.deadlineNote ? DP.deadlineNote() : '<div class="callout warn">The trade deadline has passed.</div>';
      h += '<div class="card flush"><h2>Buyers and sellers</h2><div class="hint">Every team\'s status from its title odds (contender / bubble / not contending), cap space right now and its three weakest categories this season. Sellers\' chips = their best players on deals that end within two seasons.</div><div id="dl-teams" style="padding:0 12px 12px"></div></div>';
      h += '<div class="card flush" style="margin-top:14px"><h2>🏷️ Rentals: pending free agents on teams not contending</h2><div class="hint">Contracts that end after this season (he goes to the 2027 auction) on non-contenders, by projected 2026-27 WAR. "Hometown discount" = what his team at season\'s end saves at the auction (10% of the model\'s price, every year of the term the price sets), if it holds him from the deadline on.</div><div id="dl-rent" style="padding:0 12px 12px"></div></div>';
      if (me) h += '<div class="card flush" style="margin-top:14px"><h2>🏠 Your pending free agents</h2><div class="hint">Keep them past the deadline and you pay 10% less than your winning bid at the 2027 auction. Trade one away and his new team gets that discount instead, if the deal is done before the deadline.</div><div id="dl-mine" style="padding:0 12px 12px"></div></div>';
      el.innerHTML = h;
      var weak = function (t) { var r = TS[t].rank; return r.map(function (x, c) { return [x, c]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 3).map(function (x) { return E.CATS[x[1]].l; }); };
      var chips = function (t) {
        return E.rosters[t].filter(function (p) { return p.ct !== 'MNR' && p.r && p.yStatus && (p.yStatus[1] === 'UFA' || p.yStatus[2] === 'UFA'); }).sort(U.by(function (p) { return p.WAR; }, true)).slice(0, 2);
      };
      var rows = E.teams.map(function (t) { return { t: t, c: C[t], s: TS[t], sp: E.teamCap(t)[0].space }; });
      ui.table(U.qs('#dl-teams', el), {
        rows: rows, sort: 'champ', csv: 'deadline-buyers-sellers.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [
          { k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return U.teamChip(r.t, { link: 1, b: 1 }); } },
          { k: 'tier', l: 'Status', v: function (r) { return r.c.k[0]; }, f: function (r) { return DP.tierBadge(r.t); } },
          { k: 'champ', l: 'Title', cls: 'num', v: function (r) { return r.c.champ; }, f: function (r) { return U.pct(r.c.champ, 1); } },
          { k: 'po', l: 'Playoffs', cls: 'num', v: function (r) { return r.c.po; }, f: function (r) { return U.pct(r.c.po); } },
          { k: 'sp', l: 'Cap space', cls: 'num', v: function (r) { return r.sp; }, f: function (r) { return '<span class="' + (r.sp < 1 ? 'bad' : '') + '">' + U.m(r.sp) + '</span>'; } },
          { k: 'weak', l: 'Weakest cats', v: null, f: function (r) { return '<span class="small">' + weak(r.t).map(esc).join(', ') + '</span>'; } },
          { k: 'chips', l: 'Sellers\' chips', v: null, f: function (r) { return r.c.tier === 'out' ? '<span class="small">' + chips(r.t).map(function (p) { return ui.plink(p) + ' <span class="faint">' + U.fmt(p.WAR, 1) + '</span>'; }).join(', ') + '</span>' : '<span class="faint small">buying</span>'; } },
          { k: 'go', l: '', v: null, f: function (r) { return r.t === me ? '' : '<a class="btn sm" href="' + U.hash('trade', null, { t: me ? me + ',' + r.t : r.t }) + '">Build a trade</a>'; }, csv: false }
        ]
      });
      var rent = E.P.filter(function (p) { return p.gm && p.r && DP.pendingUFA(p) && C[p.gm] && C[p.gm].tier === 'out'; }).sort(U.by(function (p) { return p.WAR; }, true)).slice(0, 40);
      var contenders = E.teams.filter(function (t) { return C[t].tier !== 'out'; });
      var htdCols = function (extra) {
        return [
          { k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p, { pos: 1 }); } },
          { k: 'gm', l: 'Owner', v: function (p) { return p.gm; }, f: function (p) { return U.teamLabel(p.gm); } },
          { k: 'sal', l: 'Salary', cls: 'num', v: function (p) { return p.sal26; }, f: function (p) { return U.m(p.sal26); } },
          { k: 'war', l: 'WAR 26-27', cls: 'num', v: function (p) { return p.WAR; }, f: function (p) { return ui.warCell(p.WAR); }, title: 'Projected 2026-27 WAR (model)' },
          { k: 'price', l: '2027 price', cls: 'num', v: function (p) { var x = DP.htdValue(p); return x ? x.price : null; }, f: function (p) { var x = DP.htdValue(p); return x ? U.m(x.price, 1) + ' <span class="faint small">' + x.term + 'y</span>' : '–'; }, title: 'Model estimate of his 2027 auction price (middle) and the term that price sets' },
          { k: 'htd', l: 'Hometown discount', cls: 'num', v: function (p) { var x = DP.htdValue(p); return x ? x.total : null; }, f: function (p) { var x = DP.htdValue(p); return x ? '<b>' + U.m(x.total, 1) + '</b> <span class="faint small">' + U.m(x.perYr, 2) + '/yr</span>' : '–'; } }
        ].concat(extra || []);
      };
      ui.table(U.qs('#dl-rent', el), {
        rows: rent, sort: 'war', csv: 'deadline-rentals.csv', empty: 'No pending free agents on non-contending teams.',
        cols: htdCols([{ k: 'fit', l: 'Contenders with room', cls: 'num', v: function (p) { return contenders.filter(function (t) { return E.teamCap(t)[0].space >= p.sal26; }).length; }, title: 'Contending or bubble teams with at least his salary in cap space right now' },
          { k: 'go', l: '', v: null, csv: false, f: function (p) { return '<a class="btn sm" href="' + U.hash('finder', null, { mode: 'get', p: p.id }) + '">What would it take?</a>'; } }])
      });
      if (me) {
        var mine = E.rosters[me].filter(function (p) { return p.r && DP.pendingUFA(p); }).sort(U.by(function (p) { return p.WAR; }, true));
        ui.table(U.qs('#dl-mine', el), { rows: mine, sort: 'htd', empty: 'None of your players\' contracts end after this season.', cols: htdCols() });
      }
    }
  };
  // ------------------------------------------------------------ Playoff picture
  // What can still be ruled in or out for sure, from the official standings: every team has 15 category decisions left
  // per regular-season week; points = W + T/2. Out: at least 8 others already have more points than this team can reach
  // and it can't catch its division leader. In: so few teams can still reach its points that, even if both division
  // titles went to teams below it, it stays in the top 8.
  DP.playoffMath = function () {
    var E = DP.E, act = E.actual(); if (!act || act.odd) return null;
    var left = Math.max(0, E.REG_WEEKS - act.done) * E.NC, divs = (DP.league.fantrax || {}).divisions || {}, nPO = (DP.meta.playoffs || {}).teams || 8;
    var divSeeds = (DP.meta.playoffs || {}).divisionWinnersTopSeeds && Object.keys(divs).length ? 2 : 0;
    var pts = {}; E.teams.forEach(function (t) { var r = act.rec[t] || { W: 0, T: 0 }; pts[t] = r.W + r.T / 2; });
    var out = {};
    E.teams.forEach(function (t) {
      var mx = pts[t] + left, others = E.teams.filter(function (u) { return u !== t; });
      var ahead = others.filter(function (u) { return pts[u] > mx; }).length;
      var canCatch = others.filter(function (u) { return pts[u] + left >= pts[t]; }).length;
      var rivals = others.filter(function (u) { return divs[u] && divs[u] === divs[t]; });
      var divOut = !divs[t] || rivals.some(function (u) { return pts[u] > mx; });
      var divIn = !!divs[t] && rivals.every(function (u) { return pts[u] + left < pts[t]; });
      // a clinched division title is a top seed, so a playoff place too
      var st = ahead >= nPO && divOut ? 'out' : canCatch + divSeeds <= nPO - 1 || (divSeeds && divIn) ? 'in' : 'alive';
      // points still needed to be sure of a top-8 place on points alone: pass the 9th-best possible finish among the others
      var maxes = others.map(function (u) { return pts[u] + left; }).sort(function (a, b) { return b - a; });
      out[t] = { pts: pts[t], max: mx, st: st, div: divIn ? 'clinched' : null, need: Math.max(0, maxes[nPO - 1 - divSeeds] - pts[t] + 0.5), left: left };
    });
    return out;
  };
  DP.pages.playoffs = {
    title: 'Playoff Picture',
    render: function (el) {
      var E = DP.E, me = DP.state.team, act = E.actual(), M = DP.playoffMath(), divs = (DP.league.fantrax || {}).divisions || {};
      var PO = DP.meta.playoffs || {}, wks = (PO.weeks || [25, 26, 27]).map(function (n) { return n - 1; });
      var h = '<div class="page-head"><h1>🏆 Playoff Picture</h1><p class="sub">The projected bracket, each team\'s odds round by round (from simulated seasons that start from the real standings), what is already settled for sure, and who has the most NHL games in the playoff weeks. ' + esc(PO.note || '') + '</p></div>';
      h += '<div class="card"><h2>Projected bracket</h2><div class="hint">Seeds = each team\'s most likely finish across the simulated seasons (average seed). Percentages: chance to make the playoffs, then to reach each round and win it all.</div><div id="po-br"><p class="muted small">Simulating the season…</p></div></div>';
      h += '<div class="card flush" style="margin-top:14px"><h2>Odds by round</h2><div class="hint">' + (act && !act.odd ? act.done + ' of ' + E.REG_WEEKS + ' weeks played, ' + (M ? M[E.teams[0]].left : 0) + ' category decisions left for every team. ' : '') + '"Settled" only when the math rules it in or out no matter what happens. "Clinch on its own" = category points (W + ½T) that would guarantee a top-' + (PO.teams || 8) + ' finish whatever the other teams do.</div><div id="po-tbl" style="padding:0 12px 12px"><p class="muted small">…</p></div></div>';
      h += '<div class="card flush" style="margin-top:14px"><h2>📅 Playoff-week schedule</h2><div class="hint">NHL games for each team\'s current optimal lineup (12F / 6D / 2G) in the playoff weeks, from the real NHL schedule. More games = more counting stats in a one-week matchup. Rosters as they are today.</div><div id="po-sch" style="padding:0 12px 12px"></div></div>';
      el.innerHTML = h;
      // schedule edge
      var sch = E.teams.map(function (t) {
        var g = wks.map(function (wi) { var lu = E.baseline[t][wi] && E.baseline[t][wi].lu; return lu ? E.sum(lu.F.concat(lu.D, lu.G).map(function (x) { return E.games(x.p, wi).N || 0; })) : 0; });
        return { t: t, g: g, tot: E.sum(g) };
      });
      var lo = Math.min.apply(null, sch.map(function (r) { return r.tot; })), hi = Math.max.apply(null, sch.map(function (r) { return r.tot; }));
      ui.table(U.qs('#po-sch', el), {
        rows: sch, sort: 'tot', csv: 'playoff-week-games.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return U.teamChip(r.t, { link: 1 }); } }]
          .concat(wks.map(function (wi, k) { return { k: 'g' + k, l: (k === wks.length - 1 ? 'Final' : 'Round ' + (k + 1)) + ' (wk ' + (wi + 1) + ')', cls: 'num', v: function (r) { return r.g[k]; } }; }))
          .concat([{ k: 'tot', l: 'Total', cls: 'num', v: function (r) { return r.tot; }, f: function (r) { var x = (r.tot - lo) / Math.max(1, hi - lo); return '<b class="' + (x > 0.75 ? 'good' : x < 0.25 ? 'bad' : '') + '">' + r.tot + '</b>'; } }])
      });
      DP.getSim(function (sim) {
        if (!U.qs('#po-br', el)) return;
        var by = {}; sim.forEach(function (r) { by[r.t] = r; });
        var order = sim.slice().sort(function (a, b) { return a.avgSeed - b.avgSeed; }), seeds = order.slice(0, PO.teams || 8).map(function (r) { return r.t; });
        var br = PO.bracket || [[1, 8], [4, 5], [3, 6], [2, 7]];
        var tm = function (t, k) { var r = by[t]; return '<div class="bt' + (t === me ? ' mine' : '') + '"><span class="sd">' + (k + 1) + '</span>' + U.teamChip(t, { link: 1 }) + '<span class="num small muted">' + U.pct(r.po) + '</span></div>'; };
        var b = '<div class="bracket"><div class="bcol"><div class="bh">Round 1 · week ' + (wks[0] + 1) + '</div>' + br.map(function (m) {
          return '<div class="bm">' + tm(seeds[m[0] - 1], m[0] - 1) + tm(seeds[m[1] - 1], m[1] - 1) + '</div>';
        }).join('') + '</div>';
        // later rounds: the more likely team of each pair, by its chance to reach that round
        var pairs = br.map(function (m) { return [seeds[m[0] - 1], seeds[m[1] - 1]]; });
        var adv = function (list, key) { return list.map(function (pr) { return by[pr[0]][key] >= by[pr[1]][key] ? pr[0] : pr[1]; }); };
        var r2 = adv(pairs, 'r2'), r2p = [[r2[0], r2[1]], [r2[2], r2[3]]], fin = adv(r2p, 'fin'), champ = by[fin[0]].champ >= by[fin[1]].champ ? fin[0] : fin[1];
        var cell = function (t, key, lab) { return '<div class="bt' + (t === me ? ' mine' : '') + '">' + U.teamChip(t, { link: 1 }) + '<span class="num small muted" title="' + esc(lab) + '">' + U.pct(by[t][key]) + '</span></div>'; };
        b += '<div class="bcol"><div class="bh">Round 2 · week ' + (wks[1] + 1) + '</div>' + r2p.map(function (pr) { return '<div class="bm">' + cell(pr[0], 'r2', 'chance to reach round 2') + cell(pr[1], 'r2', 'chance to reach round 2') + '</div>'; }).join('') + '</div>';
        b += '<div class="bcol"><div class="bh">Final · week ' + (wks[2] + 1) + '</div><div class="bm">' + cell(fin[0], 'fin', 'chance to reach the final') + cell(fin[1], 'fin', 'chance to reach the final') + '</div></div>';
        b += '<div class="bcol"><div class="bh">Champion</div><div class="bm champ">' + cell(champ, 'champ', 'title odds') + '</div></div></div>';
        b += '<p class="small muted">Later rounds show the more likely team from each pair, with its chance to get that far; a projection, not a forecast of any one matchup.</p>';
        U.qs('#po-br', el).innerHTML = b;
        var rows = E.teams.map(function (t) { return { t: t, s: by[t], m: M ? M[t] : null, a: act && !act.odd ? act.rec[t] : null }; });
        ui.table(U.qs('#po-tbl', el), {
          rows: rows, sort: 'po', csv: 'playoff-odds.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
          cols: [
            { k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return U.teamChip(r.t, { link: 1, b: 1 }); } },
            { k: 'div', l: 'Div', v: function (r) { return divs[r.t] || ''; } },
            { k: 'rec', l: 'W-L-T', cls: 'num', v: function (r) { return r.m ? r.m.pts : null; }, f: function (r) { return r.a ? r.a.W + '-' + r.a.L + '-' + r.a.T : '–'; } },
            { k: 'seed', l: 'Avg seed', cls: 'num', v: function (r) { return -r.s.avgSeed; }, f: function (r) { return U.fmt(r.s.avgSeed, 1); } },
            { k: 'po', l: 'Playoffs', cls: 'num', v: function (r) { return r.s.po; }, f: function (r) { return '<b>' + U.pct(r.s.po) + '</b>'; } },
            { k: 'r2', l: 'Round 2', cls: 'num', v: function (r) { return r.s.r2; }, f: function (r) { return U.pct(r.s.r2); } },
            { k: 'fin', l: 'Final', cls: 'num', v: function (r) { return r.s.fin; }, f: function (r) { return U.pct(r.s.fin, 1); } },
            { k: 'champ', l: 'Title', cls: 'num', v: function (r) { return r.s.champ; }, f: function (r) { return U.pct(r.s.champ, 1); } },
            { k: 'st', l: 'Settled', v: function (r) { return r.m ? (r.m.st === 'in' ? 2 : r.m.st === 'out' ? 0 : 1) : null; }, f: function (r) { return !r.m ? '–' : r.m.st === 'in' ? '<span class="badge good">clinched</span>' + (r.m.div ? ' <span class="badge good">division</span>' : '') : r.m.st === 'out' ? '<span class="badge bad">eliminated</span>' : '<span class="faint small">not yet</span>'; } },
            { k: 'need', l: 'Clinch on its own', cls: 'num', v: function (r) { return r.m ? r.m.need : null; }, f: function (r) { return r.m ? (r.m.st === 'in' ? '✓' : r.m.need > r.m.left ? '<span class="faint small">needs help</span>' : U.fmt(r.m.need, 1) + ' <span class="faint small">of ' + r.m.left + ' left</span>') : '–'; }, title: 'Category points (W + T/2) it would still need to be sure of a top-8 finish whatever anyone else does. "Needs help" = it can\'t be sure on its own results alone; it needs other teams to lose too.' }
          ]
        });
      });
    }
  };
  // ------------------------------------------------------------ Commissioner checks
  // One page that watches the league rules from the data the site already has. It flags, it doesn't judge: Fantrax
  // enforces most of these itself, and a flag can have a good reason (e.g. the injury list lags a day).
  DP.commishChecks = function () {
    var E = DP.E, lim = ((DP.league.fantrax || {}).roster || {}).maxTotalPlayers || 23, minGP = E.RULES.goalieMinGP || 2;
    var asOf = ((DP.research || {}).injuries || {}).updated || null, dl = E.RULES.tradeDeadline ? new Date(E.RULES.tradeDeadline) : null;
    var teams = E.teams.map(function (t) {
      var c = E.teamCap(t)[0], ros = E.rosters[t];
      return { t: t, space: c.space, cap: c.cap, total: c.total, ir: c.ir || 0, mn: c.mn || 0, dead: c.byType.Dead || 0,
        ar: ros.filter(function (p) { return p.fs === 'A' || p.fs === 'R'; }).length, n: ros.length };
    });
    var gmiss = [];
    (DP.league.hist || []).forEach(function (w) { E.teams.forEach(function (t) { var x = w.teams[t]; if (x && (x.GGP || 0) < minGP) gmiss.push({ n: w.n, t: t, g: x.GGP || 0 }); }); });
    var irHealthy = [], grads = [];
    E.teams.forEach(function (t) {
      DP.irCheck(t).rows.forEach(function (r) { if (r.st === 'healthy') irHealthy.push({ t: t, p: r.p }); });
      E.rosters[t].forEach(function (p) { if (p.ct === 'MNR' && (p.cgp || 0) >= p.gradThr) grads.push({ t: t, p: p }); });
    });
    var late = dl && !isNaN(dl) ? (DP.league.trades || []).filter(function (tr) { return tr.date > dl.toISOString().slice(0, 10); }) : [];
    var wi = E.lockWeek(), lineups = wi === null ? [] : E.teams.map(function (t) { return { t: t, c: E.lineupCheck(t, wi) }; });
    return { teams: teams, lim: lim, gmiss: gmiss, irHealthy: irHealthy, grads: grads, late: late, lineups: lineups, wi: wi, asOf: asOf, minGP: minGP };
  };
  DP.pages.commish = {
    title: 'Commissioner Checks',
    render: function (el) {
      var E = DP.E, X = DP.commishChecks(), me = DP.state.team;
      var flags = X.teams.filter(function (r) { return r.space < 0 || r.ar > X.lim; }).length + X.late.length;
      var h = '<div class="page-head"><h1>🧑‍⚖️ Commissioner Checks</h1><p class="sub">The league rules, watched from the nightly Fantrax sync, the weekly results and Daily Faceoff\'s injury lists. These are flags to look at, not rulings: Fantrax enforces most limits itself and a flag can have a good reason.</p></div>';
      h += '<div class="stats stats6">' +
        DP.statTile('Over the cap', String(X.teams.filter(function (r) { return r.space < 0; }).length), 'teams right now') +
        DP.statTile('Roster over ' + X.lim, String(X.teams.filter(function (r) { return r.ar > X.lim; }).length), 'Active + Bench') +
        DP.statTile('Goalie minimum misses', String(X.gmiss.length), 'this season (' + X.minGP + ' GP a week)') +
        DP.statTile('IR, not on injury list', String(X.irHealthy.length), X.asOf ? 'Daily Faceoff ' + U.date(new Date(X.asOf + 'T12:00:00Z')) : 'injury list') +
        DP.statTile('Graduated MNR', String(X.grads.length), 'stay at $0 this season') +
        DP.statTile('Trades after deadline', String(X.late.length), E.deadlineText() || 'no deadline set') + '</div>';
      if (!flags) h += '<div class="callout good">✓ No team is over the cap or the roster limit' + (X.late.length ? '' : ', and no trade is dated after the deadline') + '.</div>';
      h += '<div class="card flush"><h2>💰 Cap and roster, every team</h2><div class="hint">2026-27 cap space against each team\'s own cap (traded cap included), what IR and Minors slots take off it, dead cap from dropped contracts, and Active + Bench count (limit ' + X.lim + ').</div><div id="cm-cap" style="padding:0 12px 12px"></div></div>';
      h += '<div class="grid g2" style="margin-top:14px">';
      h += '<div class="card"><h2>🥅 Goalie minimum misses</h2><div class="hint">Weeks a team\'s locked lineup had fewer than ' + X.minGP + ' goalie games, which loses all four goalie categories (W, GAA, SV%, SHO).</div>' +
        (X.gmiss.length ? '<ul class="list-plain">' + X.gmiss.map(function (x) { return '<li>' + U.teamChip(x.t, { link: 1 }) + '<span class="small muted" style="margin-left:auto">week ' + x.n + ' · ' + x.g + ' goalie GP · <a href="' + U.hash('live', null, { w: x.n }) + '">box score</a></span></li>'; }).join('') + '</ul>' : '<p class="small muted">None this season.</p>') + '</div>';
      h += '<div class="card"><h2>🩹 In an IR slot, not on the injury list</h2><div class="hint">IR slots take a player\'s salary off this season\'s cap. These players aren\'t on Daily Faceoff\'s injury lists' + (X.asOf ? ' (' + esc(U.date(new Date(X.asOf + 'T12:00:00Z'))) + ')' : '') + ': healthy, or the list hasn\'t caught up.</div>' +
        (X.irHealthy.length ? '<ul class="list-plain">' + X.irHealthy.map(function (x) { return '<li>' + ui.pcell(x.p, { pos: 1 }) + '<span class="small muted" style="margin-left:auto">' + U.teamLabel(x.t) + ' · ' + U.m(x.p.sal26) + ' off the cap</span></li>'; }).join('') + '</ul>' : '<p class="small muted">Every IR slot holds a player on the injury list.</p>') + '</div>';
      h += '<div class="card"><h2>🎓 MNR players past the graduation line</h2><div class="hint">' + esc(E.RULES.gradNote || '') + '</div>' +
        (X.grads.length ? '<ul class="list-plain">' + X.grads.map(function (x) { return '<li>' + ui.pcell(x.p, { pos: 1 }) + '<span class="small muted" style="margin-left:auto">' + U.teamLabel(x.t) + ' · ' + x.p.cgp + '/' + x.p.gradThr + ' GP · ' + esc((DP.SLOT_NAME || {})[x.p.fs] || x.p.fs || '') + '</span></li>'; }).join('') + '</ul>' : '<p class="small muted">None yet.</p>') + '</div>';
      h += '<div class="card"><h2>🔒 Next lock: lineups</h2><div class="hint">' + (X.wi !== null ? esc(DP.lockText(X.wi)) + '. Teams with no Fantrax lineup, injured or idle starters, or a real risk of missing the goalie minimum.' : 'No locks left.') + '</div>' +
        (X.lineups.length ? (function () {
          var bad = X.lineups.filter(function (r) { return !r.c || r.c.gFailSet > 0.12 || r.c.hurt.length || r.c.dead.length; });
          return bad.length ? '<ul class="list-plain">' + bad.map(function (r) {
            var why = !r.c ? 'no lineup set' : [r.c.gFailSet > 0.12 ? U.pct(r.c.gFailSet) + ' goalie-minimum risk' : '', r.c.hurt.length ? r.c.hurt.length + ' injured starter' + (r.c.hurt.length > 1 ? 's' : '') : '', r.c.dead.length ? r.c.dead.length + ' starter' + (r.c.dead.length > 1 ? 's' : '') + ' with no games' : ''].filter(Boolean).join(' · ');
            return '<li>' + U.teamChip(r.t, { link: 1 }) + '<span class="small ' + (!r.c || r.c.gFailSet > 0.3 ? 'bad' : 'warn') + '" style="margin-left:auto">' + why + '</span></li>';
          }).join('') + '</ul>' : '<p class="small muted">✓ Every team has a lineup with healthy, playing starters.</p>';
        })() : '') + '</div>';
      h += '</div>';
      if (X.late.length) h += '<div class="callout bad" style="margin-top:14px"><b>Trades dated after the deadline:</b> ' + X.late.map(function (tr) { return esc(tr.date) + ' ' + tr.teams.map(esc).join(' / '); }).join('; ') + '.</div>';
      el.innerHTML = h;
      ui.table(U.qs('#cm-cap', el), {
        rows: X.teams, sort: 'space', desc: false, csv: 'commissioner-cap-roster.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [
          { k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return U.teamChip(r.t, { link: 1, b: 1 }); } },
          { k: 'cap', l: 'Cap', cls: 'num', v: function (r) { return r.cap; }, f: function (r) { return U.m(r.cap, 1); } },
          { k: 'total', l: 'Counted', cls: 'num', v: function (r) { return r.total; }, f: function (r) { return U.m(r.total, 1); }, title: 'Salaries that count this season (Active + Bench) plus dead cap' },
          { k: 'space', l: 'Space', cls: 'num', v: function (r) { return r.space; }, f: function (r) { return '<b class="' + (r.space < 0 ? 'bad' : r.space < 1 ? 'warn' : '') + '">' + U.m(r.space) + '</b>'; } },
          { k: 'ir', l: 'Off cap: IR', cls: 'num', v: function (r) { return r.ir; }, f: function (r) { return r.ir ? U.m(r.ir) : '–'; } },
          { k: 'mn', l: 'Off cap: Minors', cls: 'num', v: function (r) { return r.mn; }, f: function (r) { return r.mn ? U.m(r.mn) : '–'; } },
          { k: 'dead', l: 'Dead cap', cls: 'num', v: function (r) { return r.dead; }, f: function (r) { return r.dead ? U.m(r.dead) : '–'; } },
          { k: 'ar', l: 'Active+Bench', cls: 'num', v: function (r) { return r.ar; }, f: function (r) { return '<span class="' + (r.ar > X.lim ? 'bad' : '') + '">' + r.ar + '/' + X.lim + '</span>'; } },
          { k: 'n', l: 'Roster', cls: 'num', v: function (r) { return r.n; } }
        ]
      });
    }
  };
  // ------------------------------------------------------------ World Juniors (tools/research/wjc.json)
  var NATION = { CAN: 'Canada', USA: 'United States', SWE: 'Sweden', FIN: 'Finland', CZE: 'Czechia', SVK: 'Slovakia', DEU: 'Germany', CHE: 'Switzerland', LVA: 'Latvia', NOR: 'Norway', RUS: 'Russia', DNK: 'Denmark', BLR: 'Belarus', KAZ: 'Kazakhstan' };
  var FLAG = { CAN: '🇨🇦', USA: '🇺🇸', SWE: '🇸🇪', FIN: '🇫🇮', CZE: '🇨🇿', SVK: '🇸🇰', DEU: '🇩🇪', CHE: '🇨🇭', LVA: '🇱🇻', NOR: '🇳🇴', RUS: '🇷🇺' };
  DP.wjcRows = function () {
    var W = (DP.research || {}).wjc; if (!W) return null;
    var E = DP.E, cut = (W.born || 2007) + '-01-01', teams = {}, named = {};
    Object.keys(W.groups || {}).forEach(function (g) { W.groups[g].teams.forEach(function (c) { teams[c] = g; }); });
    var norm = function (x) { return String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); };
    Object.keys(W.rosters || {}).forEach(function (c) { if (Array.isArray(W.rosters[c])) W.rosters[c].forEach(function (n) { named[norm(n)] = c; }); });
    var V = DP.radarView ? DP.radarView() : null, seen = {}, rows = [];
    (V ? V.rows : []).forEach(function (r) {
      var p = r.p; if (!p.dob || p.dob < cut) return;
      seen[p.id] = 1; rows.push({ p: p, r: r, nat: p.nat, g: teams[p.nat] || null, owned: !!p.gm, nhl: r.nhlNow, named: named[norm(p.n)] || null });
    });
    // young players already past prospect status (ELCs in the NHL) are eligible by age too
    E.P.forEach(function (p) { if (p.gm && !seen[p.id] && p.dob && p.dob >= cut) rows.push({ p: p, r: null, nat: p.nat, g: teams[p.nat] || null, owned: true, nhl: true, named: named[norm(p.n)] || null }); });
    return { W: W, rows: rows, teams: teams };
  };
  DP.pages.wjc = {
    title: 'World Juniors',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, D = DP.wjcRows(), q = hsh.q;
      var h = '<div class="page-head"><h1>🌍 World Juniors</h1><p class="sub">League prospects who are young enough for the tournament, by country, with where they are playing now. A big tournament moves a prospect\'s stock; this page is the watch list. Facts from the sources listed below; national rosters are added when they are named.</p></div>';
      if (!D) { el.innerHTML = h + '<div class="callout">Tournament details aren\'t loaded yet (tools/research/wjc.json).</div>'; return; }
      var W = D.W, st = new Date(W.start + 'T17:00:00Z'), en = new Date(W.end + 'T23:59:00-07:00'), now = E.now();
      var cd = st > now ? countdown(st) : null, live = !cd && now <= en;
      h += '<div class="countdown">' + (cd ? '<div><div class="cd-n num">' + cd.d + '</div><div class="cd-l">days</div></div>' : '<div><div class="cd-n">' + (live ? '🔴' : '🏁') + '</div><div class="cd-l">' + (live ? 'on now' : 'over') + '</div></div>') +
        '<div class="cd-t"><b>' + esc(W.name) + '</b>: ' + esc(U.date(new Date(W.start + 'T12:00:00Z'))) + ' – ' + esc(U.date(new Date(W.end + 'T12:00:00Z'))) + ', ' + esc((W.venues || []).join(' and ')) + '. ' + esc(W.eligibility || '') + '</div></div>';
      (W.status || []).forEach(function (t) { h += '<div class="callout warn small">' + esc(t) + '</div>'; });
      var rows = D.rows, owned = rows.filter(function (r) { return r.owned; });
      var inT = function (r) { return !!r.g; };
      h += '<div class="stats stats6">' + DP.statTile('Eligible by age', String(rows.length), 'prospects on the site, born ' + W.born + ' or later') +
        DP.statTile('On league rosters', String(owned.length), owned.filter(inT).length + ' from a country in the tournament') +
        DP.statTile('Already in the NHL', String(rows.filter(function (r) { return r.nhl && r.owned; }).length), 'owned; NHL teams rarely release them') +
        DP.statTile('Named to a roster', String(rows.filter(function (r) { return r.named; }).length), Object.keys(W.rosters || {}).length ? 'as listed' : 'rosters not named yet') +
        (me ? DP.statTile('Yours', String(owned.filter(function (r) { return r.p.gm === me; }).length), owned.filter(function (r) { return r.p.gm === me && inT(r) && !r.nhl; }).length + ' outside the NHL, from a country in it') : '') + '</div>';
      // groups
      h += '<div class="grid g2">' + Object.keys(W.groups || {}).map(function (g) {
        var G = W.groups[g];
        return '<div class="card"><h2>Group ' + esc(g) + ' <span class="faint small">' + esc(G.venue) + '</span></h2><ul class="list-plain">' + G.teams.map(function (c) {
          var mine = owned.filter(function (r) { return r.nat === c; }), all = rows.filter(function (r) { return r.nat === c; });
          return '<li><span>' + (FLAG[c] || '') + ' <b>' + esc(NATION[c] || c) + '</b></span><span class="small muted" style="margin-left:auto">' + all.length + ' eligible · ' + mine.length + ' on league rosters</span></li>';
        }).join('') + '</ul></div>';
      }).join('') + '</div>';
      h += '<div class="card flush" style="margin-top:14px"><h2>The watch list</h2><div class="hint">Every prospect born ' + W.born + ' or later, with his country and where he plays now. "In the NHL" players usually stay with their NHL team. Stock = the Prospect Radar\'s score.</div><div id="wj-t" style="padding:0 12px 12px"></div></div>';
      h += '<p class="small muted">Sources (checked ' + esc(W.checked || '') + '): ' + (W.sources || []).map(function (x) { return '<a target="_blank" rel="noopener" href="' + esc(x.url) + '">' + esc(x.name) + '</a>'; }).join(' · ') + '.</p>';
      el.innerHTML = h;
      var natOpts = [['', 'All countries']].concat(Object.keys(D.teams).map(function (c) { return [c, (NATION[c] || c)]; })).concat([['other', 'Not in the tournament']]);
      ui.table(U.qs('#wj-t', el), {
        rows: rows, sort: 'stock', csv: 'world-juniors-watch-list.csv', search: function (r) { return r.p.n + ' ' + (NATION[r.nat] || r.nat || ''); },
        rowCls: function (r) { return r.p.gm && r.p.gm === me ? 'mine' : ''; },
        filters: [{ l: 'Owner', def: 'owned', opts: [['', 'Everyone'], ['owned', 'On league rosters'], ['mine', 'My team'], ['un', 'Not owned']], fn: function (r, v) { return v === 'owned' ? r.owned : v === 'mine' ? r.p.gm === me : !r.owned; } },
          { l: 'Country', opts: natOpts, fn: function (r, v) { return v === 'other' ? !r.g : r.nat === v; } },
          { l: 'Show', opts: [['', 'All'], ['go', 'Not in the NHL'], ['nhl', 'In the NHL']], fn: function (r, v) { return v === 'nhl' ? r.nhl : !r.nhl; } }],
        cols: [
          { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return r.r ? '<span class="pc">' + ui.pos(r.p) + '<span class="pct"><a class="plink" href="' + U.hash('radar', null, { p: r.r.key }) + '">' + esc(r.p.n) + '</a> <span class="faint small">' + esc(r.p.t || '') + '</span></span></span>' : ui.pcell(r.p, { pos: 1 }); } },
          { k: 'nat', l: 'Country', v: function (r) { return NATION[r.nat] || r.nat || ''; }, f: function (r) { return (FLAG[r.nat] || '') + ' ' + esc(NATION[r.nat] || r.nat || '–') + (!r.g ? ' <span class="faint small">' + (r.nat === 'RUS' ? 'can\'t play' : 'not in the top group') + '</span>' : ''); } },
          { k: 'dob', l: 'Born', v: function (r) { return r.p.dob; }, f: function (r) { return '<span class="small nw">' + esc(r.p.dob) + '</span>'; } },
          { k: 'gm', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return r.p.gm ? U.teamLabel(r.p.gm) : '<span class="faint">' + (r.r && r.r.x && !r.r.x.inPool ? 'not in Fantrax' : 'unowned') + '</span>'; }, asc: true },
          { k: 'where', l: 'Playing now', v: function (r) { return r.nhl ? 'NHL' : r.r && r.r.where ? r.r.where.lg : ''; }, f: function (r) { return r.nhl ? '<span class="badge info">NHL</span>' : r.r && r.r.where ? esc(r.r.where.lg) + ' <span class="faint small">' + esc(r.r.where.team || '') + '</span>' : '–'; } },
          { k: 'line', l: 'This season', v: null, f: function (r) { var l = r.r && r.r.lines && r.r.lines[0]; return l ? '<span class="small">' + esc(l[0]) + ' ' + (r.p.slot === 'G' || r.p.G ? l[2] + ' GP' : l[2] + ' GP, ' + l[3] + '-' + l[4] + '-' + l[5]) + '</span>' : '<span class="faint small">–</span>'; } },
          { k: 'stock', l: 'Stock', cls: 'num', v: function (r) { return r.r ? r.r.stock : null; }, f: function (r) { return r.r ? U.fmt(r.r.stock, 1) + ' <span class="faint small">#' + r.r.rank + '</span>' : '<span class="faint">–</span>'; } },
          { k: 'named', l: 'Roster', v: function (r) { return r.named ? 1 : 0; }, f: function (r) { return r.named ? '<span class="badge good">named</span>' : '<span class="faint small">–</span>'; } }
        ]
      });
    }
  };
})();
