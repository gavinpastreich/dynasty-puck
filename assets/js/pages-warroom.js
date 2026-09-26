/* Dynasty Puck HQ - long-range tools: 2027 Auction War Room, league Mock Draft, Awards & Team Wrapped, GM trade personas. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  // ================================================================== 2027 Auction War Room
  var AKEY = 'auction27';
  function surplusAt(p, price, term) { // discounted market value minus price over the band term, starting 2027-28
    var E = DP.E, v = 0, mn = E.RULES.minSalary;
    for (var k = 0; k < term; k++) { var y = Math.min(6, 1 + k); v += Math.pow(E.DISCOUNT, k) * (mn + Math.max(0, p.yWar[y]) * E.dpwY(y) - price); }
    return v;
  }
  function auctionPool() {
    var E = DP.E;
    return E.P.filter(function (p) {
      if (p.gm) return p.yStatus && p.yStatus[1] === 'UFA';
      return p.r && E.auctionValue(p, 1) > 1;
    });
  }
  DP.pages.auction = {
    title: 'Auction War Room',
    render: function (el, hsh) {
      var E = DP.E, A = E.auction, me = hsh.q.team || DP.state.team;
      var st = U.store.get(AKEY, null) || { sold: {} };
      var pool = auctionPool(), base = E.leagueSpace(1), spent = {}, bought = {};
      E.teams.forEach(function (t) { spent[t] = 0; bought[t] = 0; });
      Object.keys(st.sold).forEach(function (id) { var s = st.sold[id]; if (spent[s.t] !== undefined) { spent[s.t] += s.price; bought[s.t]++; } });
      // live price level: what's left to spend vs what's left to buy, relative to the start of the auction
      var supply0 = E.sum(pool.map(function (p) { return E.auctionValue(p, 1); }));
      var supplyLeft = E.sum(pool.filter(function (p) { return !st.sold[p.id]; }).map(function (p) { return E.auctionValue(p, 1); }));
      var spaceLeft = E.sum(E.teams.map(function (t) { return Math.max(0, base.byTeam[t] - spent[t]); }));
      var live = Object.keys(st.sold).length ? Math.max(0.6, Math.min(1.6, (spaceLeft / Math.max(1, base.total)) / Math.max(0.05, supplyLeft / Math.max(1, supply0)))) : 1;
      var price = function (p) { var ap = E.auctionPrice(p, 1); return { mid: Math.max(1, ap.mid * live), lo: Math.max(1, ap.lo * live), hi: Math.max(1, ap.hi * live) }; };
      var count27 = function (t) { return E.rosters[t].filter(function (p) { return typeof p.yCost[1] === 'number' && p.yStatus[1] !== 'MNR'; }).length + bought[t]; };
      var rosterMax = ((DP.league.fantrax || {}).roster || {}).maxTotalPlayers || 23;
      var budgets = E.teams.map(function (t) {
        var space = base.byTeam[t] - spent[t], open = Math.max(0, rosterMax - count27(t));
        return { t: t, space: space, open: open, max: Math.max(0, space - Math.max(0, open - 1) * E.RULES.minSalary), spent: spent[t], n: bought[t] };
      });
      var h = '<div class="page-head"><h1>🔨 2027 Auction War Room</h1><p class="sub">Plan next summer\'s UFA auction: every team\'s projected budget and max bid, the player pool with projected prices and the contract length each price implies ($104M bands), who holds the hometown discount (10% off their winning bid), targets and nomination ideas for your team, and a live tracker to log sales during the auction (saved in this browser only).</p></div>';
      h += '<div class="controls"><label>My team ' + ui.teamSelect('au-team', me, 'Choose…') + '</label>' + (Object.keys(st.sold).length ? '<span class="badge warn">' + Object.keys(st.sold).length + ' sales logged · prices ×' + U.fmt(live, 2) + '</span> <button class="btn sm ghost" id="au-reset">Reset tracker</button>' : '') + '</div>';
      h += '<div class="stats">' + DP.statTile('League cap space', U.m(base.total, 0), '2027-28 at $' + E.capY(1) + 'M, after modeled ELC/RFA calls') + DP.statTile('Players in the pool', pool.length, pool.filter(function (p) { return p.gm; }).length + ' coming off contracts') +
        DP.statTile('Price level vs 2026', '×' + U.fmt(A.scale27 * live, 2), 'space ÷ supply, calibrated on the 2026 auction') + '</div>';
      h += '<div class="grid g2"><div class="card"><h2>Budgets</h2><div class="hint">Max bid = cap space minus $' + E.RULES.minSalary + 'M for every other open spot (' + rosterMax + ' active + bench).</div><div id="au-bud"></div></div>';
      h += '<div class="card"><h2>' + (me ? 'Plan for ' + esc(U.teamName(me)) : 'Your plan') + '</h2><div id="au-plan"></div></div></div>';
      h += '<div class="card" style="margin-top:14px"><h2>Player pool</h2><div class="hint">Projected price (middle half of outcomes) · band term · value over the next 3 seasons · surplus at the projected price. <b>Mark sold</b> during the auction to track budgets; prices re-adjust to money and talent left.</div><div id="au-pool"></div></div>';
      el.innerHTML = h;
      U.qs('#au-team', el).addEventListener('change', function (e) { DP.go('auction', null, { team: e.target.value }); });
      var rs = U.qs('#au-reset', el); if (rs) rs.addEventListener('click', function () { if (confirm('Clear all logged sales?')) { U.store.del(AKEY); DP.render(); } });
      ui.table(U.qs('#au-bud', el), {
        rows: budgets, sort: 'max', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [{ k: 't', l: 'Team', v: function (r) { return r.t; }, f: function (r) { return '<b>' + esc(r.t) + '</b>'; } },
          { k: 'space', l: 'Space', cls: 'num', v: function (r) { return r.space; }, f: function (r) { return '<span class="' + (r.space < 0 ? 'bad' : '') + '">' + U.m(r.space, 1) + '</span>'; } },
          { k: 'open', l: 'Open spots', cls: 'num', v: function (r) { return r.open; } },
          { k: 'max', l: 'Max bid', cls: 'num', v: function (r) { return r.max; }, f: function (r) { return '<b>' + U.m(r.max, 1) + '</b>'; } },
          { k: 'n', l: 'Bought', cls: 'num', v: function (r) { return r.n; }, f: function (r) { return r.n ? r.n + ' · ' + U.m(r.spent, 1) : '–'; } }]
      });
      var rows = pool.map(function (p) {
        var pr = price(p), ap = E.auctionPrice(p, 1), term = E.bandTerm(pr.mid, 1);
        return { p: p, pr: pr, term: term, val: E.auctionValue(p, 1), sur: surplusAt(p, pr.mid, term), fit: me ? E.quickGain(me, p) : 0, sold: st.sold[p.id], base: ap };
      });
      // plan
      if (me) {
        var myB = budgets.find(function (b) { return b.t === me; }), open = rows.filter(function (r) { return !r.sold; });
        var targets = open.filter(function (r) { return r.pr.mid <= myB.max && r.sur > 0; }).sort(function (a, b) { return (b.sur + b.fit * 3) - (a.sur + a.fit * 3); }).slice(0, 8);
        var rich = budgets.filter(function (b) { return b.t !== me; }).sort(function (a, b) { return b.max - a.max; }).slice(0, 3).map(function (b) { return b.t; });
        var pricey = open.filter(function (r) { return r.pr.mid >= 3; }), fits = pricey.map(function (r) { return r.fit; }).sort(function (a, b) { return a - b; });
        var medFit = fits.length ? fits[Math.floor(fits.length / 2)] : 0;
        var nominate = pricey.filter(function (r) { return r.fit <= medFit && targets.indexOf(r) < 0; }).sort(function (a, b) { return b.pr.mid - a.pr.mid; }).slice(0, 6);
        var li = function (r, right) { return '<li>' + ui.pos(r.p) + '<span>' + ui.pcell(r.p) + '<br><span class="small muted">~' + U.m(r.pr.mid) + ' · ' + r.term + ' yr' + (r.term > 1 ? 's' : '') + '</span></span><span class="num small" style="margin-left:auto">' + right + '</span></li>'; };
        var home = open.filter(function (r) { return E.htdTeam(r.p) === me; }).sort(function (a, b) { return b.val - a.val; }).slice(0, 8);
        U.qs('#au-plan', el).innerHTML = '<div class="stats" style="margin:0 0 8px">' + DP.statTile('Your space', U.m(myB.space, 1), myB.open + ' open spots') + DP.statTile('Your max bid', U.m(myB.max, 1), 'keeps $1M per remaining spot') + '</div>' +
          '<h3 class="small">🎯 Targets (surplus + fit, within your max bid)</h3><ul class="list-plain">' + (targets.map(function (r) { return li(r, ui.delta(r.sur, 1) + ' surplus'); }).join('') || '<li class="muted small">Nothing affordable projects a surplus.</li>') + '</ul>' +
          (home.length ? '<h3 class="small">🏠 Your hometown players (you pay ' + Math.round((1 - E.RULES.htdPct) * 100) + '% of your winning bid)</h3><ul class="list-plain">' + home.map(function (r) { return li(r, 'you pay ' + U.m(E.htdPrice(r.pr.mid))); }).join('') + '</ul>' : '') +
          '<h3 class="small">📣 Nominate early (pricey, little help to you)</h3><p class="small muted">Put these up first so the biggest budgets (' + rich.map(esc).join(', ') + ') spend on them before your targets come up.</p><ul class="list-plain">' + nominate.map(function (r) { return li(r, U.m(r.pr.mid)); }).join('') + '</ul>';
      } else U.qs('#au-plan', el).innerHTML = '<p class="muted small">Choose your team for targets, max bid and nomination ideas.</p>';
      ui.table(U.qs('#au-pool', el), {
        rows: rows, sort: 'price', page: 60, csv: 'auction-2027-pool.csv', search: function (r) { return r.p.n + ' ' + (r.p.gm || '') + ' ' + r.p.t; },
        rowCls: function (r) { return r.sold ? 'faint' : ''; },
        filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (r, v) { return r.p.slot === v; } },
          { l: 'Status', opts: [['', 'All'], ['open', 'Still available'], ['sold', 'Sold']], fn: function (r, v) { return v === 'sold' ? !!r.sold : !r.sold; } }],
        cols: [{ k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p); } },
          { k: 'pos', l: 'Pos', v: function (r) { return r.p.slot; }, f: function (r) { return ui.pos(r.p); } },
          { k: 'from', l: 'From', v: function (r) { return r.p.gm || 'FA'; }, f: function (r) { return r.p.gm ? esc(r.p.gm) : '<span class="faint">FA</span>'; } },
          { k: 'age', l: 'Age', cls: 'num', v: function (r) { return r.p.age; }, f: function (r) { return U.fmt((r.p.age || 0) + 1, 0); }, title: 'Age next season' },
          { k: 'val', l: '3-yr value', cls: 'num', v: function (r) { return r.val; }, f: function (r) { return U.fmt(r.val, 1); }, title: 'Discounted WAR over 2027-28 to 2029-30' },
          { k: 'price', l: 'Proj price', cls: 'num', v: function (r) { return r.pr.mid; }, f: function (r) { return '<b>' + U.m(r.pr.mid) + '</b><br><span class="faint small">' + U.m(r.pr.lo) + '–' + U.m(r.pr.hi) + '</span>'; } },
          { k: 'term', l: 'Band', cls: 'num', v: function (r) { return r.term; }, f: function (r) { return r.term + ' yr'; } },
          { k: 'htd', l: 'Hometown', v: function (r) { return E.htdTeam(r.p) || ''; }, f: function (r) { var t = E.htdTeam(r.p); return t ? '<span class="small">' + esc(t) + ' pays ' + U.m(E.htdPrice(r.pr.mid)) + '</span>' : '<span class="faint">–</span>'; }, title: 'Team with the hometown discount (had him from the trade deadline to season end) and what it would pay for the projected winning bid' },
          { k: 'sur', l: 'Surplus', cls: 'num', v: function (r) { return r.sur; }, f: function (r) { return ui.delta(r.sur, 1); } },
          me ? { k: 'fit', l: 'Fit for ' + me, cls: 'num', v: function (r) { return r.fit; }, f: function (r) { return U.fmt(r.fit, 2); }, title: 'Category wins this player would add to your lineup (2026-27 rates)' } : null,
          { k: 'sold', l: 'Tracker', v: function (r) { return r.sold ? r.sold.price : -1; }, f: function (r) { return r.sold ? '<span class="small">' + esc(r.sold.t) + ' @ ' + U.m(r.sold.price) + '</span> <button class="btn sm ghost" data-unsell="' + esc(r.p.id) + '">undo</button>' : '<button class="btn sm" data-sell="' + esc(r.p.id) + '">Mark sold</button>'; } }]
      });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sell]'), u = e.target.closest('[data-unsell]');
        if (!b && !u) return;
        var s = U.store.get(AKEY, null) || { sold: {} };
        if (u) { delete s.sold[u.dataset.unsell]; U.store.set(AKEY, s); DP.render(); return; }
        var p = E.byId[b.dataset.sell], team = prompt('Who won ' + p.n + '? Team code (' + E.teams.join(', ') + ')', me || '');
        if (!team) return;
        team = E.teams.find(function (t) { return t.toLowerCase() === team.trim().toLowerCase(); });
        if (!team) { U.toast('Unknown team code'); return; }
        var amt = parseFloat(prompt('Winning bid in $M for ' + p.n, E.auctionPrice(p, 1).mid.toFixed(1)));
        if (!(amt > 0)) return;
        s.sold[p.id] = { t: team, price: amt }; U.store.set(AKEY, s); DP.render();
      });
    }
  };

  // ================================================================== league Mock Draft (2027)
  var mockState = null;
  function mockPool() {
    var E = DP.E, c = E.pickCurve(), out = [], seen = {};
    var b = ((DP.prospects || {}).boards || {})['2027'];
    ((b && b.players) || []).forEach(function (r) {
      var key = String(r.name).toLowerCase();
      seen[key] = 1;
      out.push({ key: 'b' + r.rank, name: r.name, pos: /G/.test(r.pos || '') ? 'G' : /D/.test(r.pos || '') && String(r.pos).length <= 2 ? 'D' : 'F', team: (r.team || '') + (r.league ? ' (' + r.league + ')' : ''), src: '2027 NHL class #' + r.rank, v: c[Math.min(c.length - 1, r.rank - 1)] * 0.97 + 0.3 * Math.pow(0.97, r.rank) });  // consensus rank breaks the curve's flat steps
    });
    E.P.filter(function (p) { return !p.gm && (p.age || 30) < 24 && p.DV > 0.2 && !seen[p.n.toLowerCase()]; }).forEach(function (p) {
      out.push({ key: p.id, name: p.n, pos: p.slot, team: p.t, src: 'unowned prospect', v: p.DV, p: p });
    });
    return out.sort(function (a, b) { return b.v - a.v; });
  }
  function mockOrder() {
    var E = DP.E, picks = (DP.league.picks || []).filter(function (p) { return p.year === 2027; }), order = [];
    var slot = {}; E.teams.forEach(function (t) { slot[t] = E.expSlot(t, 2027); });
    for (var r = 1; r <= (DP.league.rounds || 3); r++) {
      picks.filter(function (p) { return p.round === r; }).sort(function (a, b) { return slot[a.orig] - slot[b.orig]; }).forEach(function (p) { order.push({ r: r, orig: p.orig, owner: p.owner }); });
    }
    return order;
  }
  function aiPick(avail, team, rand) {
    var E = DP.E, mnr = E.rosters[team].filter(function (p) { return p.ct === 'MNR'; });
    var need = { F: 1, D: mnr.filter(function (p) { return p.D; }).length < 5 ? 1.08 : 1, G: mnr.filter(function (p) { return p.G; }).length < 2 ? 1.12 : 0.9 };
    var best = null, bs = -1;
    avail.forEach(function (x) { var s = x.v * need[x.pos] * Math.exp(0.18 * (rand() * 2 - 1)); if (s > bs) { bs = s; best = x; } });
    return best;
  }
  function mockRun(st) {
    while (st.i < st.order.length) {
      var slot = st.order[st.i];
      if (slot.owner === st.me && !st.auto) return;
      var avail = st.pool.filter(function (x) { return !st.taken[x.key]; });
      var x = aiPick(avail, slot.owner, st.rand); if (!x) break;
      st.taken[x.key] = 1; st.log.push({ slot: slot, x: x }); st.i++;
    }
  }
  DP.pages.mock = {
    title: 'Mock Draft',
    render: function (el, hsh) {
      var E = DP.E, me = hsh.q.team || DP.state.team;
      if (!mockState || mockState.me !== me || mockState.v !== E.version || hsh.q.new) {
        mockState = { me: me, v: E.version, order: mockOrder(), pool: mockPool(), taken: {}, log: [], i: 0, auto: !me, seed: (mockState ? mockState.seed + 1 : 1) };
        mockState.rand = E.rng(20270 + mockState.seed);
        mockRun(mockState);
      }
      var st = mockState, onClock = st.order[st.i];
      var h = '<div class="page-head"><h1>🎯 2027 League Mock Draft</h1><p class="sub">3 rounds in projected order (reverse of the simulated standings; traded picks go to their owners). Pool: the 2027 NHL draft class from the consensus board plus unowned prospects, valued on the league\'s own 2026 rookie-draft curve. The other GMs pick best value with a little randomness and positional need. Draft for your team when you\'re on the clock.</p></div>';
      h += '<div class="controls"><label>I\'m drafting for ' + ui.teamSelect('mk-team', me, 'Nobody (watch only)') + '</label><button class="btn" id="mk-new">↻ New mock</button>' + (me && onClock ? '<button class="btn ghost" id="mk-auto">Auto-pick the rest</button>' : '') + '</div>';
      h += '<div class="grid g2"><div class="card"><h2>' + (onClock ? (onClock.owner === me ? '⏰ You\'re on the clock: pick ' + (st.i + 1) : 'Pick ' + (st.i + 1)) : 'Draft complete') + '</h2><div id="mk-avail"></div></div>';
      h += '<div class="card"><h2>Draft board</h2><div id="mk-log"></div></div></div>';
      el.innerHTML = h;
      U.qs('#mk-team', el).addEventListener('change', function (e) { DP.go('mock', null, { team: e.target.value }); });
      U.qs('#mk-new', el).addEventListener('click', function () { mockState.v = -1; DP.render(); });
      var au = U.qs('#mk-auto', el); if (au) au.addEventListener('click', function () { st.auto = true; mockRun(st); DP.render(); });
      var avail = st.pool.filter(function (x) { return !st.taken[x.key]; }).slice(0, 40);
      U.qs('#mk-avail', el).innerHTML = onClock ? '<div class="tbl-wrap" style="max-height:520px;overflow:auto"><table class="t"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Source</th><th class="num">Value</th><th></th></tr></thead><tbody>' + avail.map(function (x, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td>' + (x.p ? ui.plink(x.p) : '<b>' + esc(x.name) + '</b>') + '<br><span class="faint small">' + esc(x.team || '') + '</span></td><td>' + esc(x.pos) + '</td><td class="small muted">' + esc(x.src) + '</td><td class="num">' + U.fmt(x.v, 1) + '</td><td>' + (onClock.owner === me ? '<button class="btn sm primary" data-draft="' + esc(x.key) + '">Draft</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="small">Your haul: ' + st.log.filter(function (l) { return l.slot.owner === me; }).map(function (l) { return esc(l.x.name); }).join(', ') + '</p>';
      var mineN = 0;
      U.qs('#mk-log', el).innerHTML = '<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="t"><thead><tr><th class="num">Pick</th><th>Team</th><th>Player</th><th class="num">Value</th></tr></thead><tbody>' + st.order.map(function (o, i) {
        var l = st.log[i], mine = o.owner === me; if (mine && l) mineN++;
        return '<tr class="' + (mine ? 'mine' : '') + '"><td class="num">' + o.r + '.' + (i % E.teams.length + 1) + '</td><td>' + esc(o.owner) + (o.orig !== o.owner ? ' <span class="faint small">(' + esc(o.orig) + ')</span>' : '') + '</td><td>' + (l ? (l.x.p ? ui.plink(l.x.p) : esc(l.x.name)) + ' <span class="faint small">' + esc(l.x.pos) + '</span>' : (i === st.i ? '<b>on the clock</b>' : '')) + '</td><td class="num">' + (l ? U.fmt(l.x.v, 1) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-draft]'); if (!b) return;
        var x = st.pool.find(function (y) { return y.key === b.dataset.draft; }); if (!x || st.taken[x.key] || !st.order[st.i]) return;
        st.taken[x.key] = 1; st.log.push({ slot: st.order[st.i], x: x }); st.i++; mockRun(st); DP.render();
      });
    }
  };

  // ================================================================== GM trade personas (used on Trade History)
  DP.personas = function () {
    var E = DP.E, T = (DP.league && DP.league.trades) || [], out = {};
    E.teams.forEach(function (t) { out[t] = { t: t, n: 0, picksIn: 0, picksOut: 0, pv: 0, warIn: 0, warOut: 0, dvIn: 0, dvOut: 0, ageIn: [], ageOut: [], capIn: 0, capOut: 0 }; });
    T.forEach(function (tr) {
      tr.teams.forEach(function (t) { if (out[t]) out[t].n++; });
      tr.moves.forEach(function (m) {
        var to = out[m.to], fr = out[m.from];
        if (m.kind === 'pick') {
          var v = m.year >= 2027 ? E.pickValue({ year: m.year, round: m.round, orig: m.orig }) : 1;
          if (to) { to.picksIn++; to.pv += v; } if (fr) { fr.picksOut++; fr.pv -= v; }
        } else if (m.kind === 'player' && m.id && E.byId[m.id]) {
          var p = E.byId[m.id];
          if (to) { to.warIn += p.WAR; to.dvIn += p.DV; to.ageIn.push(p.age || 27); to.capIn += p.sal26 || 0; }
          if (fr) { fr.warOut += p.WAR; fr.dvOut += p.DV; fr.ageOut.push(p.age || 27); fr.capOut += p.sal26 || 0; }
        }
      });
    });
    var avg = function (a) { return a.length ? E.sum(a) / a.length : null; };
    E.teams.forEach(function (t) {
      var o = out[t], tags = [];
      o.ageDiff = o.ageIn.length && o.ageOut.length ? avg(o.ageIn) - avg(o.ageOut) : null;
      o.warNet = o.warIn - o.warOut; o.capNet = o.capIn - o.capOut; o.picksNet = o.picksIn - o.picksOut;
      if (!o.n) tags.push(['🧘', 'Stands pat', 'No trades yet']);
      if (o.n >= 5) tags.push(['📞', 'Wheeler-dealer', o.n + ' trades']);
      if (o.picksNet <= -2 && o.warNet > 0) tags.push(['🏆', 'Win-now buyer', 'Sends picks for players who help this season']);
      if (o.picksNet >= 2 || (o.ageDiff !== null && o.ageDiff <= -3)) tags.push(['🌱', 'Futures collector', 'Adds picks and younger players']);
      if (o.capNet <= -3) tags.push(['✂️', 'Cap surgeon', 'Moves salary off the books']);
      if (o.capNet >= 3) tags.push(['💼', 'Cap sponge', 'Takes on salary']);
      if (o.n && !tags.length) tags.push(['🎯', 'Opportunist', 'Value-for-value deals']);
      o.tags = tags;
    });
    return out;
  };
  DP.personasHtml = function () {
    var P = DP.personas(), me = DP.state.team;
    return '<div class="tbl-wrap"><table class="t"><thead><tr><th>GM</th><th>Persona</th><th class="num">Trades</th><th class="num">Picks in / out</th><th class="num">Net pick value</th><th class="num">WAR in − out</th><th class="num">Age in vs out</th><th class="num">Cap in − out</th></tr></thead><tbody>' +
      DP.E.teams.map(function (t) { return P[t]; }).sort(function (a, b) { return b.n - a.n; }).map(function (o) {
        return '<tr class="' + (o.t === me ? 'mine' : '') + '"><td><b>' + esc(o.t) + '</b></td><td>' + o.tags.map(function (g) { return '<span class="badge info" title="' + esc(g[2]) + '">' + g[0] + ' ' + esc(g[1]) + '</span>'; }).join(' ') + '</td><td class="num">' + o.n + '</td><td class="num">' + o.picksIn + ' / ' + o.picksOut + '</td><td class="num">' + ui.delta(o.pv, 1) + '</td><td class="num">' + ui.delta(o.warNet, 1) + '</td><td class="num">' + (o.ageDiff === null ? '–' : U.sgn(o.ageDiff, 1) + ' yrs') + '</td><td class="num">' + U.sm(o.capNet) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">From every trade in the log, valued with today\'s projections. Personas are simple labels from those numbers, not judgments.</p>';
  };

  // ================================================================== Awards race + Team Wrapped
  function tradeNets() { // per trade: net value by team under the model lens
    var E = DP.E;
    return ((DP.league && DP.league.trades) || []).map(function (tr) {
      var net = {};
      tr.teams.forEach(function (t) { net[t] = 0; });
      tr.moves.forEach(function (m) {
        var v = m.kind === 'player' ? (m.id && E.byId[m.id] ? E.dvWith(E.byId[m.id]) : 0) : m.kind === 'pick' ? (m.year >= 2027 ? E.pickValue({ year: m.year, round: m.round, orig: m.orig }) : 0) : 0;
        if (net[m.to] !== undefined) net[m.to] += v; if (net[m.from] !== undefined) net[m.from] -= v;
      });
      return { tr: tr, net: net };
    });
  }
  function luck() { // actual category win% vs what the projections expected in the weeks already played
    var E = DP.E, act = E.actual(); if (!act || act.odd || !act.done) return null;
    var exp = {}; E.teams.forEach(function (t) { exp[t] = 0; });
    DP.meta.h2h.forEach(function (g) {
      if (g[0] - 1 >= act.done) return;
      var pr = E.matchupProbs(E.baseline[g[1]][g[0] - 1], E.baseline[g[2]][g[0] - 1]);
      exp[g[1]] += E.sum(pr.map(function (x) { return x.w + x.t / 2; })); exp[g[2]] += E.sum(pr.map(function (x) { return x.l + x.t / 2; }));
    });
    return E.teams.map(function (t) { var a = act.rec[t] || { W: 0, T: 0 }; return { t: t, act: a.W + a.T / 2, exp: exp[t], luck: a.W + a.T / 2 - exp[t] }; }).sort(function (a, b) { return b.luck - a.luck; });
  }
  DP.pages.awards = {
    title: 'Awards & Wrapped',
    render: function (el, hsh) {
      var E = DP.E, me = hsh.q.team || DP.state.team, own = E.P.filter(function (p) { return p.gm && p.r; });
      var top = function (arr, f, n) { return arr.slice().sort(function (a, b) { return f(b) - f(a); }).slice(0, n || 5); };
      var li = function (p, right) { return '<li>' + ui.pos(p) + '<span>' + ui.pcell(p) + '<br><span class="small muted">' + esc(p.gm) + '</span></span><span class="num" style="margin-left:auto">' + right + '</span></li>'; };
      var h = '<div class="page-head"><h1>🏅 Awards race & Team Wrapped</h1><p class="sub">Season awards as they stand today (projections now, real results as the season goes), plus a season-in-review card for every team. Awards are for fun; every number comes from the model or the league\'s own data.</p></div>';
      h += '<div class="grid g3">';
      h += '<div class="card"><h2>🏆 MVP race</h2><div class="hint">Most category wins above replacement (season projection, including games played).</div><ul class="list-plain">' + top(own, function (p) { return p.WAR; }).map(function (p) { return li(p, '<b>' + U.fmt(p.WAR, 1) + '</b> WAR'); }).join('') + '</ul></div>';
      h += '<div class="card"><h2>💸 Contract of the year</h2><div class="hint">Biggest 2026-27 surplus: market value minus salary (MNR excluded).</div><ul class="list-plain">' + top(own.filter(function (p) { return p.ct !== 'MNR'; }), function (p) { return p.surplus; }).map(function (p) { return li(p, '<b class="good">' + U.sm(p.surplus) + '</b>'); }).join('') + '</ul></div>';
      h += '<div class="card"><h2>🌟 Rookie of the year</h2><div class="hint">MNR and ELC players by WAR.</div><ul class="list-plain">' + top(own.filter(function (p) { return p.ct === 'MNR' || p.ct === 'ELC1'; }), function (p) { return p.WAR; }).map(function (p) { return li(p, '<b>' + U.fmt(p.WAR, 1) + '</b> WAR'); }).join('') + '</ul></div>';
      var tn = tradeNets(), best = null;
      tn.forEach(function (x) { Object.keys(x.net).forEach(function (t) { if (!best || x.net[t] > best.v) best = { t: t, v: x.net[t], tr: x.tr }; }); });
      h += '<div class="card"><h2>🤝 Trade of the year</h2><div class="hint">The biggest value win in any single trade (today\'s dynasty values).</div>' + (best ? '<p><b>' + esc(U.teamName(best.t)) + '</b> won the ' + esc(best.tr.date) + ' deal by <b>' + U.fmt(best.v, 1) + '</b> dynasty value.</p><p class="small muted">' + best.tr.moves.map(function (m) { return esc(m.label) + ' → ' + esc(m.to); }).join(' · ') + '</p><p><a href="#/history">All trades →</a></p>' : '<p class="muted">No trades yet.</p>') + '</div>';
      var adds = (DP.league.moves || []).filter(function (m) { return m.type === 'add' && E.byId[m.id] && E.byId[m.id].gm === m.to; }).map(function (m) { return E.byId[m.id]; });
      h += '<div class="card"><h2>🛒 Pickup of the year</h2><div class="hint">Players added from free agency this season (Fantrax log), by WAR.</div>' + (adds.length ? '<ul class="list-plain">' + top(adds, function (p) { return p.WAR; }).map(function (p) { return li(p, '<b>' + U.fmt(p.WAR, 1) + '</b> WAR'); }).join('') + '</ul>' : '<p class="muted small">Fills in as GMs add free agents (logged nightly from Fantrax).</p>') + '</div>';
      var L = luck();
      h += '<div class="card"><h2>🍀 Luck meter</h2><div class="hint">Category wins so far minus what the projections expected for those matchups.</div>' + (L ? '<ul class="list-plain">' + [L[0], L[1], L[L.length - 2], L[L.length - 1]].map(function (x, i) { return '<li><span><b>' + esc(U.teamName(x.t)) + '</b><br><span class="small muted">' + U.fmt(x.act, 0) + ' cat wins vs ' + U.fmt(x.exp, 1) + ' expected</span></span><span class="num ' + (x.luck >= 0 ? 'good' : 'bad') + '" style="margin-left:auto">' + U.sgn(x.luck, 1) + (i < 2 ? ' 🍀' : ' 🌧️') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted small">Starts after week 1.</p>') + '</div>';
      h += '</div>';
      h += '<div class="card" style="margin-top:14px"><h2>🎁 Team Wrapped</h2><div class="controls"><label>Team ' + ui.teamSelect('aw-team', me, 'Choose a team…') + '</label></div><div id="aw-wrap"></div></div>';
      el.innerHTML = h;
      U.qs('#aw-team', el).addEventListener('change', function (e) { DP.go('awards', null, { team: e.target.value }); });
      if (me) U.qs('#aw-wrap', el).innerHTML = wrapped(me, tn, L);
    }
  };
  function wrapped(t, tn, L) {
    var E = DP.E, ros = E.rosters[t], TS = DP.teamSummary(), s = TS[t], act = E.actual();
    var mvp = ros.filter(function (p) { return p.r; }).sort(function (a, b) { return b.WAR - a.WAR; })[0];
    var bargain = ros.filter(function (p) { return p.r && p.ct !== 'MNR'; }).sort(function (a, b) { return b.surplus - a.surplus; })[0];
    var prospect = ros.filter(function (p) { return p.ct === 'MNR'; }).sort(function (a, b) { return b.DV - a.DV; })[0];
    var myTrades = tn.filter(function (x) { return x.net[t] !== undefined; }), net = E.sum(myTrades.map(function (x) { return x.net[t]; }));
    var mv = (DP.league.moves || []).filter(function (m) { return m.to === t || m.from === t; });
    var grads = ros.filter(function (p) { return p.ct === 'MNR'; }).map(function (p) { return E.graduation(p); }).filter(function (g) { return g.status === 'graduated' || g.week !== null; }).length;
    var lk = L ? L.find(function (x) { return x.t === t; }) : null;
    var real = act && !act.odd && act.rec[t];
    var recV = real ? act.rec[t].W + '-' + act.rec[t].L + '-' + act.rec[t].T : U.fmt(s.exp.W, 0) + '-' + U.fmt(s.exp.L, 0) + '-' + U.fmt(s.exp.T, 0);
    var tile = function (l, v, d) { return DP.statTile(l, v, d); };
    var strengths = E.CATS.map(function (c, i) { return [c.l, s.rank[i]]; }).sort(function (a, b) { return a[1] - b[1]; });
    return '<div class="stats">' + tile('Category record', recV, real ? 'so far (Fantrax)' : 'projected for the season') + tile('Power rank', '#' + s.prank, 'now + dynasty + prospects') +
      tile('MVP', mvp ? esc(mvp.n) : '–', mvp ? U.fmt(mvp.WAR, 1) + ' WAR' : '') + tile('Best bargain', bargain ? esc(bargain.n) : '–', bargain ? U.sm(bargain.surplus) + ' surplus' : '') +
      tile('Top prospect', prospect ? esc(prospect.n) : '–', prospect ? 'DV ' + U.fmt(prospect.DV, 1) : '') + tile('Trades', myTrades.length, myTrades.length ? 'net ' + U.sgn(net, 1) + ' value' : 'none yet') +
      tile('Roster moves', mv.length, 'adds, drops, contract changes') + tile('Graduations', grads, 'MNR players reaching the line') +
      tile('Cap used', U.m(s.pay, 1), U.m(s.space, 1) + ' left') + (lk ? tile('Luck', U.sgn(lk.luck, 1), 'cat wins vs expected') : '') + '</div>' +
      '<p class="small">Best categories: <b>' + strengths.slice(0, 3).map(function (x) { return esc(x[0]) + ' (' + U.ord(x[1]) + ')'; }).join(', ') + '</b> · needs work: ' + strengths.slice(-3).reverse().map(function (x) { return esc(x[0]) + ' (' + U.ord(x[1]) + ')'; }).join(', ') + '.</p>' +
      '<p class="small muted">Share it: <a href="' + U.hash('awards', null, { team: t }) + '">link to this card</a>. At season\'s end this becomes the final recap.</p>';
  }
})();
