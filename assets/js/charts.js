/* Dynasty Puck HQ - small SVG charts (no library). Every mark carries a tooltip via [data-tip]. */
(function () {
  'use strict';
  var DP = window.DP = window.DP || {};
  var U = DP.U, esc = U.esc;
  var C = DP.C = {};
  C.SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

  function niceTicks(min, max, n) {
    if (max === min) { max = min + 1; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = n / span * step;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (var v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  C.niceTicks = niceTicks;
  function roundedBar(x, y, w, h, r, up) { // 4px rounded data end, square at baseline
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h));
    if (h <= 0 || w <= 0) return '';
    if (up) return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
    return 'M' + x + ',' + (y + h) + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'Z';
  }
  function hbarPath(x0, y, len, h, r) { // horizontal bar from x0, rounded at the far end (len may be negative)
    if (Math.abs(len) < 0.5) return '';
    r = Math.min(r, h / 2, Math.abs(len));
    if (len > 0) return 'M' + x0 + ',' + y + 'H' + (x0 + len - r) + 'Q' + (x0 + len) + ',' + y + ' ' + (x0 + len) + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + (x0 + len) + ',' + (y + h) + ' ' + (x0 + len - r) + ',' + (y + h) + 'H' + x0 + 'Z';
    var e = x0 + len;
    return 'M' + x0 + ',' + y + 'H' + (e + r) + 'Q' + e + ',' + y + ' ' + e + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + e + ',' + (y + h) + ' ' + (e + r) + ',' + (y + h) + 'H' + x0 + 'Z';
  }

  // Horizontal bars (supports negatives, diverging from 0). data: [{label, value, tip, hl, color}]
  C.hbars = function (data, o) {
    o = o || {};
    var W = o.width || 560, rowH = o.rowH || 24, barH = Math.min(o.barH || 14, 24), lab = o.labelW || 130, valW = o.valW || 58;
    var H = data.length * rowH + 22, min = Math.min(0, d3min(data)), max = Math.max(0, d3max(data));
    if (o.min !== undefined) min = o.min; if (o.max !== undefined) max = o.max;
    var ticks = niceTicks(min, max, 4), lo = ticks[0], hi = ticks[ticks.length - 1];
    var px = function (v) { return lab + (v - lo) / (hi - lo) * (W - lab - valW); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + W + 'px" role="img" aria-label="' + esc(o.title || 'bar chart') + '">';
    ticks.forEach(function (t) { s += '<line class="gridl" x1="' + px(t) + '" x2="' + px(t) + '" y1="0" y2="' + (H - 18) + '"/><text class="axis" x="' + px(t) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(o.tickFmt ? o.tickFmt(t) : U.fmt(t, Math.abs(hi - lo) < 5 ? 1 : 0)) + '</text>'; });
    s += '<line class="base" x1="' + px(0) + '" x2="' + px(0) + '" y1="0" y2="' + (H - 18) + '"/>';
    data.forEach(function (d, i) {
      var y = i * rowH + (rowH - barH) / 2, x0 = px(0), len = px(d.value) - x0;
      var col = d.color || (d.hl ? 'var(--accent)' : (d.value < 0 && o.divergent ? 'var(--s8)' : 'var(--s1)'));
      var tip = d.tip || ui_tip(o.fmt ? o.fmt(d.value) : U.fmt(d.value, 1), esc(d.label));
      s += '<text x="' + (lab - 8) + '" y="' + (y + barH / 2 + 4) + '" text-anchor="end" style="fill:var(' + (d.hl ? '--ink' : '--ink2') + ');font-size:12px;' + (d.hl ? 'font-weight:700' : '') + '">' + esc(trunc(d.label, 18)) + '</text>';
      s += '<g data-tip="' + esc(tip) + '"><rect class="hit" x="' + lab + '" y="' + (i * rowH) + '" width="' + (W - lab) + '" height="' + rowH + '"/>';
      s += '<path class="mark" d="' + hbarPath(x0, y, len, barH, 4) + '" fill="' + col + '"/></g>';
      var tx = len >= 0 ? px(d.value) + 5 : px(d.value) - 5;
      s += '<text x="' + tx + '" y="' + (y + barH / 2 + 4) + '" text-anchor="' + (len >= 0 ? 'start' : 'end') + '" style="fill:var(--muted);font-size:11px">' + esc(o.fmt ? o.fmt(d.value) : U.fmt(d.value, 1)) + '</text>';
    });
    return '<div class="chart">' + s + '</svg></div>';
  };
  function d3min(d) { return Math.min.apply(null, d.map(function (x) { return x.value; })); }
  function d3max(d) { return Math.max.apply(null, d.map(function (x) { return x.value; })); }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function ui_tip(v, l) { return '<div class="tv">' + esc(v) + '</div><div class="tl">' + l + '</div>'; }

  // Vertical stacked columns. cats: labels; series: [{name, values, color}]; line: optional [{name, value}] (cap line)
  C.stacked = function (cats, series, o) {
    o = o || {};
    var W = o.width || 560, H = o.height || 240, padL = 44, padB = 26, padT = 10;
    var totals = cats.map(function (_, i) { return series.reduce(function (a, s) { return a + Math.max(0, s.values[i] || 0); }, 0); });
    var max = Math.max(o.max || 0, Math.max.apply(null, totals), o.refLine || 0) * 1.05;
    var ticks = niceTicks(0, max, 4), hi = ticks[ticks.length - 1];
    var py = function (v) { return padT + (1 - v / hi) * (H - padT - padB); };
    var band = (W - padL) / cats.length, bw = Math.min(o.barW || 30, band * 0.62);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + W + 'px" role="img" aria-label="' + esc(o.title || 'stacked columns') + '">';
    ticks.forEach(function (t) { s += '<line class="gridl" x1="' + padL + '" x2="' + W + '" y1="' + py(t) + '" y2="' + py(t) + '"/><text class="axis" x="' + (padL - 6) + '" y="' + (py(t) + 4) + '" text-anchor="end">' + esc(o.tickFmt ? o.tickFmt(t) : U.fmt(t)) + '</text>'; });
    cats.forEach(function (c, i) {
      var x = padL + i * band + (band - bw) / 2, acc = 0, segs = [];
      series.forEach(function (sr, k) { var v = Math.max(0, sr.values[i] || 0); if (v > 0) segs.push({ v: v, k: k, sr: sr }); });
      var tip = '<div class="tv">' + esc(o.fmt ? o.fmt(totals[i]) : U.fmt(totals[i], 1)) + '</div><div class="tl">' + esc(c) + '</div>' +
        segs.map(function (g) { return '<div class="row"><span class="key" style="background:' + (g.sr.color || C.SERIES[g.k]) + '"></span>' + esc(g.sr.name) + ': ' + esc(o.fmt ? o.fmt(g.v) : U.fmt(g.v, 1)) + '</div>'; }).join('');
      s += '<g data-tip="' + esc(tip) + '"><rect class="hit" x="' + (padL + i * band) + '" y="' + padT + '" width="' + band + '" height="' + (H - padT - padB) + '"/>';
      segs.forEach(function (g, j) {
        var y1 = py(acc + g.v), y0 = py(acc), h = y0 - y1 - (j < segs.length - 1 ? 0 : 0);
        var top = j === segs.length - 1;
        var gap = j > 0 ? 2 : 0;
        s += top ? '<path class="mark" d="' + roundedBar(x, y1, bw, Math.max(0, h - gap), 4, true) + '" fill="' + (g.sr.color || C.SERIES[g.k]) + '"/>'
          : '<rect class="mark" x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(0, h - gap) + '" fill="' + (g.sr.color || C.SERIES[g.k]) + '"/>';
        acc += g.v;
      });
      s += '</g><text class="axis" x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(c) + '</text>';
    });
    s += '<line class="base" x1="' + padL + '" x2="' + W + '" y1="' + py(0) + '" y2="' + py(0) + '"/>';
    if (o.refLine) {
      s += '<line x1="' + padL + '" x2="' + W + '" y1="' + py(o.refLine) + '" y2="' + py(o.refLine) + '" stroke="var(--bad)" stroke-width="1.5"/>' +
        '<text x="' + (W - 2) + '" y="' + (py(o.refLine) - 5) + '" text-anchor="end" style="fill:var(--bad);font-size:11px">' + esc(o.refLabel || '') + '</text>';
    }
    s += '</svg>';
    var legend = '<div class="legend">' + series.map(function (sr, k) { return '<span><span class="k" style="background:' + (sr.color || C.SERIES[k]) + '"></span>' + esc(sr.name) + '</span>'; }).join('') + '</div>';
    return '<div class="chart">' + (series.length > 1 ? legend : '') + s + '</div>';
  };

  // Line chart with crosshair tooltip. x: labels; series: [{name, values (null gaps), color, dash}]
  C.lines = function (x, series, o) {
    o = o || {};
    var W = o.width || 560, H = o.height || 220, padL = 44, padR = o.padR || 12, padB = 26, padT = 12;
    var all = []; series.forEach(function (s) { s.values.forEach(function (v) { if (v !== null && v !== undefined && !isNaN(v)) all.push(v); }); });
    if (!all.length) return '<p class="muted small">No data.</p>';
    var mn = o.min !== undefined ? o.min : Math.min.apply(null, all), mx = o.max !== undefined ? o.max : Math.max.apply(null, all);
    if (o.zero !== false) mn = Math.min(0, mn);
    var ticks = niceTicks(mn, mx, 4), lo = ticks[0], hi = ticks[ticks.length - 1];
    var n = x.length, px = function (i) { return padL + (n === 1 ? (W - padL - padR) / 2 : i / (n - 1) * (W - padL - padR)); };
    var py = function (v) { return padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="max-width:' + W + 'px" role="img" aria-label="' + esc(o.title || 'line chart') + '">';
    ticks.forEach(function (t) { s += '<line class="gridl" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + py(t) + '" y2="' + py(t) + '"/><text class="axis" x="' + (padL - 6) + '" y="' + (py(t) + 4) + '" text-anchor="end">' + esc(o.tickFmt ? o.tickFmt(t) : U.fmt(t, Math.abs(hi - lo) < 3 ? 1 : 0)) + '</text>'; });
    var every = Math.max(1, Math.ceil(n / (o.maxLabels || 8)));
    x.forEach(function (l, i) { if (i % every === 0 || i === n - 1) s += '<text class="axis" x="' + px(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    series.forEach(function (sr, k) {
      var col = sr.color || C.SERIES[k], d = '', pen = false;
      sr.values.forEach(function (v, i) {
        if (v === null || v === undefined || isNaN(v)) { pen = false; return; }
        d += (pen ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(v).toFixed(1); pen = true;
      });
      if (sr.area) s += '<path d="' + d + 'L' + px(n - 1) + ',' + py(Math.max(lo, 0)) + 'L' + px(0) + ',' + py(Math.max(lo, 0)) + 'Z" fill="' + col + '" opacity=".1"/>';
      s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (sr.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
      sr.values.forEach(function (v, i) {
        if (v === null || v === undefined || isNaN(v)) return;
        if (sr.dots !== false && (n <= 12 || i === n - 1)) s += '<circle cx="' + px(i) + '" cy="' + py(v) + '" r="4" fill="' + col + '" stroke="var(--card)" stroke-width="2"/>';
      });
    });
    // crosshair columns
    x.forEach(function (l, i) {
      var tip = '<div class="tl">' + esc(l) + '</div>' + series.map(function (sr, k) {
        var v = sr.values[i];
        return '<div class="row"><span class="key" style="background:' + (sr.color || C.SERIES[k]) + '"></span><b>' + esc(v === null || v === undefined || isNaN(v) ? '–' : (o.fmt ? o.fmt(v) : U.fmt(v, 1))) + '</b> <span class="tl">' + esc(sr.name) + '</span></div>';
      }).join('');
      var bw = (W - padL - padR) / Math.max(1, n - 1);
      s += '<g class="xh" data-tip="' + esc(tip) + '"><rect class="hit" x="' + (px(i) - bw / 2) + '" y="' + padT + '" width="' + bw + '" height="' + (H - padT - padB) + '"/><line x1="' + px(i) + '" x2="' + px(i) + '" y1="' + padT + '" y2="' + (H - padB) + '" stroke="var(--axis)" stroke-width="1" opacity="0" class="xhl"/></g>';
    });
    s += '</svg>';
    var legend = series.length > 1 ? '<div class="legend">' + series.map(function (sr, k) { return '<span><span class="k line" style="background:' + (sr.color || C.SERIES[k]) + '"></span>' + esc(sr.name) + '</span>'; }).join('') + '</div>' : '';
    return '<div class="chart lines">' + legend + s + '</div>';
  };

  // sequential heat colour for a value in [0,1] (single blue hue)
  C.heat = function (t) {
    t = U.clamp(t, 0, 1);
    var steps = ['var(--seq0)', 'var(--seq1)', 'var(--seq2)', 'var(--seq3)', 'var(--seq4)', 'var(--seq5)'];
    return steps[Math.round(t * (steps.length - 1))];
  };
  C.heatInk = function (t) { return t > 0.62 ? (document.documentElement.dataset.theme === 'light' ? '#fff' : '#0d1117') : 'var(--ink)'; };

  // category profile: diverging bars for z-scores by category (team strengths/weaknesses)
  C.catProfile = function (z, ranks, o) {
    o = o || {};
    var E = DP.E, h = '';
    E.CATS.forEach(function (cat, c) {
      var v = U.clamp(z[c], -2.5, 2.5), w = Math.abs(v) / 2.5 * 50;
      var col = v >= 0 ? 'var(--s1)' : 'var(--s2)';
      var tip = '<div class="tv">' + (ranks ? U.ord(ranks[c]) + ' of ' + E.teams.length : U.sgn(z[c], 2)) + '</div><div class="tl">' + esc(cat.name) + (ranks ? ' · z ' + U.sgn(z[c], 2) : '') + '</div>';
      h += '<div class="catbar" data-tip="' + esc(tip) + '"><b>' + esc(cat.l) + '</b><div class="track"><div class="mid"></div><span style="background:' + col + ';' + (v >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%"></span></div><span class="num muted">' + (ranks ? U.ord(ranks[c]) : U.sgn(z[c], 1)) + '</span></div>';
    });
    return '<div>' + h + '<div class="legend small"><span><span class="k" style="background:var(--s1)"></span>stronger than league average</span><span><span class="k" style="background:var(--s2)"></span>weaker</span></div></div>';
  };
})();
