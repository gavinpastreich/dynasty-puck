/* Dynasty Puck HQ - Trade Machine, Trade Finder, Trade History, Draft Picks. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  // ------------------------------------------------------------ lenses
  DP.lenses = function (q) {
    var E = DP.E, fit = E.fitLeagueLens();
    var custom = { key: 'custom', name: 'Custom', lam: q && q.lam !== undefined ? +q.lam : 0.5, disc: q && q.disc !== undefined ? +q.disc : 0.85, pick: q && q.pick !== undefined ? +q.pick : 1, now: q && q.now !== undefined ? +q.now : 1 };
    return { model: E.LENS_MODEL, league: fit, custom: custom };
  };
  function lensText(L) {
    return 'cap cost counted ' + Math.round(L.lam * 100) + '% · future discount ' + Math.round((1 - L.disc) * 100) + '%/yr · picks ×' + L.pick + ' · 2026-27 season ×' + L.now;
  }
  DP.lensText = lensText;

  function assetName(a) {
    var E = DP.E;
    if (a.kind === 'player') return a.p.n;
    if (a.kind === 'pick') return E.pickLabel(a.pk) + ' pick';
    return 'Cap space ' + U.m(a.amt);
  }
  function assetHtml(a, L) {
    var E = DP.E, v = E.assetValue(a, L);
    if (a.kind === 'player') {
      var p = a.p;
      return ui.pos(p) + '<span>' + ui.plink(p) + ' <span class="faint small">' + esc(p.t) + ' · ' + Math.floor(p.age || 0) + 'y</span><br><span class="small muted">' + ui.pill(p.ct) + ' ' + U.m(p.sal26) + ' · WAR ' + U.fmt(p.WAR, 1) + '</span></span><span class="num" style="margin-left:auto"><b>' + U.fmt(v, 1) + '</b></span>';
    }
    if (a.kind === 'pick') return '<span class="pos">PK</span><span>' + esc(E.pickLabel(a.pk)) + '<br><span class="small muted">~#' + E.pickOverall(a.pk) + ' overall</span></span><span class="num" style="margin-left:auto"><b>' + U.fmt(v, 1) + '</b></span>';
    return '<span class="pos">$</span><span>' + esc(assetName(a)) + '</span><span class="num" style="margin-left:auto"><b>' + U.fmt(v, 1) + '</b></span>';
  }

  // encode / decode trade assets in the URL: p:ID>TO | k:YEAR-RD-ORIG>TO
  function decode(str) {
    var E = DP.E;
    return (str || '').split('|').filter(Boolean).map(function (s) {
      var m = s.split('>'), to = m[1], id = m[0];
      if (id.indexOf('p:') === 0) { var p = E.byId[id.slice(2)]; return p ? { asset: { kind: 'player', p: p }, from: p.gm, to: to } : null; }
      if (id.indexOf('k:') === 0) { var pk = E.pickByKey(id.slice(2)); return pk ? { asset: { kind: 'pick', pk: pk }, from: pk.owner, to: to } : null; }
      return null;
    }).filter(Boolean);
  }
  function encode(moves) {
    return moves.map(function (m) { return (m.asset.kind === 'player' ? 'p:' + m.asset.p.id : 'k:' + DP.E.pickKey(m.asset.pk)) + '>' + m.to; }).join('|');
  }

  // ------------------------------------------------------------ Trade Machine
  DP.pages.trade = {
    title: 'Trade Machine',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team;
      var teams = (q.t || '').split(',').filter(function (t) { return E.rosters[t]; });
      var moves = decode(q.a);
      if (q.p && E.byId[q.p] && E.byId[q.p].gm) { // "trade for this player"
        var tp = E.byId[q.p], mine = me && me !== tp.gm ? me : null;
        teams = U.uniq([mine || E.teams.find(function (t) { return t !== tp.gm; }), tp.gm]);
        moves = [{ asset: { kind: 'player', p: tp }, from: tp.gm, to: teams[0] }];
      }
      if (!teams.length) teams = me ? [me] : [];
      moves.forEach(function (m) { if (teams.indexOf(m.from) < 0) teams.push(m.from); if (teams.indexOf(m.to) < 0) teams.push(m.to); });
      while (teams.length < 2) teams.push(E.teams.find(function (t) { return teams.indexOf(t) < 0; }));
      teams = teams.slice(0, 4);
      var LS = DP.lenses(q), lensKey = q.lens || 'model', L = LS[lensKey] || LS.model;
      var state = function (o) { return Object.assign({ t: teams.join(','), a: encode(moves), lens: lensKey }, lensKey === 'custom' ? { lam: L.lam, disc: L.disc, pick: L.pick, now: L.now } : {}, o || {}); };
      var go = function (o) { DP.go('trade', null, state(o)); };

      var h = '<div class="page-head"><h1>Trade Machine</h1><p class="sub">Any 2–4 teams, players and draft picks. Shows value balance under different valuation lenses, this-season category impact (lineups re-optimized every week), projected standings, multi-year cap and playoff odds. Share the link to propose it.</p></div>';
      h += '<div class="controls">' + teams.map(function (t, i) { return '<label>Team ' + (i + 1) + ' <select data-team="' + i + '">' + U.teamOptions(t) + '</select></label>'; }).join('') +
        (teams.length < 4 ? '<button class="btn sm" id="tr-addteam">＋ Add team</button>' : '') + (teams.length > 2 ? '<button class="btn sm ghost" id="tr-rmteam">− Remove last team</button>' : '') +
        '<button class="btn sm ghost" id="tr-clear">Clear</button></div>';
      h += '<div class="controls"><label>Valuation lens <select id="tr-lens">' + ['model', 'league', 'custom'].map(function (k) { return '<option value="' + k + '"' + (k === lensKey ? ' selected' : '') + '>' + esc(LS[k].name) + '</option>'; }).join('') + '</select></label><span class="small muted">' + esc(lensText(L)) + '</span></div>';
      if (lensKey === 'custom') {
        h += '<div class="controls">' + slider('lam', 'Cap cost counted', L.lam, 0, 1, 0.05, function (v) { return Math.round(v * 100) + '%'; }) + slider('disc', 'Patience (yearly keep)', L.disc, 0.6, 0.99, 0.01, function (v) { return Math.round(v * 100) + '%'; }) +
          slider('pick', 'Pick weight', L.pick, 0.25, 10, 0.25, function (v) { return '×' + v; }) + slider('now', 'Win-now weight', L.now, 0.25, 3, 0.25, function (v) { return '×' + v; }) + '</div>';
      }
      h += '<div class="grid" style="grid-template-columns:repeat(' + teams.length + ',minmax(0,1fr))" id="tr-cols">';
      teams.forEach(function (t) {
        var out = moves.filter(function (m) { return m.from === t; });
        var roster = E.rosters[t].slice().sort(U.by(function (p) { return E.dvWith(p, L); }, true));
        var picks = E.picksOf(t);
        h += '<div class="tradecol"><h3>' + esc(U.teamName(t)) + ' <span class="faint small">sends</span></h3>';
        h += out.map(function (m) {
          var dest = teams.length > 2 ? '<select class="small" data-dest="' + esc(key(m)) + '" aria-label="Destination">' + teams.filter(function (x) { return x !== t; }).map(function (x) { return '<option value="' + esc(x) + '"' + (x === m.to ? ' selected' : '') + '>→ ' + esc(x) + '</option>'; }).join('') + '</select>' : '';
          return '<div class="pl">' + assetHtml(m.asset, L) + dest + '<button class="btn sm ghost" data-rm="' + esc(key(m)) + '" aria-label="Remove">✕</button></div>';
        }).join('') || '<p class="small muted">Nothing yet.</p>';
        h += '<select data-add="' + esc(t) + '" style="width:100%;margin-top:8px" aria-label="Add asset from ' + esc(t) + '"><option value="">＋ Add player or pick…</option><optgroup label="Players (by value)">' +
          roster.map(function (p) { return '<option value="p:' + esc(p.id) + '">' + esc(p.n + ' · ' + p.slot + ' · ' + p.ct + ' ' + U.m(p.sal26) + ' · value ' + U.fmt(E.dvWith(p, L), 1)) + '</option>'; }).join('') +
          '</optgroup><optgroup label="Draft picks">' + picks.map(function (pk) { return '<option value="k:' + esc(E.pickKey(pk)) + '">' + esc(E.pickLabel(pk) + ' · ~#' + E.pickOverall(pk) + ' · value ' + U.fmt(E.pickValue(pk, L), 1)) + '</option>'; }).join('') + '</optgroup></select></div>';
      });
      h += '</div><div id="tr-res" style="margin-top:14px"></div>';
      h += '<div class="card" style="margin-top:14px"><h2>📊 How this league values things</h2><div id="tr-league"></div></div>';
      el.innerHTML = h;

      U.qsa('[data-team]', el).forEach(function (s) {
        s.addEventListener('change', function () {
          var i = +s.dataset.team, old = teams[i], nt = s.value;
          if (teams.indexOf(nt) >= 0 && teams.indexOf(nt) !== i) { U.toast('That team is already in the trade.'); s.value = old; return; }
          teams[i] = nt; moves = moves.filter(function (m) { return m.from !== old && m.to !== old; }); go();
        });
      });
      var addT = U.qs('#tr-addteam', el); if (addT) addT.addEventListener('click', function () { teams.push(E.teams.find(function (x) { return teams.indexOf(x) < 0; })); go(); });
      var rmT = U.qs('#tr-rmteam', el); if (rmT) rmT.addEventListener('click', function () { var t = teams.pop(); moves = moves.filter(function (m) { return m.from !== t && m.to !== t; }); go(); });
      U.qs('#tr-clear', el).addEventListener('click', function () { moves = []; go(); });
      U.qs('#tr-lens', el).addEventListener('change', function (e) { lensKey = e.target.value; L = LS[lensKey]; go(); });
      U.qsa('input[data-lens]', el).forEach(function (inp) {
        inp.addEventListener('input', function () { U.qs('#lv-' + inp.dataset.lens, el).textContent = inp.dataset.fmt === 'pct' ? Math.round(inp.value * 100) + '%' : '×' + inp.value; });
        inp.addEventListener('change', function () { L = Object.assign({}, L); L[inp.dataset.lens] = +inp.value; go(); });
      });
      U.qsa('[data-add]', el).forEach(function (s) {
        s.addEventListener('change', function () {
          var from = s.dataset.add, v = s.value; if (!v) return;
          var to = teams.find(function (x) { return x !== from; });
          var m = decode(v + '>' + to)[0];
          if (m && !moves.some(function (x) { return key(x) === key(m); })) moves.push(m);
          go();
        });
      });
      el.addEventListener('click', function (e) { var r = e.target.closest('[data-rm]'); if (r) { moves = moves.filter(function (m) { return key(m) !== r.dataset.rm; }); go(); } });
      U.qsa('[data-dest]', el).forEach(function (s) { s.addEventListener('change', function () { moves.forEach(function (m) { if (key(m) === s.dataset.dest) m.to = s.value; }); go(); }); });

      results(U.qs('#tr-res', el), teams, moves, L, LS);
      leaguePanel(U.qs('#tr-league', el), LS);
    }
  };
  function key(m) { return m.asset.kind === 'player' ? 'p:' + m.asset.p.id : 'k:' + DP.E.pickKey(m.asset.pk); }
  function slider(k, label, v, min, max, step, fmt) {
    var isPct = k === 'lam' || k === 'disc';
    return '<label>' + esc(label) + ' <input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" data-lens="' + k + '" data-fmt="' + (isPct ? 'pct' : 'x') + '" aria-label="' + esc(label) + '"><b id="lv-' + k + '">' + fmt(v) + '</b></label>';
  }

  function results(box, teams, moves, L, LS) {
    var E = DP.E;
    if (!moves.length) { box.innerHTML = '<div class="callout">Add players or picks from each team above. Tip: open any player and click <b>Trade for</b>, or use the <a href="#/finder">Trade Finder</a> for ideas.</div>'; return; }
    var val = E.tradeValue(moves.map(function (m) { return { asset: m.asset, from: m.from, to: m.to }; }), L);
    var valM = E.tradeValue(moves, LS.model), valL = E.tradeValue(moves, LS.league);
    var rosters = E.applyMoves(moves.filter(function (m) { return m.asset.kind === 'player'; }).map(function (m) { return { id: m.asset.p.id, to: m.to }; }));
    var weeksA = E.weeksFor(rosters, teams), stA = E.expectedStandings(weeksA);
    var h = '';
    // fairness
    if (teams.length === 2) {
      var a = teams[0], b = teams[1], ia = (val[a] || {}).in || 0, ib = (val[b] || {}).in || 0, tot = ia + ib || 1, bal = (ia - ib) / tot;
      var verdict = Math.abs(bal) < 0.1 ? 'Fair' : Math.abs(bal) < 0.3 ? 'Leans ' + (bal > 0 ? a : b) : 'Lopsided toward ' + (bal > 0 ? a : b);
      h += '<div class="card"><h2>Fairness <span class="badge ' + (Math.abs(bal) < 0.1 ? 'good' : Math.abs(bal) < 0.3 ? 'warn' : 'bad') + '">' + esc(verdict) + '</span></h2><div class="hint">Value each side receives under the selected lens (' + esc(L.name || 'custom') + '). Needle left = ' + esc(b) + ' wins, right = ' + esc(a) + ' wins.</div>' +
        '<div style="display:flex;justify-content:space-between" class="small"><span>' + esc(U.teamName(b)) + ' gets more</span><span>' + esc(U.teamName(a)) + ' gets more</span></div><div class="fair" role="meter" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="' + bal.toFixed(2) + '" aria-label="Trade balance"><div class="needle" style="left:' + (50 + U.clamp(bal, -1, 1) * 50).toFixed(1) + '%"></div></div>' +
        '<p class="small muted" style="margin-top:8px">Under the other lenses: model ' + balTxt(valM, a, b) + ' · league-implied ' + balTxt(valL, a, b) + '.</p>' + balancer(teams, moves, L, ia, ib) + '</div>';
    }
    // per-team impact table
    h += '<div class="card" style="margin-top:14px"><h2>Impact by team</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">Value in</th><th class="num">Value out</th><th class="num">Net</th><th class="num">Δ exp. cat wins (2026-27)</th><th class="num">Proj. finish</th><th class="num">Cap 26-27 after</th><th class="num">Cap 27-28 after</th><th class="num">Roster</th><th>Biggest category changes</th></tr></thead><tbody>';
    var capRows = [];
    teams.forEach(function (t) {
      var v = val[t] || { in: 0, out: 0, net: 0 };
      var adds = moves.filter(function (m) { return m.to === t && m.asset.kind === 'player'; }).map(function (m) { return m.asset.p; });
      var rems = moves.filter(function (m) { return m.from === t && m.asset.kind === 'player'; }).map(function (m) { return m.asset.p; });
      var g = E.gain(t, adds, rems);
      var rb = E.expStandings.find(function (r) { return r.t === t; }), ra = stA.find(function (r) { return r.t === t; });
      var capB = E.teamCap(t), capA = E.teamCap(t, rosters[t]);
      capRows.push({ t: t, b: capB, a: capA });
      var top = g.byCat.map(function (x, c) { return [c, x]; }).filter(function (x) { return Math.abs(x[1]) > 0.15; }).sort(function (x, y) { return Math.abs(y[1]) - Math.abs(x[1]); }).slice(0, 4);
      h += '<tr><td><b>' + esc(U.teamName(t)) + '</b></td><td class="num">' + U.fmt(v.in, 1) + '</td><td class="num">' + U.fmt(v.out, 1) + '</td><td class="num">' + ui.delta(v.net, 1) + '</td><td class="num">' + ui.delta(g.total, 1) + '</td><td class="num">' + U.ord(rb.rank) + ' → <b>' + U.ord(ra.rank) + '</b></td>' +
        '<td class="num ' + (capA[0].total > E.CAP ? 'bad' : '') + '">' + U.m(capA[0].total) + ' <span class="faint small">(' + U.sm(capA[0].total - capB[0].total) + ')</span></td><td class="num">' + U.m(capA[1].total) + '</td><td class="num">' + rosters[t].length + '</td><td class="small">' + top.map(function (x) { return ui.delta(x[1], 1) + ' ' + esc(E.CATS[x[0]].l); }).join(' · ') + '</td></tr>';
    });
    h += '</tbody></table></div><p class="small muted">Value = dynasty value under the lens (discounted category wins). Δ exp. cat wins re-optimizes each team\'s weekly lineups over all 24 weeks against its real schedule. Over-cap cells in red.</p>' +
      '<div class="controls"><button class="btn" id="tr-odds">🎲 Playoff odds before/after</button><button class="btn" id="tr-share">🔗 Copy share link</button><span id="tr-odds-out" class="small"></span></div></div>';
    // multi-year cap
    h += '<div class="card" style="margin-top:14px"><h2>Multi-year cap impact</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th>' + E.YEARS.map(function (y) { return '<th class="num">' + y + '</th>'; }).join('') + '</tr></thead><tbody>' +
      capRows.map(function (r) {
        return '<tr><td><b>' + esc(r.t) + '</b></td>' + r.a.map(function (y, i) { var d = y.total - r.b[i].total; return '<td class="num ' + (y.total > E.CAP ? 'bad' : '') + '">' + U.m(y.total, 1) + (Math.abs(d) > 0.001 ? '<br><span class="small ' + (d > 0 ? 'bad' : 'good') + '">' + U.sm(d, 1) + '</span>' : '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Committed salary after the trade (future caps assumed $' + E.CAP + 'M). Expiring RFA/UFA seasons are not counted.</p></div>';
    // dynasty value by year
    var yearsVal = teams.map(function (t) {
      return E.YEARS.map(function (_, y) {
        var s = 0;
        moves.forEach(function (m) {
          if (m.asset.kind !== 'player') return;
          var v = (m.asset.p.yVal[y] || 0);
          if (m.to === t) s += v; if (m.from === t) s -= v;
        });
        return +s.toFixed(2);
      });
    });
    h += '<div class="card" style="margin-top:14px"><h2>Who wins when?</h2><div class="hint">Net player value gained per season (model, before discounting; picks excluded). Above zero = that team comes out ahead that season.</div>' +
      C.lines(E.YEARS.map(function (y) { return y.slice(2); }), teams.map(function (t, i) { return { name: t, values: yearsVal[i], color: C.SERIES[i] }; }), { height: 230, width: 900, zero: true, title: 'Net value by season' }) + '</div>';
    box.innerHTML = h;
    U.qs('#tr-share', box).addEventListener('click', function () {
      var url = location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { U.toast('Link copied. Paste it in the league chat.'); }, function () { U.toast(url, 6000); });
      else U.toast(url, 6000);
    });
    U.qs('#tr-odds', box).addEventListener('click', function () {
      var o = U.qs('#tr-odds-out', box); o.textContent = 'Simulating 1,000 seasons twice…';
      setTimeout(function () {
        var before = E.simSeason({ n: 1000, seed: 4242 }), after = E.simSeason({ n: 1000, seed: 4242, weeks: weeksA });
        o.innerHTML = teams.map(function (t) {
          var b = before.find(function (r) { return r.t === t; }), a2 = after.find(function (r) { return r.t === t; });
          return '<b>' + esc(t) + '</b> playoffs ' + U.pct(b.po) + ' → ' + U.pct(a2.po) + ' (' + ui.delta((a2.po - b.po) * 100, 0) + ' pts), title ' + U.pct(b.champ, 1) + ' → ' + U.pct(a2.champ, 1);
        }).join(' · ');
      }, 30);
    });
  }
  // suggest single assets that even out a 2-team trade
  function balancer(teams, moves, L, ia, ib) {
    var E = DP.E, gap = Math.abs(ia - ib), tot = ia + ib;
    if (!tot || gap / tot < 0.1) return '';
    var giver = ia > ib ? teams[0] : teams[1], getter = giver === teams[0] ? teams[1] : teams[0];
    var used = {}; moves.forEach(function (m) { used[key(m)] = 1; });
    var cands = E.rosters[giver].map(function (p) { return { a: { kind: 'player', p: p }, k: 'p:' + p.id, v: E.dvWith(p, L), lab: p.n }; })
      .concat(E.picksOf(giver).map(function (pk) { return { a: { kind: 'pick', pk: pk }, k: 'k:' + E.pickKey(pk), v: E.pickValue(pk, L), lab: E.pickLabel(pk) + ' pick' }; }))
      .filter(function (c) { return !used[c.k] && c.v >= gap * 0.5 && c.v <= gap * 1.5; })
      .sort(function (x, y) { return Math.abs(x.v - gap) - Math.abs(y.v - gap); }).slice(0, 5);
    if (!cands.length) return '<p class="small muted">No single ' + esc(giver) + ' asset closes the gap of ' + U.fmt(gap, 1) + '. Try two smaller pieces.</p>';
    var cur = U.parseHash().q;
    return '<p class="small"><b>Balance it:</b> ' + esc(giver) + ' could add one of ' + cands.map(function (c) {
      var a2 = (cur.a ? cur.a + '|' : '') + c.k + '>' + getter;
      return '<a href="' + U.hash('trade', null, Object.assign({}, cur, { a: a2, p: '' })) + '">' + esc(c.lab) + ' (' + U.fmt(c.v, 1) + ')</a>';
    }).join(', ') + ' to cover the ' + U.fmt(gap, 1) + ' gap.</p>';
  }
  function balTxt(v, a, b) {
    var ia = (v[a] || {}).in || 0, ib = (v[b] || {}).in || 0, tot = ia + ib || 1, bal = (ia - ib) / tot;
    return Math.abs(bal) < 0.1 ? 'fair' : (bal > 0 ? a : b) + ' +' + Math.round(Math.abs(bal) * 100) + '%';
  }

  function leaguePanel(box, LS) {
    var E = DP.E, f = LS.league;
    var h = '<p>Fitted to the league\'s <b>' + f.n + ' actual trades</b> (Nov 2025 – Aug 2026) by finding the valuation that makes those deals look most even using today\'s projections. It\'s a read on revealed preferences, not a rule:</p><ul>' +
      '<li><b>Cap cost:</b> trades are best explained when cap hit counts <b>' + Math.round(f.lam * 100) + '%</b> (model default 50%). ' + (f.lam <= 0.25 ? 'The league mostly trades on talent and doesn\'t discount expensive players much.' : f.lam >= 0.75 ? 'GMs are very cap-conscious.' : '') + '</li>' +
      '<li><b>Patience:</b> future seasons are discounted about <b>' + Math.round((1 - f.disc) * 100) + '% per year</b> (model 15%). ' + (f.disc >= 0.9 ? 'This is a patient, long-game league.' : '') + '</li>' +
      '<li><b>Draft picks:</b> valued at about <b>×' + f.pick + '</b> the model\'s estimate. ' + (f.pick >= 3 ? 'Picks and prospects trade at a premium here, so selling picks is a good way to buy current production.' : '') + '</li>' +
      '<li><b>This season:</b> weighted <b>×' + f.now + '</b> vs later seasons.</li></ul>' +
      '<p class="small muted">Fit improvement: squared imbalance ' + U.fmt(f.base, 2) + ' (model) → ' + U.fmt(f.err, 2) + ' (league lens). With only ' + f.n + ' trades, and players valued at today\'s projections rather than at trade time, treat this as directional. It sharpens as the league logs more trades (re-export the Fantrax trade history on the <a href="#/data">Data page</a>).</p>' +
      '<p><a href="#/history">See every past trade with both lenses →</a></p>';
    box.innerHTML = h;
  }

  // ------------------------------------------------------------ Trade Finder
  DP.pages.finder = {
    title: 'Trade Finder',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team;
      var h = '<div class="page-head"><h1>Trade Finder</h1><p class="sub">"Who could I get for X?" and "What would it take to get Y?", ranked by deals that help both teams in 2026-27 categories and are roughly even in value.</p></div>';
      if (!me) { el.innerHTML = h; ui.needTeam(el.appendChild(document.createElement('div')), 'trade ideas'); return; }
      var target = q.p && E.byId[q.p] ? E.byId[q.p] : null;
      var mode = q.mode || (target && target.gm !== me ? 'get' : 'give');
      var LS = DP.lenses(q), lensKey = q.lens || 'model', L = LS[lensKey] || LS.model;
      var mine = E.rosters[me].slice().sort(U.by(function (p) { return E.dvWith(p, L); }, true));
      h += '<div class="controls"><div class="seg" role="tablist"><button data-mode="give" class="' + (mode === 'give' ? 'on' : '') + '">Trade away one of mine</button><button data-mode="get" class="' + (mode === 'get' ? 'on' : '') + '">Acquire a target</button></div>' +
        '<label>Lens <select id="f-lens">' + ['model', 'league'].map(function (k) { return '<option value="' + k + '"' + (k === lensKey ? ' selected' : '') + '>' + esc(LS[k].name) + '</option>'; }).join('') + '</select></label></div>';
      if (mode === 'give') {
        var x = target && target.gm === me ? target : mine[0];
        h += '<div class="controls"><label>My player <select id="f-p">' + mine.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p === x ? ' selected' : '') + '>' + esc(p.n + ' · ' + p.slot + ' · value ' + U.fmt(E.dvWith(p, L), 1)) + '</option>'; }).join('') + '</select></label></div><div id="f-out"><p class="muted">Searching the league…</p></div>';
        el.innerHTML = h;
        setTimeout(function () { give(U.qs('#f-out', el), x, me, L); }, 30);
      } else {
        var others = E.P.filter(function (p) { return p.gm && p.gm !== me; }).sort(U.by(function (p) { return E.dvWith(p, L); }, true));
        var y = target && target.gm !== me ? target : others[0];
        h += '<div class="controls"><label>Target <select id="f-p">' + others.slice(0, 400).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p === y ? ' selected' : '') + '>' + esc(p.n + ' (' + p.gm + ') · value ' + U.fmt(E.dvWith(p, L), 1)) + '</option>'; }).join('') + '</select></label></div><div id="f-out"><p class="muted">Building packages…</p></div>';
        el.innerHTML = h;
        setTimeout(function () { get(U.qs('#f-out', el), y, me, L); }, 30);
      }
      U.qsa('[data-mode]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('finder', null, { mode: b.dataset.mode, lens: lensKey }); }); });
      U.qs('#f-p', el).addEventListener('change', function (e) { DP.go('finder', null, { mode: mode, p: e.target.value, lens: lensKey }); });
      U.qs('#f-lens', el).addEventListener('change', function (e) { DP.go('finder', null, { mode: mode, p: q.p, lens: e.target.value }); });
    }
  };
  function give(box, x, me, L) {
    var E = DP.E, vx = E.dvWith(x, L);
    var pool = E.P.filter(function (p) { return p.gm && p.gm !== me; });
    var near = pool.map(function (p) { return { p: p, v: E.dvWith(p, L) }; }).filter(function (c) { return Math.abs(c.v - vx) <= Math.max(1.5, 0.3 * Math.abs(vx)); })
      .sort(function (a, b) { return Math.abs(a.v - vx) - Math.abs(b.v - vx); }).slice(0, 70);
    near.forEach(function (c) { c.mine = E.gain(me, [c.p], [x]).total; c.theirs = E.gain(c.p.gm, [x], [c.p]).total; c.score = Math.min(c.mine, c.theirs) + 0.25 * (c.mine + c.theirs); });
    near.sort(function (a, b) { return b.score - a.score; });
    box.innerHTML = '<p class="small muted">' + esc(x.n) + ' is worth <b>' + U.fmt(vx, 1) + '</b> under this lens. Candidates within ±30% of that value, ranked by how much both teams gain in 2026-27 category wins.</p><div id="f-t"></div>';
    ui.table(U.qs('#f-t', box), {
      rows: near.slice(0, 40), sort: 'score', page: 40,
      cols: [
        { k: 'n', l: 'Player', v: function (c) { return c.p.n; }, f: function (c) { return ui.pcell(c.p); } },
        { k: 'gm', l: 'Team', v: function (c) { return c.p.gm; }, f: function (c) { return U.teamLabel(c.p.gm); } },
        { k: 'v', l: 'Value', cls: 'num', v: function (c) { return c.v; }, f: function (c) { return U.fmt(c.v, 1); } },
        { k: 'war', l: 'WAR', cls: 'num', v: function (c) { return c.p.WAR; }, f: function (c) { return U.fmt(c.p.WAR, 1); } },
        { k: 'sal', l: 'Salary', cls: 'num', v: function (c) { return c.p.sal26; }, f: function (c) { return U.m(c.p.sal26) + ' ' + ui.pill(c.p.ct); } },
        { k: 'mine', l: 'You Δ cat W', cls: 'num', v: function (c) { return c.mine; }, f: function (c) { return ui.delta(c.mine, 1); } },
        { k: 'theirs', l: 'They Δ cat W', cls: 'num', v: function (c) { return c.theirs; }, f: function (c) { return ui.delta(c.theirs, 1); } },
        { k: 'score', l: 'Mutual fit', cls: 'num', v: function (c) { return c.score; }, f: function (c) { return U.fmt(c.score, 1); } },
        { k: 'go', l: '', v: null, f: function (c) { return '<a class="btn sm" href="' + U.hash('trade', null, { t: me + ',' + c.p.gm, a: 'p:' + x.id + '>' + c.p.gm + '|p:' + c.p.id + '>' + me }) + '">Open</a>'; } }
      ]
    });
  }
  function get(box, y, me, L) {
    var E = DP.E, vy = E.dvWith(y, L);
    var assets = E.rosters[me].map(function (p) { return { kind: 'player', p: p, v: E.dvWith(p, L) }; })
      .concat(E.picksOf(me).map(function (pk) { return { kind: 'pick', pk: pk, v: E.pickValue(pk, L) }; }))
      .filter(function (a) { return a.v > 0.05; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 30);
    var pk = [];
    for (var i = 0; i < assets.length; i++) {
      if (Math.abs(assets[i].v - vy) <= 0.2 * Math.max(vy, 1)) pk.push([assets[i]]);
      for (var j = i + 1; j < assets.length; j++) {
        var s = assets[i].v + assets[j].v;
        if (Math.abs(s - vy) <= 0.2 * Math.max(vy, 1)) pk.push([assets[i], assets[j]]);
      }
    }
    pk = pk.map(function (list) {
      var players = list.filter(function (a) { return a.kind === 'player'; }).map(function (a) { return a.p; });
      var mineG = E.gain(me, [y], players).total, theirG = E.gain(y.gm, players, [y]).total;
      return { list: list, v: E.sum(list.map(function (a) { return a.v; })), mine: mineG, theirs: theirG, score: mineG + 0.5 * theirG };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 25);
    box.innerHTML = '<p class="small muted">' + esc(y.n) + ' (' + esc(y.gm) + ') is worth <b>' + U.fmt(vy, 1) + '</b>. Packages of one or two of your assets within ±20%, ranked by your category gain, with their gain as a tiebreaker.</p>' +
      (pk.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>Package</th><th class="num">Value</th><th class="num">You Δ cat W</th><th class="num">They Δ cat W</th><th></th></tr></thead><tbody>' + pk.map(function (x) {
        var link = U.hash('trade', null, { t: me + ',' + y.gm, a: ['p:' + y.id + '>' + me].concat(x.list.map(function (a) { return (a.kind === 'player' ? 'p:' + a.p.id : 'k:' + E.pickKey(a.pk)) + '>' + y.gm; })).join('|') });
        return '<tr><td>' + x.list.map(function (a) { return a.kind === 'player' ? ui.plink(a.p) : esc(E.pickLabel(a.pk)); }).join(' + ') + '</td><td class="num">' + U.fmt(x.v, 1) + '</td><td class="num">' + ui.delta(x.mine, 1) + '</td><td class="num">' + ui.delta(x.theirs, 1) + '</td><td><a class="btn sm" href="' + link + '">Open</a></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted">No one- or two-asset package matches that value. Try the league-implied lens or build a bigger deal in the Trade Machine.</p>');
  }

  // ------------------------------------------------------------ Trade History
  DP.pages.history = {
    title: 'Trade History',
    render: function (el, hsh) {
      var E = DP.E, T = (DP.league && DP.league.trades) || [], LS = DP.lenses(), me = DP.state.team, ft = hsh.q.team || '';
      var h = '<div class="page-head"><h1>Trade History</h1><p class="sub">Every trade in the Fantrax log (' + T.length + ' trades), judged with <b>today\'s</b> projections. Old team names mapped to current GMs: ' + Object.keys(DP.league.aliases).filter(function (k) { return DP.league.aliases[k] !== k; }).map(function (k) { return esc(k) + ' = ' + esc(DP.league.aliases[k]); }).join(', ') + '.</p></div>';
      // scoreboard
      var score = {}; E.teams.forEach(function (t) { score[t] = { t: t, n: 0, m: 0, l: 0 }; });
      var cards = T.map(function (tr) {
        var assets = tr.moves.map(function (m) {
          var a = null;
          if (m.kind === 'player') a = m.id && E.byId[m.id] ? { kind: 'player', p: E.byId[m.id] } : { kind: 'gone', label: m.label };
          else if (m.kind === 'pick') a = m.year >= 2027 ? { kind: 'pick', pk: { year: m.year, round: m.round, orig: m.orig, owner: m.to } } : { kind: 'usedpick', label: m.label, round: m.round };
          else a = { kind: 'cap', amt: m.amt };
          return { m: m, a: a };
        });
        var v = function (x, L) {
          if (x.a.kind === 'gone') return 0;
          if (x.a.kind === 'usedpick') { var c = E.pickCurve(), n = E.teams.length; return c[Math.round((x.a.round - 1) * n + n / 2)] * L.pick; }
          return E.assetValue(x.a, L);
        };
        var sides = {};
        assets.forEach(function (x) { var s = sides[x.m.to] = sides[x.m.to] || { items: [], m: 0, l: 0 }; s.items.push(x); s.m += v(x, LS.model); s.l += v(x, LS.league); });
        Object.keys(sides).forEach(function (t) {
          if (!score[t]) return;
          score[t].n++;
          var others = Object.keys(sides).filter(function (u) { return u !== t; });
          score[t].m += sides[t].m - E.sum(others.map(function (u) { return sides[u].m; })) / Math.max(1, others.length);
          score[t].l += sides[t].l - E.sum(others.map(function (u) { return sides[u].l; })) / Math.max(1, others.length);
        });
        return { tr: tr, sides: sides, v: v };
      });
      h += '<div class="grid g2"><div class="card"><h2>Trade scoreboard</h2><div class="hint">Net value gained across all trades (value received minus value sent, averaged per counterpart), using today\'s projections. 2026 picks are valued as an average pick in that round.</div><div id="h-score"></div></div>';
      h += '<div class="card"><h2>What the history says</h2>' + (function () { var f = LS.league; return '<p>Best-fitting league lens: cap cost counted <b>' + Math.round(f.lam * 100) + '%</b>, future discounted <b>' + Math.round((1 - f.disc) * 100) + '%/yr</b>, picks valued <b>×' + f.pick + '</b>, current season <b>×' + f.now + '</b>.</p><p class="small muted">Most active: ' + Object.keys(score).map(function (t) { return score[t]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 4).map(function (s) { return esc(s.t) + ' (' + s.n + ')'; }).join(', ') + '. Pick-heavy deals dominate the 2026 offseason.</p><p><a href="#/trade?lens=league">Try the league lens in the Trade Machine →</a></p>'; })() + '</div></div>';
      h += '<div class="controls" style="margin-top:14px"><label>Team <select id="h-team"><option value="">All teams</option>' + U.teamOptions(ft) + '</select></label></div><div id="h-list"></div>';
      h += '<div class="card" style="margin-top:14px"><h2>🔔 Fantrax roster log</h2><div class="hint">Every add, drop, trade and contract change the nightly Fantrax sync has seen, newest first.</div>' + DP.activityHtml(500) + '</div>';
      el.innerHTML = h;
      ui.table(U.qs('#h-score', el), {
        rows: Object.keys(score).map(function (t) { return score[t]; }), sort: 'm',
        rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<b>' + esc(U.teamName(r.t)) + '</b>'; } }, { k: 'n', l: 'Trades', cls: 'num' },
          { k: 'm', l: 'Net (model)', cls: 'num', v: function (r) { return r.m; }, f: function (r) { return ui.delta(r.m, 1); } }, { k: 'l', l: 'Net (league lens)', cls: 'num', v: function (r) { return r.l; }, f: function (r) { return ui.delta(r.l, 1); } }]
      });
      var list = cards.filter(function (c) { return !ft || c.tr.teams.indexOf(ft) >= 0; });
      U.qs('#h-list', el).innerHTML = list.map(function (c) {
        var tr = c.tr, ts = Object.keys(c.sides);
        var best = ts.slice().sort(function (a, b) { return c.sides[b].m - c.sides[a].m; })[0];
        return '<div class="card" style="margin-bottom:12px"><h3>' + esc(U.date(new Date(tr.date + 'T12:00:00Z'))) + ', ' + esc(tr.date.slice(0, 4)) + ' <span class="faint small">' + esc(tr.season) + (tr.obj ? ' · ' + tr.obj + ' objection' + (tr.obj > 1 ? 's' : '') : '') + '</span></h3><div class="grid" style="grid-template-columns:repeat(' + ts.length + ',minmax(0,1fr))">' +
          ts.map(function (t) {
            var s = c.sides[t];
            return '<div class="tradecol"><h3 class="small">' + esc(U.teamName(t)) + ' received ' + (t === best && ts.length === 2 ? '<span class="badge good">wins today</span>' : '') + '</h3>' + s.items.map(function (x) {
              var a = x.a, val = c.v(x, DP.E.LENS_MODEL);
              var name = a.kind === 'player' ? ui.plink(a.p) + ' <span class="faint small">' + esc(a.p.gm ? 'now ' + a.p.gm : 'now FA') + '</span>' : a.kind === 'pick' ? esc(x.m.label) : a.kind === 'usedpick' ? esc(x.m.label) + ' <span class="faint small">(used)</span>' : a.kind === 'cap' ? esc(x.m.label) : esc(x.m.label) + ' <span class="faint small">(no longer in data)</span>';
              return '<div class="pl"><span>' + name + '</span><span class="num" style="margin-left:auto">' + U.fmt(val, 1) + '</span></div>';
            }).join('') + '<div class="small muted" style="margin-top:6px">Total: model <b>' + U.fmt(s.m, 1) + '</b> · league lens <b>' + U.fmt(s.l, 1) + '</b></div></div>';
          }).join('') + '</div></div>';
      }).join('') || '<p class="muted">No trades for this team.</p>';
      U.qs('#h-team', el).addEventListener('change', function (e) { DP.go('history', null, { team: e.target.value }); });
    }
  };

  // ------------------------------------------------------------ Draft Picks
  DP.pages.picks = {
    title: 'Draft Picks',
    render: function (el) {
      var E = DP.E, me = DP.state.team, P = DP.league.picks.filter(function (p) { return p.year >= 2027; });
      var years = U.uniq(P.map(function (p) { return p.year; })).sort();
      var h = '<div class="page-head"><h1>League Draft Picks</h1><p class="sub">3-round league draft; picks exist through ' + years[years.length - 1] + ' and a new year is added after each draft. Ownership is replayed from the Fantrax trade history (each team starts with its own picks; confirmed by the commissioner for M.M). Order: reverse standings, champion picks 14th.</p></div>';
      h += '<div class="grid g2"><div class="card span2"><h2>Who owns each team\'s pick</h2><div class="hint">Rows = original team. A highlighted cell = traded; it shows the current owner. Hover for value.</div><div class="tbl-wrap"><table class="t"><thead><tr><th>Original team</th>' + years.map(function (y) { return [1, 2, 3].map(function (r) { return '<th class="num">' + y + ' R' + r + '</th>'; }).join(''); }).join('') + '<th class="num">Exp. 2027 slot</th></tr></thead><tbody>';
      E.teams.forEach(function (t) {
        h += '<tr class="' + (t === me ? 'mine' : '') + '"><td><b>' + esc(U.teamName(t)) + '</b></td>';
        years.forEach(function (y) {
          [1, 2, 3].forEach(function (r) {
            var pk = P.find(function (p) { return p.year === y && p.round === r && p.orig === t; });
            var moved = pk.owner !== t, v = E.pickValue(pk);
            h += '<td class="num" style="' + (moved ? 'background:var(--warn-bg)' : '') + '" data-tip="' + esc('<div class="tv">' + U.fmt(v, 2) + ' value</div><div class="tl">' + y + ' R' + r + ' of ' + U.teamName(t) + ' · ~#' + E.pickOverall(pk) + ' · owner ' + U.teamName(pk.owner) + '</div>') + '">' + (moved ? '<b>' + esc(pk.owner) + '</b>' : '<span class="faint">own</span>') + '</td>';
          });
        });
        h += '<td class="num">#' + U.fmt(E.expSlot(t, 2027), 1) + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
      h += '<div class="card"><h2>Pick inventory & value</h2><div class="hint">Value = expected dynasty value of the prospect taken at the projected slot (the 2026 class on league rosters sets the curve), discounted per year out. 2027 slots come from the season simulation.</div><div id="p-inv"></div></div>';
      var curve = E.pickCurve();
      h += '<div class="card"><h2>Pick value curve</h2><div class="hint">Model value by overall pick (1–42), 2027 draft. The first ~8 picks carry most of the value in this format.</div>' +
        C.lines(curve.map(function (_, i) { return String(i + 1); }), [{ name: 'Value', values: curve.map(function (v) { return +v.toFixed(2); }), area: true }], { height: 200, maxLabels: 14, title: 'Pick value curve' }) + '</div></div>';
      el.innerHTML = h;
      var inv = E.teams.map(function (t) {
        var own = E.picksOf(t);
        return { t: t, n: own.length, r1: own.filter(function (p) { return p.round === 1; }).length, v: E.sum(own.map(function (p) { return E.pickValue(p); })), list: own };
      });
      ui.table(U.qs('#p-inv', el), {
        rows: inv, sort: 'v', rowCls: function (r) { return r.t === me ? 'mine' : ''; },
        cols: [{ k: 't', l: 'Team', v: function (r) { return U.teamName(r.t); }, f: function (r) { return '<b>' + esc(U.teamName(r.t)) + '</b>'; } }, { k: 'n', l: 'Picks', cls: 'num' }, { k: 'r1', l: '1sts', cls: 'num' },
          { k: 'v', l: 'Total value', cls: 'num', v: function (r) { return r.v; }, f: function (r) { return U.fmt(r.v, 1); } },
          { k: 'list', l: 'Picks owned', v: null, f: function (r) { return '<span class="small">' + r.list.map(function (p) { return esc(E.pickLabel(p)); }).join(', ') + '</span>'; } }]
      });
    }
  };
})();
