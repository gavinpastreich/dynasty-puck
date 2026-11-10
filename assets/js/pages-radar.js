/* Dynasty Puck HQ - Prospect Radar: every prospect on one scale, re-scored nightly; who is rising and falling and why;
   this season's lines in every league; headlines from NHL.com and public feeds; a report per prospect.
   Data: E.prospectPool() (live model) + data/radar.js (nightly history and headlines, tools/prospect_radar.js). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  var TAGCLS = { 'call-up': 'good', hot: 'good', honor: 'info', contract: 'info', trade: 'info', 'sent down': 'warn', injury: 'bad' };
  var WIN = [['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['s', 'Season']];
  var REF = { '7': 1, '14': 2, '30': 3, s: 4 };   // position in DP.radar.ref
  var CHL = { OHL: 1, WHL: 1, QMJHL: 1 }, EURO = { KHL: 1, SHL: 1, Liiga: 1, NL: 1, Czechia: 1, Czech: 1, ELH: 1, DEL: 1, HockeyAllsvenskan: 1, Allsvenskan: 1, Mestis: 1, VHL: 1, MHL: 1, Slovakia: 1, 'J20 Nationell': 1, J20: 1, 'U20 SM-sarja': 1 };
  function lgGroup(lg) { return !lg ? 'none' : lg === 'NHL' || lg === 'AHL' || lg === 'NCAA' || lg === 'USHL' ? lg : CHL[lg] ? 'CHL' : EURO[lg] ? 'Europe' : 'Other'; }
  function day(d) { return U.date(new Date(d + 'T12:00:00Z')); }
  function tagHtml(k) { return '<span class="badge ' + (TAGCLS[k] || 'info') + '">' + esc(k) + '</span>'; }

  // ---------------------------------------------------------------- the view model (cached per engine version)
  var cache = null;
  DP.radarView = function () {
    var E = DP.E, R = DP.radar || null;
    if (cache && cache.v === E.version && cache.R === R) return cache;
    var pool = E.prospectPool(), n = R ? R.dates.length : 0;
    var rows = pool.map(function (x) {
      var h = R && R.p[x.key], p = x.p;
      var row = { x: x, key: x.key, p: p, h: h || null, stock: x.stock, rank: x.rank, pros: x.pros || {}, lines: E.seasonLines(p), last: E.seasonLines(p, 1), news: (R && R.news[x.key]) || [], d: {} };
      if (h && h.m[0]) Object.keys(REF).forEach(function (w) {
        var j = REF[w], i = R.ref[j], m0 = h.m[0], m1 = h.m[j];
        if (!m1 || h.v[i] === null || i === n - 1) return;
        row.d[w] = { dv: h.v[n - 1] - h.v[i], dr: h.r[i] - h.r[n - 1], r0: h.r[i], g: m0[0] - m1[0], s: m0[1] - m1[1], c: m0[2] - m1[2], e0: m1[3], e1: m0[3], k0: m1[4], k1: m0[4], c0: m1[2], c1: m0[2], from: R.dates[i] };
      });
      // where he is playing: the league whose games grew in the last two weeks, else his busiest line this season
      var d = row.d['14'] || row.d['7'], other = row.lines.filter(function (l) { return l[0] !== 'NHL'; })[0];
      var sp = d ? split(row, d) : null;
      row.nhlNow = !!(sp && sp.nhl > 0);
      row.where = row.nhlNow ? { lg: 'NHL', team: p.t } : sp && sp.other > 0 && other ? { lg: other[0], team: other[1] } : row.lines[0] ? { lg: row.lines[0][0], team: row.lines[0][1] } : null;
      row.grp = lgGroup(row.where && row.where.lg);
      row.news14 = row.news.filter(function (it) { return R && it.d >= R.dates[R.ref[2]]; });
      return row;
    });
    var by = {}; rows.forEach(function (r) { by[r.key] = r; by[r.x.id] = r; });
    return (cache = { v: E.version, R: R, rows: rows, by: by, n: n });
  };

  function ownerHtml(row) {
    if (row.x.owned) return U.teamLabel(row.p.gm);
    return row.x.inPool ? '<span class="muted">unowned</span>' : '<span class="faint" title="A 2026 NHL draft pick Fantrax has not added to its player pool yet. He can\'t be rostered until it does.">not in Fantrax</span>';
  }
  function nameHtml(row, plain) {
    var p = row.p, sub = [esc(p.t || ''), p.age ? Math.floor(p.age) + 'y' : ''].filter(Boolean).join(' · ');
    return '<a class="plink" href="' + U.hash('radar', null, { p: row.key }) + '">' + esc(p.n) + '</a>' + (row.x.inPool ? ui.injBadge(p) : '') + (plain ? '' : ' <span class="faint small">' + sub + '</span>');
  }
  function lineTxt(p, l) {
    return p.slot === 'G' ? l[0] + ' ' + l[2] + ' GP, ' + l[3] + ' W, ' + U.rate(l[5]) : l[0] + ' ' + l[2] + ' GP, ' + l[3] + '-' + l[4] + '-' + l[5];
  }
  function etaTxt(pros) { return pros.eta === undefined ? '–' : pros.eta === 0 ? 'now' : DP.E.YEARS[Math.min(6, pros.eta)].slice(2); }
  // small trend line of the value history; green if it ends above where it starts
  function spark(v, w, h) {
    w = w || 84; h = h || 22;
    var pts = []; (v || []).forEach(function (x, i) { if (x !== null) pts.push([i, x]); });
    if (pts.length < 2) return '<span class="faint small">new</span>';
    var lo = Math.min.apply(null, pts.map(function (q) { return q[1]; })), hi = Math.max.apply(null, pts.map(function (q) { return q[1]; })), n = v.length - 1;
    var minR = Math.max(0.6, 0.25 * Math.abs(hi));   // a wobble of a few hundredths shouldn't fill the box
    if (hi - lo < minR) { var mid = (hi + lo) / 2; lo = mid - minR / 2; hi = mid + minR / 2; }
    var sx = function (i) { return (2 + i / n * (w - 4)).toFixed(1); }, sy = function (y) { return (hi === lo ? h / 2 : 2 + (1 - (y - lo) / (hi - lo)) * (h - 4)).toFixed(1); };
    var up = pts[pts.length - 1][1] >= pts[0][1], col = Math.abs(pts[pts.length - 1][1] - pts[0][1]) < 0.05 ? 'var(--muted)' : up ? 'var(--good)' : 'var(--bad)';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="value trend: ' + U.fmt(pts[0][1], 1) + ' to ' + U.fmt(pts[pts.length - 1][1], 1) + '"><path d="' +
      pts.map(function (q, i) { return (i ? 'L' : 'M') + sx(q[0]) + ',' + sy(q[1]); }).join('') + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + sx(pts[pts.length - 1][0]) + '" cy="' + sy(pts[pts.length - 1][1]) + '" r="2" fill="' + col + '"/></svg>';
  }
  function rankMove(d) {
    if (!d) return '<span class="faint">new</span>';
    return d.dr > 0 ? '<span class="good">▲' + d.dr + '</span>' : d.dr < 0 ? '<span class="bad">▼' + (-d.dr) + '</span>' : '<span class="faint">–</span>';
  }
  // what happened in the window, from the nightly snapshots: games, points, projection, the model's read, thresholds
  // games in a window split into NHL and elsewhere. Season games and career NHL games come from two NHL feeds that can
  // be a game apart, so a player with no line outside the NHL this season has every game counted as NHL.
  function split(row, d) {
    var hasOther = row.lines.some(function (l) { return l[0] !== 'NHL'; });
    var nhl = !hasOther ? d.g : Math.max(0, Math.min(d.g, d.c));
    return { nhl: nhl, other: d.g - nhl };
  }
  function windowTxt(row, w) {
    var d = row.d[w], p = row.p, G = p.slot === 'G';
    if (!d) return '';
    if (d.g <= 0) return 'no games';
    var sp = split(row, d), olg = (row.lines.filter(function (l) { return l[0] !== 'NHL'; })[0] || [])[0] || 'other leagues';
    var where = sp.other <= 0 ? 'NHL' : sp.nhl <= 0 ? olg : null;
    return (where ? where + ': ' : '') + d.g + ' GP' + (where ? '' : ' (' + sp.nhl + ' NHL)') + ', ' + d.s + (G ? ' W' : ' P');
  }
  function why(row, w) {
    var d = row.d[w], p = row.p, G = p.slot === 'G', out = [];
    if (!d) return out;
    out.push(esc(windowTxt(row, w)));
    if (d.e0 !== null && d.e1 !== null && Math.abs(d.e1 - d.e0) >= 8) out.push('NHL games projected ' + d.e0 + ' → ' + d.e1);
    if (!G && d.k0 !== null && d.k1 !== null && Math.abs(d.k1 - d.k0) >= 1.5) out.push('peak outlook ' + Math.round(d.k0) + ' → ' + Math.round(d.k1) + ' pts/82');
    if (G && d.k0 !== null && d.k1 !== null && Math.abs(d.k1 - d.k0) >= 0.15) out.push('save % vs his league ' + (d.k1 > d.k0 ? 'up' : 'down'));
    if (p.gradThr && d.c0 < p.gradThr && d.c1 >= p.gradThr) out.push('<b>graduated</b> (' + p.gradThr + ' NHL games)');
    var tags = {};
    row.news.forEach(function (it) { if (it.d >= d.from) (it.k || []).forEach(function (k) { if (k === 'call-up' || k === 'sent down' || k === 'injury' || k === 'trade') tags[k] = 1; }); });
    return out.concat(Object.keys(tags).map(tagHtml));
  }
  function inScope(row, scope, me) { return !scope || (scope === 'mine' ? row.p.gm === me && row.x.owned : scope === 'un' ? !row.x.owned : scope === 'owned' ? row.x.owned : row.p.gm === scope && row.x.owned); }
  function scopeSelect(scope, me) {
    return '<label>Show <select id="rd-scope" aria-label="Which prospects">' + [['', 'All prospects'], me ? ['mine', 'My team'] : null, ['owned', 'Rostered (MNR)'], ['un', 'Unowned']].filter(Boolean).map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === scope ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      DP.meta.gms.map(function (g) { return '<option value="' + esc(g.code) + '"' + (g.code === scope ? ' selected' : '') + '>' + esc(g.code) + '</option>'; }).join('') + '</select></label>';
  }
  function newsLi(it, rows) {
    return '<li class="newsitem"><span class="faint small nd">' + esc(day(it.d)) + '</span><div><a href="' + esc(it.u) + '" target="_blank" rel="noopener">' + esc(it.t) + '</a> ' + (it.k || []).map(tagHtml).join(' ') +
      '<div class="small faint">' + esc(it.s) + (rows ? ' · ' + rows.map(function (r) { return nameHtml(r, true) + (r.x.owned ? ' <span class="faint">(' + esc(r.p.gm) + ')</span>' : ''); }).join(', ') : '') + '</div></div></li>';
  }
  // headlines across prospects: one entry per story, with every tracked prospect it is filed under
  function wire(rows) {
    var byU = {}, list = [];
    rows.forEach(function (row) { row.news.forEach(function (it) {
      var g = byU[it.u]; if (!g) { g = byU[it.u] = { it: it, rows: [], w: 0 }; list.push(g); }
      g.rows.push(row); g.w = Math.max(g.w, it.w || 1);
    }); });
    return list.sort(function (a, b) { return a.it.d < b.it.d ? 1 : a.it.d > b.it.d ? -1 : b.w - a.w; });
  }

  // ---------------------------------------------------------------- page
  DP.pages.radar = {
    title: 'Prospect Radar',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, V = DP.radarView(), R = V.R, me = DP.state.team;
      if (q.p) { report(el, V, q.p); return; }
      var tab = q.tab || 'stock', scope = q.scope !== undefined ? q.scope : (q.team || ''), w = REF[q.w] ? q.w : '7';
      var rows = V.rows, n7 = wire(rows).filter(function (g) { return R && g.it.d >= R.dates[R.ref[1]]; }).length;
      var okSrc = R ? R.sources.filter(function (s) { return s.ok; }).length : 0;
      var h = '<div class="page-head"><h1>Prospect Radar</h1><p class="sub">' + rows.length + ' prospects on one scale: rostered MNR players, unowned players 22 or under, and 2026 NHL draft picks Fantrax hasn\'t added yet. ' +
        'Re-scored every night from this season\'s games in every league; headlines from NHL.com and ' + (R ? R.sources.length - 1 : 'public') + ' public feeds.' +
        (R ? ' History: ' + esc(day(R.dates[0])) + ' to ' + esc(day(R.dates[V.n - 1])) + ', every night scored with today\'s model.' : '') + '</p></div>';
      if (!R) h += '<div class="callout warn">The nightly history and headlines (data/radar.js) haven\'t been built yet, so trends and news are empty. Rankings below come straight from the model.</div>';
      else if (R.stale) h += '<div class="callout warn">The prospect model changed since the history was built, so older ranks are not fully comparable until it is rebuilt.</div>';
      h += '<div class="stats">' + DP.statTile('Prospects tracked', String(rows.length), rows.filter(function (r) { return r.x.owned; }).length + ' rostered · ' + rows.filter(function (r) { return !r.x.owned; }).length + ' unowned') +
        DP.statTile('In the NHL right now', String(rows.filter(function (r) { return r.nhlNow; }).length), 'played an NHL game in the last 14 days') +
        DP.statTile('Moved 10+ spots this week', String(rows.filter(function (r) { return r.d['7'] && Math.abs(r.d['7'].dr) >= 10 && r.rank <= 200; }).length), 'inside the top 200') +
        DP.statTile('Headlines this week', String(n7), R ? okSrc + ' of ' + R.sources.length + ' sources read' : 'not built yet') + '</div>';
      h += '<div class="tabs" role="tablist">' + [['stock', 'Stock watch'], ['rank', 'Rankings'], ['news', 'News wire']].map(function (t) { return '<button role="tab" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div><div id="rd-body"></div>';
      el.innerHTML = h;
      U.qsa('[data-tab]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('radar', null, { tab: b.dataset.tab, scope: scope, w: q.w }); }); });
      var body = U.qs('#rd-body', el), set = function (o) { DP.go('radar', null, Object.assign({ tab: tab, scope: scope, w: q.w, tag: q.tag }, o)); };
      if (tab === 'rank') rankings(body, V, scope, me);
      else if (tab === 'news') newsTab(body, V, scope, me, q.tag || '', set);
      else stockTab(body, V, scope, me, w, set);
    }
  };

  function stockTab(body, V, scope, me, w, set) {
    var E = DP.E, R = V.R, rows = V.rows.filter(function (r) { return inScope(r, scope, me); });
    var h = '<div class="controls"><div class="seg" role="group" aria-label="Window">' + WIN.map(function (x) { return '<button data-w="' + x[0] + '" class="' + (x[0] === w ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' + scopeSelect(scope, me) +
      (R ? '<span class="small muted">Change since ' + esc(day(R.dates[R.ref[REF[w]]])) + '</span>' : '') + '</div>';
    var moved = rows.filter(function (r) { return r.d[w]; });
    var mv = function (r) {
      var d = r.d[w];
      return '<li class="mv"><span class="rk">#' + r.rank + '</span><div class="who">' + nameHtml(r) + ' ' + ui.pos(r.p) + ' ' + ownerHtml(r) + '<div class="small muted">' + why(r, w).join(' · ') + '</div></div>' +
        '<div class="chg"><b class="' + (d.dv > 0 ? 'good' : 'bad') + '">' + U.sgn(d.dv, 1) + '</b><div class="small">' + rankMove(d) + ' <span class="faint">from #' + d.r0 + '</span></div></div></li>';
    };
    var up = moved.filter(function (r) { return r.d[w].dv >= 0.15; }).sort(function (a, b) { return b.d[w].dv - a.d[w].dv; }).slice(0, 10);
    var dn = moved.filter(function (r) { return r.d[w].dv <= -0.15; }).sort(function (a, b) { return a.d[w].dv - b.d[w].dv; }).slice(0, 10);
    var none = '<p class="muted small">' + (R ? 'No one in this group moved by more than 0.15 over this window.' : 'Needs the nightly history.') + '</p>';
    h += '<div class="grid g2"><div class="card"><h2>📈 Risers</h2><div class="hint">Biggest gains in model value (stock). Under each name: what changed between the two nights.</div>' + (up.length ? '<ul class="list-plain">' + up.map(mv).join('') + '</ul>' : none) + '</div>' +
      '<div class="card"><h2>📉 Fallers</h2><div class="hint">Biggest drops. A fall is the model reading fewer NHL games, less scoring, or a weaker save percentage than it expected.</div>' + (dn.length ? '<ul class="list-plain">' + dn.map(mv).join('') + '</ul>' : none) + '</div>';
    // hot hands: scoring pace in the window for skaters who played in one league (points can't be split across leagues)
    var hot = moved.filter(function (r) { var d = r.d[w], sp = split(r, d); return r.p.slot !== 'G' && d.g >= 3 && (sp.nhl === 0 || sp.other === 0); }).map(function (r) {
      var d = r.d[w], lg = split(r, d).nhl > 0 ? 'NHL' : (r.lines.filter(function (l) { return l[0] !== 'NHL'; })[0] || [])[0], f = E.nhleFactor(lg);
      return { r: r, lg: lg, pace: f === null || f === undefined ? null : d.s / d.g * f * 82 };
    }).filter(function (x) { return x.pace !== null; }).sort(function (a, b) { return b.pace - a.pace; }).slice(0, 8);
    h += '<div class="card"><h2>🔥 Hot hands</h2><div class="hint">Best scoring pace over the window, translated to NHL points per 82 (NHLe) so leagues compare. Skaters with 3+ games in one league. Small samples: a pace, not a projection.</div>' +
      (hot.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>Player</th><th>Owner</th><th>League</th><th class="num">GP</th><th class="num">P</th><th class="num" title="NHL-equivalent points per 82 games over the window">NHLe pace</th></tr></thead><tbody>' +
        hot.map(function (x) { var d = x.r.d[w]; return '<tr class="' + (x.r.p.gm === me && me ? 'mine' : '') + '"><td>' + nameHtml(x.r) + '</td><td>' + ownerHtml(x.r) + '</td><td>' + esc(x.lg) + '</td><td class="num">' + d.g + '</td><td class="num">' + d.s + '</td><td class="num"><b>' + Math.round(x.pace) + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted small">No one qualifies in this window.</p>') + '</div>';
    var un = V.rows.filter(function (r) { return !r.x.owned; }).slice(0, 8);
    h += '<div class="card"><h2>🎯 Best unowned prospects</h2><div class="hint">Valued as if a team held them on an MNR deal. "Not in Fantrax" = a 2026 NHL draft pick Fantrax hasn\'t added yet: a name for the next rookie draft.</div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th class="num">#</th><th>Player</th><th>Pos</th><th>Status</th><th>2026-27</th><th class="num">Stock</th></tr></thead><tbody>' +
      un.map(function (r) { return '<tr><td class="num">' + r.rank + '</td><td>' + nameHtml(r) + (r.p.dr ? ' <span class="faint small">#' + r.p.dr[2] + ' in ' + r.p.dr[0] + '</span>' : '') + '</td><td>' + ui.pos(r.p) + '</td><td>' + ownerHtml(r) + '</td><td class="small">' + (r.lines[0] ? esc(lineTxt(r.p, r.lines[0])) : '–') + '</td><td class="num"><b>' + U.fmt(r.stock, 1) + '</b></td></tr>'; }).join('') +
      '</tbody></table></div><p class="small"><a href="' + U.hash('radar', null, { tab: 'rank', scope: 'un' }) + '">All unowned prospects →</a></p></div>';
    var latest = wire(rows).slice(0, 8);
    h += '<div class="card span2"><h2>📰 Latest headlines</h2>' + (latest.length ? '<ul class="list-plain">' + latest.map(function (g) { return newsLi(g.it, g.rows); }).join('') + '</ul><p class="small"><a href="' + U.hash('radar', null, { tab: 'news', scope: scope }) + '">News wire →</a></p>' : '<p class="muted small">No headlines for this group in the last 45 days.</p>') + '</div></div>';
    body.innerHTML = h;
    U.qsa('[data-w]', body).forEach(function (b) { b.addEventListener('click', function () { set({ w: b.dataset.w }); }); });
    U.qs('#rd-scope', body).addEventListener('change', function (e) { set({ scope: e.target.value }); });
  }

  function rankings(body, V, scope, me) {
    var E = DP.E, R = V.R;
    body.innerHTML = '<details class="small" style="margin:0 0 10px"><summary>How the stock number works</summary><p class="muted"><b>Stock</b> = dynasty value as an MNR asset with a full 2026-27 counted (so it doesn\'t drift down as weeks lock): age-adjusted scoring in every league this season and last, shrunk toward a draft-slot prior, times the chance of an NHL career (draft slot, rising with each NHL game), through the league\'s contract rules. Goalies are read on save percentage against their league\'s usual level. It is a model estimate, and headlines never feed it. Click a name for the full report.</p></details><div id="rk"></div>';
    var d7 = function (r) { return r.d['7']; }, d14 = function (r) { return r.d['14']; };
    ui.table(U.qs('#rk', body), {
      rows: V.rows, sort: 'rank', desc: false, csv: 'prospect-radar.csv', page: 80,
      search: function (r) { return r.p.n + ' ' + (r.p.gm || 'unowned') + ' ' + (r.p.t || '') + ' ' + (r.where ? r.where.lg + ' ' + r.where.team : ''); },
      filters: [{ l: 'Show', opts: [['', 'All prospects'], me ? ['mine', 'My team'] : null, ['owned', 'Rostered (MNR)'], ['un', 'Unowned']].filter(Boolean).concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: scope, fn: function (r, v) { return inScope(r, v, me); } },
        { l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (r, v) { return r.p.slot === v; } },
        { l: 'Playing in', opts: [['', 'Anywhere'], ['NHL', 'NHL'], ['AHL', 'AHL'], ['NCAA', 'NCAA'], ['CHL', 'CHL (OHL/WHL/QMJHL)'], ['USHL', 'USHL'], ['Europe', 'Europe'], ['none', 'No games yet']], fn: function (r, v) { return r.grp === v; } },
        { l: 'News', opts: [['', 'Any'], ['y', 'Has headlines (14 days)']], fn: function (r) { return r.news14.length > 0; } }],
      rowCls: function (r) { return r.p.gm === me && me && r.x.owned ? 'mine' : ''; },
      cols: [{ k: 'rank', l: '#', cls: 'num', v: function (r) { return r.rank; }, asc: true },
        { k: 'mv', l: '7 days', cls: 'num', title: 'Rank change over the last 7 days', v: function (r) { return d7(r) ? d7(r).dr : null; }, f: function (r) { return rankMove(d7(r)); }, csv: function (r) { return d7(r) ? d7(r).dr : ''; } },
        { k: 'n', l: 'Player', cls: 'nw', v: function (r) { return r.p.n; }, f: function (r) { return nameHtml(r); }, csv: function (r) { return r.p.n; } },
        { k: 'pos', l: 'Pos', v: function (r) { return r.p.slot; }, f: function (r) { return ui.pos(r.p); } },
        { k: 'gm', l: 'Owner', cls: 'nw', v: function (r) { return r.x.owned ? r.p.gm : r.x.inPool ? 'zy' : 'zz'; }, f: ownerHtml, csv: function (r) { return r.x.owned ? r.p.gm : r.x.inPool ? 'unowned' : 'not in Fantrax'; }, asc: true },
        { k: 'stock', l: 'Stock', cls: 'num', v: function (r) { return r.stock; }, f: function (r) { return '<b>' + U.fmt(r.stock, 1) + '</b>'; } },
        { k: 'tr', l: 'Trend', title: R ? 'Stock since ' + day(R.dates[0]) : 'Stock history', v: function (r) { return r.d.s ? r.d.s.dv : null; }, f: function (r) { return r.h ? spark(r.h.v) : ''; }, csv: function (r) { return r.d.s ? r.d.s.dv.toFixed(2) : ''; } },
        { k: 'line', l: '2026-27', cls: 'nw', title: 'His busiest line this season (skaters G-A-P; goalies wins and save %)', v: function (r) { return r.lines[0] ? r.lines[0][2] : null; }, f: function (r) { return r.lines[0] ? '<span class="small">' + esc(lineTxt(r.p, r.lines[0])) + (r.lines.length > 1 ? ' <span class="faint">+' + (r.lines.length - 1) + '</span>' : '') + '</span>' : '<span class="faint">–</span>'; }, csv: function (r) { return r.lines.map(function (l) { return lineTxt(r.p, l); }).join(' | '); } },
        { k: 'nhle', l: 'NHLe', cls: 'num', title: 'NHL-equivalent points per 82 games this season (last season in brackets)', v: function (r) { var s = seasonOf(r, 0); return s ? s.pace : null; }, f: function (r) { var a = seasonOf(r, 0), b = seasonOf(r, 1); return (a ? '<b>' + Math.round(a.pace) + '</b>' : '–') + (b ? ' <span class="faint small">(' + Math.round(b.pace) + ')</span>' : ''); }, csv: function (r) { var a = seasonOf(r, 0); return a ? Math.round(a.pace) : ''; } },
        { k: 'l14', l: 'Last 14 days', cls: 'nw', title: 'Games and points (wins for goalies) added between the nightly snapshots', v: function (r) { return d14(r) ? d14(r).s + d14(r).g / 100 : null; }, f: function (r) { return d14(r) ? '<span class="small">' + esc(windowTxt(r, '14')) + '</span>' : '<span class="faint">–</span>'; }, csv: function (r) { return d14(r) ? windowTxt(r, '14') : ''; } },
        { k: 'peak', l: 'Peak pts/82', cls: 'num', title: 'The model\'s expected peak scoring if he becomes an NHL regular', v: function (r) { return r.pros.peakPts || null; }, f: function (r) { return r.pros.peakPts ? U.fmt(r.pros.peakPts, 0) : '–'; } },
        { k: 'pn', l: 'P(NHL)', cls: 'num', v: function (r) { return r.pros.p === undefined ? null : r.pros.p; }, f: function (r) { return r.pros.p === undefined ? '–' : U.pct(r.pros.p); } },
        { k: 'eta', l: 'ETA', cls: 'num', v: function (r) { return r.pros.eta === undefined ? null : r.pros.eta; }, f: function (r) { return etaTxt(r.pros); }, asc: true },
        { k: 'dr', l: 'Drafted', cls: 'nw', v: function (r) { return r.p.dr && r.p.dr[2] ? r.p.dr[0] * 1000 + r.p.dr[2] : 9e6; }, f: function (r) { return r.p.dr && r.p.dr[2] ? '<span class="small">' + r.p.dr[0] + ' #' + r.p.dr[2] + '</span>' : '<span class="faint small">undrafted</span>'; }, csv: function (r) { return r.p.dr && r.p.dr[2] ? r.p.dr[0] + ' #' + r.p.dr[2] : ''; }, asc: true },
        { k: 'news', l: 'News', cls: 'nw', title: 'Headlines in the last 14 days', v: function (r) { return r.news14.length; }, f: function (r) { var k = {}; r.news14.forEach(function (it) { (it.k || []).forEach(function (t) { k[t] = 1; }); }); return r.news14.length ? '<a class="small" href="' + U.hash('radar', null, { p: r.key }) + '">' + r.news14.length + '</a> ' + Object.keys(k).slice(0, 2).map(tagHtml).join(' ') : ''; }, csv: function (r) { return r.news14.length; } }]
    });
  }
  // first date from which the history has a point every night
  function firstDaily(dates) {
    var i = dates.length - 1;
    while (i > 0 && (new Date(dates[i] + 'T12:00:00Z') - new Date(dates[i - 1] + 'T12:00:00Z')) / 864e5 <= 1.5) i--;
    return dates[i];
  }
  function seasonOf(r, back) { var b = r.pros.blend; return b ? b.seasons.filter(function (s) { return s.back === back; })[0] : null; }

  function newsTab(body, V, scope, me, tag, set) {
    var R = V.R, rows = V.rows.filter(function (r) { return inScope(r, scope, me); });
    var list = wire(rows).filter(function (g) { return !tag || (g.it.k || []).indexOf(tag) >= 0; });
    var h = '<div class="controls">' + scopeSelect(scope, me) + '<label>Tag <select id="rd-tag" aria-label="Tag">' + [['', 'All']].concat(Object.keys(TAGCLS).map(function (k) { return [k, k]; })).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === tag ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' +
      '<span class="small muted">' + list.length + ' headlines, last 45 days' + (R && R.newsAsOf ? ' · read ' + esc(day(R.newsAsOf.slice(0, 10))) : '') + '</span></div>';
    var days = {}, order = [];
    list.slice(0, 150).forEach(function (g) { if (!days[g.it.d]) { days[g.it.d] = []; order.push(g.it.d); } days[g.it.d].push(g); });
    h += '<div class="card">' + (order.length ? order.map(function (d) { return '<h3 class="newsday">' + esc(new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })) + '</h3><ul class="list-plain">' + days[d].map(function (g) { return newsLi(g.it, g.rows); }).join('') + '</ul>'; }).join('') :
      '<p class="muted">No headlines for this selection.</p>') + '</div>';
    if (R) h += '<details class="card" style="margin-top:14px"><summary><b>Sources</b> <span class="small muted">' + R.sources.filter(function (s) { return s.ok; }).length + ' of ' + R.sources.length + ' read on the last run</span></summary><p class="small muted">NHL.com stories are found by player id (league and team sites). Feed headlines are attached when the full name is in the headline, or in the summary under a headline about prospects, roster moves or injuries. Only the headline, source, date and link are kept; tags come from words in the headline. Nothing here feeds the ranking: the model reads games, not news.</p><ul class="small" style="columns:2;column-gap:24px;margin:0;padding-left:18px">' +
      R.sources.map(function (s) { return '<li>' + (s.ok ? '' : '<span class="bad">✕</span> ') + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>' + (s.ok ? '' : ' <span class="faint">(not reachable)</span>') + '</li>'; }).join('') + '</ul></details>';
    body.innerHTML = h;
    U.qs('#rd-scope', body).addEventListener('change', function (e) { set({ scope: e.target.value }); });
    U.qs('#rd-tag', body).addEventListener('change', function (e) { set({ tag: e.target.value }); });
  }

  // ---------------------------------------------------------------- one prospect's report
  function report(el, V, key) {
    var E = DP.E, R = V.R, row = V.by[key];
    if (!row) { el.innerHTML = '<p><a href="#/radar">← Prospect Radar</a></p><div class="callout warn">That player isn\'t in the prospect pool (he may have graduated or been signed to a full contract).</div>'; return; }
    var p = row.p, pr = row.pros, G = p.slot === 'G', dr = p.dr;
    document.title = p.n + ' · Prospect Radar · Dynasty Puck HQ';
    var bio = [];
    if (p.age) bio.push('Age ' + U.fmt(p.age, 1));
    if (p.ht) bio.push(Math.floor(p.ht / 12) + '\'' + (p.ht % 12) + '"' + (p.wt ? ', ' + p.wt + ' lb' : ''));
    if (p.nat) bio.push(p.nat);
    bio.push(dr && dr[2] ? 'Drafted ' + dr[0] + ' #' + dr[2] + ' (R' + dr[1] + ')' : 'Undrafted');
    var h = '<p><a href="#/radar">← Prospect Radar</a></p><div class="phead">' + DP.headshot(p) + '<div style="flex:1;min-width:220px"><h2>' + esc(p.n) + ' ' + ui.pos(p) + '</h2><div class="muted">' + esc(p.t || '') + ' · ' + esc(bio.join(' · ')) + '</div>' +
      '<div style="margin-top:6px">' + (row.x.owned ? 'Owned by <b>' + esc(U.teamName(p.gm)) + '</b> (' + esc(p.gm) + ') ' + ui.pill('MNR') : row.x.inPool ? '<span class="badge info">Unowned</span> in the Fantrax pool' : '<span class="badge warn">Not in Fantrax yet</span> 2026 NHL draft pick; can\'t be rostered until Fantrax adds him') +
      (row.where ? ' · playing in <b>' + esc(row.where.lg) + '</b>' + (row.where.team && row.where.lg !== 'NHL' ? ' (' + esc(row.where.team) + ')' : '') : '') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + (row.x.inPool ? '<a class="btn sm" href="#/player/' + encodeURIComponent(p.id) + '">Full player page</a>' : '') + (p.nhl ? '<a class="btn sm" target="_blank" rel="noopener" href="https://www.nhl.com/player/' + p.nhl + '">NHL.com</a>' : '') + '</div></div>';
    var dtile = function (w, lab) { var d = row.d[w]; return DP.statTile(lab, d ? '<span class="' + (d.dv > 0.05 ? 'good' : d.dv < -0.05 ? 'bad' : '') + '">' + U.sgn(d.dv, 1) + '</span>' : '–', d ? (d.dr > 0 ? 'up ' + d.dr : d.dr < 0 ? 'down ' + (-d.dr) : 'same rank') + ' (was #' + d.r0 + ')' : 'not tracked then'); };
    h += '<div class="stats" style="margin-top:14px">' + DP.statTile('Radar rank', '#' + row.rank, 'of ' + V.rows.length + ' prospects') + DP.statTile('Stock', U.fmt(row.stock, 1), 'value as an MNR asset', 'Dynasty value with a full 2026-27 counted, as if held on an MNR deal.') +
      dtile('7', 'Last 7 days') + dtile('30', 'Last 30 days') + dtile('s', 'Since ' + (R ? day(R.dates[0]) : 'the start')) + '</div><div class="grid g2">';
    // value history
    h += '<div class="card"><h2>Stock over time</h2><div class="hint">Model value each night, every night scored with today\'s model.' + (R && R.dates.length > 2 ? ' Points are weekly before ' + esc(day(firstDaily(R.dates))) + ', nightly after.' : '') + '</div>' +
      (row.h ? C.lines(R.dates.map(day), [{ name: 'Stock', values: row.h.v, area: true }], { height: 210, maxLabels: 6, title: p.n + ' stock over time' }) : '<p class="muted small">No history yet.</p>') + '</div>';
    // what the model sees
    var m = '<table class="t"><tbody>';
    if (!row.x.pros) {
      m += '<tr><td>Prospect model</td><td class="num"><b>not used</b></td><td class="small muted">he is 25 or older, so he is valued on his NHL projection alone' + (p.r ? ' (' + U.fmt(p.WAR, 1) + ' WAR this season)' : ' (none this season)') + '</td></tr>';
    } else if (G) {
      m += '<tr><td>If he makes it</td><td class="num"><b>' + U.fmt(E.gPeak, 1) + '</b> WAR</td><td class="small muted">average value of the 64 busiest NHL goalies in our categories</td></tr>';
      m += '<tr><td>Save % vs his league</td><td class="num"><b>' + (pr.form ? U.sgn(pr.form.score, 2) : '–') + '</b></td><td class="small muted">' + (pr.form ? 'in units of .010 above the league\'s usual level, this season and last (' + Math.round(pr.form.rel * 100) + '% weight)' : 'no league-play games the model can read') + '</td></tr>';
    } else {
      m += '<tr><td>Draft-slot prior</td><td class="num"><b>' + U.fmt(pr.prior, 0) + '</b> pts/82</td><td class="small muted">typical peak for a regular drafted there</td></tr>';
      (pr.blend ? pr.blend.seasons : []).slice().sort(function (a, b) { return a.back - b.back; }).forEach(function (s) {
        m += '<tr><td>' + esc(U.season(s.season)) + ' ' + esc(s.lg) + '</td><td class="num"><b>' + Math.round(s.pace) + '</b> NHLe</td><td class="small muted">' + s.pts + ' P in ' + s.gp + ' GP at ' + U.fmt(s.age, 1) + ' → age-adjusted peak ' + Math.round(s.peak) + '</td></tr>';
      });
      m += '<tr><td>Peak outlook</td><td class="num"><b>' + U.fmt(pr.peakPts, 0) + '</b> pts/82</td><td class="small muted">' + esc(pr.basis || '') + '</td></tr>';
    }
    if (row.x.pros) m += '<tr><td>Chance of an NHL career</td><td class="num"><b>' + U.pct(pr.p) + '</b></td><td class="small muted">' + U.pct(E.pNHL(dr ? dr[2] : null)) + ' for his draft slot' + ((p.cgp || 0) > 0 ? ', raised by his ' + p.cgp + ' NHL games' : '') + ' (85% at 40 games' + (G ? '' : ', 95% at 82') + ')</td></tr>';
    if (row.x.pros) m += '<tr><td>Expected arrival</td><td class="num"><b>' + esc(etaTxt(pr)) + '</b></td><td class="small muted">' + (p.projGP ? Math.round(p.projGP) + ' NHL games projected this season' : 'no NHL games projected this season') + '</td></tr>';
    m += '<tr><td>Graduation</td><td class="num"><b>' + (p.cgp || 0) + '</b> / ' + p.gradThr + '</td><td class="small muted">career NHL games toward the MNR line</td></tr></tbody></table>';
    h += '<div class="card"><h2>What the model sees</h2><div class="hint">Every input behind the stock number. Estimates, not facts.</div><div class="tbl-wrap">' + m + '</div></div>';
    // season lines
    var linesTbl = function (L, lab) {
      if (!L.length) return '';
      return '<h3>' + esc(lab) + '</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>League</th><th>Team</th><th class="num">GP</th>' + (G ? '<th class="num">W</th><th class="num">GAA</th><th class="num">SV%</th><th class="num">SO</th>' : '<th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">PIM</th>') + '</tr></thead><tbody>' +
        L.map(function (l) { return '<tr><td><b>' + esc(l[0]) + '</b></td><td class="small">' + esc(l[1]) + '</td><td class="num">' + l[2] + '</td>' + (G ? '<td class="num">' + l[3] + '</td><td class="num">' + U.fmt(l[4], 2) + '</td><td class="num">' + U.rate(l[5]) + '</td><td class="num">' + l[6] + '</td>' : '<td class="num">' + l[3] + '</td><td class="num">' + l[4] + '</td><td class="num"><b>' + l[5] + '</b></td><td class="num">' + l[6] + '</td>') + '</tr>'; }).join('') + '</tbody></table></div>';
    };
    var win = WIN.map(function (x) { var d = row.d[x[0]]; return d ? '<tr><td>' + esc(x[1]) + ' <span class="faint small">since ' + esc(day(d.from)) + '</span></td><td class="small">' + esc(windowTxt(row, x[0])) + '</td><td class="num">' + ui.delta(d.dv, 1) + '</td><td class="num">' + rankMove(d) + '</td></tr>' : ''; }).join('');
    h += '<div class="card"><h2>This season</h2><div class="hint">League-play lines from the NHL API (updated nightly). Tournaments and leagues without an NHL equivalency are left out.</div>' +
      (linesTbl(row.lines, '2026-27') || '<p class="muted small">No league games yet this season.</p>') + linesTbl(row.last, '2025-26') +
      (win ? '<h3>Recent form</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Window</th><th>Games</th><th class="num">Stock</th><th class="num">Rank</th></tr></thead><tbody>' + win + '</tbody></table></div>' : '') + '</div>';
    h += '<div class="card"><h2>Headlines</h2><div class="hint">NHL.com stories tagged with him and public feeds that name him, last 45 days.</div>' +
      (row.news.length ? '<ul class="list-plain">' + row.news.map(function (it) { return newsLi(it); }).join('') + '</ul>' : '<p class="muted small">Nothing filed under him in the last 45 days.</p>') + '</div></div>';
    el.innerHTML = h;
  }

  // Team Hub card: one team's prospects this week (biggest moves with the reason, latest headlines)
  DP.radarTeamCard = function (team) {
    if (!DP.radar) return '';
    var V = DP.radarView(), rows = V.rows.filter(function (r) { return r.x.owned && r.p.gm === team; });
    if (!rows.length) return '';
    var mv = rows.filter(function (r) { return r.d['7'] && Math.abs(r.d['7'].dv) >= 0.1; }).sort(function (a, b) { return Math.abs(b.d['7'].dv) - Math.abs(a.d['7'].dv); }).slice(0, 6);
    var li = function (r) {
      var d = r.d['7'];
      return '<li class="mv"><span class="rk">#' + r.rank + '</span><div class="who">' + nameHtml(r) + ' ' + ui.pos(r.p) + '<div class="small muted">' + why(r, '7').join(' · ') + '</div></div><div class="chg"><b class="' + (d.dv > 0 ? 'good' : 'bad') + '">' + U.sgn(d.dv, 1) + '</b><div class="small">' + rankMove(d) + '</div></div></li>';
    };
    var news = wire(rows).slice(0, 4);
    return '<div class="card"><h2>📡 Prospect Radar: this week</h2><div class="hint">' + rows.length + ' prospects, re-scored nightly. Biggest moves in model value over the last 7 days, and the latest headlines.</div>' +
      (mv.length ? '<ul class="list-plain">' + mv.map(li).join('') + '</ul>' : '<p class="muted small">No prospect here moved by more than 0.1 this week.</p>') +
      (news.length ? '<h3 style="margin-top:12px">Headlines</h3><ul class="list-plain">' + news.map(function (g) { return newsLi(g.it, g.rows); }).join('') + '</ul>' : '') +
      '<p class="small"><a href="' + U.hash('radar', null, { tab: 'rank', scope: team }) + '">All ' + rows.length + ' on the Radar →</a> · <a href="' + U.hash('radar', null, { tab: 'news', scope: team }) + '">News wire →</a></p></div>';
  };

  // compact block for the player page and the Team Hub: rank, moves and the latest headlines
  DP.radarBrief = function (p) {
    if (!DP.radar) return '';
    var V = DP.radarView(), row = V.by[p.id];
    if (!row) return '';
    var d7 = row.d['7'], d30 = row.d['30'];
    return '<div class="card" style="margin-top:14px"><h3>📡 Prospect Radar <span class="faint small">#' + row.rank + ' of ' + V.rows.length + ' · stock ' + U.fmt(row.stock, 1) + '</span> ' + (row.h ? spark(row.h.v, 96, 22) : '') + '</h3>' +
      '<p class="small">' + [d7 ? '7 days: <b>' + U.sgn(d7.dv, 1) + '</b> (' + rankMove(d7) + ') ' + esc(windowTxt(row, '7')) : '', d30 ? '30 days: <b>' + U.sgn(d30.dv, 1) + '</b> (' + rankMove(d30) + ')' : ''].filter(Boolean).join(' · ') + '</p>' +
      (row.news.length ? '<ul class="list-plain">' + row.news.slice(0, 3).map(function (it) { return newsLi(it); }).join('') + '</ul>' : '') +
      '<p class="small"><a href="' + U.hash('radar', null, { p: row.key }) + '">Full prospect report →</a></p></div>';
  };
})();
