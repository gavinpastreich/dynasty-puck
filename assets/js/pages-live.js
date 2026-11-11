/* Dynasty Puck HQ - Scoreboard: the fantasy week in progress (live) and every finished week.
 * Totals = each team's Fantrax-Active players (weekly lock) x their NHL stats that week. Finished days are exact
 * (NHL stats API); the game day in progress comes from the NHL live feeds via the "Live scoreboard" GitHub job, which
 * publishes a small score.json every few minutes on game nights. The nightly build carries the same numbers, so the
 * page works without the live file; it just moves less often. The rest of the week is simulated. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function fmt(c, v) {
    if (v === null || v === undefined) return '–';
    if (c === 12) return v.toFixed(2);
    if (c === 13) return U.rate(v);
    if (c === 10) return U.fmt(Math.round(v), 0);   // Cor is scored as a whole number
    return U.fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);
  }
  DP.liveOddsCache = {};
  DP.liveOdds = function (a, b) {
    var sc = DP.league.score, E = DP.E, k = a + '|' + b + '|' + E.version + '|' + (sc && sc.asOf);
    if (!sc || !sc.teams) return null;
    if (!DP.liveOddsCache[k]) DP.liveOddsCache[k] = E.liveOdds(a, b, sc, 3000);
    return DP.liveOddsCache[k];
  };

  // ------------------------------------------------------------ live feed (published by the GitHub job between builds)
  var feed = DP.scoreFeed = { state: 'idle', at: null, err: null };
  feed.url = function () { return ((DP.meta || {}).live || {}).url || null; };
  feed.nLive = function () { var sc = DP.league.score; return sc && sc.live ? sc.live.games.filter(function (g) { return g.st === 'live'; }).length : 0; };
  feed.pull = function (done) {
    var url = feed.url();
    if (!url || typeof fetch === 'undefined') { if (done) done(false); return; }
    feed.state = 'loading';
    fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 120000), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (sc) {
        feed.state = 'ok'; feed.at = new Date(); feed.err = null;
        var cur = DP.league.score, changed = false;
        if (sc && sc.week && sc.teams && Object.keys(sc.teams).length && !sc.test &&
            (!cur || sc.week > cur.week || (sc.week === cur.week && Date.parse(sc.asOf) > Date.parse(cur.asOf)))) {
          DP.league.score = sc; DP.liveOddsCache = {}; changed = true;
        }
        if (done) done(changed);
      })
      .catch(function (e) { feed.state = 'err'; feed.err = String(e && e.message || e); if (done) done(false); });
  };
  // keep the scoreboard and the dashboard tile moving while someone is looking at them
  feed.tick = function () {
    if (typeof document === 'undefined' || document.hidden) return;
    var route = U.parseHash().route || 'home';
    if (route !== 'live' && route !== 'home') return;
    feed.pull(function (changed) {
      var r2 = U.parseHash().route || 'home', busy = document.querySelector('.modal-bg.open') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
      if (r2 !== route) return;
      if (changed && !busy) DP.render(); else if (route === 'live') stamp();
    });
  };
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    setTimeout(feed.tick, 1200);
    setInterval(feed.tick, 150000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && (!feed.at || Date.now() - feed.at > 120000)) feed.tick(); });
  }

  function ago(iso) {
    var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!(m >= 0)) return '';
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago';
  }
  function stamp() {
    var el = document.getElementById('live-stamp'), sc = DP.league.score; if (!el || !sc) return;
    el.textContent = 'Numbers as of ' + ago(sc.asOf) + (feed.state === 'ok' && feed.at ? ' · checked ' + feed.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : feed.state === 'err' ? ' · live feed not reachable, showing the last build' : '');
  }
  function weekLabel(w) { return w.po ? 'Playoffs round ' + w.po : 'Week ' + w.n; }
  function dateRange(a, b) { return U.date(new Date(a + 'T12:00:00Z')) + ' – ' + U.date(new Date(b + 'T12:00:00Z')); }

  var open = {};   // matchups whose player lines are expanded (kept across live refreshes)

  DP.pages.live = {
    title: 'Live Scoreboard',
    render: function (el, hsh) {
      var E = DP.E, sc = DP.league.score, me = DP.state.team, H = E.history();
      var h = '<div class="page-head"><h1>📺 Live Scoreboard</h1><p class="sub">Every category of every matchup: each team\'s locked Fantrax lineup × what those players did in NHL games that week. The week in progress updates during games and the rest of it is simulated; finished weeks are final. Fantrax is the official score.</p></div>';
      if ((!sc || !sc.week) && !H.n) {
        h += '<div class="callout">The scoreboard starts once Week 1 is underway. ' + esc(DP.lockText && DP.lockText(0) ? 'Week 1 ' + DP.lockText(0) + '.' : '') + ' Meanwhile, see the <a href="#/preview">Weekly Preview</a>.</div>';
        el.innerHTML = h; return;
      }
      // weeks to choose from: the one in progress (or just finished) + every archived week
      var curN = sc && sc.week ? sc.week : null, opts = [];
      if (curN) opts.push({ n: curN, cur: true, final: !!sc.final });
      H.weeks.slice().reverse().forEach(function (w) { if (w.n !== curN) opts.push({ n: w.n, final: true }); });
      var want = +hsh.q.w || (curN || opts[0].n), sel = opts.filter(function (o) { return o.n === want; })[0] || opts[0];
      var w = E.weeks[sel.n - 1], nLive = sel.cur ? feed.nLive() : 0;
      h += '<div class="controls"><label>Week <select id="lv-week">' + opts.map(function (o) {
        var ww = E.weeks[o.n - 1];
        return '<option value="' + o.n + '"' + (o === sel ? ' selected' : '') + '>' + esc(weekLabel(ww) + ' · ' + dateRange(ww.start, ww.end) + (o.cur && !o.final ? ' · in progress' : ' · final')) + '</option>';
      }).join('') + '</select></label>' + (sel.cur && feed.url() ? '<button class="btn sm" id="lv-refresh">↻ Refresh</button>' : '') +
        (nLive ? '<span class="badge bad livedot">● LIVE · ' + nLive + ' NHL game' + (nLive > 1 ? 's' : '') + ' on</span>' : '') + '<span class="small muted" id="live-stamp"></span></div>';

      if (sel.cur) h += currentWeek(sc, w, me);
      else h += pastWeek(H.weeks.filter(function (x) { return x.n === sel.n; })[0], w, me);
      el.innerHTML = h;
      stamp();
      U.qs('#lv-week', el).addEventListener('change', function (e) { DP.go('live', null, { w: e.target.value }); });
      var rf = U.qs('#lv-refresh', el);
      if (rf) rf.addEventListener('click', function () { rf.disabled = true; rf.textContent = 'Checking…'; feed.pull(function (changed) { if (changed) DP.render(); else { rf.disabled = false; rf.textContent = '↻ Refresh'; stamp(); U.toast('Already up to date'); } }); });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lines]'); if (!b) return;
        var d = U.qs('#' + b.dataset.lines, el); if (!d) return;
        d.hidden = !d.hidden; open[b.dataset.key] = !d.hidden;
        if (!d.hidden && d.dataset.week) loadLines(d);
      });
      if (sel.cur) {
        var games = w.po ? [] : DP.meta.h2h.filter(function (g) { return g[0] === w.n; });
        games.sort(function (x, y) { return (y[1] === me || y[2] === me ? 1 : 0) - (x[1] === me || x[2] === me ? 1 : 0); });
        setTimeout(function () {
          var box = U.qs('#live-games', el); if (!box) return;
          box.innerHTML = games.map(function (g) { return card(g[1], g[2], sc, me); }).join('') || '<p class="muted">Playoff pairings come from the final standings; open a matchup from the Weekly Matchup page.</p>';
        }, 20);
      } else U.qsa('[data-week]', el).forEach(function (d) { if (!d.hidden) loadLines(d); });
    }
  };

  // ------------------------------------------------------------ the week in progress
  function ticker(sc) {
    var L = sc.live; if (!L || !L.games || !L.games.length) return '';
    var t = function (g) { return g.start ? new Date(g.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };
    return '<div class="ticker" aria-label="NHL games on ' + esc(L.date) + '">' + L.games.map(function (g) {
      var live = g.st === 'live';
      return '<span class="tk ' + g.st + '"><b>' + esc(g.a) + '</b> ' + (g.st === 'pre' ? '' : (g.as === null || g.as === undefined ? 0 : g.as)) + ' <span class="faint">@</span> <b>' + esc(g.h) + '</b> ' + (g.st === 'pre' ? '' : (g.hs === null || g.hs === undefined ? 0 : g.hs)) +
        ' <span class="' + (live ? 'bad' : 'faint') + ' small">' + esc(g.st === 'pre' ? t(g) : g.note || '') + '</span></span>';
    }).join('') + '</div>';
  }
  function currentWeek(sc, w, me) {
    var L = sc.live, nPre = L ? L.games.filter(function (g) { return g.st === 'pre'; }).length : 0, nLive = feed.nLive();
    var h = '<div class="callout small"><b>' + esc(weekLabel(w)) + '</b> (' + esc(dateRange(w.start, w.end)) + ')' +
      (sc.final ? ' · <b>final</b>' : (sc.to ? ' · finished days through <b>' + esc(U.date(new Date(sc.to + 'T12:00:00Z'))) + '</b> are exact' : '') +
        (L ? ' · ' + esc(U.date(new Date(L.date + 'T12:00:00Z'))) + ': ' + (nLive ? '<b>' + nLive + ' game' + (nLive > 1 ? 's' : '') + ' in progress</b>' : '') + (nLive && nPre ? ', ' : '') + (nPre ? nPre + ' still to start' : '') + (!nLive && !nPre ? 'all games final' : '') + ' (counted from the NHL live feeds)' : '')) +
      (sc.test ? ' · <b class="bad">TEST DATA</b>' : '') + '. Cor is estimated from NHL shot attempts' + (L && !sc.final ? ', and for games still being played from play-by-play and shift charts until the NHL posts the final numbers' : '') + '.' +
      (L && !sc.final && L.corOk === false && nLive ? ' <b>Cor for tonight\'s games in progress isn\'t all in yet</b>: the NHL posts the shift data it is counted from partway through each game, so Cor can trail the other categories.' : '') + '</div>';
    h += ticker(sc);
    return h + '<div id="live-games"><p class="muted">Simulating the rest of the week…</p></div>';
  }

  function card(a, b, sc, me) {
    var E = DP.E, o = DP.liveOdds(a, b), sNow = E.liveScore(o), key = a + '|' + b, id = 'l' + key.replace(/[^A-Za-z0-9]/g, '_');
    var onA = playing(a, sc), onB = playing(b, sc), fin = !!sc.final;
    var badge = fin ? (sNow[0] === sNow[1] ? '<span class="badge warn" style="margin-left:auto">Final: tied</span>' : '<span class="badge good" style="margin-left:auto">Final: ' + esc(sNow[0] > sNow[1] ? a : b) + ' wins</span>')
      : '<span class="badge ' + (Math.abs(o.win - o.loss) < 0.2 ? 'warn' : 'good') + '" style="margin-left:auto">' + esc(o.win >= o.loss ? a : b) + ' ' + U.pct(Math.max(o.win, o.loss)) + ' to win</span>';
    var h = '<div class="card' + (a === me || b === me ? ' mine-card' : '') + '" style="margin-bottom:12px"><h2 style="flex-wrap:wrap">' + esc(U.teamName(a)) + ' <span class="num">' + sNow[0] + '</span><span class="muted">–</span><span class="num">' + sNow[1] + '</span> ' + esc(U.teamName(b)) + (sNow[2] ? ' <span class="small muted">(' + sNow[2] + ' tied)</span>' : '') + badge + '</h2>';
    if (onA || onB) h += '<p class="small" style="margin:0 0 8px"><span class="bad">●</span> On the ice now: ' + esc(a) + ' ' + onA + ', ' + esc(b) + ' ' + onB + ' players.</p>';
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th class="num">' + esc(a) + (fin ? '' : ' now') + '</th>' + (fin ? '' : '<th class="num">proj</th><th style="min-width:120px">' + esc(a) + ' wins cat</th><th class="num">proj</th>') + '<th class="num">' + esc(b) + (fin ? '' : ' now') + '</th></tr></thead><tbody>' +
      o.cats.map(function (x, c) {
        var cat = E.CATS[c], lead = x.a === null || x.b === null || x.a === x.b ? 0 : ((cat.low ? x.a < x.b : x.a > x.b) ? 1 : -1);
        return '<tr><td><b title="' + esc(cat.name) + '">' + esc(cat.l) + '</b></td><td class="num ' + (lead > 0 ? 'good' : '') + '">' + (lead > 0 ? '<b>' + fmt(c, x.a) + '</b>' : fmt(c, x.a)) + '</td>' +
          (fin ? '' : '<td class="num muted">' + fmt(c, x.pa) + '</td><td>' + ui.meter(x.pw, x.pw >= 0.6 ? 'good' : x.pw <= 0.4 ? 'bad' : '', U.pct(x.pw)) + '</td><td class="num muted">' + fmt(c, x.pb) + '</td>') +
          '<td class="num ' + (lead < 0 ? 'good' : '') + '">' + (lead < 0 ? '<b>' + fmt(c, x.b) + '</b>' : fmt(c, x.b)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var gm = E.RULES.goalieMinGP;
    h += '<p class="small muted">Goalie GP' + (fin ? '' : ' so far') + ': ' + esc(a) + ' ' + o.ggpA + ', ' + esc(b) + ' ' + o.ggpB + ' (minimum ' + gm + ').' + (fin ? '' : ' Tie odds ' + U.pct(o.tie) + '.') + ' <button class="btn sm ghost" data-lines="' + id + '" data-key="' + esc(key) + '">Player lines</button> <a class="btn sm ghost" href="' + U.hash('matchup', null, { w: sc.week, a: a, b: b, set: '1' }) + '">Full matchup</a></p>';
    h += '<div id="' + id + '"' + (open[key] ? '' : ' hidden') + '>' + lines(a, sc.teams[a], sc) + lines(b, sc.teams[b], sc) + '</div>';
    return h + '</div>';
  }
  function playing(t, sc) {
    var on = {}, T = sc.teams[t]; if (!sc.live || !T) return 0;
    var E = DP.E, n = 0;
    (T.active || []).forEach(function (id) { var p = E.byId[id]; if (p && p.nt26 && sc.live.left[p.nt26] > 0 && sc.live.left[p.nt26] < 1) n++; });
    void on; return n;
  }

  function lines(t, T, sc) {
    var E = DP.E; if (!T) return '';
    var rows = Object.keys(T.pl || {}).map(function (id) { return [E.byId[id], T.pl[id]]; }).filter(function (x) { return x[0]; });
    var sk = rows.filter(function (x) { return !x[0].G; }).sort(function (x, y) { return (2 * y[1][1] + y[1][2]) - (2 * x[1][1] + x[1][2]) || y[1][4] - x[1][4]; }), gk = rows.filter(function (x) { return x[0].G; });
    var idle = (T.active || []).map(function (id) { return E.byId[id]; }).filter(function (p) { return p && !(T.pl || {})[p.id]; });
    var dot = function (p) { var lf = sc && sc.live && p.nt26 ? sc.live.left[p.nt26] : undefined; return lf > 0 && lf < 1 ? ' <span class="bad" title="Playing right now">●</span>' : ''; };
    return '<h3 class="small">' + esc(U.teamName(t)) + '</h3><div class="tbl-wrap"><table class="t small"><thead><tr><th>Skater</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">PIM</th><th class="num">SOG</th><th class="num">STP</th><th class="num">Hit</th><th class="num">Blk</th><th class="num">Tk</th><th class="num">Cor*</th></tr></thead><tbody>' +
      sk.map(function (x) { return '<tr><td>' + ui.plink(x[0]) + dot(x[0]) + '</td>' + x[1].map(function (v) { return '<td class="num">' + U.fmt(v, 0) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>' + (gk.length ? '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Goalie</th><th class="num">GP</th><th class="num">W</th><th class="num">GA</th><th class="num">SA</th><th class="num">SHO</th><th class="num">Min</th></tr></thead><tbody>' +
      gk.map(function (x) { return '<tr><td>' + ui.plink(x[0]) + dot(x[0]) + '</td>' + x[1].map(function (v) { return '<td class="num">' + U.fmt(v, 0) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '') +
      (idle.length ? '<p class="small muted">In the lineup, no NHL game played yet: ' + idle.map(function (p) { return ui.plink(p) + dot(p); }).join(', ') + '.</p>' : '');
  }

  // ------------------------------------------------------------ finished weeks
  function pastWeek(W, w, me) {
    var E = DP.E;
    if (!W) return '<div class="callout warn">No category totals stored for this week.</div>';
    var h = '<div class="callout small"><b>' + esc(weekLabel(w)) + '</b> (' + esc(dateRange(w.start, w.end)) + ') · <b>final</b>' + (W.final ? '' : ' (stat corrections can still move a number for a day or two)') + '. Rebuilt from the locked lineups and NHL stats; Cor is estimated, so a near-tie in Cor can differ from Fantrax.</div>';
    var games = W.games.slice().sort(function (x, y) { return (y.a === me || y.b === me ? 1 : 0) - (x.a === me || x.b === me ? 1 : 0); });
    if (!games.length) return h + '<p class="muted">No head-to-head schedule stored for this week.</p>';
    games.forEach(function (g) {
      var va = W.vec[g.a], vb = W.vec[g.b], key = W.n + ':' + g.a + '|' + g.b, id = 'p' + key.replace(/[^A-Za-z0-9]/g, '_');
      var res = g.sa.W === g.sb.W ? '<span class="badge warn" style="margin-left:auto">Tied</span>' : '<span class="badge good" style="margin-left:auto">' + esc(g.sa.W > g.sb.W ? g.a : g.b) + ' won</span>';
      h += '<div class="card' + (g.a === me || g.b === me ? ' mine-card' : '') + '" style="margin-bottom:12px"><h2 style="flex-wrap:wrap">' + esc(U.teamName(g.a)) + ' <span class="num">' + g.sa.W + '</span><span class="muted">–</span><span class="num">' + g.sb.W + '</span> ' + esc(U.teamName(g.b)) + (g.sa.T ? ' <span class="small muted">(' + g.sa.T + ' tied)</span>' : '') + res + '</h2>' +
        '<div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th class="num">' + esc(g.a) + '</th><th class="num">' + esc(g.b) + '</th><th class="num" title="Share of the other 13 teams this number would have beaten that week">' + esc(g.a) + ' vs league</th><th class="num">' + esc(g.b) + ' vs league</th></tr></thead><tbody>' +
        E.CATS.map(function (cat, c) {
          var r = g.r[c];
          return '<tr><td><b title="' + esc(cat.name) + '">' + esc(cat.l) + '</b></td><td class="num ' + (r === 1 ? 'good' : '') + '">' + (r === 1 ? '<b>' + fmt(c, va[c]) + '</b>' : fmt(c, va[c])) + '</td><td class="num ' + (r === -1 ? 'good' : '') + '">' + (r === -1 ? '<b>' + fmt(c, vb[c]) + '</b>' : fmt(c, vb[c])) + '</td><td class="num muted">' + U.pct(W.ap[g.a][c]) + '</td><td class="num muted">' + U.pct(W.ap[g.b][c]) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="small muted">Goalie GP: ' + esc(g.a) + ' ' + va.ggp + ', ' + esc(g.b) + ' ' + vb.ggp + ' (minimum ' + E.RULES.goalieMinGP + '). <button class="btn sm ghost" data-lines="' + id + '" data-key="' + esc(key) + '">Player lines</button></p>' +
        '<div id="' + id + '" data-week="' + W.n + '" data-a="' + esc(g.a) + '" data-b="' + esc(g.b) + '"' + (open[key] ? '' : ' hidden') + '><p class="small muted">Loading…</p></div></div>';
    });
    return h;
  }
  // player lines of a finished week live in data/weeks/wNN.js (loaded on demand)
  DP.weekDetail = DP.weekDetail || {};
  function loadLines(d) {
    var n = +d.dataset.week, fill = function () {
      var W = DP.weekDetail[n];
      d.innerHTML = W && W.teams ? lines(d.dataset.a, W.teams[d.dataset.a]) + lines(d.dataset.b, W.teams[d.dataset.b]) : '<p class="small muted">Player lines for this week aren\'t published.</p>';
      d.removeAttribute('data-week');
    };
    if (DP.weekDetail[n]) return fill();
    var s = document.createElement('script');
    s.src = 'data/weeks/w' + (n < 10 ? '0' : '') + n + '.js';
    s.onload = fill; s.onerror = fill;
    document.head.appendChild(s);
  }
})();
