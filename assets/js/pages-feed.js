/* Dynasty Puck HQ - League Feed: one timeline of what happened, newest first. Trades and adds/drops (Fantrax logs),
   line and power-play moves of owned players plus free agents promoted (Daily Faceoff depth charts, data/depthlog.js),
   the biggest dynasty value swings between nights on file (data/values.js) and every week's final results. Filters by
   team and kind. The depth log and value history load on demand. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var KINDS = [['trade', '🤝', 'Trades'], ['move', '🧾', 'Adds & drops'], ['line', '🔀', 'Line & PP'], ['value', '📈', 'Value swings'], ['result', '🏒', 'Results']];
  var KIC = {}; KINDS.forEach(function (k) { KIC[k[0]] = k[1]; });
  var PROMO = function (e) { return e.up && ((e.k === 'pp' && e.to === 'PP1') || (e.k === 'line' && (e.to === 'F1' || e.to === 'F2' || e.to === 'D1')) || (e.k === 'g' && e.to === 'G1')); };
  function chip(e) { var lab = function (x) { return x || (e.k === 'line' ? 'out' : e.k === 'pp' ? 'none' : '–'); }; return '<span class="lchip ' + (e.up ? 'up' : 'dn') + '">' + esc(lab(e.from)) + ' → <b>' + esc(lab(e.to)) + '</b></span>'; }
  function addDay(d, k) { return new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10); }

  // items: { d, k, teams: [codes], html, w (weight, for ordering inside a day) }
  DP.feedItems = function (opt) {
    opt = opt || {};
    var E = DP.E, out = [];
    // trades
    ((DP.league && DP.league.trades) || []).forEach(function (tr) {
      out.push({ d: tr.date, k: 'trade', teams: tr.teams.slice(), w: 5, html: '<b>Trade</b>: ' + tr.teams.map(function (t) {
        var got = tr.moves.filter(function (m) { return m.to === t; });
        return U.teamChip(t, { link: 1 }) + ' got ' + (got.length ? got.map(function (m) { var p = m.id && E.byId[m.id]; return p ? ui.plink(p) : esc(m.label); }).join(', ') : 'nothing listed');
      }).join('; ') + '. <a href="#/history">Trade History →</a>' });
    });
    // adds and drops (one item per team per day)
    var md = {};
    (DP.league.moves || []).forEach(function (m) {
      if (m.type !== 'add' && m.type !== 'drop') return;
      var t = m.type === 'add' ? m.to : m.from, k = m.d + '|' + t;
      (md[k] = md[k] || { d: m.d, t: t, add: [], drop: [] })[m.type].push(m);
    });
    Object.keys(md).forEach(function (k) {
      var x = md[k], nm = function (m) { var p = E.byId[m.id]; return p ? ui.plink(p) : esc(m.n); };
      out.push({ d: x.d, k: 'move', teams: [x.t], w: 3, html: U.teamChip(x.t, { link: 1 }) + (x.add.length ? ' added ' + x.add.map(nm).join(', ') : '') + (x.add.length && x.drop.length ? ';' : '') + (x.drop.length ? ' dropped ' + x.drop.map(nm).join(', ') : '') + '.' });
    });
    // weekly results
    E.history().weeks.forEach(function (w) {
      if (!w.games || !w.games.length) return;
      var wk = E.weeks[w.n - 1], big = w.games.map(function (g) { return { g: g, m: Math.abs(g.sa.W - g.sb.W) }; }).sort(function (a, b) { return b.m - a.m; })[0];
      w.games.forEach(function (g) {
        var aw = g.sa.W > g.sa.L, bw = g.sb.W > g.sb.L, win = aw ? g.a : bw ? g.b : null, lose = aw ? g.b : bw ? g.a : null, s = aw ? g.sa : g.sb;
        out.push({ d: addDay(wk.end, 1), k: 'result', teams: [g.a, g.b], w: 1, html: 'Week ' + w.n + ': ' + (win ? U.teamChip(win, { link: 1 }) + ' beat ' + U.teamChip(lose, { link: 1 }) + ' <b class="num">' + s.W + '-' + s.L + (s.T ? '-' + s.T : '') + '</b>' : U.teamChip(g.a, { link: 1 }) + ' and ' + U.teamChip(g.b, { link: 1 }) + ' tied <b class="num">' + g.sa.W + '-' + g.sa.L + '-' + g.sa.T + '</b>') + (big && big.g === g && big.m >= 8 ? ' <span class="badge warn">blowout of the week</span>' : '') + (g === w.games[w.games.length - 1] ? ' <a href="#/weekly?w=' + w.n + '">The Weekly →</a>' : '') });
      });
    });
    // line and power-play moves (owned players by team and day; free agents promoted)
    var L = opt.lines;
    if (L && L.events) {
      var lm = {};
      DP.lineEvents(L, opt.lineDays || 200).forEach(function (e) {
        if (!e.p) return;
        var t = e.p.gm || (PROMO(e) ? 'FA' : null); if (!t) return;
        var k = e.d + '|' + t; (lm[k] = lm[k] || { d: e.d, t: t, ev: [] }).ev.push(e);
      });
      Object.keys(lm).forEach(function (k) {
        var x = lm[k];
        out.push({ d: x.d, k: 'line', teams: x.t === 'FA' ? [] : [x.t], fa: x.t === 'FA', w: 2, html: (x.t === 'FA' ? '<b>Free agents moving up</b>: ' : U.teamChip(x.t, { link: 1 }) + ' line moves: ') + x.ev.slice(0, 6).map(function (e) { return ui.plink(e.p) + ' ' + chip(e); }).join(', ') + (x.ev.length > 6 ? ' +' + (x.ev.length - 6) + ' more' : '') + '.' });
      });
    }
    // value swings between consecutive nights on file
    var V = opt.values;
    if (V && V.p && V.dates.length > 1) {
      for (var i = 1; i < V.dates.length; i++) {
        var sw = [];
        Object.keys(V.p).forEach(function (id) { var v = V.p[id].v, a = v[i - 1], b = v[i]; if (a !== null && b !== null && a !== undefined && b !== undefined && Math.abs(b - a) >= 1) sw.push({ id: id, d: b - a, b: b }); });
        if (!sw.length) continue;
        sw.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
        var top = sw.slice(0, 6).filter(function (x) { return E.byId[x.id]; }), gap = Math.round((Date.parse(V.dates[i]) - Date.parse(V.dates[i - 1])) / 864e5);
        if (!top.length) continue;
        out.push({ d: V.dates[i], k: 'value', teams: top.map(function (x) { return E.byId[x.id].gm; }).filter(Boolean), w: 0, html: '<b>Value swings</b>' + (gap > 1 ? ' over ' + gap + ' days' : '') + ': ' + top.map(function (x) { var p = E.byId[x.id]; return ui.plink(p) + ' ' + ui.delta(x.d, 1) + (p.gm ? ' <span class="faint small">' + esc(p.gm) + '</span>' : ''); }).join(', ') + '. <a href="#/movers">Market Movers →</a>' });
      }
    }
    out.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : b.w - a.w; });
    return out;
  };
  DP.feedFilter = function (items, o) {
    return items.filter(function (x) {
      if (o.kinds && o.kinds.length && o.kinds.indexOf(x.k) < 0) return false;
      if (o.team && x.teams.indexOf(o.team) < 0) return false;
      if (o.since && x.d < o.since) return false;
      return true;
    });
  };
  DP.feedHtml = function (items, max) {
    var h = '', last = null;
    items.slice(0, max || 999).forEach(function (x) {
      if (x.d !== last) { h += (last ? '</ul>' : '') + '<h3 class="feed-day">' + esc(U.date(new Date(x.d + 'T12:00:00Z'))) + '</h3><ul class="list-plain feed">'; last = x.d; }
      h += '<li class="feed-' + x.k + (x.teams.indexOf(DP.state.team) >= 0 ? ' mine' : '') + '"><span class="feed-ic" aria-hidden="true">' + KIC[x.k] + '</span><span class="small">' + x.html + '</span></li>';
    });
    return h ? h + '</ul>' : '<p class="small muted">Nothing in this window.</p>';
  };
  DP.loadFeed = function (done) {
    DP.loadValues(function (V) { DP.loadDepthLog(function (L) { done(DP.feedItems({ values: V, lines: L })); }); });
  };

  DP.pages.feed = {
    title: 'League Feed',
    render: function (el, hsh) {
      var q = hsh.q, me = DP.state.team, team = q.team === 'all' ? '' : (q.team || ''), days = q.days === 'all' ? 0 : (+q.days || 14), kinds = q.k ? q.k.split(',') : [];
      var h = '<div class="page-head"><h1>📣 League Feed</h1><p class="sub">Everything that happened in the league, newest first: trades, adds and drops, line and power-play moves, the biggest value swings and every week\'s results. Filter by team or kind.</p></div>';
      h += '<div class="controls"><label>Team <select id="fd-team"><option value="all">Everyone</option>' + U.teamOptions(team) + '</select></label>' + (me && team !== me ? '<button class="btn sm" id="fd-me">Just my team</button>' : '') +
        '<div class="seg">' + [7, 14, 30, 'all'].map(function (d) { return '<button data-days="' + d + '" class="' + (String(d) === String(days || 'all') ? 'on' : '') + '">' + (d === 'all' ? 'All season' : d + ' days') + '</button>'; }).join('') + '</div></div>';
      h += '<div class="controls feed-kinds">' + KINDS.map(function (k) { var on = !kinds.length || kinds.indexOf(k[0]) >= 0; return '<label class="small"><input type="checkbox" data-k="' + k[0] + '"' + (on ? ' checked' : '') + '> ' + k[1] + ' ' + esc(k[2]) + '</label>'; }).join('') + '</div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the depth charts and the value history…</p></div>';
      var nav = function (o) { var Q = { team: team || undefined, days: days ? (days === 14 ? undefined : days) : 'all', k: kinds.length ? kinds.join(',') : undefined }; Object.keys(o).forEach(function (k) { Q[k] = o[k]; }); DP.go('feed', null, Q); };
      U.qs('#fd-team', el).addEventListener('change', function (e) { nav({ team: e.target.value === 'all' ? undefined : e.target.value }); });
      if (U.qs('#fd-me', el)) U.qs('#fd-me', el).addEventListener('click', function () { nav({ team: me }); });
      U.qsa('[data-days]', el).forEach(function (b) { b.addEventListener('click', function () { nav({ days: b.dataset.days === '14' ? undefined : b.dataset.days }); }); });
      U.qsa('[data-k]', el).forEach(function (c) { c.addEventListener('change', function () { var on = U.qsa('[data-k]', el).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.k; }); nav({ k: on.length === KINDS.length || !on.length ? undefined : on.join(',') }); }); });
      DP.loadFeed(function (items) {
        var box = U.qs('.lz', el); if (!box) return;
        var last = items.length ? items[0].d : null, since = days && last ? addDay(last, -(days - 1)) : null;
        var F = DP.feedFilter(items, { team: team, kinds: kinds, since: since });
        box.innerHTML = '<p class="small muted">' + F.length + ' item' + (F.length === 1 ? '' : 's') + (since ? ' since ' + esc(U.date(new Date(since + 'T12:00:00Z'))) : ' this season') + '.</p>' + DP.feedHtml(F, 400) + (F.length > 400 ? '<p class="small muted">Showing the newest 400. Narrow the filters to see more.</p>' : '');
      });
    }
  };
})();
