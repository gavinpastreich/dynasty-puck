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
  function spark(v, w, h, fixLo, fixHi) {
    w = w || 90; h = h || 22;
    var pts = []; (v || []).forEach(function (x, i) { if (x !== null) pts.push([i, x]); });
    if (pts.length < 2) return '';
    var lo = fixLo !== undefined ? fixLo : Math.min.apply(null, pts.map(function (q) { return q[1]; })), hi = fixHi !== undefined ? fixHi : Math.max.apply(null, pts.map(function (q) { return q[1]; })), n = v.length - 1;
    var d = pts.map(function (q, k) { return (k ? 'L' : 'M') + (q[0] / n * (w - 2) + 1).toFixed(1) + ',' + (h - 2 - (q[1] - lo) / (hi - lo || 1) * (h - 4)).toFixed(1); }).join('');
    var up = pts[pts.length - 1][1] >= pts[0][1];
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="var(--' + (up ? 'good' : 'bad') + ')" stroke-width="1.6"/></svg>';
  }
  // one line per team over the nights on file (team colors; hover a line to pick it out). series = {team: [values]},
  // opts: { me, fmt(v) for labels and tips, step (gridline step), lo, hi, label(t, v) }
  DP.teamLinesChart = function (dates, series, opts) {
    opts = opts || {};
    var E = DP.E, me = opts.me, T = E.teams.filter(function (t) { return series[t]; }), n = dates.length; if (n < 2 || !T.length) return '';
    var fmt = opts.fmt || function (v) { return String(Math.round(v)); }, all = [];
    T.forEach(function (t) { series[t].forEach(function (v) { if (v !== null && v !== undefined) all.push(v); }); });
    var step = opts.step || (Math.max.apply(null, all) - Math.min.apply(null, all) > 160 ? 50 : 25);
    var lo = opts.lo !== undefined ? opts.lo : Math.floor(Math.min.apply(null, all) / step) * step, hi = opts.hi !== undefined ? opts.hi : Math.ceil(Math.max.apply(null, all) / step) * step;
    var W = 900, H = 400, padL = 42, padR = 150, padT = 12, padB = 26;
    var t0 = Date.parse(dates[0] + 'T12:00:00Z'), t1 = Date.parse(dates[n - 1] + 'T12:00:00Z');
    var px = function (i) { return padL + (Date.parse(dates[i] + 'T12:00:00Z') - t0) / Math.max(1, t1 - t0) * (W - padL - padR); };
    var py = function (v) { return padT + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - padT - padB); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="bump" role="img" aria-label="' + esc(opts.title || 'Every team, night by night') + '">';
    for (var g = lo; g <= hi + 1e-9; g += step) s += '<line class="gridl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + py(g).toFixed(1) + '" y2="' + py(g).toFixed(1) + '"/><text class="axis" x="' + (padL - 6) + '" y="' + (py(g) + 4).toFixed(1) + '" text-anchor="end">' + esc(fmt(g)) + '</text>';
    var lastLab = -1;
    dates.forEach(function (d, i) { var x = px(i); if (i === 0 || i === n - 1 || x - lastLab > 70) { if (i === n - 1 && x - lastLab < 50 && lastLab >= 0) return; s += '<text class="axis" x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(day(d).replace(/,.*/, '')) + '</text>'; lastLab = x; } });
    var lastOf = function (t) { var v = series[t]; for (var k = v.length - 1; k >= 0; k--) if (v[k] !== null && v[k] !== undefined) return v[k]; return lo; };
    var ends = T.map(function (t) { return { t: t, y: py(lastOf(t)) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
    // labels pushed past the bottom: pull the stack back up so every label stays on the chart
    var floorY = H - padB + 2;
    if (ends.length && ends[ends.length - 1].y > floorY) { ends[ends.length - 1].y = floorY; for (k = ends.length - 2; k >= 0; k--) if (ends[k + 1].y - ends[k].y < 13) ends[k].y = ends[k + 1].y - 13; }
    var labY = {}; ends.forEach(function (e) { labY[e.t] = e.y; });
    T.slice().sort(function (a, b) { return (a === me) - (b === me); }).forEach(function (t) {
      var col = U.teamColor(t), v = series[t], pen = false, d = '';
      v.forEach(function (x, i) { if (x === null || x === undefined) { pen = false; return; } d += (pen ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(x).toFixed(1); pen = true; });
      var tip = '<div class="tv">' + esc(U.teamName(t)) + '</div><div class="tl">' + esc(opts.tip ? opts.tip(t, v) : fmt(lastOf(t)) + ' now') + '</div>';
      s += '<g class="bl' + (t === me ? ' me' : '') + '" data-tip="' + esc(tip) + '"><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (t === me ? 4.5 : 2.6) + '" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text x="' + (W - padR + 8) + '" y="' + (labY[t] + 4).toFixed(1) + '" style="fill:' + col + ';font-size:12px;font-weight:' + (t === me ? 800 : 600) + '">' + esc(fmt(lastOf(t))) + ' ' + esc(U.teamName(t).length > 15 ? U.teamName(t).slice(0, 14) + '…' : U.teamName(t)) + '</text></g>';
    });
    return '<div class="chart">' + s + '</svg></div>';
  };
  // every team's total dynasty value on each night on file
  DP.teamValueChart = function (me) {
    var V = DP.values; if (!V || !V.teams || V.dates.length < 2) return '';
    var j30 = V.ref[3];
    return DP.teamLinesChart(V.dates, V.teams, { me: me, title: 'Total dynasty value of every team, night by night', tip: function (t, v) { var n = v.length - 1; return Math.round(v[n]) + ' now · ' + U.sgn(v[n] - v[j30], 1) + ' in 30 days · ' + U.sgn(v[n] - v[0], 1) + ' since ' + day(V.dates[0]); } });
  };
  // playoff odds of every team on the nights nearest two dates (from the odds history): {team: {a, b, d}}
  DP.oddsBetween = function (from, to) {
    var V = DP.values; if (!V || !V.odds) return null;
    var at = function (d, after) { var k = -1; V.dates.forEach(function (x, i) { if (after ? (k < 0 && x >= d) : x <= d) k = i; }); return k; };
    var i0 = at(from, false), i1 = at(to, true); if (i0 < 0) i0 = 0; if (i1 < 0) i1 = V.dates.length - 1;
    if (i1 <= i0) return null;
    var out = {}; Object.keys(V.odds).forEach(function (t) { var a = V.odds[t].po[i0], b = V.odds[t].po[i1]; if (a !== null && b !== null) out[t] = { a: a, b: b, d: b - a }; });
    out._from = V.dates[i0]; out._to = V.dates[i1];
    return out;
  };
  // every team's playoff odds on each night on file (season sim with that night's standings and rosters)
  DP.oddsChart = function (me, key) {
    var V = DP.values; if (!V || !V.odds || V.dates.length < 2) return '';
    var ser = {}; Object.keys(V.odds).forEach(function (t) { ser[t] = V.odds[t][key || 'po'].map(function (x) { return x === null ? null : x * 100; }); });
    return DP.teamLinesChart(V.dates, ser, { me: me, lo: 0, hi: 100, step: 25, title: 'Playoff odds of every team, night by night', fmt: function (v) { return Math.round(v) + '%'; },
      tip: function (t, v) { var n = v.length - 1, j = V.ref[3]; return Math.round(v[n]) + '% now' + (v[j] !== null ? ' · ' + Math.round(v[j]) + '% 30 days ago' : '') + (v[0] !== null ? ' · ' + Math.round(v[0]) + '% on ' + day(V.dates[0]) : ''); } });
  };
  // fills the Team Hub's dynasty value tile with the 30-day change
  DP.teamValueTrend = function (t, box) {
    DP.loadValues(function (V) {
      if (!V || !V.teams || !V.teams[t] || !box || !document.body.contains(box)) return;
      var v = V.teams[t], n = v.length - 1, j = V.ref[3];
      box.innerHTML = '<br><a href="#/movers?w=30">30 days ' + ui.delta(v[n] - v[j], 1) + '</a> ' + spark(v, 64, 16);
    });
  };
  // player card / page: value trend (data/values.js) and recent line moves (data/depthlog.js), both loaded on demand
  DP.fillTrends = function (root) {
    if (!root) return;
    U.qsa('[data-trend]', root).forEach(function (box) {
      var id = box.dataset.trend, p = DP.E.byId[id]; if (!p || box.dataset.done) return; box.dataset.done = '1';
      var parts = { v: '', l: '' }, show = function () { box.innerHTML = parts.v + parts.l; box.classList.toggle('on', !!(parts.v || parts.l)); };
      DP.loadValues(function (V) {
        var o = V && V.p[id]; if (!o) return;
        var n = V.dates.length - 1, now = o.v[n], at = function (j) { var x = o.v[V.ref[j]]; return x === null || x === undefined ? null : now - x; };
        var bits = [[2, '7 days'], [3, '30 days'], [4, 'since ' + day(V.dates[0]).replace(/,.*/, '')]].map(function (b) { var d = at(b[0]); return d === null ? '' : esc(b[1]) + ' ' + ui.delta(d, 1); }).filter(Boolean);
        parts.v = '<div class="pct-row"><span class="pct-k">📈 Value</span><b class="num">' + U.fmt(now, 1) + '</b> ' + spark(o.v, 96, 20) + ' <span class="small">' + bits.join(' · ') + '</span> <a class="small" href="#/movers">Market Movers</a></div>';
        show();
      });
      DP.loadDepthLog(function (L) {
        if (!L) return;
        var ev = DP.lineEvents(L, 30).filter(function (e) { return e.p === p; }).reverse().slice(0, 4);
        if (!ev.length) return;
        parts.l = '<div class="pct-row"><span class="pct-k">🔀 Lines</span>' + ev.map(function (e) { return lineChip(e) + ' <span class="faint small">' + esc(day(e.d).replace(/,.*/, '')) + '</span>'; }).join(' ') + ' <a class="small" href="#/lines?days=30">Line changes</a></div>';
        show();
      });
    });
  };
  function lineChip(e) {
    var lab = function (x) { return x || (e.k === 'line' ? 'out' : e.k === 'pp' ? 'no PP' : '–'); };
    return '<span class="lchip ' + (e.up ? 'up' : 'dn') + '">' + esc(lab(e.from)) + ' → <b>' + esc(lab(e.to)) + '</b></span>';
  }
  // fills <span data-vt="ID"> with the player's 30-day value change (Trade Machine): rising / falling flagged at 15%
  DP.fillValueTrends = function (root) {
    if (!root || !U.qs('[data-vt]', root)) return;
    DP.loadValues(function (V) {
      if (!V) return;
      var n = V.dates.length - 1, j = V.ref[3];
      U.qsa('[data-vt]', root).forEach(function (b) {
        var o = V.p[b.dataset.vt]; if (!o || o.v[j] === null || o.v[n] === null) return;
        var d = o.v[n] - o.v[j], pct = Math.abs(o.v[j]) > 1 ? d / Math.abs(o.v[j]) : null;
        if (Math.abs(d) < 0.1) { b.innerHTML = '· <span class="faint">steady over 30 days</span>'; return; }
        b.innerHTML = '· <span class="' + (d > 0 ? 'good' : 'bad') + '" title="Dynasty value ' + U.fmt(o.v[j], 1) + ' → ' + U.fmt(o.v[n], 1) + ' over 30 days (Market Movers)">30d ' + U.sgn(d, 1) + (pct !== null && Math.abs(pct) >= 0.15 ? (d > 0 ? ' rising' : ' falling') : '') + '</span>';
      });
    });
  };
  // a team's playoff odds over the last `days` nights on file, as a sparkline
  DP.oddsSpark = function (t, days, w, h) {
    var V = DP.values, o = V && V.odds && V.odds[t]; if (!o) return '';
    var lastT = Date.parse(V.dates[V.dates.length - 1] + 'T12:00:00Z'), v = o.po.filter(function (_, i) { return lastT - Date.parse(V.dates[i] + 'T12:00:00Z') <= (days || 30) * 864e5; });
    return spark(v.map(function (x) { return x === null ? null : x * 100; }), w, h, 0, 100);
  };
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
        if (V.teams) hh += '<div class="card" style="margin-top:14px"><h2>📊 Team value through the season</h2><div class="hint">Each team\'s total dynasty value on every night on file (every player it owned that night, scored with today\'s model). Hover a line to pick a team out' + (me ? '; yours is the thick one' : '') + '.</div>' + DP.teamValueChart(me) + '</div>';
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
