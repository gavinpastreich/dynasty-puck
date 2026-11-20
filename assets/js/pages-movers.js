/* Dynasty Puck HQ - Market Movers: every player's dynasty value night by night (data/values.js from
   tools/value_history.js, every night re-scored with today's engine), the biggest risers and fallers with the reason,
   and which teams gained or lost the most value. data/values.js is loaded only when needed. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var WIN = [['1', '1 day', 1], ['7', '7 days', 2], ['30', '30 days', 3], ['s', 'Season', 4]];

  DP.loadValues = function (done) {
    if (DP.values) return done(DP.values);
    var s = document.createElement('script');
    s.src = 'data/values.js';
    s.onload = function () { done(DP.values || null); }; s.onerror = function () { done(null); };
    document.head.appendChild(s);
  };
  function day(d) { return U.date(new Date(d + 'T12:00:00Z')); }
  // value change of one player over a window, with what changed: owner, contract, this-season projection, injury
  DP.moverRow = function (id, j) {
    var V = DP.values, o = V && V.p[id], E = DP.E; if (!o) return null;
    var i0 = V.ref[j], n = V.dates.length - 1, v0 = o.v[i0], v1 = o.v[n];
    if (v0 === null || v1 === null || v0 === undefined || v1 === undefined) return null;
    var m0 = o.m[j], m1 = o.m[0], p = E.byId[id], why = [];
    if (m0 && m1) {
      if (m0[1] !== m1[1]) why.push(!m0[1] ? 'picked up by ' + m1[1] : !m1[1] ? 'dropped by ' + m0[1] : 'moved ' + m0[1] + ' → ' + m1[1]);
      if (m0[2] !== m1[2] && m0[1] === m1[1]) why.push('contract ' + (m0[2] || '–') + ' → ' + (m1[2] || '–'));
      if (Math.abs(m1[0] - m0[0]) >= 0.3) why.push('2026-27 projection ' + U.sgn(m1[0] - m0[0], 1) + ' WAR');
    }
    if (p && p.inj && /OUT|IR/i.test(p.inj[0])) why.push('on the injury report (' + p.inj[0] + ')');
    return { id: id, p: p, v0: v0, v1: v1, d: v1 - v0, pct: v0 > 0.5 ? v1 / v0 - 1 : null, why: why, own0: m0 && m0[1], own1: m1 && m1[1] };
  };
  DP.teamValueMoves = function (j) {
    var V = DP.values, E = DP.E, i0 = V.ref[j], n = V.dates.length - 1, out = {};
    E.teams.forEach(function (t) { out[t] = { t: t, now: 0, then: 0, held: 0 }; });
    Object.keys(V.p).forEach(function (id) {
      var o = V.p[id], m0 = o.m[j], m1 = o.m[0];
      if (m1 && m1[1] && out[m1[1]] && o.v[n] !== null) { out[m1[1]].now += o.v[n]; if (m0 && m0[1] === m1[1] && o.v[i0] !== null) out[m1[1]].held += o.v[n] - o.v[i0]; }
      if (m0 && m0[1] && out[m0[1]] && o.v[i0] !== null) out[m0[1]].then += o.v[i0];
    });
    return E.teams.map(function (t) { var x = out[t]; x.d = x.now - x.then; x.moves = x.d - x.held; return x; });
  };
  function spark(v, w, h) {
    w = w || 90; h = h || 22;
    var pts = []; (v || []).forEach(function (x, i) { if (x !== null) pts.push([i, x]); });
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts.map(function (q) { return q[1]; })), hi = Math.max.apply(null, pts.map(function (q) { return q[1]; })), n = v.length - 1;
    var d = pts.map(function (q, k) { return (k ? 'L' : 'M') + (q[0] / n * (w - 2) + 1).toFixed(1) + ',' + (h - 2 - (q[1] - lo) / (hi - lo || 1) * (h - 4)).toFixed(1); }).join('');
    var up = pts[pts.length - 1][1] >= pts[0][1];
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="var(--' + (up ? 'good' : 'bad') + ')" stroke-width="1.6"/></svg>';
  }
  DP.valueSpark = function (id, w, h) { var o = DP.values && DP.values.p[id]; return o ? spark(o.v, w, h) : ''; };

  DP.pages.movers = {
    title: 'Market Movers',
    render: function (el, hsh) {
      var q = hsh.q, me = DP.state.team, E = DP.E;
      var h = '<div class="page-head"><h1>📈 Market Movers</h1><p class="sub">Every player\'s dynasty value, night by night, re-scored with today\'s model so the nights compare: who is rising, who is falling and why, and which teams gained or lost the most value. Values are model estimates (see Rules & Methods).</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the value history…</p></div>';
      DP.loadValues(function (V) {
        var box = U.qs('.lz', el); if (!box) return;
        if (!V) { box.innerHTML = '<div class="callout">The value history (data/values.js) isn\'t built yet. It comes with the nightly refresh.</div>'; return; }
        var wk = WIN.filter(function (x) { return x[0] === q.w; })[0] || WIN[1], j = wk[2];
        var from = V.dates[V.ref[j]], to = V.dates[V.dates.length - 1];
        var rows = Object.keys(V.p).map(function (id) { return DP.moverRow(id, j); }).filter(function (r) { return r && r.p; });
        var hh = (V.stale ? '<div class="callout warn">The valuation changed since this history was scored; older nights may not compare exactly until it is re-scored.</div>' : '');
        hh += '<div class="controls"><div class="seg" role="tablist">' + WIN.map(function (x) { return '<button data-w="' + x[0] + '" class="' + (x === wk ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><span class="small muted">' + esc(day(from)) + ' → ' + esc(day(to)) + ' · ' + V.dates.length + ' nights on file since ' + esc(day(V.dates[0])) + '</span></div>';
        var li = function (r) {
          return '<li><div class="fml">' + ui.pcell(r.p, { pos: 1 }) + '<div class="fmd small muted">' + U.fmt(r.v0, 1) + ' → <b>' + U.fmt(r.v1, 1) + '</b>' + (r.own1 ? ' · ' + U.teamLabel(r.own1) : ' · FA') + (r.why.length ? ' · ' + esc(r.why.join('; ')) : '') + '</div></div><span class="fmr">' + DP.valueSpark(r.id, 70, 20) + '<br><b class="' + (r.d > 0 ? 'good' : 'bad') + '">' + U.sgn(r.d, 1) + '</b></span></li>';
        };
        var up = rows.filter(function (r) { return r.d > 0.05; }).sort(function (a, b) { return b.d - a.d; });
        var dn = rows.filter(function (r) { return r.d < -0.05; }).sort(function (a, b) { return a.d - b.d; });
        hh += '<div class="grid g2"><div class="card"><h2>📈 Risers</h2><div class="hint">Biggest gains in dynasty value.</div><ul class="list-plain fmlist">' + up.slice(0, 12).map(li).join('') + '</ul></div>' +
          '<div class="card"><h2>📉 Fallers</h2><div class="hint">Biggest drops.</div><ul class="list-plain fmlist">' + dn.slice(0, 12).map(li).join('') + '</ul></div></div>';
        var TV = DP.teamValueMoves(j).sort(function (a, b) { return b.d - a.d; });
        hh += '<div class="card flush" style="margin-top:14px"><h2>💼 Team value</h2><div class="hint">Total dynasty value of each roster now vs ' + esc(day(from)) + '. "Held players" = value change of the players a team had both then and now; "moves" = what trades, adds and drops changed.</div><div class="tbl-wrap" style="padding:0 12px 12px"><table class="t"><thead><tr><th>Team</th><th class="num">Then</th><th class="num">Now</th><th class="num">Change</th><th class="num">Held players</th><th class="num">Moves</th></tr></thead><tbody>' +
          TV.map(function (x) { return '<tr class="' + (x.t === me ? 'mine' : '') + '"><td>' + U.teamChip(x.t, { link: 1 }) + '</td><td class="num">' + U.fmt(x.then, 0) + '</td><td class="num">' + U.fmt(x.now, 0) + '</td><td class="num"><b>' + ui.delta(x.d, 1) + '</b></td><td class="num">' + ui.delta(x.held, 1) + '</td><td class="num">' + ui.delta(x.moves, 1) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
        hh += '<div class="card flush" style="margin-top:14px"><h2>Everyone</h2><div id="mv-t" style="padding:0 12px 12px"></div></div>';
        box.innerHTML = hh;
        U.qsa('[data-w]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('movers', null, { w: b.dataset.w === '7' ? undefined : b.dataset.w }); }); });
        ui.table(U.qs('#mv-t', el), {
          rows: rows, sort: 'd', csv: 'market-movers-' + wk[0] + '.csv', search: function (r) { return r.p.n + ' ' + (r.own1 || 'FA'); },
          rowCls: function (r) { return r.own1 && r.own1 === me ? 'mine' : ''; },
          filters: [{ l: 'Owner', opts: [['', 'Everyone'], ['mine', 'My team'], ['owned', 'Owned'], ['fa', 'Free agents']], fn: function (r, v) { return v === 'mine' ? r.own1 === me : v === 'owned' ? !!r.own1 : !r.own1; } },
            { l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (r, v) { return r.p.slot === v || (v === 'D' && r.p.fd); } }],
          cols: [
            { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p, { pos: 1 }); } },
            { k: 'own', l: 'Owner', v: function (r) { return r.own1 || 'zz'; }, f: function (r) { return r.own1 ? U.teamLabel(r.own1) : '<span class="muted">FA</span>'; }, asc: true },
            { k: 'trend', l: 'Trend', v: null, f: function (r) { return DP.valueSpark(r.id); } },
            { k: 'v1', l: 'Value', cls: 'num', v: function (r) { return r.v1; }, f: function (r) { return U.fmt(r.v1, 1); } },
            { k: 'd', l: 'Change', cls: 'num', v: function (r) { return r.d; }, f: function (r) { return '<b>' + ui.delta(r.d, 1) + '</b>'; } },
            { k: 'pct', l: '%', cls: 'num', v: function (r) { return r.pct; }, f: function (r) { return r.pct === null ? '–' : ui.delta(r.pct * 100, 0); } },
            { k: 'why', l: 'What changed', v: null, f: function (r) { return '<span class="small">' + esc(r.why.join('; ')) + '</span>'; } }
          ]
        });
      });
    }
  };
})();
