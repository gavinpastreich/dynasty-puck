/* Dynasty Puck HQ - player card (modal + full page). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  var SKL = ['GP', 'Pt-D', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
  var GKL = ['GP', 'W', 'GAA', 'SV%', 'SHO'];

  // NHL.com headshot (assets.nhle.com). Small ones (lists) are round avatars; a player with no NHL id gets his initials.
  DP.headshot = function (p, size) {
    var team = p.nt || p.t, s = size || 92, small = s <= 40;
    var init = esc(p.n.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2));
    if (!p.nhl) return small ? '<span class="av noimg" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true">' + init + '</span>' : '<div class="noimg" style="width:' + s + 'px;height:' + s + 'px">' + init + '</div>';
    var src = 'https://assets.nhle.com/mugs/nhl/20262027/' + encodeURIComponent(team || 'NHL') + '/' + p.nhl + '.png';
    var fb = 'https://assets.nhle.com/mugs/nhl/default-' + (p.pos === 'G' ? 'goalie' : 'skater') + '.png';
    var img = '<img loading="lazy" decoding="async" alt="' + (small ? '' : esc(p.n) + ' headshot') + '" src="' + src + '" width="' + s + '" height="' + s + '"' + (small ? '' : ' style="width:' + s + 'px;height:' + s + 'px"') + ' onerror="this.onerror=null;this.src=\'' + fb + '\'">';
    return small ? '<span class="av" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true">' + img + '</span>' : img;
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
      '<div style="margin-top:6px">' + (p.gm ? 'Owned by ' + U.teamChip(p.gm, { b: 1 }) + ' (' + esc(p.gm) + ') ' : (p.wv ? '<span class="pill W">On waivers</span> ' : '<span class="badge info">Free agent</span> ')) +
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
    var rng = E.dvRange ? E.dvRange(p) : null;
    h += stat('Dynasty value', U.fmt(p.DV, 1), rng && rng.hi - rng.lo > 0.15 ? 'range ' + U.fmt(rng.lo, 1) + ' to ' + U.fmt(rng.hi, 1) : 'discounted wins, 7 seasons', 'Sum of projected WAR 2026-27 to 2032-33 net of ' + (E.LAMBDA * 100) + '% of cap cost, discounted ' + E.DISCOUNT + '/yr, contract rules applied.');
    if (grad) h += stat('Career NHL GP', (p.cgp || 0) + ' / ' + grad.thr, grad.status === 'graduated' ? 'already graduated' : grad.week !== null ? 'projected to graduate wk ' + (grad.week + 1) + (grad.date ? ' (' + U.date(grad.date) + ')' : '') : 'not projected to graduate in 2026-27', 'MNR graduation uses career NHL regular-season GP: ' + E.RULES.gradSkater + ' skaters / ' + E.RULES.gradGoalie + ' goalies.');
    else h += stat('Career NHL GP', U.fmt(p.cgp || 0), p.cgps === 'est' ? 'estimate (2025-26 only)' : 'regular season, NHL API', '');
    h += '</div>';
    if (grad && p.inj && grad.week !== null && grad.week < 8) h += '<div class="callout warn">Injury/absence flag: projected to graduate around week ' + (grad.week + 1) + ', but currently listed ' + esc(p.inj[4] ? 'as a contract holdout' : p.inj[0] + (p.inj[2] ? ' (' + p.inj[2] + ')' : '')) + '. Missed games push graduation back, which keeps him at $0 longer.</div>';
    if (grad && grad.status === 'graduated') h += '<div class="callout warn">Has ' + p.cgp + ' career NHL games, past the ' + grad.thr + '-game line. He stays at $0 for the rest of the season and signs an ELC ($1.5M) in the offseason (or is dropped). If he\'s on the active roster he can\'t be moved back down to the minors.</div>';

    // categories: 2025-26 actual vs 2026-27 projection
    var labels = p.G ? GKL : SKL;
    var Y = p.ytd, PRE = p.pre;
    h += '<div class="grid g2" style="margin-top:4px"><div class="card"><h3>' + (Y ? '2026-27 so far vs projection' : '2025-26 actual vs 2026-27 projection') + '</h3><div class="hint">' + (Y ? 'NHL stats this season (Cor estimated from shot attempts). The projection is now <b>rest-of-season</b>: the preseason projection blended with what he has done so far (preseason counts as 25-60 games of evidence depending on the category).' : 'Fantrax official 2025-26 and Fantrax 2026-27 projections' + (p.G ? '' : '; Tk and Cor projected by this app') + '.') + ' Percentile = per-game rate vs ' + p.slot + ' with 30+ projected GP.</div>';
    h += '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Stats this season and projection"><table class="t"><thead><tr><th>Cat</th><th class="num">2025-26</th>' + (Y ? '<th class="num">26-27 so far</th><th class="num">Preseason</th><th class="num" title="Full season at the rest-of-season rates">ROS proj</th>' : '<th class="num">2026-27 proj</th>') + '<th class="num">WAR</th><th style="min-width:110px">Percentile</th></tr></thead><tbody>';
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
    if (DP.formLine) h += DP.formLine(p);
    if (DP.iceLine) h += DP.iceLine(p);
    if (DP.adpLine) h += DP.adpLine(p);
    if (DP.mateLine) h += DP.mateLine(p);
    if (p.age) h += '<div class="small pc-ageout" data-ageout="' + esc(p.id) + '"></div>';
    h += DP.nextGames ? DP.nextGames(p) : '';
    h += '<div class="pc-trend" data-trend="' + esc(p.id) + '"></div>';
    if (p.tkc) h += '<p class="note">Tk/Cor projection: per-GP rates ' + U.fmt(p.tkc[0], 2) + ' Tk and ' + U.fmt(p.tkc[1], 1) + ' Cor, blended from ' + U.fmt(p.tkc[4], 0) + ' weighted NHL games with a role prior of ' + U.fmt(p.tkc[2], 2) + ' / ' + U.fmt(p.tkc[3], 1) + '.</p>';
    h += '</div>';

    // dynasty curve + contract timeline
    var yrs = E.YEARS.map(function (y) { return y.slice(2); });
    h += '<div class="card"><h3>Dynasty outlook</h3><div class="hint">Projected WAR by season (age curve' + (p._pros ? ' + prospect model' : '') + ') and value after cap cost. Contract path uses league rules.</div>';
    if (rng && rng.hi - rng.lo > 0.15) {
      // on the league's scale: 0 to the highest ceiling of any owned player, so players can be compared at a glance
      if (!E._dvTop || E._dvTop.v !== E.version) E._dvTop = { v: E.version, x: Math.max.apply(null, E.P.filter(function (q) { return q.gm; }).map(function (q) { return E.dvRange(q).hi; }).concat([1])) };
      var span = Math.max(1, E._dvTop.x, rng.hi), pos = function (v) { return Math.max(0, Math.min(100, v / span * 100)).toFixed(1); };
      h += '<div class="dvr"><div class="dvr-bar"><span class="dvr-r" style="left:' + pos(rng.lo) + '%;width:' + (pos(rng.hi) - pos(rng.lo)).toFixed(1) + '%"></span><span class="dvr-m" style="left:' + pos(p.DV) + '%"></span></div>' +
        '<div class="dvr-l small"><span>Floor <b>' + U.fmt(rng.lo, 1) + '</b></span><span>Expected <b>' + U.fmt(p.DV, 1) + '</b></span><span>Ceiling <b>' + U.fmt(rng.hi, 1) + '</b></span></div>' +
        '<div class="small muted">10th to 90th percentile of the model\'s outcomes, on the league\'s scale (the bar runs to the best ceiling of any rostered player, ' + U.fmt(span, 0) + ')' + (rng.pNhl !== null && rng.pNhl !== undefined ? '; chance of an NHL career ' + U.pct(rng.pNhl) : '') + (rng.hi - p.DV > Math.max(5, 0.6 * Math.max(1, p.DV)) ? '. <b class="good">Big upside</b>: the good case is worth far more than the expected value.' : rng.hi - rng.lo < 0.3 * Math.max(1, p.DV) ? '. A safe value: a narrow range.' : '.') + ' <a href="#/rules">How it works</a></div></div>';
    }
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
    if (DP.devCurveCard) h += DP.devCurveCard(p);
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

  // his NHL team's games in the next 7 days (Eastern dates), back-to-backs marked
  DP.nextGames = function (p) {
    var E = DP.E, sc = p.nt26 && DP.nhl.sched[p.nt26]; if (!sc) return '';
    var today = E.dayIndex(E.now().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
    var g = sc.filter(function (r) { return r[0] >= today && r[0] < today + 7; });
    var day = function (d) { var t = new Date(E.seasonStart + d * 864e5); return t.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) + ' ' + (t.getUTCMonth() + 1) + '/' + t.getUTCDate(); };
    var has = {}; sc.forEach(function (r) { has[r[0]] = 1; });
    return '<div class="pc-next small"><span class="pct-k">📅 Next 7 days</span>' + (g.length ? g.map(function (r) {
      return '<span class="pc-g' + (has[r[0] - 1] ? ' b2b' : '') + '" title="' + (has[r[0] - 1] ? 'Second night of a back-to-back' : '') + '">' + esc(day(r[0])) + ' ' + (r[2] ? 'vs' : '@') + ' <b>' + esc(r[1]) + '</b>' + (has[r[0] - 1] ? ' <span class="faint">B2B</span>' : '') + '</span>';
    }).join('') : '<span class="muted">no games</span>') + '</div>';
  };
  DP.openPlayer = function (id) {
    var p = DP.E.byId[id];
    if (!p) return;
    if (DP.noteRecent) DP.noteRecent(p.id);
    ui.modal(DP.playerHtml(p, false));
    if (DP.fillTrends) DP.fillTrends(document.getElementById('modal-bg'));
    if (DP.fillAgeOutlook) DP.fillAgeOutlook(document.getElementById('modal-bg'));
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

  // every add, drop and trade involving a player in this league (Fantrax moves log this season, trade log since 2025-26)
  DP.playerMoves = function (p) {
    var out = [], T = (DP.league && DP.league.trades) || [], tdays = {};
    T.forEach(function (tr, i) {
      tr.moves.forEach(function (m) {
        if (m.kind !== 'player' || m.id !== p.id) return;
        tdays[tr.date] = 1;
        var with_ = tr.moves.filter(function (o) { return o !== m && o.to === m.from; }).map(function (o) { return o.label; });
        out.push({ d: tr.date, k: 'trade', from: m.from, to: m.to, teams: tr.teams, back: with_, season: tr.season, i: i });
      });
    });
    ((DP.league && DP.league.moves) || []).forEach(function (m) {
      if (m.id !== p.id) return;
      if (m.type === 'add') out.push({ d: m.d, k: 'add', to: m.to, ct: m.ct, sal: m.sal });
      else if (m.type === 'drop') out.push({ d: m.d, k: 'drop', from: m.from, ct: m.ct, sal: m.sal });
      else if (m.type === 'move' && !tdays[m.d]) out.push({ d: m.d, k: 'trade', from: m.from, to: m.to, teams: [m.from, m.to], back: [] });
    });
    return out.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  };
  function movesCard(p) {
    var M = DP.playerMoves(p); if (!M.length) return '';
    var tn = function (t) { return U.teamChip(t, { link: 1 }); }, dt = function (d) { return esc(U.date(new Date(d + 'T12:00:00Z'))); };
    var li = function (x) {
      var what = x.k === 'add' ? '🛒 Added by ' + tn(x.to) + (x.ct ? ' <span class="faint">' + esc(x.ct) + (x.sal ? ' ' + U.m(x.sal / 1e6, 1) : '') + '</span>' : '')
        : x.k === 'drop' ? '🗑️ Dropped by ' + tn(x.from)
        : '🤝 Traded from ' + tn(x.from) + ' to ' + tn(x.to) + (x.teams.length > 2 ? ' <span class="faint">(' + x.teams.length + '-team trade)</span>' : '') + (x.back.length ? '<br><span class="small muted">' + esc(U.teamName(x.from)) + ' got back: ' + esc(x.back.slice(0, 5).join(', ')) + (x.back.length > 5 ? ' +' + (x.back.length - 5) + ' more' : '') + '</span>' : '');
      return '<li><span class="small muted nw" style="min-width:86px">' + dt(x.d) + '</span><span>' + what + '</span></li>';
    };
    return '<div class="card" style="margin-top:14px"><h2>🧾 Moves in Dynasty Puck</h2><div class="hint">Every add, drop and trade involving him in the Fantrax logs (adds and drops this season, trades since 2025-26). <a href="#/history">Trade History</a> values each trade.</div><ul class="list-plain pmoves">' + M.map(li).join('') + '</ul></div>';
  }
  DP.pages.player = {
    title: 'Player',
    render: function (el, h) {
      var p = DP.E.byId[h.arg];
      if (!p) { el.innerHTML = '<div class="callout bad">Player not found.</div>'; return; }
      document.title = p.n + ' · Dynasty Puck HQ';
      if (DP.noteRecent) DP.noteRecent(p.id);
      el.innerHTML = '<p><a href="#/players">← Players</a></p>' + DP.playerHtml(p, true) + (DP.radarBrief ? DP.radarBrief(p) : '') + (p.gm ? '<div class="card" style="margin-top:14px"><h2>💱 Trade market</h2><div id="p-market"><p class="muted small">Pricing him for every team…</p></div></div>' : '');
      if (p.gm) setTimeout(function () { market(p, U.qs('#p-market', el)); }, 30);
      similarCard(p, el);
      if (DP.compsCard) DP.compsCard(p, el);
      seasonLog(p, el);
      var mc = movesCard(p); if (mc) el.insertAdjacentHTML('beforeend', mc);
      if (DP.fillTrends) DP.fillTrends(el);
      if (DP.fillAgeOutlook) DP.fillAgeOutlook(el);
    }
  };
  // players with the closest per-game category profile (rest-of-season rates), same position group. Each rate is
  // standardized over the group's regulars (20+ projected games); distance = Euclidean over the standardized rates.
  var SK = ['G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'], GK = ['w', 'sv', 'gaa', 'sho'], simCache = {};
  function group(p) { return p.G ? 'G' : p.slot === 'D' ? 'D' : 'F'; }
  function stats(g) {
    var E = DP.E, key = g + ':' + E.version; if (simCache[key]) return simCache[key];
    var ks = g === 'G' ? GK : SK, pool = E.P.filter(function (q) { return q.r && group(q) === g && q.p26 && q.p26[0] >= 20; });
    var m = ks.map(function (k) { return E.sum(pool.map(function (q) { return q.r[k] || 0; })) / Math.max(1, pool.length); });
    var sd = ks.map(function (k, i) { return Math.sqrt(E.sum(pool.map(function (q) { var d = (q.r[k] || 0) - m[i]; return d * d; })) / Math.max(1, pool.length)) || 1; });
    return (simCache[key] = { ks: ks, m: m, sd: sd, pool: pool });
  }
  DP.similarPlayers = function (p, n) {
    if (!p || !p.r) return [];
    var S = stats(group(p)), z = function (q) { return S.ks.map(function (k, i) { return ((q.r[k] || 0) - S.m[i]) / S.sd[i]; }); }, zp = z(p);
    return S.pool.filter(function (q) { return q.id !== p.id; }).map(function (q) {
      var zq = z(q), d = Math.sqrt(DP.E.sum(zq.map(function (v, i) { return (v - zp[i]) * (v - zp[i]); })));
      return { p: q, d: d };
    }).sort(function (a, b) { return a.d - b.d; }).slice(0, n || 8);
  };
  function similarCard(p, el) {
    var L = DP.similarPlayers(p, 8); if (!L.length) return;
    var me = DP.state.team, prof = function (q) {
      var r = q.r;
      return q.G ? U.rate(r.sv) + ' SV% · ' + U.fmt(r.gaa, 2) + ' GAA · ' + U.fmt(r.w, 2) + ' W/GP' : U.fmt(r.G + r.A, 2) + ' P · ' + U.fmt(r.SOG, 1) + ' SOG · ' + U.fmt(r.Hit + r.Blk, 1) + ' Hit+Blk per game';
    };
    var cost = function (q) { return q.ct === 'MNR' ? 'MNR $0' : q.sal26 ? esc(q.ct || '') + ' ' + U.m(q.sal26, 1) : q.gm ? esc(q.ct || '') : 'FA'; };
    var card = document.createElement('div'); card.className = 'card'; card.style.marginTop = '14px';
    card.innerHTML = '<h2>👯 Plays like</h2><div class="hint">The closest per-game profiles in our categories among ' + (p.G ? 'goalies' : p.slot === 'D' ? 'defensemen' : 'forwards') + ' (rest-of-season projected rates). ' + esc(p.n) + ': ' + esc(prof(p)) + '. Useful for finding a cheaper or available version of the same player.</div>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>Player</th><th>Owner</th><th>Per game</th><th>Match</th><th class="num">Value</th><th>Contract</th></tr></thead><tbody>' +
      L.map(function (x) {
        var q = x.p, cheaper = (p.sal26 || 0) - (q.sal26 || 0);
        return '<tr class="' + (q.gm && q.gm === me ? 'mine' : '') + '"><td>' + ui.pcell(q, { pos: 1 }) + '</td><td>' + ui.owner(q) + '</td><td class="small">' + esc(prof(q)) + '</td><td class="small nw">' + (x.d < 1.2 ? '<b class="good">very close</b>' : x.d < 2 ? 'close' : x.d < 3 ? 'similar' : '<span class="muted">loosely</span>') + '</td><td class="num">' + U.fmt(q.DV, 1) + '</td><td class="small">' + cost(q) + (cheaper >= 1 ? ' <span class="good">' + U.m(cheaper, 1) + ' less</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    el.appendChild(card);
  }
  // this season in the league: every finished week he was in a locked lineup, with his real lines (data/weeks/wNN.js),
  // plus the week in progress from the live scoreboard
  DP.playerSeasonLog = function (p, details) {
    var rows = [];
    details.forEach(function (W) {
      Object.keys(W.teams || {}).forEach(function (t) {
        var T = W.teams[t]; if ((T.active || []).indexOf(p.id) < 0) return;
        rows.push({ n: W.n, t: t, l: (T.pl || {})[p.id] || null });
      });
    });
    var sc = DP.league.score;
    if (sc && sc.week && sc.teams && !rows.some(function (r) { return r.n === sc.week; })) Object.keys(sc.teams).forEach(function (t) {
      var T = sc.teams[t]; if ((T.active || []).indexOf(p.id) >= 0) rows.push({ n: sc.week, t: t, l: (T.pl || {})[p.id] || null, live: !sc.final });
    });
    return rows.sort(function (a, b) { return a.n - b.n; });
  };
  function seasonLog(p, el) {
    var E = DP.E, ns = E.history().weeks.map(function (w) { return w.n; });
    if (!DP.loadWeeks) return;
    var card = document.createElement('div'); card.className = 'card'; card.style.marginTop = '14px';
    card.innerHTML = '<h2>🏒 This season in Dynasty Puck</h2><p class="small muted">Loading the weekly lines…</p>';
    el.appendChild(card);   // before the router adds the footer
    DP.loadWeeks(ns, function (details) {
      if (!document.body.contains(card)) return;
      var R = DP.playerSeasonLog(p, details);
      if (!R.length) { card.innerHTML = '<h2>🏒 This season in Dynasty Puck</h2><p class="small muted">Not in anyone\'s locked lineup in a week played so far.</p>'; return; }
      var G = p.G, heads = G ? ['GP', 'W', 'GA', 'SA', 'SV%', 'SO'] : ['GP', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
      var tot = null, cell = function (l) {
        if (!l) return heads.map(function () { return '<td class="num muted">0</td>'; }).join('');
        if (G) return [l[0], l[1], l[2], l[3], l[3] ? U.rate(1 - l[2] / l[3]) : '–', l[4]].map(function (v) { return '<td class="num">' + v + '</td>'; }).join('');
        return l.map(function (v, i) { return '<td class="num">' + U.fmt(v, i === 9 ? 1 : 0) + '</td>'; }).join('');
      };
      R.forEach(function (r) { if (!r.l || r.live) return; if (!tot) tot = r.l.map(function () { return 0; }); r.l.forEach(function (v, i) { tot[i] += v; }); });
      card.innerHTML = '<h2>🏒 This season in Dynasty Puck</h2><div class="hint">Every week he was in a locked Fantrax lineup, with what he did in NHL games that week (the lines that counted). ' + R.filter(function (r) { return !r.live; }).length + ' of ' + ns.length + ' weeks played.</div>' +
        '<div class="tbl-wrap"><table class="t small"><thead><tr><th>Week</th><th>Team</th>' + heads.map(function (x) { return '<th class="num">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
        R.map(function (r) { return '<tr><td><a href="' + U.hash('live', null, { w: r.n }) + '">W' + r.n + '</a>' + (r.live ? ' <span class="badge warn">so far</span>' : '') + '</td><td>' + U.teamLabel(r.t) + '</td>' + cell(r.l) + '</tr>'; }).join('') +
        (tot ? '<tr class="tot"><td colspan="2"><b>Total</b> (finished weeks)</td>' + cell(tot) + '</tr>' : '') + '</tbody></table></div>';
    });
  }
  // what the player is worth to each team (roster fit x window) vs to his current team
  function market(p, box) {
    if (!box) return;
    var E = DP.E, me = DP.state.team, own = -E.useValue(p.gm, [], [p]).total;
    var rows = E.teams.filter(function (t) { return t !== p.gm; }).map(function (t) { return { t: t, v: E.useValue(t, [p], []).total }; }).sort(function (a, b) { return b.v - a.v; });
    var top = rows.slice(0, 5), mine = me && me !== p.gm ? rows.find(function (r) { return r.t === me; }) : null;
    var h = '<p class="small muted">Use value: what adding him does for each team\'s lineup (depth, positions, categories) across the seasons it would control him, × that team\'s win-now weight, minus cap cost. Market value (same for everyone): <b>' + U.fmt(p.DV, 1) + '</b>.</p>' +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th>Status</th><th class="num">Worth to them</th><th class="num">vs ' + esc(p.gm) + '</th></tr></thead><tbody>' +
      '<tr class="' + (p.gm === me ? 'mine' : '') + '"><td>' + U.teamChip(p.gm, { b: 1 }) + ' <span class="faint small">current team</span></td><td>' + DP.tierBadge(p.gm) + '</td><td class="num"><b>' + U.fmt(own, 1) + '</b></td><td></td></tr>' +
      top.concat(mine && top.indexOf(mine) < 0 ? [mine] : []).map(function (r) {
        return '<tr class="' + (r.t === me ? 'mine' : '') + '"><td>' + U.teamChip(r.t) + '</td><td>' + DP.tierBadge(r.t) + '</td><td class="num">' + U.fmt(r.v, 1) + '</td><td class="num">' + ui.delta(r.v - own, 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var best = rows[0];
    h += '<p class="small">' + (best && best.v > own + 0.5 ? 'Worth most to ' + U.teamChip(best.t, { b: 1 }) + ' (+' + U.fmt(best.v - own, 1) + ' more than to ' + esc(p.gm) + '), so a deal there can help both sides.' : esc(p.gm) + ' values him about as much as anyone: no obvious trade surplus.') + ' ' +
      (p.gm === me ? '<a class="btn sm" href="' + U.hash('finder', null, { mode: 'give', p: p.id }) + '">Find deals for him</a>' : me ? '<a class="btn sm" href="' + U.hash('finder', null, { mode: 'get', p: p.id }) + '">What would it take?</a>' : '') + '</p>';
    box.innerHTML = h;
  }
})();
