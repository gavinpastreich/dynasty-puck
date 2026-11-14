/* Dynasty Puck HQ - The Weekly: an auto-written recap of each finished week, ready to paste in the league chat.
 * Everything in it is computed from the site's data: the real weekly category results (E.history: locked Fantrax
 * lineups x NHL stats), the standings they add up to, the locked starters' player lines (data/weeks/wNN.js), the
 * Fantrax roster log, and for the latest week the Prospect Radar, the draft tracker, the regression watch and next
 * week's projected matchups. Templates only: no number is made up. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  function day(d) { return U.date(new Date(d + 'T12:00:00Z')); }
  function addDays(d, n) { var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function tn(t) { return U.teamName(t); }
  function score(g, side) { var s = side === 'a' ? g.sa : g.sb; return s.W + '-' + s.L + '-' + s.T; }

  // standings after each finished week (category W-L-T, ranked by W + T/2, then W)
  function standingsAfter(H, upto) {
    var E = DP.E, wl = {};
    E.teams.forEach(function (t) { wl[t] = { t: t, W: 0, L: 0, T: 0 }; });
    H.weeks.forEach(function (w) {
      if (w.n > upto) return;
      (w.games || []).forEach(function (g) { ['W', 'L', 'T'].forEach(function (k) { wl[g.a][k] += g.sa[k]; wl[g.b][k] += g.sb[k]; }); });
    });
    var list = E.teams.map(function (t) { return wl[t]; }).sort(function (a, b) { return (b.W + b.T / 2) - (a.W + a.T / 2) || b.W - a.W; });
    list.forEach(function (r, i) { r.rank = i + 1; r.pct = (r.W + r.T / 2) / Math.max(1, r.W + r.L + r.T); });
    var by = {}; list.forEach(function (r) { by[r.t] = r; });
    return { list: list, by: by };
  }
  // the week's strength (all-play: share of the other 13 teams each team's numbers would have beaten), 0..1
  function strength(w, t) { var a = w.ap && w.ap[t]; return a ? DP.E.sum(a) / a.length : null; }

  DP.weeklyData = function (n) {
    var E = DP.E, H = E.history(), w = H.weeks.filter(function (x) { return x.n === n && x.games && x.games.length; })[0];
    if (!w) return null;
    var games = w.games.map(function (g) {
      var m = g.sa.W - g.sb.W, win = m > 0 ? g.a : m < 0 ? g.b : null, lose = m > 0 ? g.b : m < 0 ? g.a : null;
      return { g: g, a: g.a, b: g.b, margin: Math.abs(m), win: win, lose: lose, sw: win ? strength(w, win) : null, sl: lose ? strength(w, lose) : null };
    });
    var sorted = games.slice().sort(function (x, y) { return y.margin - x.margin; });
    var blow = sorted[0], close = sorted[sorted.length - 1];
    var decided = games.filter(function (x) { return x.win; });
    var unlucky = decided.slice().sort(function (x, y) { return y.sl - x.sl; })[0], lucky = decided.slice().sort(function (x, y) { return x.sw - y.sw; })[0];
    var best = E.teams.slice().sort(function (a, b) { return strength(w, b) - strength(w, a); });
    var before = standingsAfter(H, n - 1), after = standingsAfter(H, n);
    var moves = E.teams.map(function (t) { return { t: t, from: before.by[t].rank, to: after.by[t].rank, d: before.by[t].rank - after.by[t].rank }; });
    var up = moves.filter(function (m) { return m.d > 0; }).sort(function (a, b) { return b.d - a.d; })[0], down = moves.filter(function (m) { return m.d < 0; }).sort(function (a, b) { return a.d - b.d; })[0];
    // category records of the week: the best number league-wide in each category
    var cats = E.CATS.map(function (cat, c) {
      var vals = E.teams.map(function (t) { return { t: t, v: w.vec[t][c] }; }).filter(function (x) { return x.v !== null && x.v !== undefined; });
      vals.sort(function (x, y) { return cat.low ? x.v - y.v : y.v - x.v; });
      return { cat: cat, c: c, top: vals[0] };
    });
    // the Fantrax log: trades and pickups that week (the nightly sync dates a move the morning after)
    var lo = w.from, hi = addDays(w.to, 1);
    var trades = ((DP.league && DP.league.trades) || []).filter(function (t) { return t.date >= lo && t.date <= hi; });
    var adds = ((DP.league && DP.league.moves) || []).filter(function (m) { return m.type === 'add' && m.d >= lo && m.d <= hi && E.byId[m.id]; })
      .map(function (m) { return { m: m, p: E.byId[m.id] }; }).sort(function (a, b) { return (b.p.WAR || 0) - (a.p.WAR || 0); });
    var latest = H.weeks.filter(function (x) { return x.games && x.games.length; }).slice(-1)[0];
    return { n: n, w: w, games: games, sorted: sorted, blow: blow, close: close, unlucky: unlucky, lucky: lucky, best: best, before: before, after: after, up: up, down: down, cats: cats, trades: trades, adds: adds, isLatest: latest && latest.n === n };
  };
  // trade value by today's model, per receiving team
  function tradeTake(tr) {
    var E = DP.E, got = {};
    tr.moves.forEach(function (m) {
      var v = 0;
      if (m.kind === 'player' && m.id && E.byId[m.id]) v = E.dvWith(E.byId[m.id]);
      else if (m.kind === 'pick' && m.year >= 2027) v = E.pickValue({ year: m.year, round: m.round, orig: m.orig });
      else if (m.kind === 'cap') v = E.assetValue({ kind: 'cap', amt: m.amt, cur: tr.season === DP.meta.season });
      got[m.to] = (got[m.to] || 0) + v;
    });
    var ts = Object.keys(got).sort(function (a, b) { return got[b] - got[a]; });
    return { got: got, best: ts[0], teams: tr.teams };
  }
  // the latest week only: what is happening now (Radar, draft board, regression, next week)
  function nowBits(n) {
    var E = DP.E, out = {};
    if (DP.radar && DP.radarView) {
      var rows = DP.radarView().rows.filter(function (r) { return r.d['7'] && r.d['7'].dv > 0; }).sort(function (a, b) { return b.d['7'].dv - a.d['7'].dv; });
      out.prospect = rows[0] || null;
    }
    if (DP.draft && DP.draftView) {
      var dr = DP.draftView().rows.filter(function (x) { return x.m.up && x.m.up.dr > 0; }).sort(function (a, b) { return b.m.up.dr - a.m.up.dr; });
      out.draft = dr[0] || null;
    }
    if (DP.luck) {
      var L = DP.luck().rows.filter(function (r) { return r.p.gm && r.sig; });
      out.hot = L.filter(function (r) { return r.sig === 'sell'; }).sort(function (a, b) { return b.z - a.z; })[0] || null;
      out.cold = L.filter(function (r) { return r.sig === 'buy'; }).sort(function (a, b) { return a.z - b.z; })[0] || null;
    }
    var wi = n, wk = E.weeks[wi];
    if (wk && !wk.po) {
      var gs = DP.meta.h2h.filter(function (g) { return g[0] === n + 1; }).map(function (g) {
        var pr = E.matchupProbs(E.baseline[g[1]][wi], E.baseline[g[2]][wi]), ea = E.sum(pr.map(function (x) { return x.w + x.t / 2; }));
        return { a: g[1], b: g[2], ea: ea, eb: E.NC - ea };
      });
      var st = standingsAfter(E.history(), n).by;
      out.next = { n: n + 1, start: wk.start, live: E.nowWeek() === wi, marquee: gs.slice().sort(function (x, y) { return (st[x.a].rank + st[x.b].rank) - (st[y.a].rank + st[y.b].rank); })[0], closest: gs.slice().sort(function (x, y) { return Math.abs(x.ea - x.eb) - Math.abs(y.ea - y.eb); })[0] };
    }
    return out;
  }
  // players of the week from the locked starters' lines (data/weeks/wNN.js): [GP, G, A, PIM, SOG, STP, Hit, Blk, Tk, Cor]; goalies [GP, W, GA, SA, SHO, Min]
  function stars(W) {
    var E = DP.E, sk = [], gk = [];
    Object.keys(W.teams || {}).forEach(function (t) {
      var T = W.teams[t];
      Object.keys(T.pl || {}).forEach(function (id) { var p = E.byId[id], l = T.pl[id]; if (!p) return; (p.G ? gk : sk).push({ p: p, t: t, l: l }); });
    });
    var top = function (list, f) { return list.slice().sort(function (a, b) { return f(b) - f(a); })[0]; };
    var pts = function (x) { return x.l[1] + x.l[2] + x.l[1] * 0.01; };
    var sv = function (x) { return x.l[3] >= 40 ? 1 - x.l[2] / x.l[3] : 0; };
    return {
      skater: top(sk, function (x) { return pts(x) + x.l[4] * 0.001; }),
      d: top(sk.filter(function (x) { return x.p.D; }), function (x) { return pts(x) + x.l[4] * 0.001; }),
      grinder: top(sk, function (x) { return x.l[6] + x.l[7]; }),
      sniper: top(sk, function (x) { return x.l[1] * 10 + x.l[4] * 0.01; }),
      goalie: top(gk, function (x) { return x.l[1] * 2 + sv(x) * 10 + x.l[4]; })
    };
  }
  function pl(k, one, many) { return k + ' ' + (k === 1 ? one : many); }
  function lineTxt(x) {
    if (!x) return '';
    var l = x.l;
    return x.p.G ? pl(l[1], 'win', 'wins') + (l[3] ? ', ' + U.rate(1 - l[2] / l[3]) + ' on ' + l[3] + ' shots' : '') + (l[4] ? ', ' + pl(l[4], 'shutout', 'shutouts') : '')
      : l[1] + 'G ' + l[2] + 'A in ' + l[0] + ' GP, ' + l[4] + ' SOG' + (l[6] + l[7] ? ', ' + pl(l[6], 'hit', 'hits') + ', ' + pl(l[7], 'block', 'blocks') : '');
  }
  DP._weekly = { standingsAfter: standingsAfter, strength: strength, stars: stars, nowBits: nowBits }; // for tools/test/check_weekly.js
  DP.weekDetail = DP.weekDetail || {};
  function loadWeek(n, done) {
    if (DP.weekDetail[n]) return done(DP.weekDetail[n]);
    var s = document.createElement('script');
    s.src = 'data/weeks/w' + (n < 10 ? '0' : '') + n + '.js';
    s.onload = function () { done(DP.weekDetail[n] || null); }; s.onerror = function () { done(null); };
    document.head.appendChild(s);
  }

  DP.pages.weekly = {
    title: 'The Weekly',
    render: function (el, hsh) {
      var E = DP.E, H = E.history(), done = H.weeks.filter(function (x) { return x.games && x.games.length; }), me = DP.state.team;
      var h = '<div class="page-head"><h1>🗞️ The Weekly</h1><p class="sub">An auto-written recap of every finished week: the results, who got lucky, who climbed, the players who carried their teams, the week\'s trades and pickups and, for the latest week, what to watch next. Every number comes from the site\'s data (locked Fantrax lineups × NHL stats). Copy it into the league chat.</p></div>';
      if (!done.length) { el.innerHTML = h + '<div class="callout">No finished week yet. The first recap appears the morning after week 1 ends.</div>'; return; }
      var n = +hsh.q.w || done[done.length - 1].n;
      if (!done.some(function (x) { return x.n === n; })) n = done[done.length - 1].n;
      var D = DP.weeklyData(n), w = D.w;
      h += '<div class="controls"><label>Week <select id="wk-n">' + done.slice().reverse().map(function (x) { return '<option value="' + x.n + '"' + (x.n === n ? ' selected' : '') + '>Week ' + x.n + ' · ' + esc(day(x.from)) + '–' + esc(day(x.to)) + '</option>'; }).join('') + '</select></label>' +
        '<button class="btn" id="wk-copy">📋 Copy for the chat</button><a class="btn ghost" href="' + U.hash('live', null, { w: n }) + '">Full box scores →</a><a class="btn ghost" href="' + U.hash('preview', null, { w: n + 1 }) + '">Week ' + (n + 1) + ' preview →</a></div>';
      h += '<h2 style="margin:6px 0 2px">Week ' + n + ' · ' + esc(day(w.from)) + '–' + esc(day(w.to)) + (w.final ? '' : ' <span class="badge warn" title="Stat corrections can still move a number for a day or two">provisional</span>') + '</h2>';
      // results
      h += '<div class="grid g2"><div class="card"><h2>Results</h2><ul class="list-plain mvlist">' + D.sorted.map(function (x) {
        var g = x.g, mine = g.a === me || g.b === me;
        return '<li' + (mine ? ' class="mine-li"' : '') + '><b>' + esc(tn(x.win || g.a)) + '</b> ' + (x.win ? 'beat' : 'tied') + ' <b>' + esc(tn(x.win ? x.lose : g.b)) + '</b> <span class="num">' + (x.win === g.b ? score(g, 'b') : score(g, 'a')) + '</span>' +
          (x === D.blow && x.margin >= 5 ? ' <span class="badge info">blowout</span>' : '') + (x === D.close && x.margin <= 1 ? ' <span class="badge warn">nail-biter</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
      // stories
      var S = [];
      var b0 = D.best[0], lead = D.after.list[0];
      S.push('<b>Team of the week:</b> ' + esc(tn(b0)) + '. Its numbers would have beaten ' + U.pct(strength(w, b0)) + ' of the league category by category (all-play).');
      if (D.unlucky && D.unlucky.sl >= 0.5) S.push('<b>Hard luck:</b> ' + esc(tn(D.unlucky.lose)) + ' lost ' + esc(score(D.unlucky.g, D.unlucky.lose === D.unlucky.g.a ? 'a' : 'b')) + ' to ' + esc(tn(D.unlucky.win)) + ' with a week that beat ' + U.pct(D.unlucky.sl) + ' of the league.');
      if (D.lucky && D.lucky.sw < 0.5) S.push('<b>Stole one:</b> ' + esc(tn(D.lucky.win)) + ' won with numbers that beat only ' + U.pct(D.lucky.sw) + ' of the league.');
      S.push('<b>Standings:</b> ' + esc(tn(lead.t)) + ' lead' + (lead.t.slice(-1) === 's' ? '' : 's') + ' at ' + lead.W + '-' + lead.L + '-' + lead.T + '.' + (D.up ? ' Biggest climb: ' + esc(tn(D.up.t)) + ' (' + U.ord(D.up.from) + ' → ' + U.ord(D.up.to) + ').' : '') + (D.down ? ' Biggest drop: ' + esc(tn(D.down.t)) + ' (' + U.ord(D.down.from) + ' → ' + U.ord(D.down.to) + ').' : ''));
      var ck = D.cats.filter(function (x) { return /^(G|Hit|SOG|SV|GAA)$/.test(x.cat.k) && x.top; }).map(function (x) { var v = x.top.v; return esc(x.cat.l) + ' ' + esc(x.top.t) + ' (' + (x.cat.k === 'SV' ? U.rate(v) : x.cat.k === 'GAA' ? U.fmt(v, 2) : U.fmt(v, 0)) + ')'; });
      if (ck.length) S.push('<b>League highs:</b> ' + ck.join(' · ') + '.');
      h += '<div class="card"><h2>The story</h2><ul class="small" style="padding-left:18px;margin:0">' + S.map(function (s) { return '<li style="margin-bottom:6px">' + s + '</li>'; }).join('') + '<li id="wk-stars" class="muted">Loading the players of the week…</li></ul></div></div>';
      // moves
      var M = [];
      D.trades.forEach(function (tr) { var tk = tradeTake(tr); M.push('<b>Trade:</b> ' + tr.teams.map(function (t) { return esc(tn(t)); }).join(' / ') + ' (' + tr.moves.filter(function (m) { return m.kind === 'player'; }).map(function (m) { return esc(m.label); }).join(', ') + (tr.moves.some(function (m) { return m.kind === 'pick'; }) ? ' and picks' : '') + (tr.moves.some(function (m) { return m.kind === 'cap'; }) ? ' and cap space' : '') + '). By today\'s model ' + esc(tk.best) + ' came out ahead. <a href="#/history">Trade History →</a>'); });
      D.adds.slice(0, 3).forEach(function (x) { M.push('<b>Pickup:</b> ' + esc(x.m.to) + ' added ' + ui.plink(x.p) + ' (' + U.fmt(x.p.WAR, 1) + ' WAR projected).'); });
      if (M.length) h += '<div class="card" style="margin-top:14px"><h2>Moves</h2><ul class="small" style="padding-left:18px;margin:0">' + M.map(function (s) { return '<li style="margin-bottom:6px">' + s + '</li>'; }).join('') + '</ul></div>';
      var X = D.isLatest ? nowBits(n) : {};
      var W2 = [];
      if (X.hot) W2.push('<b>Sell-high alert:</b> ' + ui.plink(X.hot.p) + ' (' + esc(X.hot.p.gm) + '): ' + esc(DP.luckWhy(X.hot)) + '. <a href="#/luck">Buy Low / Sell High →</a>');
      if (X.cold) W2.push('<b>Buy-low watch:</b> ' + ui.plink(X.cold.p) + ' (' + esc(X.cold.p.gm) + '): ' + esc(DP.luckWhy(X.cold)) + '.');
      if (X.prospect) W2.push('<b>Prospect of the week:</b> <a href="' + U.hash('radar', null, { p: X.prospect.key }) + '">' + esc(X.prospect.p.n) + '</a>' + (X.prospect.x.owned ? ' (' + esc(X.prospect.p.gm) + ')' : ' (unowned)') + ', up ' + U.fmt(X.prospect.d['7'].dv, 1) + ' in Radar stock over 7 days.');
      if (X.draft) W2.push('<b>2027 draft riser:</b> <a href="' + U.hash('draft', null, { p: X.draft.k }) + '">' + esc(X.draft.n) + '</a>, #' + X.draft.m.up.then + ' → #' + X.draft.rk + ' on Tankathon\'s board.');
      if (X.next && X.next.marquee) {
        var mq = X.next.marquee, cl = X.next.closest;
        W2.push('<b>Week ' + X.next.n + (X.next.live ? ' (under way)' : '') + ' marquee:</b> ' + esc(tn(mq.a)) + ' vs ' + esc(tn(mq.b)) + ' (projected ' + U.fmt(mq.ea, 1) + ' – ' + U.fmt(mq.eb, 1) + ' categories).' + (cl && cl !== mq ? ' Closest on paper: ' + esc(tn(cl.a)) + ' vs ' + esc(tn(cl.b)) + ' (' + U.fmt(cl.ea, 1) + ' – ' + U.fmt(cl.eb, 1) + ').' : '') +
          (X.next.live ? ' <a href="#/live">Live scoreboard →</a>' : ' <a href="' + U.hash('preview', null, { w: X.next.n }) + '">Preview →</a>'));
      }
      if (W2.length) h += '<div class="card" style="margin-top:14px"><h2>What to watch</h2><ul class="small" style="padding-left:18px;margin:0">' + W2.map(function (s) { return '<li style="margin-bottom:6px">' + s + '</li>'; }).join('') + '</ul><p class="small muted">From the Prospect Radar, the draft tracker, the regression watch and next week\'s projections, as of today.</p></div>';
      // standings table
      h += '<div class="card" style="margin-top:14px"><h2>Standings after week ' + n + '</h2><div class="tbl-wrap"><table class="t"><thead><tr><th class="num">#</th><th>Team</th><th class="num">W-L-T</th><th class="num">Win %</th><th class="num">Move</th><th class="num">This week</th></tr></thead><tbody>' + D.after.list.map(function (r) {
        var b = D.before.by[r.t], d = b.rank - r.rank, x = D.games.filter(function (g) { return g.a === r.t || g.b === r.t; })[0];
        return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td class="num">' + r.rank + '</td><td><b>' + esc(tn(r.t)) + '</b></td><td class="num">' + r.W + '-' + r.L + '-' + r.T + '</td><td class="num">' + U.rate(r.pct) + '</td><td class="num">' + (n > 1 && d ? '<span class="' + (d > 0 ? 'good' : 'bad') + '">' + (d > 0 ? '▲' : '▼') + Math.abs(d) + '</span>' : '<span class="faint">–</span>') + '</td><td class="num">' + (x ? score(x.g, x.g.a === r.t ? 'a' : 'b') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Rebuilt from the weekly results; Fantrax is the official record (they match on about 99% of category decisions).</p></div>';
      el.innerHTML = h;
      U.qs('#wk-n', el).addEventListener('change', function (e) { DP.go('weekly', null, { w: e.target.value }); });
      var starsTxt = [];
      loadWeek(n, function (W) {
        var li = U.qs('#wk-stars', el); if (!li) return;
        if (!W || !W.teams) { li.textContent = 'Player lines for this week aren\'t published.'; return; }
        var st = stars(W), parts = [];
        if (st.skater) parts.push(['Star of the week', st.skater]);
        if (st.d && st.d !== st.skater) parts.push(['Top defenseman', st.d]);
        if (st.sniper && st.sniper !== st.skater && st.sniper.l[1] >= 3) parts.push(['Sniper', st.sniper]);
        if (st.grinder && st.grinder.l[6] + st.grinder.l[7] >= 12) parts.push(['Grinder', st.grinder]);
        if (st.goalie) parts.push(['Goalie of the week', st.goalie]);
        li.className = '';
        li.innerHTML = '<b>Players of the week</b> (locked starters): ' + parts.map(function (x) { return x[0] + ': ' + ui.plink(x[1].p) + ' (' + esc(x[1].t) + '), ' + esc(lineTxt(x[1])); }).join('; ') + '.';
        starsTxt = parts.map(function (x) { return x[0] + ': ' + x[1].p.n + ' (' + x[1].t + '), ' + lineTxt(x[1]); });
      });
      U.qs('#wk-copy', el).addEventListener('click', function () { U.copy(chatText(D, X, starsTxt), 'The Weekly copied. Paste it in the league chat.'); });
    }
  };
  function chatText(D, X, starsTxt) {
    var w = D.w, out = ['THE WEEKLY · Dynasty Puck week ' + D.n + ' (' + day(w.from) + '–' + day(w.to) + ')', ''];
    D.sorted.forEach(function (x) { var g = x.g; out.push((x.win ? tn(x.win) + ' def. ' + tn(x.lose) + ' ' + (x.win === g.b ? score(g, 'b') : score(g, 'a')) : tn(g.a) + ' tied ' + tn(g.b) + ' ' + score(g, 'a')) + (x === D.blow && x.margin >= 5 ? '  (blowout)' : x === D.close && x.margin <= 1 ? '  (nail-biter)' : '')); });
    out.push('');
    out.push('Team of the week: ' + tn(D.best[0]) + ' (beat ' + U.pct(strength(w, D.best[0])) + ' of the league category by category)');
    if (D.unlucky && D.unlucky.sl >= 0.5) out.push('Hard luck: ' + tn(D.unlucky.lose) + ' lost with a week that beat ' + U.pct(D.unlucky.sl) + ' of the league');
    if (D.lucky && D.lucky.sw < 0.5) out.push('Stole one: ' + tn(D.lucky.win) + ' won with numbers that beat only ' + U.pct(D.lucky.sw) + ' of the league');
    var lead = D.after.list[0];
    out.push('Standings: ' + tn(lead.t) + ' on top at ' + lead.W + '-' + lead.L + '-' + lead.T + (D.up ? '; biggest climb ' + tn(D.up.t) + ' (' + U.ord(D.up.from) + ' to ' + U.ord(D.up.to) + ')' : '') + (D.down ? '; biggest drop ' + tn(D.down.t) + ' (' + U.ord(D.down.from) + ' to ' + U.ord(D.down.to) + ')' : ''));
    starsTxt.forEach(function (s) { out.push(s); });
    D.trades.forEach(function (tr) { out.push('Trade: ' + tr.teams.map(tn).join(' / ') + ' (' + tr.moves.filter(function (m) { return m.kind === 'player'; }).map(function (m) { return m.label; }).join(', ') + ')'); });
    if (X.hot) out.push('Sell-high alert: ' + X.hot.p.n + ' (' + X.hot.p.gm + '), ' + DP.luckWhy(X.hot));
    if (X.prospect) out.push('Prospect of the week: ' + X.prospect.p.n + (X.prospect.x.owned ? ' (' + X.prospect.p.gm + ')' : ' (unowned)'));
    if (X.draft) out.push('2027 draft riser: ' + X.draft.n + ', #' + X.draft.m.up.then + ' to #' + X.draft.rk + ' on Tankathon');
    if (X.next && X.next.marquee) out.push('Week ' + X.next.n + (X.next.live ? ' (under way)' : '') + ' marquee: ' + tn(X.next.marquee.a) + ' vs ' + tn(X.next.marquee.b));
    out.push('', 'Full recap: ' + ((DP.meta.alerts && DP.meta.alerts.siteUrl) || '') + '#/weekly?w=' + D.n);
    return out.join('\n');
  }
})();
