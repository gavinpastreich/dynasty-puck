/* Dynasty Puck HQ - Offseason Planner.
 *   Roster planner: one team's roster season by season, with every contract decision as a what-if (ELC length for
 *     graduating MNR players, re-sign terms, let go, win back at the auction) and the cap and roster room it leaves.
 *   League outlook: every team's commitments by season and what comes off the books each summer.
 *   Decisions & auction: the summer-2027 tables (pages-cap.js).
 * A plan is saved per team on this device only (localStorage dp_plan_<team>). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};
  var ROSTER = 23; // Active + Bench
  var EVENT = { ufa: 'UFA (to the auction)', rfa: 'RFA decision', elcup: 'ELC up', sign: 'ELC to sign' };
  var yr = function (y) { return 2026 + y; };
  var known = function (v) { return v !== null && v !== undefined; };

  // ---------------------------------------------------------------- one player under a plan
  // plan entry (one of): { elc: 0|1|2 } MNR's first deal · { dec: { y: years|0 } } re-sign call · { rebuy: 1 } win back at auction
  function pathOf(p, pl) {
    var E = DP.E, cp = pl && (pl.elc !== undefined || pl.dec) ? E.costPath(p, p.yWar, pl) : { cost: p.yCost, status: p.yStatus };
    var cost = cp.cost.slice(), status = cp.status.slice();
    if (pl && pl.rebuy && status[1] === 'UFA') { // projected auction price (hometown discount if he qualifies) for the band's term
      var a = E.auctionPrice(p, 1), price = E.htdTeam(p) ? E.htdPrice(a.mid) : a.mid;
      for (var k = 0; k < a.term && 1 + k < 7; k++) { cost[1 + k] = Math.round(price * 100) / 100; status[1 + k] = 'Auction'; }
    }
    return { cost: cost, status: status };
  }
  // the next call a GM makes on a player: { kind, y (season it takes effect; 1 = 2027-28), opts: [[value, label]], cur, model }
  function choiceOf(p, pl) {
    var E = DP.E, R = E.RULES;
    if (p.ct === 'MNR') {
      if (!known(p.grad) || p.grad + 1 > 6) return null;
      var def = String(R.elcYears || 2);
      return { kind: 'elc', y: p.grad + 1, model: def, cur: pl && pl.elc !== undefined ? String(pl.elc) : def,
        opts: [['2', 'Sign ELC: 2 yrs @ ' + U.m(R.elcSalary)], ['1', 'Sign ELC: 1 yr @ ' + U.m(R.elcSalary)], ['0', 'Release']] };
    }
    var d = E.nextDecision(p);
    if (d && d.opts) {
      var model = d.model || d.pick, mv = model ? String(model.L) : '0';
      return { kind: 'dec', y: d.y, model: mv, cur: pl && pl.dec && pl.dec[d.y] !== undefined ? String(pl.dec[d.y]) : mv,
        opts: d.opts.map(function (o) { return [String(o.L), (d.kind === 'elcUp' && o.L === 1 ? '1-yr ELC ext' : 'Re-sign ' + o.L + ' yr' + (o.L > 1 ? 's' : '')) + ' @ ' + U.m(o.price) + (String(o.L) === mv ? ' ★' : '')]; })
          .concat([['0', 'Let him go' + (mv === '0' ? ' ★' : '')]]) };
    }
    if (p.yStatus && p.yStatus[1] === 'UFA' && p.yStatus[0] !== 'UFA') { // contract up (or 27+): back to the auction next summer
      var a = E.auctionPrice(p, 1), price = E.htdTeam(p) ? E.htdPrice(a.mid) : a.mid;
      return { kind: 'rebuy', y: 1, model: '', cur: pl && pl.rebuy ? '1' : '',
        opts: [['', 'Leaves: UFA auction'], ['1', 'Win him back ~' + U.m(price) + ' × ' + a.term + ' yr' + (a.term > 1 ? 's' : '') + (E.htdTeam(p) ? ' (hometown)' : '')]] };
    }
    return null;
  }
  // the next contract event for a rostered player (facts and the rules, no plan): { y: summer (1 = 2027), type, sal }
  DP.contractEvent = function (p) {
    var E = DP.E;
    if (!p.gm) return null;
    if (p.ct === 'MNR') return known(p.grad) && p.grad + 1 <= 6 ? { y: p.grad + 1, type: 'sign', sal: 0 } : null;
    var last = function (y) { return typeof p.cy[y - 1] === 'number' ? p.cy[y - 1] : p.sal26; }, d = E.nextDecision(p);
    if (d) return { y: d.y, type: d.why === 'age' ? 'ufa' : d.kind === 'elcUp' ? 'elcup' : 'rfa', sal: last(d.y), d: d };
    var i = p.yStatus ? p.yStatus.indexOf('UFA') : -1;
    return i > 0 ? { y: i, type: 'ufa', sal: last(i) } : null;
  };
  // "2-yr ELC, signed 2026" for a contract the sheet has a term for
  DP.dealText = function (p) {
    if (!p.c || !p.c.term || p.ct === 'MNR') return '';
    return p.c.term + '-yr ' + (p.ct === 'ELC1' ? 'ELC' : p.ct === 'RFA1' ? 'RFA deal' : p.ct === 'BID' ? 'auction deal' : 'deal') + (p.c.signed ? ', signed ' + p.c.signed : '');
  };

  // ---------------------------------------------------------------- one team under a plan
  // rows: every player with his cost and status by season; yrs: committed money, cap, space and roster counts by season
  DP.planFor = function (t, plan) {
    var E = DP.E;
    plan = plan || {};
    var rows = E.rosters[t].map(function (p) {
      var pl = plan[p.id] || null, path = pathOf(p, pl);
      return { p: p, pl: pl, cost: path.cost, status: path.status, ch: choiceOf(p, pl) };
    });
    var pen = E.penaltiesOf(t);
    var yrs = E.YEARS.map(function (_, y) {
      var o = { y: y, cap: E.capOf(t, y), dead: E.sum(pen.map(function (d) { return d.amt[y] || 0; })), signed: 0, elc: 0, re: 0, auc: 0, n: 0, nSigned: 0, nElc: 0, pos: { F: 0, D: 0, G: 0 }, mnr: 0, off: 0 };
      rows.forEach(function (r) {
        var c = r.cost[y], s = r.status[y], p = r.p;
        if (y === 0) { // this season: the 23 are whoever sits in Active and Bench slots; IR and Minors slots are off the cap
          if (p.ct === 'MNR') o.mnr++;
          if (p.fs === 'A' || p.fs === 'R') { o.n++; o.pos[p.slot] = (o.pos[p.slot] || 0) + 1; }
          if (typeof c === 'number') { if (E.offCap(p)) o.off += c; else { o.signed += c; if (p.ct !== 'MNR') o.nSigned++; } }
          return;
        }
        if (s === 'MNR') { o.mnr++; return; }
        if (typeof c !== 'number') return;
        o.n++; o.pos[p.slot] = (o.pos[p.slot] || 0) + 1;
        if (s === 'ELC') { o.elc += c; if (r.status[y - 1] === 'MNR') o.nElc++; }
        else if (s === 'Auction') o.auc += c;
        else if (/^(RFA|ELC ext)/.test(s)) o.re += c;
        else { o.signed += c; o.nSigned++; }
      });
      o.total = o.signed + o.elc + o.re + o.auc + o.dead; o.space = o.cap - o.total; o.open = ROSTER - o.n;
      return o;
    });
    return { rows: rows, yrs: yrs };
  };

  // ---------------------------------------------------------------- page
  DP.pages.offseason = {
    title: 'Offseason Planner',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team, tab = /^(league|dec)$/.test(q.tab) ? q.tab : 'plan';
      var t = q.team !== undefined && (E.rosters[q.team] || q.team === '') ? q.team : (me || '');
      var go = function (o) { DP.go('offseason', null, Object.assign({ tab: tab === 'plan' ? '' : tab, team: t === (me || '') ? undefined : t, s: q.s, mode: q.mode }, o || {})); };
      var h = '<div class="page-head"><h1>📅 Offseason Planner</h1><p class="sub">Plan the roster past this season: who is signed and for how long, which MNR players graduate and need an ELC, every re-sign decision as a what-if, and what it all leaves in cap space and roster spots. Plus the league\'s contracts by season and what comes off the books each summer.</p></div>';
      h += '<div class="controls"><div class="seg" role="tablist">' + [['plan', 'Roster planner'], ['league', 'League outlook'], ['dec', 'Decisions & auction']].map(function (x) { return '<button data-tab="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        (tab !== 'league' ? '<label>Team ' + ui.teamSelect('os-team', t, tab === 'dec' ? 'All teams' : 'Choose a team…') + '</label>' : '') + '</div><div id="os-body"></div>';
      el.innerHTML = h;
      U.qsa('[data-tab]', el).forEach(function (b) { b.addEventListener('click', function () { go({ tab: b.dataset.tab === 'plan' ? '' : b.dataset.tab }); }); });
      var ts = U.qs('#os-team', el); if (ts) ts.addEventListener('change', function (e) { go({ team: e.target.value === (me || '') ? undefined : e.target.value }); });
      var body = U.qs('#os-body', el);
      if (tab === 'league') leagueTab(body, q, go);
      else if (tab === 'dec') {
        DP.offseasonTables.render(body, { q: { team: t } });
        ['.page-head', '.controls'].forEach(function (s) { var x = U.qs(s, body); if (x) x.parentNode.removeChild(x); });
      } else if (!t) body.innerHTML = '<div class="callout">Choose a team above to plan its roster. <button class="btn sm primary" data-act="pick-team">Set my team</button></div>';
      else planTab(body, t);
    }
  };

  // ---------------------------------------------------------------- Roster planner tab
  function cell(r, y) {
    var E = DP.E, c = r.cost[y], s = r.status[y], prev = y > 0 ? r.status[y - 1] : null, td = function (cls, txt, tip) { return '<td class="num pc ' + cls + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + txt + '</td>'; };
    if (s === 'MNR') return td('c-mnr', 'MNR', 'MNR contract: $0, in the minors until he graduates');
    if (typeof c !== 'number') {
      if (y > 0 && prev && prev !== 'UFA' && prev !== 'FA') return td('c-ufa', prev === 'MNR' ? 'released' : 'UFA', prev === 'MNR' ? 'Released instead of signing his ELC' : 'Rights end: back to the auction in summer ' + yr(y));
      return td('c-none', '');
    }
    var signed = y === 0 || s === 'contract' || s === r.p.ct; // a deal that exists today (an RFA1 contract is not a re-sign to come)
    if (!signed && s === 'ELC') return td('c-elc', U.m(c) + '<span>ELC</span>', prev === 'MNR' ? 'Entry-level deal signed in summer ' + yr(y) : 'Entry-level deal');
    if (!signed && s === 'Auction') return td('c-auc', '~' + U.m(c) + '<span>auction</span>', 'Projected price to win him back at the summer ' + yr(1) + ' auction (a projection, not a contract)');
    if (!signed && s === 'ELC ext') return td('c-re', U.m(c) + '<span>ELC ext</span>', '1-year ELC extension, then UFA');
    if (!signed && /^RFA/.test(s)) return td('c-re', U.m(c) + '<span>re-sign</span>', 'Re-signed as an RFA (' + s.replace('RFA ', '') + ' deal): a planned or modeled call, not signed yet');
    var off = y === 0 ? E.offCap(r.p) : null;
    return td('c-con' + (off ? ' c-off' : ''), U.m(c) + (off ? '<span>' + (off === 'IR' ? 'IR' : 'minors') + '</span>' : ''), off ? 'Off the 2026-27 cap while in ' + (off === 'IR' ? 'an IR' : 'a Minors') + ' slot' : 'Under contract');
  }
  function planTab(box, t) {
    var E = DP.E, plan = U.store.get('plan_' + t, {}), P = DP.planFor(t, plan), base = DP.planFor(t, {}), Y = E.YEARS, n1 = P.yrs[1], minS = E.RULES.minSalary;
    var changed = Object.keys(plan).length;
    var newElc = P.rows.filter(function (r) { return r.status[1] === 'ELC' && r.status[0] === 'MNR'; });
    var calls = P.rows.filter(function (r) { return r.ch && r.ch.y === 1 && r.ch.kind === 'dec'; });
    var leaving = P.rows.filter(function (r) { return r.status[1] === 'UFA' && r.status[0] !== 'UFA' && r.p.ct !== 'MNR'; });
    var need = E.RULES.lineup || { F: 12, D: 6, G: 2 }, short = ['F', 'D', 'G'].filter(function (k) { return n1.pos[k] < need[k]; });
    var h = '<div class="stats">' +
      DP.statTile('Cap space ' + Y[1], '<span class="' + (n1.space < 0 ? 'bad' : '') + '">' + U.m(n1.space) + '</span>', U.m(n1.total, 1) + ' of $' + n1.cap + 'M' + (changed ? ' · model\'s calls: ' + U.m(base.yrs[1].space, 1) : '')) +
      DP.statTile('Roster ' + Y[1], n1.n + ' / ' + ROSTER, (n1.open > 0 ? n1.open + ' open spot' + (n1.open > 1 ? 's' : '') : n1.open < 0 ? '<span class="bad">' + (-n1.open) + ' too many</span>' : 'full') + ' · F ' + n1.pos.F + ' · D ' + n1.pos.D + ' · G ' + n1.pos.G) +
      DP.statTile('ELCs to sign', newElc.length, newElc.length ? U.m(E.sum(newElc.map(function (r) { return r.cost[1]; })), 1) + ' · ' + newElc.map(function (r) { return r.p.n.split(' ').slice(-1)[0]; }).join(', ') : 'no MNR projected to graduate this season') +
      DP.statTile('Re-sign calls', calls.length, calls.length ? 'RFA and ELC-up decisions in summer ' + yr(1) : 'none in summer ' + yr(1)) +
      DP.statTile('Leaving', leaving.length, leaving.length ? U.m(E.sum(leaving.map(function (r) { return r.cost[0] || 0; })), 1) + ' of salary to the auction' : 'nobody hits the auction') +
      (n1.open > 0 && n1.space > 0 ? DP.statTile('Max auction bid', U.m(n1.space - (n1.open - 1) * minS, 1), U.m(n1.space / n1.open, 1) + ' per open spot · keeps $' + minS + 'M for each other spot') : '') + '</div>';
    if (n1.space < 0) h += '<div class="callout bad">This plan is ' + U.m(-n1.space) + ' over the ' + Y[1] + ' cap. Let someone go, pick a shorter or cheaper option, or plan a trade.</div>';
    else if (n1.open < 0) h += '<div class="callout warn">This plan has ' + n1.n + ' players for ' + ROSTER + ' Active and Bench spots in ' + Y[1] + '. Players who can still go to the minors don\'t need one; everyone else does.</div>';
    else if (short.length) h += '<div class="callout">Lineup needs for ' + Y[1] + ' (12 F, 6 D, 2 G): short at ' + short.map(function (k) { return '<b>' + k + '</b> (' + n1.pos[k] + ' of ' + need[k] + ')'; }).join(', ') + ' before the auction, with ' + U.m(n1.space, 1) + ' to spend.</div>';
    h += '<div class="card flush" style="margin-top:14px"><h2>' + esc(U.teamName(t)) + ': roster by season' + (changed ? ' <span class="badge warn">' + changed + ' change' + (changed > 1 ? 's' : '') + ' from the model\'s calls</span>' : '') + '</h2>' +
      '<div class="hint">Every player and what he costs each season. Set the <b>next decision</b> on a player to see what it does to your cap and roster; ★ marks the model\'s call (best projected surplus). ' +
      '<span class="pk c-con">signed</span> <span class="pk c-elc">new ELC</span> <span class="pk c-re">re-sign (planned)</span> <span class="pk c-auc">auction (projected)</span> <span class="pk c-mnr">MNR, $0</span> <span class="pk c-ufa">rights end</span>. Saved on this device only.' +
      (changed ? ' <button class="btn sm" id="pl-reset">Reset to the model\'s calls</button>' : '') + '</div>';
    var main = P.rows.filter(function (r) { return r.p.ct !== 'MNR' || (known(r.p.grad) && r.p.grad <= 1); });
    var far = P.rows.filter(function (r) { return main.indexOf(r) < 0; });
    h += '<div class="tbl-wrap" style="padding:0 12px"><table class="t plan"><thead><tr><th>Player</th><th>Now</th><th>Next decision</th>' + Y.map(function (y) { return '<th class="num">' + y.slice(2) + '</th>'; }).join('') + '</tr></thead><tbody>';
    [['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']].forEach(function (g) {
      var rs = main.filter(function (r) { return r.p.slot === g[0]; }).sort(function (a, b) { return (b.p.ct === 'MNR' ? -1 : b.cost[0] || 0) - (a.p.ct === 'MNR' ? -1 : a.cost[0] || 0) || b.p.WAR - a.p.WAR; });
      h += '<tr class="grp"><td colspan="' + (3 + Y.length) + '">' + g[1] + ' <span class="faint small">' + P.yrs.slice(0, 4).map(function (o) { return Y[o.y].slice(2) + ': ' + (o.pos[g[0]] || 0); }).join(' · ') + ' (lineup needs ' + need[g[0]] + ')</span></td></tr>';
      rs.forEach(function (r) {
        var p = r.p, ch = r.ch, gr = p.ct === 'MNR' ? E.graduation(p) : null, deal = DP.dealText(p);
        h += '<tr><td>' + ui.pos(p) + ' ' + ui.plink(p) + ' <span class="faint small">' + Math.floor(p.age || 0) + 'y</span></td>' +
          '<td class="nw">' + ui.pill(p.ct) + ' ' + (p.ct === 'MNR' ? '<span class="small muted">' + gr.cgp + '/' + gr.thr + ' GP</span>' : U.m(p.sal26)) + (deal ? ' <span class="faint small" title="' + esc(deal) + '">' + p.c.term + 'y</span>' : '') + (DP.fsTag ? DP.fsTag(p) : '') + '</td><td class="nw">' +
          (ch ? '<span class="faint small">' + yr(ch.y) + '</span> <select class="plsel' + (ch.cur !== ch.model ? ' chg' : '') + '" data-plan="' + esc(p.id) + '" data-kind="' + ch.kind + '" data-y="' + ch.y + '" data-model="' + esc(ch.model) + '" aria-label="Decision for ' + esc(p.n) + '">' + ch.opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === ch.cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' : '') + '</td>' +
          Y.map(function (_, y) { return cell(r, y); }).join('') + '</tr>';
      });
    });
    var foot = function (label, f, cls) { return '<tr class="' + (cls || '') + '"><td colspan="3"><b>' + label + '</b></td>' + P.yrs.map(function (o) { return '<td class="num">' + f(o) + '</td>'; }).join('') + '</tr>'; };
    h += '</tbody><tfoot>' +
      foot('Committed <span class="faint small">contracts, planned deals and dead cap</span>', function (o) { return U.m(o.total, 1); }, 'sum') +
      foot('Cap', function (o) { return '$' + o.cap + 'M'; }) +
      foot('Cap space', function (o) { return '<b class="' + (o.space < 0 ? 'bad' : 'good') + '">' + U.m(o.space, 1) + '</b>'; }) +
      foot('Players on the roster <span class="faint small">of ' + ROSTER + ' Active + Bench</span>', function (o) { return '<span class="' + (o.n > ROSTER ? 'bad' : '') + '">' + o.n + '</span>'; }) +
      foot('Open spots', function (o) { return o.open; }) +
      foot('F · D · G', function (o) { return ['F', 'D', 'G'].map(function (k) { return '<span class="' + (o.y > 0 && o.pos[k] < need[k] ? 'warn' : '') + '">' + (o.pos[k] || 0) + '</span>'; }).join(' · '); }) +
      foot('MNR prospects <span class="faint small">$0</span>', function (o) { return o.mnr; }) + '</tfoot></table></div>' +
      '<p class="small muted" style="padding:0 14px">2026-27 is the roster as it stands in Fantrax (Active and Bench slots count against the cap; IR and Minors slots don\'t). Later seasons count every contract, because nobody knows yet who will be on IR or in the minors. A graduated MNR signs his ELC the summer after he graduates: $' + E.RULES.elcSalary + 'M for 1 or 2 years, your choice. Re-sign prices follow the league rules; decisions after the first one on each player follow the model. Auction prices are projections.</p></div>';
    if (far.length) h += '<details class="card" style="margin-top:14px"><summary><b>' + far.length + ' prospects further out</b> <span class="small muted">MNR players not projected to need an ELC before ' + Y[3] + '</span></summary><ul class="small" style="columns:2;margin:8px 0 0;padding-left:18px">' +
      far.sort(function (a, b) { return (known(a.p.grad) ? a.p.grad : 9) - (known(b.p.grad) ? b.p.grad : 9) || b.p.DV - a.p.DV; }).map(function (r) { return '<li>' + ui.plink(r.p) + ' <span class="faint">' + esc(r.p.slot) + ' · ' + Math.floor(r.p.age || 0) + 'y · ' + (known(r.p.grad) && r.p.grad + 1 <= 6 ? 'ELC from ' + Y[r.p.grad + 1] + ' (projected)' : 'not projected to graduate by ' + Y[6]) + '</span></li>'; }).join('') + '</ul></details>';
    h += '<div class="card" style="margin-top:14px"><h2>Committed money by season</h2><div class="hint">Red line = ' + esc(U.teamName(t)) + '\'s cap each season.</div><div id="pl-chart"></div></div>';
    box.innerHTML = h;
    var series = [['Signed deals', 'signed'], ['New ELCs', 'elc'], ['Re-signs (planned)', 're'], ['Auction (projected)', 'auc'], ['Dead cap', 'dead']].map(function (s, k) {
      return { name: s[0], values: P.yrs.map(function (o) { return +o[s[1]].toFixed(2); }), color: C.SERIES[k] };
    }).filter(function (s) { return s.values.some(function (v) { return v > 0; }); });
    U.qs('#pl-chart', box).innerHTML = C.stacked(Y.map(function (y) { return y.slice(2); }), series, { refLine: P.yrs.map(function (o) { return o.cap; }), refLabel: 'cap', fmt: function (v) { return U.m(v); }, tickFmt: function (v) { return '$' + v + 'M'; }, title: 'Committed money by season', width: 900, height: 260 });
    U.qsa('select[data-plan]', box).forEach(function (s) {
      s.addEventListener('change', function () {
        var pl = U.store.get('plan_' + t, {}), id = s.dataset.plan, v = s.value;
        if (v === s.dataset.model) delete pl[id];
        else if (s.dataset.kind === 'elc') pl[id] = { elc: +v };
        else if (s.dataset.kind === 'rebuy') pl[id] = { rebuy: 1 };
        else { var d = {}; d[s.dataset.y] = +v; pl[id] = { dec: d }; }
        U.store.set('plan_' + t, pl); DP.render();
      });
    });
    var rs = U.qs('#pl-reset', box); if (rs) rs.addEventListener('click', function () { U.store.del('plan_' + t); DP.render(); });
  }

  // ---------------------------------------------------------------- League outlook tab
  function leagueTab(box, q, go) {
    var E = DP.E, me = DP.state.team, Y = E.YEARS, NY = 5, mode = q.mode === 'signed' ? 'signed' : 'model', s = Math.min(4, Math.max(1, +q.s || 1));
    var teams = E.teams.map(function (t) { return { t: t, y: DP.planFor(t, {}).yrs }; });
    var tot = function (o) { return mode === 'signed' ? o.signed + o.dead : o.total; }, cnt = function (o) { return o.y === 0 ? o.n : mode === 'signed' ? o.nSigned : o.n; };
    var ev = E.P.filter(function (p) { return p.gm; }).map(function (p) { var e = DP.contractEvent(p); return e ? { p: p, e: e } : null; }).filter(Boolean);
    var h = '<div class="card flush"><h2>Cap space by team and season</h2><div class="hint">Each team\'s cap space, with what it has committed and how many players that covers. ' +
      '<b>With the model\'s calls</b> adds the ELCs for MNR players projected to graduate and the re-signs the model would make; <b>signed deals only</b> counts contracts that exist today (plus dead cap). 2026-27 is each team\'s own cap after traded cap space.</div>' +
      '<div class="controls" style="padding:0 12px"><div class="seg"><button data-mode="model" class="' + (mode === 'model' ? 'on' : '') + '">With the model\'s calls</button><button data-mode="signed" class="' + (mode === 'signed' ? 'on' : '') + '">Signed deals only</button></div></div><div id="lg-cap" style="padding:0 12px 12px"></div></div>';
    h += '<div class="card flush" style="margin-top:14px"><h2>What comes off the books each summer</h2><div class="hint">Contracts ending and decisions due, by team. <span class="pk c-ufa">UFA</span> rights end, back to the auction (contract up, or 27 and older) · <span class="pk c-re">RFA</span> re-sign decision · <span class="pk c-elc">ELC up</span> entry-level deal ends · <span class="pk c-mnr">sign</span> a graduated MNR needs his ELC. The $ figure is the salary those contracts carry in their last season.</div><div id="lg-exp" style="padding:0 12px 12px"></div></div>';
    h += '<div class="card flush" style="margin-top:14px"><h2>Every contract event, summer by summer</h2><div class="controls" style="padding:0 12px"><div class="seg">' + [1, 2, 3, 4].map(function (k) { return '<button data-s="' + k + '" class="' + (k === s ? 'on' : '') + '">Summer ' + yr(k) + '</button>'; }).join('') + '</div></div><div id="lg-ev" style="padding:0 12px 12px"></div></div>';
    box.innerHTML = h;
    U.qsa('[data-mode]', box).forEach(function (b) { b.addEventListener('click', function () { go({ mode: b.dataset.mode === 'model' ? '' : 'signed' }); }); });
    U.qsa('[data-s]', box).forEach(function (b) { b.addEventListener('click', function () { go({ s: b.dataset.s === '1' ? '' : b.dataset.s }); }); });
    ui.table(U.qs('#lg-cap', box), {
      rows: teams, sort: 'y1', csv: 'league-cap-outlook.csv', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
      cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<a href="' + U.hash('offseason', null, { team: r.t }) + '"><b>' + esc(U.teamName(r.t)) + '</b></a>'; } }]
        .concat(Y.slice(0, NY).map(function (y, i) {
          return { k: 'y' + i, l: y, cls: 'num', v: function (r) { return r.y[i].cap - tot(r.y[i]); }, csv: function (r) { return (r.y[i].cap - tot(r.y[i])).toFixed(2); },
            f: function (r) { var o = r.y[i], sp = o.cap - tot(o); return '<b class="' + (sp < 0 ? 'bad' : sp > 0.25 * o.cap ? 'good' : '') + '">' + U.m(sp, 1) + '</b><br><span class="small faint">' + U.m(tot(o), 1) + ' · ' + cnt(o) + ' players</span>'; } };
        }))
    });
    var chip = function (cls, n, lab) { return n ? '<span class="pk ' + cls + '">' + n + ' ' + lab + '</span> ' : ''; };
    ui.table(U.qs('#lg-exp', box), {
      rows: E.teams.map(function (t) {
        var mine = ev.filter(function (x) { return x.p.gm === t; });
        return { t: t, s: [1, 2, 3, 4].map(function (k) { var l = mine.filter(function (x) { return x.e.y === k; }), c = function (ty) { return l.filter(function (x) { return x.e.type === ty; }).length; }; return { ufa: c('ufa'), rfa: c('rfa'), elcup: c('elcup'), sign: c('sign'), sal: E.sum(l.map(function (x) { return x.e.sal || 0; })) }; }) };
      }), sort: 's0', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
      cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<a href="' + U.hash('offseason', null, { team: r.t }) + '"><b>' + esc(U.teamName(r.t)) + '</b></a>'; } }]
        .concat([1, 2, 3, 4].map(function (k, i) {
          return { k: 's' + i, l: 'Summer ' + yr(k), v: function (r) { return r.s[i].sal; },
            f: function (r) { var x = r.s[i]; return (chip('c-ufa', x.ufa, 'UFA') + chip('c-re', x.rfa, 'RFA') + chip('c-elc', x.elcup, 'ELC up') + chip('c-mnr', x.sign, 'sign') || '<span class="faint">–</span>') + (x.sal ? '<br><span class="small faint">' + U.m(x.sal, 1) + ' ending</span>' : ''); } };
        }))
    });
    var call = function (x) {
      var e = x.e, p = x.p;
      if (e.type === 'sign') return 'ELC ' + U.m(E.RULES.elcSalary) + ' (1 or 2 yrs)';
      if (e.type === 'ufa') { if (e.y !== 1) return '–'; var a = E.auctionPrice(p, 1); return 'auction ~' + U.m(a.mid) + ' · ' + a.term + ' yr' + (a.term > 1 ? 's' : ''); }
      var pk = e.d && e.d.pick; return pk ? (e.d.kind === 'elcUp' && pk.L === 1 ? '1-yr ELC ext' : 'Re-sign ' + pk.L + ' yr' + (pk.L > 1 ? 's' : '')) + ' @ ' + U.m(pk.price) : 'Let go';
    };
    ui.table(U.qs('#lg-ev', box), {
      rows: ev.filter(function (x) { return x.e.y === s; }), sort: 'war', csv: 'contract-events-' + yr(s) + '.csv', search: function (x) { return x.p.n + ' ' + x.p.gm; }, page: 40,
      empty: 'Nothing due that summer.',
      filters: [{ l: 'Team', opts: [['', 'All']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), fn: function (x, v) { return x.p.gm === v; } },
        { l: 'Event', opts: [['', 'All']].concat(Object.keys(EVENT).map(function (k) { return [k, EVENT[k]]; })), fn: function (x, v) { return x.e.type === v; } }],
      rowCls: function (x) { return x.p.gm === me ? 'mine' : ''; },
      cols: [{ k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p); } },
        { k: 'gm', l: 'GM', v: function (x) { return x.p.gm; } },
        { k: 'now', l: 'Now', v: function (x) { return x.p.sal26; }, f: function (x) { var d = DP.dealText(x.p); return ui.pill(x.p.ct) + ' ' + (x.p.ct === 'MNR' ? '' : U.m(x.p.sal26)) + (d ? '<br><span class="faint small">' + esc(d) + '</span>' : ''); }, csv: function (x) { return x.p.ct + ' ' + x.p.sal26; } },
        { k: 'ev', l: 'Event', v: function (x) { return EVENT[x.e.type]; }, f: function (x) { return '<span class="pk ' + ({ ufa: 'c-ufa', rfa: 'c-re', elcup: 'c-elc', sign: 'c-mnr' })[x.e.type] + '">' + esc(EVENT[x.e.type]) + '</span>' + (x.e.d && x.e.d.why === 'age' ? ' <span class="faint small">27+</span>' : ''); } },
        { k: 'age', l: 'Age that June 30', cls: 'num', v: function (x) { return E.ageJune30(x.p, s); }, f: function (x) { return U.fmt(E.ageJune30(x.p, s), 1); } },
        { k: 'war', l: 'WAR ' + Y[s].slice(2), cls: 'num', v: function (x) { return x.p.yWar ? x.p.yWar[s] : null; }, f: function (x) { return x.p.yWar ? U.fmt(x.p.yWar[s], 1) : '–'; } },
        { k: 'call', l: 'Model call / projection', v: function (x) { return call(x); }, f: function (x) { return '<span class="small">' + esc(call(x)) + '</span>'; } }]
    });
  }
})();
