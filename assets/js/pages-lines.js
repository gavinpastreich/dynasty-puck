/* Dynasty Puck HQ - Line & PP changes: night-to-night moves in Daily Faceoff's depth charts (data/depthlog.js from
   tools/research/depth_log.py): power-play units, top-six / top-four lines, in and out of the lineup, goalie order. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var KIND = { pp: 'Power play', line: 'Lines', g: 'Goalies' };

  DP.loadDepthLog = function (done) {
    if (DP.depthLog) return done(DP.depthLog);
    var s = document.createElement('script');
    s.src = 'data/depthlog.js';
    s.onload = function () { done(DP.depthLog || null); }; s.onerror = function () { done(null); };
    document.head.appendChild(s);
  };
  var norm = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, ''); };
  var idx = null;
  function who(name, team) {
    if (!idx) { idx = {}; DP.E.P.forEach(function (p) { var k = norm(p.n); (idx[k] = idx[k] || []).push(p); }); }
    var c = idx[norm(name)] || [];
    return c.filter(function (p) { return (p.nt || p.t) === team; })[0] || c[0] || null;
  }
  function chip(e) {
    var lab = function (x) { return x || (e.k === 'line' ? 'out' : e.k === 'pp' ? 'none' : '–'); };
    return '<span class="lchip ' + (e.up ? 'up' : 'dn') + '">' + esc(lab(e.from)) + ' → <b>' + esc(lab(e.to)) + '</b> ' + (e.up ? '▲' : '▼') + '</span>';
  }
  DP.lineEvents = function (L, days) {
    var last = L.events.length ? L.events[L.events.length - 1].d : null; if (!last) return [];
    var cut = new Date(new Date(last + 'T12:00:00Z').getTime() - (days - 1) * 864e5).toISOString().slice(0, 10);
    return L.events.filter(function (e) { return e.d >= cut; }).map(function (e) { return Object.assign({ p: who(e.n, e.t) }, e); });
  };

  // net change per player and kind over the window: where he started and where he is now (a flip-flop nets out)
  var RANK = { F1: 1, F2: 2, F3: 3, F4: 4, D1: 1, D2: 2, D3: 3, PP1: 1, PP2: 2, G1: 1, G2: 2 }, TOP = { F1: 1, F2: 1, D1: 1, D2: 1, F3: 0, F4: 0, D3: 0 };
  DP.lineNet = function (evs) {
    var by = {}, out = [];
    evs.forEach(function (e) { var k = e.t + '|' + e.n + '|' + e.k; (by[k] = by[k] || []).push(e); });
    Object.keys(by).forEach(function (k) {
      var a = by[k], f = a[0], l = a[a.length - 1];
      if (f.from === l.to) return;
      if (f.k === 'line' && f.from && l.to && TOP[f.from] === TOP[l.to]) return;  // net shuffle inside the top six / top four, or inside the bottom
      out.push(Object.assign({}, l, { from: f.from, to: l.to, n0: a.length, d0: f.d, up: !!l.to && (!f.from || (RANK[l.to] || 9) < (RANK[f.from] || 9)) }));
    });
    return out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  };

  // "since your last visit" (Dashboard): your players' moves and free agents moving up since that day
  DP.fillSinceLines = function (root, me) {
    var li = U.qs('[data-since-lines]', root); if (!li) return;
    DP.loadDepthLog(function (L) {
      if (!L || !L.events.length || !document.body.contains(li)) return;
      var d0 = li.dataset.sinceLines, last = L.events[L.events.length - 1].d, days = Math.max(1, Math.round((Date.parse(last) - Date.parse(d0)) / 864e5) + 1);
      var net = DP.lineNet(DP.lineEvents(L, Math.min(days, 30)).filter(function (e) { return e.p && e.d >= d0; }));
      var promo = function (e) { return e.up && ((e.k === 'pp' && e.to === 'PP1') || (e.k === 'line' && (e.to === 'F1' || e.to === 'F2' || e.to === 'D1')) || (e.k === 'g' && e.to === 'G1')); };
      var mine = me ? net.filter(function (e) { return e.p.gm === me; }) : [], fa = net.filter(function (e) { return !e.p.gm && promo(e); }).sort(function (a, b) { return (b.p.WAR || 0) - (a.p.WAR || 0); });
      if (!mine.length && !fa.length) return;
      var one = function (e) { return ui.plink(e.p) + ' ' + chip(e); };
      li.hidden = false;
      li.innerHTML = '<span class="ic" aria-hidden="true">🔀</span><span>' + (mine.length ? 'Your players\' line moves: ' + mine.slice(0, 4).map(one).join(', ') + (mine.length > 4 ? ' +' + (mine.length - 4) + ' more' : '') : '') +
        (mine.length && fa.length ? '. ' : '') + (fa.length ? 'Free agents moving up: ' + fa.slice(0, 3).map(one).join(', ') : '') + '</span><a class="small" style="margin-left:auto" href="#/lines">→</a>';
    });
  };

  DP.pages.lines = {
    title: 'Line & PP Changes',
    render: function (el, hsh) {
      var q = hsh.q, me = DP.state.team, days = +q.days || 7;
      var h = '<div class="page-head"><h1>🔀 Line & PP Changes</h1><p class="sub">Night-to-night moves in Daily Faceoff\'s depth charts: power-play units, top-six forwards and top-four defense, in and out of the lineup, and the goalie order. A promotion is often the first sign of more points; a scratch means no games.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the depth-chart log…</p></div>';
      DP.loadDepthLog(function (L) {
        var box = U.qs('.lz', el); if (!box) return;
        if (!L || !L.events.length) { box.innerHTML = '<div class="callout">No depth-chart changes logged yet. They come with the nightly refresh.</div>'; return; }
        var all = DP.lineEvents(L, days), raw = all.filter(function (e) { return e.p; }), inLeague = DP.lineNet(raw), every = q.all === '1';
        var hh = '<div class="controls"><div class="seg" role="group">' + [3, 7, 14, 30].map(function (d) { return '<button data-days="' + d + '" class="' + (d === days ? 'on' : '') + '">' + d + ' days</button>'; }).join('') + '</div><span class="small muted">' + inLeague.length + ' players moved (' + raw.length + ' nightly changes) in the league\'s player pool · Daily Faceoff, compared night to night</span></div>';
        var li = function (e) { return '<li><div class="fml">' + ui.pcell(e.p, { pos: 1 }) + '<div class="fmd small muted">' + esc(KIND[e.k]) + ' · ' + esc(U.date(new Date(e.d + 'T12:00:00Z'))) + (e.n0 > 1 ? ' (' + e.n0 + ' moves)' : '') + ' · ' + ui.owner(e.p) + '</div></div><span class="fmr">' + chip(e) + '</span></li>'; };
        var promo = function (e) { return e.up && ((e.k === 'pp' && e.to === 'PP1') || (e.k === 'line' && (e.to === 'F1' || e.to === 'F2' || e.to === 'D1')) || (e.k === 'g' && e.to === 'G1')); };
        var faUp = inLeague.filter(function (e) { return !e.p.gm && promo(e); }).sort(function (a, b) { return (b.p.WAR || 0) - (a.p.WAR || 0); });
        var mine = me ? inLeague.filter(function (e) { return e.p.gm === me; }).reverse() : [];
        hh += '<div class="grid g2"><div class="card"><h2>🛒 Free agents moving up</h2><div class="hint">Unowned players promoted to PP1, a top-six / top-pair spot or the starter\'s net. Next week\'s best adds are on the <a href="#/pickup">Pickup Planner</a>.</div>' +
          (faUp.length ? '<ul class="list-plain fmlist">' + faUp.slice(0, 12).map(li).join('') + '</ul>' : '<p class="small muted">None in this window.</p>') + '</div>';
        if (!me) hh += '<div class="card"><h2>Your players</h2><p class="small muted">Pick your team at the top of the page to see every move for your players here.</p></div>';
        else hh += '<div class="card"><h2>' + U.teamBadge(me) + ' Your players</h2><div class="hint">Every move for ' + esc(U.teamName(me)) + '\'s players, newest first.</div>' + (mine.length ? '<ul class="list-plain fmlist">' + mine.slice(0, 15).map(li).join('') + '</ul>' : '<p class="small muted">No changes for your players in this window.</p>') + '</div>';
        hh += '</div><div class="card flush" style="margin-top:14px"><h2>' + (every ? 'Every nightly change' : 'Every player who moved') + '</h2><div class="hint">' + (every ? 'Each night\'s change on its own. <a href="#/lines' + (days !== 7 ? '?days=' + days : '') + '">Show one row per player</a> (where he started the window and where he is now).' : 'One row per player and kind: where he was at the start of the window and where he is now (a move that was undone is left out). <a href="#/lines?all=1' + (days !== 7 ? '&days=' + days : '') + '">Show every nightly change</a>.') + '</div><div id="ln-t" style="padding:0 12px 12px"></div></div>';
        box.innerHTML = hh;
        U.qsa('[data-days]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('lines', null, { days: b.dataset.days === '7' ? undefined : b.dataset.days, all: every ? '1' : undefined }); }); });
        ui.table(U.qs('#ln-t', el), {
          rows: (every ? raw : inLeague).slice().reverse(), sort: 'd', csv: 'line-changes.csv', search: function (e) { return e.n + ' ' + e.t; },
          rowCls: function (e) { return e.p.gm && e.p.gm === me ? 'mine' : ''; },
          filters: [{ l: 'Change', opts: [['', 'All'], ['pp', 'Power play'], ['line', 'Lines'], ['g', 'Goalies']], fn: function (e, v) { return e.k === v; } },
            { l: 'Direction', opts: [['', 'Both'], ['up', 'Moved up'], ['dn', 'Moved down']], fn: function (e, v) { return v === 'up' ? e.up : !e.up; } },
            { l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], fn: function (e, v) { return v === 'mine' ? e.p.gm === me : v === 'owned' ? !!e.p.gm : !e.p.gm; } }],
          cols: [
            { k: 'd', l: 'Date', v: function (e) { return e.d; }, f: function (e) { return '<span class="small nw">' + esc(U.date(new Date(e.d + 'T12:00:00Z'))) + '</span>'; } },
            { k: 'n', l: 'Player', v: function (e) { return e.n; }, f: function (e) { return ui.pcell(e.p, { pos: 1 }); } },
            { k: 'own', l: 'Owner', v: function (e) { return e.p.gm || 'zz'; }, f: function (e) { return ui.owner(e.p); }, asc: true },
            { k: 'k', l: 'What', v: function (e) { return KIND[e.k]; } },
            { k: 'ch', l: 'Change', v: function (e) { return e.up ? 1 : 0; }, f: chip },
            { k: 'n0', l: 'Moves', cls: 'num', v: function (e) { return e.n0 || 1; }, f: function (e) { return String(e.n0 || 1); } },
            { k: 'war', l: 'WAR', cls: 'num', v: function (e) { return e.p.WAR; }, f: function (e) { return ui.warCell(e.p.WAR); } }
          ]
        });
      });
    }
  };
})();
