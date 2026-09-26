/* Dynasty Puck HQ - player card (modal + full page). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  var SKL = ['GP', 'Pt-D', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
  var GKL = ['GP', 'W', 'GAA', 'SV%', 'SHO'];

  DP.headshot = function (p, size) {
    var team = p.nt || p.t, s = size || 92;
    var init = esc(p.n.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2));
    if (!p.nhl) return '<div class="noimg" style="width:' + s + 'px;height:' + s + 'px">' + init + '</div>';
    var src = 'https://assets.nhle.com/mugs/nhl/20262027/' + encodeURIComponent(team || 'NHL') + '/' + p.nhl + '.png';
    var fb = 'https://assets.nhle.com/mugs/nhl/default-skater.png';
    return '<img loading="lazy" alt="' + esc(p.n) + ' headshot" src="' + src + '" width="' + s + '" height="' + s + '" style="width:' + s + 'px;height:' + s + 'px" onerror="this.onerror=null;this.src=\'' + fb + '\'">';
  };

  // percentile of a per-game rate among regular players at the same slot
  var pctCache = {};
  function pctile(p, key) {
    var ck = p.slot + key + DP.E.version;
    if (!pctCache[ck]) {
      pctCache[ck] = DP.E.P.filter(function (q) { return q.slot === p.slot && q.r && q.projGP >= 30; })
        .map(function (q) { return q.r[key]; }).sort(function (a, b) { return a - b; });
    }
    var arr = pctCache[ck], v = p.r ? p.r[key] : null;
    if (v === null || v === undefined || !arr.length) return null;
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
    return lo / arr.length;
  }

  function links(p) {
    var q = encodeURIComponent(p.n), L = [];
    if (p.slug) L.push(['NHL.com', 'https://www.nhl.com/player/' + p.slug]);
    else if (p.nhl) L.push(['NHL.com', 'https://www.nhl.com/player/' + p.nhl]);
    L.push(['EliteProspects', 'https://www.eliteprospects.com/search/player?q=' + q]);
    L.push(['Hockey-Reference', 'https://www.hockey-reference.com/search/search.fcgi?search=' + q]);
    L.push(['PuckPedia', 'https://puckpedia.com/search?q=' + q]);
    L.push(['Daily Faceoff', 'https://www.dailyfaceoff.com/search?q=' + q]);
    L.push(['News', 'https://news.google.com/search?q=' + encodeURIComponent('"' + p.n + '" hockey')]);
    return L.map(function (l) { return '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(l[1]) + '">' + esc(l[0]) + ' ↗</a>'; }).join(' ');
  }

  DP.playerHtml = function (p, full) {
    var E = DP.E, h = '', dr = p.dr;
    var bio = [];
    if (p.age) bio.push('Age ' + U.fmt(p.age, 1));
    if (p.sh) bio.push((p.G ? 'Catches ' : 'Shoots ') + p.sh);
    if (p.ht) bio.push(Math.floor(p.ht / 12) + '\'' + (p.ht % 12) + '"' + (p.wt ? ', ' + p.wt + ' lb' : ''));
    if (p.nat) bio.push(p.nat);
    if (dr && dr[0]) bio.push('Drafted ' + dr[0] + (dr[2] ? ' #' + dr[2] + ' (R' + dr[1] + ')' : '') + (dr[3] ? ' by ' + dr[3] : ''));
    else if (p.nhl) bio.push('Undrafted');
    h += '<div class="phead">' + DP.headshot(p) + '<div style="flex:1;min-width:220px"><h2>' + esc(p.n) + ' ' + ui.pos(p) + '</h2>' +
      '<div class="muted">' + esc(p.t || '') + (p.nt && p.nt !== p.t ? ' (NHL: ' + esc(p.nt) + ')' : '') + ' · ' + esc(bio.join(' · ')) + '</div>' +
      '<div style="margin-top:6px">' + (p.gm ? 'Owned by <b>' + esc(U.teamName(p.gm)) + '</b> (' + esc(p.gm) + ') ' : (p.wv ? '<span class="pill W">On waivers</span> ' : '<span class="badge info">Free agent</span> ')) +
      ui.pill(p.ct) + ' ' + (p.gm ? U.m(p.sal26) : '') + (p.act27 ? ' <span class="badge warn" title="On the 2027 offseason action list">2027 decision</span>' : '') + ui.depBadge(p) + '</div>' +
      (p.inj ? '<div class="small" style="margin-top:6px">' + ui.injBadge(p) + ' ' + esc((p.inj[4] ? 'Contract holdout' : p.inj[0]) + (p.inj[1] ? ' (' + p.inj[1] + ')' : '') + (p.inj[2] ? ' · ' + p.inj[2] : '')) + ' <span class="faint">Daily Faceoff, ' + esc(p.inj[3]) + '</span></div>' : '') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="btn sm" data-cmp="' + esc(p.id) + '">＋ Compare</button>' +
      (p.gm ? '<a class="btn sm" href="' + U.hash('trade', null, { p: p.id }) + '">🔁 Trade for</a><a class="btn sm" href="' + U.hash('finder', null, { p: p.id }) + '">🔎 Trade finder</a>' : '') +
      (full ? '' : '<a class="btn sm" href="#/player/' + encodeURIComponent(p.id) + '">Full page</a>') + '</div></div>';

    // key numbers
    var grad = p.ct === 'MNR' ? E.graduation(p) : null;
    h += '<div class="stats" style="margin-top:14px">';
    h += stat('Season value (WAR)', p.r ? U.fmt(p.WAR, 1) : '–', p.r ? U.ord(p.posRank) + ' among ' + p.slot + (p.slot === 'F' ? 's' : '') : 'no 2026-27 NHL projection', 'Projected 2026-27 category wins above a replacement ' + p.slot + ' (see Rules & Methods).');
    h += stat('Market value', U.m(p.mkt), 'at ' + U.m(E.dollarPerWAR, 2) + ' per WAR', 'What the league pays per win above replacement, applied to this player.');
    h += stat(p.gm ? 'Contract surplus' : 'Pickup value', U.sm(p.surplus), p.gm ? 'market − salary (2026-27)' : 'vs a $1M signing', '');
    h += stat('Dynasty value', U.fmt(p.DV, 1), 'discounted wins, 7 seasons', 'Sum of projected WAR 2026-27 to 2032-33 net of ' + (E.LAMBDA * 100) + '% of cap cost, discounted ' + E.DISCOUNT + '/yr, contract rules applied.');
    if (grad) h += stat('Career NHL GP', (p.cgp || 0) + ' / ' + grad.thr, grad.status === 'graduated' ? 'already graduated' : grad.week !== null ? 'projected to graduate wk ' + (grad.week + 1) + (grad.date ? ' (' + U.date(grad.date) + ')' : '') : 'not projected to graduate in 2026-27', 'MNR graduation uses career NHL regular-season GP: 82 skaters / 41 goalies.');
    else h += stat('Career NHL GP', U.fmt(p.cgp || 0), p.cgps === 'est' ? 'estimate (2025-26 only)' : 'regular season, NHL API', '');
    h += '</div>';
    if (grad && p.inj && grad.week !== null && grad.week < 8) h += '<div class="callout warn">Injury/absence flag: projected to graduate around week ' + (grad.week + 1) + ', but currently listed ' + esc(p.inj[4] ? 'as a contract holdout' : p.inj[0] + (p.inj[2] ? ' (' + p.inj[2] + ')' : '')) + '. Missed games push graduation back, which keeps him at $0 longer.</div>';
    if (grad && grad.status === 'graduated') h += '<div class="callout warn">Has ' + p.cgp + ' career NHL games, past the ' + grad.thr + '-game line. He stays at $0 for the rest of the season and signs an ELC ($1.5M) in the offseason (or is dropped). If he\'s on the active roster he can\'t be moved back down to the minors.</div>';

    // categories: 2025-26 actual vs 2026-27 projection
    var labels = p.G ? GKL : SKL;
    var Y = p.ytd, PRE = p.pre;
    h += '<div class="grid g2" style="margin-top:4px"><div class="card"><h3>' + (Y ? '2026-27 so far vs projection' : '2025-26 actual vs 2026-27 projection') + '</h3><div class="hint">' + (Y ? 'NHL stats this season (Cor estimated from shot attempts). The projection is now <b>rest-of-season</b>: the preseason projection blended with what he has done so far (preseason counts as 25-60 games of evidence depending on the category).' : 'Fantrax official 2025-26 and Fantrax 2026-27 projections' + (p.G ? '' : '; Tk and Cor projected by this app') + '.') + ' Percentile = per-game rate vs ' + p.slot + ' with 30+ projected GP.</div>';
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Cat</th><th class="num">2025-26</th>' + (Y ? '<th class="num">26-27 so far</th><th class="num">Preseason</th><th class="num" title="Full season at the rest-of-season rates">ROS proj</th>' : '<th class="num">2026-27 proj</th>') + '<th class="num">WAR</th><th style="min-width:110px">Percentile</th></tr></thead><tbody>';
    labels.forEach(function (l, i) {
      var a = p.s25[i], b = p.p26[i], war = '', pc = null;
      var fmt = function (v) { return l === 'GAA' ? (v ? v.toFixed(2) : '–') : l === 'SV%' ? (v ? U.rate(v > 1 ? v / 1000 : v) : '–') : U.fmt(v, (l === 'Tk' || l === 'Cor') && i === 9 || i === 10 ? 0 : 0); };
      if (p.war) {
        var key = p.G ? { W: 'W', GAA: 'GAA', 'SV%': 'SV', SHO: 'SHO' }[l] : { 'Pt-D': 'PtD', G: 'G', A: 'A', PIM: 'PIM', SOG: 'SOG', STP: 'STP', Hit: 'Hit', Blk: 'Blk', Tk: 'Tk', Cor: 'Cor' }[l];
        if (key && p.war[key] !== undefined) war = ui.delta(p.war[key], 2);
        if (!p.G && key) pc = pctile(p, key);
        if (p.G && p.r) pc = l === 'W' ? pctile(p, 'w') : l === 'GAA' ? 1 - pctile(p, 'gaa') : l === 'SV%' ? pctile(p, 'sv') : l === 'SHO' ? pctile(p, 'sho') : null;
      }
      if (l === 'Pt-D' && !p.D && !p.fd) { war = '<span class="faint">D only</span>'; pc = null; }
      h += '<tr><td><b>' + esc(l) + '</b></td><td class="num">' + fmt(a) + '</td>' + (Y ? '<td class="num"><b>' + fmt(Y[i]) + '</b></td><td class="num muted">' + fmt(PRE[i]) + '</td>' : '') + '<td class="num">' + fmt(b) + '</td><td class="num">' + war + '</td><td>' + (pc === null ? '' : '<div class="pbar">' + ui.meter(pc, pc >= .75 ? 'good' : pc < .25 ? 'bad' : '', U.pct(pc) + ' percentile') + '<span class="small muted num" style="width:34px">' + Math.round(pc * 100) + '</span></div>') + '</td></tr>';
      if (l === 'A' && !p.G) {
        var ga = 2 * p.s25[2] + p.s25[3], gb = 2 * p.p26[2] + p.p26[3];
        h += '<tr><td><b>2G+A</b></td><td class="num">' + U.fmt(ga) + '</td>' + (Y ? '<td class="num"><b>' + U.fmt(2 * Y[2] + Y[3]) + '</b></td><td class="num muted">' + U.fmt(2 * PRE[2] + PRE[3]) + '</td>' : '') + '<td class="num">' + U.fmt(gb) + '</td><td class="num">' + (p.war ? ui.delta(p.war.GA2, 2) : '') + '</td><td></td></tr>';
      }
    });
    h += '</tbody></table></div>';
    if (p.tkc) h += '<p class="note">Tk/Cor projection: per-GP rates ' + U.fmt(p.tkc[0], 2) + ' Tk and ' + U.fmt(p.tkc[1], 1) + ' Cor, blended from ' + U.fmt(p.tkc[4], 0) + ' weighted NHL games with a role prior of ' + U.fmt(p.tkc[2], 2) + ' / ' + U.fmt(p.tkc[3], 1) + '.</p>';
    h += '</div>';

    // dynasty curve + contract timeline
    var yrs = E.YEARS.map(function (y) { return y.slice(2); });
    h += '<div class="card"><h3>Dynasty outlook</h3><div class="hint">Projected WAR by season (age curve' + (p._pros ? ' + prospect model' : '') + ') and value after cap cost. Contract path uses league rules.</div>';
    h += C.lines(yrs, [{ name: 'Projected WAR', values: p.yWar.map(function (x) { return +x.toFixed(2); }) }, { name: 'Value net of cap cost', values: p.yVal.map(function (x) { return +x.toFixed(2); }), color: 'var(--s3)' }], { height: 170, title: 'Dynasty outlook' });
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Season</th>' + E.YEARS.map(function (y) { return '<th class="num">' + y.slice(2) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += '<tr><td>Age</td>' + E.YEARS.map(function (_, y) { return '<td class="num">' + (p.age ? Math.floor(p.age + y) : '–') + '</td>'; }).join('') + '</tr>';
    h += '<tr><td>Cap hit</td>' + p.yCost.map(function (c) { return '<td class="num">' + (c === null ? '<span class="faint">–</span>' : U.m(c, c < 10 ? 2 : 1)) + '</td>'; }).join('') + '</tr>';
    h += '<tr><td>Status</td>' + p.yStatus.map(function (s) { return '<td class="num small">' + esc(s === 'contract' ? '' : s) + '</td>'; }).join('') + '</tr>';
    h += '<tr><td>WAR</td>' + p.yWar.map(function (w) { return '<td class="num">' + U.fmt(w, 1) + '</td>'; }).join('') + '</tr></tbody></table></div>';
    if (DP.decisionHtml) h += DP.decisionHtml(p);
    if (p._pros) {
      var pr = p._pros;
      h += '<p class="note">Prospect model: ' + esc(pr.basis) + (pr.line ? ' · best recent line ' + esc(U.season(pr.line.season)) + ' ' + esc(pr.line.lg) + ' ' + pr.line.pts + ' pts in ' + pr.line.gp + ' GP (NHLe pace ' + U.fmt(pr.line.pace, 0) + ' pts/82)' : '') +
        (pr.peakPts ? ' · peak ~' + U.fmt(pr.peakPts, 0) + ' pts/82' : '') + ' · P(NHL regular) ' + U.pct(pr.p) + ' · ETA ' + (pr.eta === 0 ? 'now' : E.YEARS[Math.min(6, pr.eta)]) + '.</p>';
    }
    h += '</div></div>';

    // history tables
    var nhlRows = (p.car || []).filter(function (s) { return s[1] === 'NHL'; });
    var other = (p.car || []).filter(function (s) { return s[1] !== 'NHL'; });
    h += '<div class="grid g2" style="margin-top:14px">';
    if (p.h && p.h.length && !p.G) {
      h += '<div class="card"><h3>NHL category history</h3><div class="hint">NHL stats API. Cor for seasons before 2025-26 is the Fantrax-equivalent estimate (see methods).</div><div class="tbl-wrap"><table class="t"><thead><tr><th>Season</th><th>Tm</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">PIM</th><th class="num">SOG</th><th class="num">STP</th><th class="num">Hit</th><th class="num">Blk</th><th class="num">Tk</th><th class="num">Cor</th></tr></thead><tbody>' +
        p.h.map(function (r) { return '<tr><td>' + U.season(r[0]) + '</td><td>' + esc(r[13]) + '</td>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 14].map(function (i) { return '<td class="num">' + U.fmt(r[i]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      var ser = p.h.map(function (r) { return r[1] ? (r[2] + r[3]) / r[1] * 82 : null; });
      h += C.lines(p.h.map(function (r) { return U.season(r[0]); }), [{ name: 'Points per 82', values: ser }, { name: 'SOG per 82 ÷ 5', values: p.h.map(function (r) { return r[1] ? r[5] / r[1] * 82 / 5 : null; }), color: 'var(--s3)' }], { height: 150, title: 'NHL scoring pace' }) + '</div>';
    } else if (p.h && p.h.length && p.G) {
      h += '<div class="card"><h3>NHL goalie history</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Season</th><th>Tm</th><th class="num">GP</th><th class="num">W</th><th class="num">GAA</th><th class="num">SV%</th><th class="num">SHO</th></tr></thead><tbody>' +
        p.h.map(function (r) { return '<tr><td>' + U.season(r[0]) + '</td><td>' + esc(r[7]) + '</td><td class="num">' + r[1] + '</td><td class="num">' + r[2] + '</td><td class="num">' + r[3].toFixed(2) + '</td><td class="num">' + U.rate(r[4]) + '</td><td class="num">' + r[5] + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    }
    if (nhlRows.length || other.length) {
      var rows = (p.car || []).slice().reverse();
      h += '<div class="card"><h3>Career by league</h3><div class="hint">NHL API player landing (regular season). NHLe = points pace translated to 82 NHL games with league factors.</div><div class="tbl-wrap" style="max-height:340px;overflow:auto"><table class="t"><thead><tr><th>Season</th><th>League</th><th>Team</th><th class="num">GP</th>' +
        (p.G ? '<th class="num">W</th><th class="num">GAA</th><th class="num">SV%</th><th class="num">SO</th>' : '<th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">PIM</th><th class="num" title="NHL-equivalent points per 82 games">NHLe</th>') + '</tr></thead><tbody>' +
        rows.map(function (s) {
          if (p.G) return '<tr><td>' + U.season(s[0]) + '</td><td>' + esc(s[1]) + '</td><td class="small">' + esc(s[2]) + '</td><td class="num">' + s[3] + '</td><td class="num">' + s[4] + '</td><td class="num">' + (s[5] ? s[5].toFixed(2) : '–') + '</td><td class="num">' + (s[6] ? U.rate(s[6]) : '–') + '</td><td class="num">' + s[7] + '</td></tr>';
          var f = E.nhleFactor(s[1]), nh = f && s[3] ? s[6] / s[3] * f * 82 : null;
          return '<tr><td>' + U.season(s[0]) + '</td><td>' + esc(s[1]) + '</td><td class="small">' + esc(s[2]) + '</td><td class="num">' + s[3] + '</td><td class="num">' + s[4] + '</td><td class="num">' + s[5] + '</td><td class="num"><b>' + s[6] + '</b></td><td class="num">' + s[7] + '</td><td class="num">' + (nh === null ? '<span class="faint">–</span>' : U.fmt(nh, 0)) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    h += '</div>';
    h += '<div style="margin-top:14px">' + links(p) + '</div>';
    return h;
  };

  function stat(l, v, d, title) {
    return '<div class="stat"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="l">' + esc(l) + '</div><div class="v">' + v + '</div><div class="d">' + esc(d || '') + '</div></div>';
  }
  DP.statTile = stat;

  DP.openPlayer = function (id) {
    var p = DP.E.byId[id];
    if (!p) return;
    ui.modal(DP.playerHtml(p, false));
  };

  // compare list (shared with the Compare page)
  DP.cmp = U.store.get('cmp', []);
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cmp]');
    if (!b) return;
    var id = b.dataset.cmp;
    if (DP.cmp.indexOf(id) < 0) DP.cmp.push(id);
    if (DP.cmp.length > 4) DP.cmp.shift();
    U.store.set('cmp', DP.cmp);
    U.toast('Added to Compare (' + DP.cmp.length + '/4). Open the Compare page to see them side by side.');
  });

  DP.pages.player = {
    title: 'Player',
    render: function (el, h) {
      var p = DP.E.byId[h.arg];
      if (!p) { el.innerHTML = '<div class="callout bad">Player not found.</div>'; return; }
      document.title = p.n + ' · Dynasty Puck HQ';
      el.innerHTML = '<p><a href="#/players">← Players</a></p>' + DP.playerHtml(p, true);
    }
  };
})();
