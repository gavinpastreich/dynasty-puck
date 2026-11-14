/* Dynasty Puck HQ - Draft Center and Mock Draft.
 *   Draft Center: the 2027 NHL draft class followed through the season (Tankathon's live board, NHL Central Scouting
 *     once it publishes, this season's stats, risers and fallers, headlines, a report per player); a draft news wire;
 *     the 2026 NHL draft class this season; the league's own rookie drafts; early 2028 and 2029 boards.
 *   Mock Draft: the 2027 league draft with your own queue, the odds a player is still there at your picks, team
 *     needs and grades.
 * Data: data/draft.js (tools/research/draft_tracker.py, nightly), DP.prospects.boards (curated profiles, opinions),
 * E.prospectPool() and DP.radar (the Prospect Radar) for players already in the league's player pool. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  var ALIAS = { shaeffgordoncarroll: 'shaeffergordoncarroll', johnnymclaughlin: 'johnmclaughlin' };
  // the name key shared with tools/research/draft_tracker.py key(): letters only, accents dropped
  DP.draftKey = function (name) {
    var s = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    return ALIAS[s] || s;
  };
  var TAGCLS = { 'call-up': 'good', hot: 'good', honor: 'info', contract: 'info', trade: 'info', 'sent down': 'warn', injury: 'bad' };
  var WIN = [['pre', 'Since September'], ['30', 'Last 30 days'], ['up', 'Last board update']];
  var CHL = { OHL: 1, WHL: 1, QMJHL: 1 };
  function day(d) { return U.date(new Date(d + 'T12:00:00Z')); }
  function addDays(d, n) { var t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function tagHtml(k) { return '<span class="badge ' + (TAGCLS[k] || 'info') + '">' + esc(k) + '</span>'; }
  function posGroup(pos) { pos = String(pos || '').toUpperCase(); return pos === 'G' ? 'G' : /^(LD|RD|D)$/.test(pos) ? 'D' : 'F'; }
  function lgGroup(lg) { return !lg ? 'Other' : CHL[lg] ? 'CHL' : lg === 'NCAA' || lg === 'USHL' ? lg : /U20|J20|MHL|KHL|VHL|SHL|HA|NL|DEL|Czech|Slovak|Liiga|SM/.test(lg) ? 'Europe' : 'Other'; }
  // rank on a date from a [[date, rank]] history: undefined = not tracked yet, null = off the board then
  function rankAt(r, date) { var v; for (var i = 0; i < (r || []).length; i++) { if (r[i][0] <= date) v = r[i][1]; else break; } return v; }
  function line(s) { return s && s.gp !== undefined ? s.gp + ' GP, ' + s.g + '-' + s.a + '-' + s.pts : ''; }
  function ppg(s) { return s && s.gp ? s.pts / s.gp : null; }
  function ageOn(dob, on) { if (!dob) return null; var a = dob.split('-'); var d = new Date(Date.UTC(+a[0], (+a[1] || 7) - 1, 15)); return (new Date(on + 'T12:00:00Z') - d) / (365.2425 * 864e5); }

  // ---------------------------------------------------------------- the 2027 class (cached per data + engine version)
  var cache = null;
  DP.draftView = function () {
    var E = DP.E, D = DP.draft || null, B = ((DP.prospects || {}).boards || {});
    if (cache && cache.v === E.version && cache.D === D) return cache;
    var cur = {}; ((B['2027'] || {}).players || []).forEach(function (b) { cur[DP.draftKey(b.name)] = b; });
    var last = D ? (D.tkUpdated || (D.built || '').slice(0, 10)) : null, prev = D ? D.seeded : null;
    var rows = [];
    if (D) {
      D.rows.forEach(function (r) { r.r.forEach(function (e) { if (e[0] < last && (!prev || e[0] > prev)) prev = e[0]; }); });
      rows = D.rows.map(function (r) {
        var b = cur[r.k] || null, p = r.fid && E.byId[r.fid];
        return { k: r.k, n: r.n, rk: r.rk, pre: r.pre, r: r.r, s: r.s, ls: r.ls || null, sh: r.sh || [], css: r.css, pos: r.pos || (b && b.pos), g: posGroup(r.pos || (b && b.pos)),
          nat: r.nat || (b && b.nat), dob: r.dob || (b && b.dob), ht: r.ht || (b && b.height), wt: r.wt || (b && b.weight), lg: r.lg || (b && b.league), team: r.team || (b && b.team),
          slug: r.slug, b: b, p: p || null, gm: r.gm || null, news: (D.news && D.news['d27:' + r.k]) || [], grp: lgGroup(r.lg || (b && b.league)), age: ageOn(r.dob || (b && b.dob), '2027-09-15') };
      });
    }
    var refs = { pre: D ? D.seeded : null, '30': last ? addDays(last, -30) : null, up: prev };
    rows.forEach(function (x) {
      x.m = {};
      Object.keys(refs).forEach(function (w) {
        var then = refs[w] ? rankAt(x.r, refs[w]) : undefined;
        x.m[w] = x.rk === null || x.rk === undefined ? { off: true, then: then } : then === undefined ? { isNew: true } : then === null ? { back: true } : { dr: then - x.rk, then: then };
      });
      x.p0 = ppg(x.b && x.b.last_season); if (x.p0 === null) x.p0 = ppg(x.ls); x.p1 = ppg(x.s);
      // production since a date, from the nightly snapshots of games and points
      x.since = function (date) {
        var a = null; x.sh.forEach(function (e) { if (e[0] <= date) a = e; });
        var z = x.sh[x.sh.length - 1];
        return a && z && z[1] > a[1] ? { gp: z[1] - a[1], g: z[2] - a[2], a: z[3] - a[3], pts: z[4] - a[4], from: a[0] } : null;
      };
    });
    var by = {}; rows.forEach(function (x) { by[x.k] = x; });
    return (cache = { v: E.version, D: D, rows: rows, by: by, last: last, refs: refs });
  };
  function moveHtml(m) {
    if (!m) return '';
    if (m.off) return '<span class="bad" title="No longer on Tankathon\'s board">off</span>';
    if (m.isNew) return '<span class="badge info" title="Not on the board at the start of this window">new</span>';
    if (m.back) return '<span class="good" title="Back on the board">back</span>';
    return m.dr > 0 ? '<span class="good">▲' + m.dr + '</span>' : m.dr < 0 ? '<span class="bad">▼' + (-m.dr) + '</span>' : '<span class="faint">–</span>';
  }
  function reportHref(k, y) { return U.hash('draft', null, { p: k, y: y && y !== 2027 ? y : undefined }); }
  function nameHtml(x) { return '<a class="plink" href="' + reportHref(x.k) + '">' + esc(x.n) + '</a>' + (x.gm ? ' <span class="badge info" title="Already on a league roster">' + esc(x.gm) + '</span>' : x.p ? ' <span class="badge" title="In Fantrax\'s player pool already">in Fantrax</span>' : ''); }
  function bioTxt(x) { return [x.pos, x.nat, x.dob ? 'b. ' + new Date(x.dob + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '', x.ht, x.wt ? x.wt + ' lb' : ''].filter(Boolean).join(' · '); }
  function newsLi(it, who) {
    return '<li class="newsitem"><span class="faint small nd">' + esc(day(it.d)) + '</span><div><a href="' + esc(it.u) + '" target="_blank" rel="noopener">' + esc(it.t) + '</a> ' + (it.k || []).map(tagHtml).join(' ') +
      '<div class="small faint">' + esc(it.s) + (who ? ' · ' + who : '') + '</div></div></li>';
  }
  function why(x, w) {
    var m = x.m[w], bits = [];
    if (m && m.dr !== undefined && m.dr !== 0) bits.push('#' + m.then + ' → #' + x.rk + ' on Tankathon\'s board');
    if (x.s && x.s.gp) bits.push(line(x.s) + ' (' + U.fmt(x.p1, 2) + ' P/GP) with ' + (x.team || '?') + ' (' + (x.lg || '?') + ')' + (x.s.nhle !== undefined ? ', NHLe ' + U.fmt(x.s.nhle, 1) : ''));
    if (x.p0 !== null && x.p1 !== null && x.s.gp >= 5) bits.push((x.p1 >= x.p0 ? 'up from ' : 'down from ') + U.fmt(x.p0, 2) + ' P/GP last season (' + esc(x.b.last_season.league || '') + ')');
    return bits.join('; ');
  }

  // ---------------------------------------------------------------- page
  DP.pages.draft = {
    title: 'Draft Center',
    render: function (el, hsh) {
      var q = hsh.q, V = DP.draftView(), D = V.D;
      if (q.p) { report(el, V, q.p, +q.y || 2027); return; }
      var tab = q.tab === 'b2027' ? 'c27' : q.tab || 'c27';
      var nNews = D ? Object.keys(D.news || {}).reduce(function (s, k) { return s + D.news[k].length; }, 0) : 0;
      var h = '<div class="page-head"><h1>🎯 Draft Center</h1><p class="sub">The 2027 NHL draft class followed all season: Tankathon\'s live board' + (D && D.tkUpdated ? ' (updated ' + esc(day(D.tkUpdated)) + ')' : '') + ', NHL Central Scouting once it publishes, this season\'s stats, who is rising and falling, and headlines from ' + (D ? D.sources.length : 'public') + ' public sources. Plus the 2026 class this season, the league\'s own rookie drafts and early 2028 and 2029 boards. <a href="#/mock">Run a mock of the 2027 league draft →</a></p></div>';
      h += '<div class="tabs" role="tablist">' + [['c27', '2027 class'], ['news', 'News wire' + (nNews ? ' (' + nNews + ')' : '')], ['nhl26', '2026 NHL Draft'], ['league', 'League drafts'], ['b2028', '2028 watch'], ['b2029', '2029 watch']].map(function (t) {
        return '<button role="tab" aria-selected="' + (t[0] === tab) + '" class="' + (t[0] === tab ? 'on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div><div id="dc-body"></div>';
      el.innerHTML = h;
      U.qsa('[data-tab]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('draft', null, { tab: b.dataset.tab === 'c27' ? undefined : b.dataset.tab }); }); });
      var body = U.qs('#dc-body', el);
      if (tab === 'news') newsTab(body, V, q);
      else if (tab === 'nhl26') nhl26Tab(body);
      else if (tab === 'league') leagueDrafts(body, q);
      else if (tab === 'b2028' || tab === 'b2029') boardTab(body, +tab.slice(1));
      else classTab(body, V, q);
    }
  };

  // ---------------------------------------------------------------- 2027 class
  function classTab(box, V, q) {
    var D = V.D, me = DP.state.team, w = q.w && V.refs[q.w] ? q.w : 'pre';
    if (!D || !V.rows.length) { box.innerHTML = '<div class="callout warn">The draft tracker (data/draft.js) hasn\'t been built yet. It runs with the nightly data refresh.</div>'; return; }
    var rows = V.rows, on = rows.filter(function (x) { return x.rk; }), css = (D.status.css || []), cssN = css.reduce(function (s, c) { return s + (c.n || 0); }, 0);
    var mv = function (x) { var m = x.m[w]; return m && m.dr !== undefined ? m.dr : null; };
    var risers = on.filter(function (x) { return mv(x) > 0; }).sort(function (a, b) { return mv(b) - mv(a) || a.rk - b.rk; }).slice(0, 8);
    var fallers = rows.filter(function (x) { return mv(x) < 0 || x.m[w].off; }).sort(function (a, b) { return (mv(a) === null ? -99 : mv(a)) - (mv(b) === null ? -99 : mv(b)); }).slice(0, 8);
    var hot = on.filter(function (x) { return x.s && x.s.gp >= 5 && x.s.nhle !== undefined; }).sort(function (a, b) { return b.s.nhle - a.s.nhle; });
    var f0 = fallers.filter(function (x) { return mv(x) !== null; })[0];
    var d14 = addDays(V.last || D.built.slice(0, 10), -14), news14 = rows.reduce(function (s, x) { return s + x.news.filter(function (it) { return it.d >= d14; }).length; }, 0);
    var h = '<p class="small muted">' + on.length + ' players on <a href="' + esc(D.status.tk.url) + '" target="_blank" rel="noopener">Tankathon\'s 2027 big board</a> (updated ' + esc(day(D.tkUpdated)) + '), checked every night since ' + esc(day(D.seeded)) + '. ' +
      'Rank and this season\'s stats are Tankathon\'s; <b>NHLe</b> is Tankathon\'s NHL-equivalent points over 82 games at this season\'s pace. ' +
      (cssN ? 'NHL Central Scouting\'s list is in (' + css.map(function (c) { return c.cat + ' ' + c.n; }).join(', ') + ').' : 'NHL Central Scouting hasn\'t published its 2027 list yet (its midterm ranking usually comes out in January); it appears here the night it does.') +
      ' <b>Preseason</b> = the September consensus of four boards. Style, ceiling and notes are Dynasty Puck HQ\'s fantasy read, not facts.' + (D.status.tk.ok ? '' : ' <span class="bad">Tankathon could not be read last night; showing the last good board.</span>') + '</p>';
    h += '<div class="stats">' +
      DP.statTile('Biggest riser', risers[0] ? esc(risers[0].n) : '–', risers[0] ? '▲' + mv(risers[0]) + ' to #' + risers[0].rk + ' · ' + { pre: 'since ' + day(D.seeded), '30': 'last 30 days', up: 'at the last board update' }[w] : 'no moves in this window yet') +
      DP.statTile('Biggest faller', f0 ? esc(f0.n) : '–', f0 ? '▼' + (-mv(f0)) + ' to #' + f0.rk : 'no drops in this window yet') +
      DP.statTile('Top NHLe', hot[0] ? esc(hot[0].n) : '–', hot[0] ? U.fmt(hot[0].s.nhle, 1) + ' · ' + line(hot[0].s) + ' (' + (hot[0].lg || '') + ')' : '') +
      DP.statTile('Headlines', '<a href="' + U.hash('draft', null, { tab: 'news' }) + '">' + news14 + '</a>', 'last 14 days, on the news wire') + '</div>';
    h += '<div class="controls"><div class="seg">' + WIN.map(function (x) { return '<button data-w="' + x[0] + '" class="' + (x[0] === w ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><span class="small muted">' +
      (w === 'pre' ? 'vs Tankathon\'s board on ' + day(D.seeded) : w === '30' ? 'vs Tankathon\'s board on ' + day(V.refs['30']) : 'vs Tankathon\'s board before its ' + day(V.last) + ' update (' + day(V.refs.up) + ')') + '</span></div>';
    var card = function (title, list, up) {
      return '<div class="card"><h2>' + title + '</h2>' + (list.length ? '<ul class="list-plain mvlist">' + list.map(function (x) {
        return '<li><b>' + (up ? '<span class="good">▲' + mv(x) + '</span>' : x.m[w].off ? '<span class="bad">off</span>' : '<span class="bad">▼' + (-mv(x)) + '</span>') + '</b> ' + (x.rk ? '#' + x.rk + ' ' : '') + nameHtml(x) + ' <span class="faint small">' + esc((x.pos || '') + ' · ' + (x.team || '') + (x.lg ? ' (' + x.lg + ')' : '')) + '</span><br><span class="small muted">' + why(x, w) + '</span></li>';
      }).join('') + '</ul>' : '<p class="small muted">No moves in this window yet. The board history starts ' + esc(day(D.seeded)) + ' and grows every time Tankathon re-ranks.</p>') + '</div>';
    };
    h += '<div class="grid g2">' + card('📈 Risers', risers, true) + card('📉 Fallers', fallers, false) + '</div>';
    h += '<div class="card flush" style="margin-top:14px"><h2>The class</h2><div id="c27" style="padding:0 12px 12px"></div></div>';
    box.innerHTML = h;
    U.qsa('[data-w]', box).forEach(function (b) { b.addEventListener('click', function () { DP.go('draft', null, { w: b.dataset.w === 'pre' ? undefined : b.dataset.w }); }); });
    var proj = DP.mockProjection();
    ui.table(U.qs('#c27', box), {
      rows: rows, sort: 'rk', desc: false, page: 50, csv: 'draft-2027-class.csv', search: function (x) { return x.n + ' ' + (x.team || '') + ' ' + (x.lg || '') + ' ' + (x.nat || ''); },
      filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']], fn: function (x, v) { return x.g === v; } },
        { l: 'League', opts: [['', 'All'], ['CHL', 'CHL'], ['USHL', 'USHL'], ['NCAA', 'NCAA'], ['Europe', 'Europe'], ['Other', 'Other']], fn: function (x, v) { return x.grp === v; } },
        { l: 'Move', opts: [['', 'All'], ['up', 'Rising'], ['down', 'Falling'], ['new', 'New to the board']], fn: function (x, v) { var m = x.m[w]; return v === 'up' ? m.dr > 0 : v === 'down' ? m.dr < 0 || m.off : m.isNew; } }],
      rowCls: function (x) { return x.gm && x.gm === me ? 'mine' : ''; },
      cols: [{ k: 'rk', l: '#', cls: 'num', asc: true, v: function (x) { return x.rk || 999; }, f: function (x) { return x.rk ? x.rk : '<span class="faint">–</span>'; }, csv: function (x) { return x.rk || ''; } },
        { k: 'n', l: 'Player', v: function (x) { return x.n; }, f: function (x) { return nameHtml(x) + '<br><span class="faint small">' + esc(bioTxt(x)) + '</span>'; } },
        { k: 'mv', l: 'Move', cls: 'num', v: function (x) { return mv(x) === null ? (x.m[w].isNew ? 0.5 : -999) : mv(x); }, f: function (x) { return moveHtml(x.m[w]); }, csv: function (x) { return mv(x); } },
        { k: 'team', l: 'Team', v: function (x) { return (x.lg || '') + ' ' + (x.team || ''); }, f: function (x) { return '<span class="small">' + esc(x.team || '') + (x.lg ? ' <span class="faint">(' + esc(x.lg) + ')</span>' : '') + '</span>'; } },
        { k: 'line', l: 'This season', v: function (x) { return x.s ? x.s.pts : null; }, f: function (x) { return x.s ? '<span class="small nw">' + esc(line(x.s)) + '</span>' : x.ls ? '<span class="faint small" title="' + esc(x.ls.season + ': ' + line(x.ls)) + '">no games yet</span>' : x.g === 'G' ? '<span class="faint small">no goalie stats</span>' : '<span class="faint small">–</span>'; }, csv: function (x) { return line(x.s); } },
        { k: 'ppg', l: 'P/GP', cls: 'num', v: function (x) { return x.p1; }, f: function (x) { return x.p1 === null ? '–' : U.fmt(x.p1, 2) + (x.p0 !== null && x.s.gp >= 5 ? ' <span class="small ' + (x.p1 >= x.p0 ? 'good' : 'bad') + '" title="' + esc('Last season ' + U.fmt(x.p0, 2) + ' in the ' + (x.b.last_season.league || '')) + '">' + (x.p1 >= x.p0 ? '▲' : '▼') + '</span>' : ''); } },
        { k: 'nhle', l: 'NHLe', cls: 'num', title: 'Tankathon\'s NHL equivalency: NHL points over 82 games at this season\'s pace and league', v: function (x) { return x.s && x.s.nhle !== undefined ? x.s.nhle : null; }, f: function (x) { return x.s && x.s.nhle !== undefined ? U.fmt(x.s.nhle, 1) : '–'; } },
        { k: 'pre', l: 'Preseason', cls: 'num', title: 'September consensus rank of four public boards', v: function (x) { return x.pre || null; }, f: function (x) { return x.pre ? '#' + x.pre : '<span class="faint">–</span>'; } },
        { k: 'css', l: 'Central Scouting', v: function (x) { return x.css ? x.css.rank : null; }, f: function (x) { return x.css ? '#' + x.css.rank + ' <span class="faint small">' + esc(['', 'NA', 'Intl', 'NA G', 'Intl G'][x.css.cat]) + '</span>' : '<span class="faint small">' + (cssN ? '–' : 'Jan') + '</span>'; } },
        { k: 'proj', l: 'League pick', cls: 'num', title: 'Where he goes in 300 simulated 2027 league drafts (Mock Draft model): median pick, and the share of mocks he is taken in round 1', v: function (x) { var p = proj.by['c:' + x.k]; return p && p.med ? p.med : 99; }, f: function (x) { var p = proj.by['c:' + x.k]; return p && p.med ? '<span class="nw">' + DP.pickLabel(p.med) + '</span> <span class="faint small">' + U.pct(p.r1) + ' R1</span>' : '<span class="faint small">' + (x.gm ? 'owned' : 'undrafted') + '</span>'; }, csv: function (x) { var p = proj.by['c:' + x.k]; return p && p.med ? p.med : ''; } },
        { k: 'prof', l: 'Profile', v: function (x) { return x.b ? x.b.ceiling || '' : ''; }, f: function (x) { return x.b && x.b.ceiling && x.b.ceiling !== 'TBD' ? '<span class="small">' + esc(x.b.style || '') + '<br><span class="faint">Ceiling: ' + esc(x.b.ceiling) + '</span></span>' : '<span class="faint small">–</span>'; } },
        { k: 'news', l: '📰', cls: 'num', title: 'Headlines in the last 45 days', v: function (x) { return x.news.length; }, f: function (x) { return x.news.length ? '<a href="' + reportHref(x.k) + '">' + x.news.length + '</a>' : ''; } }]
    });
  }

  // ---------------------------------------------------------------- one player's report
  function rankChart(r, D) {
    var pts = (r || []).filter(function (e) { return e[1] !== null; });
    if (pts.length < 2) return '';
    var W = 320, H = 90, d0 = new Date(pts[0][0] + 'T12:00:00Z'), d1 = new Date((D.tkUpdated > pts[pts.length - 1][0] ? D.tkUpdated : pts[pts.length - 1][0]) + 'T12:00:00Z');
    var lo = Math.min.apply(null, pts.map(function (e) { return e[1]; })), hi = Math.max.apply(null, pts.map(function (e) { return e[1]; }));
    if (hi - lo < 6) { lo = Math.max(1, lo - 3); hi = lo + 6; }
    var sx = function (d) { return 30 + (new Date(d + 'T12:00:00Z') - d0) / Math.max(1, d1 - d0) * (W - 44); }, sy = function (v) { return 10 + (v - lo) / (hi - lo) * (H - 28); };
    var path = '', prev = null;
    pts.forEach(function (e) { var x = sx(e[0]).toFixed(1), y = sy(e[1]).toFixed(1); path += prev === null ? 'M' + x + ',' + y : 'H' + x + 'V' + y; prev = y; });
    path += 'H' + (W - 14);
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:420px" role="img" aria-label="Tankathon rank over time"><text x="2" y="' + (sy(lo) + 4) + '" class="ax">#' + lo + '</text><text x="2" y="' + (sy(hi) + 4) + '" class="ax">#' + hi + '</text>' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' + pts.map(function (e) { return '<circle cx="' + sx(e[0]).toFixed(1) + '" cy="' + sy(e[1]).toFixed(1) + '" r="3" fill="var(--accent)"><title>' + esc(day(e[0]) + ': #' + e[1]) + '</title></circle>'; }).join('') +
      '<text x="30" y="' + (H - 4) + '" class="ax">' + esc(day(pts[0][0])) + '</text><text x="' + (W - 14) + '" y="' + (H - 4) + '" class="ax" text-anchor="end">' + esc(day(D.tkUpdated)) + '</text></svg>';
  }
  function report(el, V, k, y) {
    var D = V.D, x = y === 2027 ? V.by[k] : null, B = ((DP.prospects || {}).boards || {})[y] || {}, b = x ? x.b : (B.players || []).filter(function (r) { return DP.draftKey(r.name) === k; })[0];
    if (!x && !b) { el.innerHTML = '<p><a href="#/draft">← Draft Center</a></p><div class="callout bad">That player isn\'t on the ' + y + ' board.</div>'; return; }
    var name = x ? x.n : b.name, news = x ? x.news : ((D && D.news && D.news['d' + (y % 100) + ':' + k]) || []);
    document.title = name + ' · Draft Center · Dynasty Puck HQ';
    var h = '<p><a href="' + U.hash('draft', null, { tab: y === 2027 ? undefined : 'b' + y }) + '">← ' + (y === 2027 ? '2027 class' : y + ' watch list') + '</a></p><div class="page-head"><h1>' + esc(name) + '</h1><p class="sub">' + esc(y + ' NHL draft class') +
      (x ? ' · ' + esc(bioTxt(x)) + ' · ' + esc((x.team || '') + (x.lg ? ' (' + x.lg + ')' : '')) : ' · ' + esc([b.pos, b.team, b.league].filter(Boolean).join(' · '))) +
      (x && x.gm ? ' · <span class="badge info">on ' + esc(U.teamName(x.gm)) + '</span>' : x && x.p ? ' · already in Fantrax\'s player pool' : '') + '</p></div>';
    if (x) {
      var p = DP.mockProjection().by['c:' + k], m = x.m.pre, sn = x.since(addDays(V.last, -14));
      h += '<div class="stats">' +
        DP.statTile('Tankathon rank', x.rk ? '#' + x.rk : 'off the board', m.dr !== undefined ? (m.dr ? (m.dr > 0 ? '▲' : '▼') + Math.abs(m.dr) + ' since ' + day(D.seeded) + ' (#' + m.then + ')' : 'same as ' + day(D.seeded)) : m.isNew ? 'new since ' + day(D.seeded) : '') +
        DP.statTile('Preseason consensus', x.pre ? '#' + x.pre : '–', 'four boards, September') +
        DP.statTile('Central Scouting', x.css ? '#' + x.css.rank : '–', x.css ? ['', 'North American skaters', 'International skaters', 'North American goalies', 'International goalies'][x.css.cat] + ', ' + x.css.kind : 'first list due in January') +
        DP.statTile('This season', x.s ? x.s.pts + ' pts' : '–', x.s ? line(x.s) + (x.s.nhle !== undefined ? ' · NHLe ' + U.fmt(x.s.nhle, 1) : '') : x.ls ? 'no games yet this season' : x.g === 'G' ? 'Tankathon shows no goalie stats' : '') +
        DP.statTile('League pick (mock model)', p && p.med ? DP.pickLabel(p.med) : x.gm ? 'owned' : 'undrafted', p && p.med ? 'range ' + DP.pickLabel(p.p10) + ' to ' + DP.pickLabel(p.p90) + ' · round 1 in ' + U.pct(p.r1) + ' of mocks' : p ? 'taken in ' + U.pct(p.any) + ' of mocks' : '') + '</div>';
      h += '<div class="grid g2"><div class="card"><h2>Rank on Tankathon\'s board</h2>' + (rankChart(x.r, D) || '<p class="small muted">One board so far' + (x.rk ? ' (#' + x.rk + ')' : '') + '. The line fills in each time Tankathon re-ranks.</p>') +
        '<p class="small muted">' + x.r.map(function (e) { return esc(day(e[0])) + ': ' + (e[1] === null ? 'off' : '#' + e[1]); }).join(' · ') + '</p></div>';
      h += '<div class="card"><h2>Production</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Season</th><th>Team</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">P/GP</th></tr></thead><tbody>' +
        (x.s ? '<tr><td>2026-27</td><td>' + esc((x.team || '') + (x.lg ? ' (' + x.lg + ')' : '')) + '</td><td class="num">' + x.s.gp + '</td><td class="num">' + x.s.g + '</td><td class="num">' + x.s.a + '</td><td class="num"><b>' + x.s.pts + '</b></td><td class="num">' + U.fmt(x.p1, 2) + '</td></tr>' : '') +
        (!(x.b && x.b.last_season && x.b.last_season.gp) && x.ls ? '<tr><td>' + esc(x.ls.season) + '</td><td class="faint">(Tankathon)</td><td class="num">' + x.ls.gp + '</td><td class="num">' + x.ls.g + '</td><td class="num">' + x.ls.a + '</td><td class="num">' + x.ls.pts + '</td><td class="num">' + U.fmt(x.ls.pts / x.ls.gp, 2) + '</td></tr>' : '') +
        (x.b && x.b.last_season && x.b.last_season.gp ? (function (s) { return '<tr><td>' + esc(s.season) + '</td><td>' + esc((s.team || '') + ' (' + (s.league || '') + ')') + '</td><td class="num">' + s.gp + '</td><td class="num">' + s.g + '</td><td class="num">' + s.a + '</td><td class="num">' + s.pts + '</td><td class="num">' + U.fmt(s.pts / s.gp, 2) + '</td></tr>'; })(x.b.last_season) : '') +
        '</tbody></table></div><p class="small muted">' + (sn ? 'Since ' + esc(day(sn.from)) + ': ' + sn.gp + ' GP, ' + sn.g + '-' + sn.a + '-' + sn.pts + '. ' : '') + 'This season from Tankathon (one league per season); last season from the September board' + (x.slug ? ' · <a href="https://www.tankathon.com/nhl/players/' + esc(x.slug) + '" target="_blank" rel="noopener">Tankathon page ↗</a>' : '') + '.</p></div></div>';
    }
    if (b) {
      h += '<div class="card" style="margin-top:14px"><h2>Fantasy profile <span class="badge">opinion</span></h2><p><b>' + esc(b.style || '') + '</b>' + (b.cats && b.cats.length ? ' · helps ' + b.cats.map(esc).join(', ') : '') + (b.ceiling ? ' · ceiling: ' + esc(b.ceiling) : '') + (b.comp ? ' · comparison: ' + esc(b.comp) : '') + '</p>' +
        (b.note ? '<p class="small">' + esc(b.note) + '</p>' : '') + (b.tags && b.tags.length ? '<p>' + b.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join(' ') + '</p>' : '') +
        '<p class="small muted">September sources: ' + (b.sources || []).map(function (s) { var n = esc(s.name + (s.rank ? ' #' + s.rank : '')); return s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + n + '</a>' : n; }).join(' · ') + '. The profile is Dynasty Puck HQ\'s read of those write-ups for our categories, not a fact.</p></div>';
    }
    h += '<div class="card" style="margin-top:14px"><h2>📰 Headlines</h2>' + (news.length ? '<ul class="list-plain">' + news.map(function (it) { return newsLi(it); }).join('') + '</ul>' : '<p class="small muted">No headlines in the last 45 days. The news scraper checks ' + (D ? D.sources.length : 'about 50') + ' public sources every night for his full name.</p>') + '</div>';
    el.innerHTML = h;
  }

  // ---------------------------------------------------------------- news wire
  function newsTab(box, V, q) {
    var D = V.D, R = DP.radar, E = DP.E, cls = q.cls || '', tag = q.tag || '', byU = {}, list = [];
    var add = function (it, who, c) { var g = byU[it.u]; if (!g) { g = byU[it.u] = { it: it, who: [], cls: {}, w: 0 }; list.push(g); } if (g.who.indexOf(who) < 0) g.who.push(who); g.cls[c] = 1; g.w = Math.max(g.w, it.w || 1); };
    V.rows.forEach(function (x) { x.news.forEach(function (it) { add(it, nameHtml(x), '2027'); }); });
    [2028, 2029].forEach(function (y) {
      (((DP.prospects || {}).boards || {})[y] || { players: [] }).players.forEach(function (b) {
        var k = DP.draftKey(b.name); ((D && D.news && D.news['d' + (y % 100) + ':' + k]) || []).forEach(function (it) { add(it, '<a class="plink" href="' + reportHref(k, y) + '">' + esc(b.name) + '</a> <span class="faint">(' + y + ')</span>', String(y)); });
      });
    });
    if (R) { // the 2026 class: the Prospect Radar's headlines
      var RV = DP.radarView();
      ((DP.prospects || {}).draft2026 || []).forEach(function (r) {
        var row = RV.by[r.fid] || RV.by['n' + r.nhl]; if (!row) return;
        row.news.forEach(function (it) { add(it, '<a class="plink" href="' + U.hash('radar', null, { p: row.key }) + '">' + esc(row.p.n) + '</a> <span class="faint">(2026 #' + r.ov + ')</span>', '2026'); });
      });
    }
    list.sort(function (a, b) { return a.it.d < b.it.d ? 1 : a.it.d > b.it.d ? -1 : b.w - a.w; });
    var tags = {}; list.forEach(function (g) { (g.it.k || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var shown = list.filter(function (g) { return (!cls || g.cls[cls]) && (!tag || (g.it.k || []).indexOf(tag) >= 0); });
    var set = function (o) { DP.go('draft', null, Object.assign({ tab: 'news', cls: cls || undefined, tag: tag || undefined }, o)); };
    var h = '<p class="small muted">Headlines that name a player in the 2027, 2028 or 2029 draft class, or a 2026 draftee, from NHL.com and ' + (D ? D.sources.length - 1 : 'about 50') + ' public feeds (league sites, junior and college hockey, scouting services, team blogs), checked every night' + (D && D.newsAsOf ? ', last ' + esc(U.date(new Date(D.newsAsOf))) : '') + '. A headline counts when the player\'s full name is in it, or in the summary under a headline about prospects or the draft. Only the headline and link are kept, and headlines never change a ranking. Kept for 45 days.</p>';
    h += '<div class="controls"><div class="seg">' + [['', 'All classes'], ['2027', '2027'], ['2028', '2028'], ['2029', '2029'], ['2026', '2026 draftees']].map(function (c) { return '<button data-cls="' + c[0] + '" class="' + (c[0] === cls ? 'on' : '') + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      (Object.keys(tags).length ? '<label>Tag <select id="nw-tag"><option value="">All</option>' + Object.keys(tags).sort().map(function (t) { return '<option value="' + esc(t) + '"' + (t === tag ? ' selected' : '') + '>' + esc(t) + ' (' + tags[t] + ')</option>'; }).join('') + '</select></label>' : '') + '</div>';
    h += '<div class="card">' + (shown.length ? '<ul class="list-plain">' + shown.slice(0, 120).map(function (g) { return newsLi(g.it, g.who.join(', ')); }).join('') + '</ul>' : '<p class="muted">No headlines for this filter in the last 45 days.</p>') + '</div>';
    box.innerHTML = h;
    U.qsa('[data-cls]', box).forEach(function (b) { b.addEventListener('click', function () { set({ cls: b.dataset.cls || undefined }); }); });
    var ts = U.qs('#nw-tag', box); if (ts) ts.addEventListener('change', function () { set({ tag: ts.value || undefined }); });
    void E;
  }

  // ---------------------------------------------------------------- 2026 NHL draft: the class this season
  function nhl26Tab(box) {
    var E = DP.E, PR = DP.prospects || {}, me = DP.state.team, picks = PR.draft2026 || [], RV = DP.radar ? DP.radarView() : null;
    var rowOf = function (r) { return RV ? RV.by[r.fid] || RV.by['n' + r.nhl] || null : null; };
    var lineTxt = function (row) { var l = row && row.lines[0]; if (!l) return ''; return row.p.slot === 'G' ? l[0] + ' ' + l[2] + ' GP, ' + l[3] + ' W, ' + U.rate(l[5]) : l[0] + ' ' + l[2] + ' GP, ' + l[3] + '-' + l[4] + '-' + l[5]; };
    box.innerHTML = '<p class="small muted">' + picks.length + ' picks (NHL API). "League" = the Dynasty Puck team that owns him now. <b>This season</b> and <b>Radar</b> come from the Prospect Radar (re-scored nightly; ▲▼ = rank change over 30 days). Scouting notes, styles and risers/fallers are the pre-draft notes from the old Prospect app.</p><div id="d26"></div>';
    ui.table(U.qs('#d26', box), {
      rows: picks, sort: 'ov', desc: false, csv: 'nhl-draft-2026.csv', page: 64, search: function (r) { return r.n + ' ' + r.team + ' ' + (r.club || '') + ' ' + (r.gm || ''); },
      filters: [{ l: 'Round', opts: [['', 'All'], ['1', '1'], ['2', '2'], ['3', '3'], ['4+', '4+']], fn: function (r, v) { return v === '4+' ? r.rd >= 4 : r.rd === +v; } },
        { l: 'League status', opts: [['', 'All'], ['owned', 'Owned in league'], ['avail', 'Unowned']], fn: function (r, v) { return v === 'owned' ? !!r.gm : !r.gm; } }],
      rowCls: function (r) { return r.gm && r.gm === me ? 'mine' : ''; },
      cols: [{ k: 'ov', l: '#', cls: 'num', v: function (r) { return r.ov; } },
        { k: 'n', l: 'Player', v: function (r) { return r.n; }, f: function (r) { var p = r.fid && E.byId[r.fid], row = rowOf(r); return (p ? ui.plink(p) : row ? '<a class="plink" href="' + U.hash('radar', null, { p: row.key }) + '">' + esc(r.n) + '</a>' : '<b>' + esc(r.n) + '</b>') + ' <span class="faint small">' + esc((r.pos || '') + ' · ' + (r.nat || '') + ' · ' + r.team) + '</span>'; } },
        { k: 'gm', l: 'League', v: function (r) { return r.gm || 'zz'; }, f: function (r) { return r.gm ? '<b>' + esc(r.gm) + '</b>' : '<span class="faint">unowned</span>'; } },
        { k: 'now', l: 'This season', v: function (r) { var row = rowOf(r), l = row && row.lines[0]; return l ? l[5] : null; }, f: function (r) { var t = lineTxt(rowOf(r)); return t ? '<span class="small nw">' + esc(t) + '</span>' : '<span class="faint small">–</span>'; }, csv: function (r) { return lineTxt(rowOf(r)); } },
        { k: 'radar', l: 'Radar', cls: 'num', title: 'Prospect Radar rank (all prospects) and its change over 30 days', v: function (r) { var row = rowOf(r); return row ? row.rank : null; }, f: function (r) { var row = rowOf(r); if (!row) return '–'; var d = row.d['30']; return '<a href="' + U.hash('radar', null, { p: row.key }) + '">#' + row.rank + '</a>' + (d && d.dr ? ' <span class="small ' + (d.dr > 0 ? 'good' : 'bad') + '">' + (d.dr > 0 ? '▲' : '▼') + Math.abs(d.dr) + '</span>' : ''); } },
        { k: 'stock', l: 'Stock', cls: 'num', v: function (r) { var row = rowOf(r); return row ? row.stock : null; }, f: function (r) { var row = rowOf(r); return row ? U.fmt(row.stock, 1) : '–'; } },
        { k: 'pre', l: 'Pre-draft rank', cls: 'num', v: function (r) { return r.pre ? r.pre.rank : null; }, f: function (r) { return r.pre ? r.pre.rank + (r.pre.rank - r.ov >= 10 ? ' <span class="badge good" title="Went earlier than the pre-draft rank">↑</span>' : r.ov - r.pre.rank >= 10 ? ' <span class="badge warn" title="Slid past the pre-draft rank">↓</span>' : '') : '–'; } },
        { k: 'style', l: 'Style', v: function (r) { return r.pre ? r.pre.style : ''; }, f: function (r) { return r.pre ? '<span class="small">' + esc(r.pre.style) + '</span>' : ''; } },
        { k: 'note', l: 'Scouting note', v: null, f: function (r) { return r.pre ? '<span class="small">' + esc(r.pre.note) + (r.pre.stock ? ' <i class="muted">' + esc(r.pre.stock) + '</i>' : '') + '</span>' : ''; } }]
    });
  }

  // ---------------------------------------------------------------- 2028 / 2029 watch lists
  function boardTab(box, y) {
    var D = DP.draft, b = ((DP.prospects || {}).boards || {})[y];
    if (!b || !b.players || !b.players.length) { box.innerHTML = '<div class="callout warn">The ' + y + ' board will appear here after the next data build.</div>'; return; }
    var news = function (r) { return (D && D.news && D.news['d' + (y % 100) + ':' + DP.draftKey(r.name)]) || []; };
    box.innerHTML = '<p class="small muted">' + esc(b.note || '') + ' Updated ' + esc(b.updated || '') + '. Sources: ' + (b.sources || []).map(function (s) { return '<a target="_blank" rel="noopener" href="' + esc(s.url) + '">' + esc(s.name) + '</a>'; }).join(', ') + '. Stats are from the listed sources; style, categories, ceiling, comparison and notes are fantasy-focused analysis, not facts. 📰 = headlines in the last 45 days.</p><div id="bd"></div>';
    ui.table(U.qs('#bd', box), {
      rows: b.players, sort: 'rank', desc: false, csv: 'draft-board-' + y + '.csv', page: 80, search: function (r) { return r.name + ' ' + (r.team || '') + ' ' + (r.league || ''); },
      filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']], fn: function (r, v) { return posGroup(r.pos) === v; } }],
      cols: [{ k: 'rank', l: '#', cls: 'num', v: function (r) { return r.rank; } },
        { k: 'name', l: 'Player', v: function (r) { return r.name; }, f: function (r) {
          return '<a class="plink" href="' + reportHref(DP.draftKey(r.name), y) + '">' + esc(r.name) + '</a>' + (r.gm ? ' <span class="badge info" title="Already owned in the league">' + esc(r.gm) + '</span>' : '') +
            '<br><span class="faint small">' + esc([r.pos, r.team, r.league].filter(Boolean).join(' · ')) + '</span>' + (r.tags && r.tags.length ? '<br>' + r.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join(' ') : ''); } },
        { k: 'last', l: 'Last season', v: function (r) { return r.last_season ? r.last_season.pts : null; }, f: function (r) { var s = r.last_season; return s && (s.gp || s.pts) ? '<span class="small">' + esc((s.season || '') + ' ' + (s.league || '')) + ' ' + (s.gp ? s.gp + 'GP ' : '') + (s.g !== undefined && s.g !== null ? s.g + '-' + s.a + '-' + s.pts : s.pts + ' pts') + '</span>' : ''; } },
        { k: 'style', l: 'Profile', v: function (r) { return r.ceiling || ''; }, f: function (r) { return '<span class="small"><b>' + esc(r.style || '') + '</b><br>Helps: ' + esc((r.cats || []).join(', ')) + '<br>Ceiling: ' + esc(r.ceiling || '–') + (r.comp ? '<br>Comp: ' + esc(r.comp) : '') + '</span>'; } },
        { k: 'note', l: 'Fantasy note', v: null, f: function (r) { return '<div class="small" style="min-width:240px;max-width:460px">' + esc(r.note || '') + '</div>'; } },
        { k: 'news', l: '📰', cls: 'num', v: function (r) { return news(r).length; }, f: function (r) { var n = news(r).length; return n ? '<a href="' + reportHref(DP.draftKey(r.name), y) + '">' + n + '</a>' : ''; } }]
    });
  }

  // ---------------------------------------------------------------- the league's own rookie drafts
  function leagueDrafts(body, q) {
    var E = DP.E, D = (DP.league && DP.league.drafts) || {}, which = q.d || '2026', me = DP.state.team, RV = DP.radar ? DP.radarView() : null;
    var d = D[which];
    var h = '<div class="controls"><div class="seg">' + Object.keys(D).sort().reverse().map(function (k) { return '<button data-d="' + k + '" class="' + (k === which ? 'on' : '') + '">' + esc(D[k].name) + '</button>'; }).join('') + '</div></div>';
    if (!d) { body.innerHTML = h + '<p class="muted">No league draft data.</p>'; return; }
    var rows = d.picks.map(function (pk) { var p = pk.id && E.byId[pk.id], rr = p && RV ? RV.by[p.id] : null; return { pk: pk, p: p, v: p ? p.DV : 0, rr: rr }; });
    var byV = rows.slice().sort(function (a, b) { return b.v - a.v; });
    byV.forEach(function (r, i) { r.mrank = i + 1; });
    var grade = {};
    rows.forEach(function (r) { var t = r.pk.owner; if (!t) return; grade[t] = grade[t] || { t: t, n: 0, v: 0, best: null, up: 0 }; grade[t].n++; grade[t].v += Math.max(0, r.v); if (r.rr && r.rr.d.s) grade[t].up += r.rr.d.s.dv; if (!grade[t].best || r.v > grade[t].best.v) grade[t].best = r; });
    var gl = Object.keys(grade).map(function (k) { return grade[k]; }).sort(function (a, b) { return b.v - a.v; });
    gl.forEach(function (g, i) { g.grade = ui.gradeOf(1 - i / Math.max(1, gl.length - 1)); });
    var since = RV && RV.R ? day(RV.R.dates[RV.R.ref[4]]) : 'the start of the season';
    h += '<div class="grid g2"><div class="card span2"><h2>' + esc(d.name) + '</h2><div class="hint">' + d.picks.length + ' picks, ' + d.rounds + ' rounds' + (d.snake ? ' (snake)' : ' (straight order, reverse standings)') + '. Value = each player\'s dynasty value today. <b>Stock since ' + esc(since) + '</b> = his change in Prospect Radar stock since then. <b>Steal</b> = the model ranks him 8+ spots above where he went; <b>reach</b> = 8+ below. ' + (which === '2026' ? 'This draft sets the pick-value curve used for future picks.' : 'Picks are credited to today\'s team. Three 2025 franchises have since changed hands (now Beginner\'s Luck, Colganites and Bethesda Bullies), inferred from where their picks sit today.') + '</div><div id="ld"></div></div>';
    h += '<div class="card span2"><h2>Draft grades (by value drafted)</h2><div id="lg"></div></div></div>';
    body.innerHTML = h;
    U.qsa('[data-d]', body).forEach(function (b) { b.addEventListener('click', function () { DP.go('draft', null, { tab: 'league', d: b.dataset.d }); }); });
    ui.table(U.qs('#ld', body), {
      rows: rows, sort: 'ov', desc: false, page: 60, csv: 'league-draft-' + which + '.csv', search: function (r) { return r.pk.n + ' ' + (r.pk.owner || '') + ' ' + (r.pk.orig || ''); },
      filters: [{ l: 'Team', opts: [['', 'All']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), fn: function (r, v) { return r.pk.owner === v || r.pk.orig === v; } },
        { l: 'Round', opts: [['', 'All']].concat(Array.apply(null, Array(d.rounds)).map(function (_, i) { return [String(i + 1), 'R' + (i + 1)]; })), fn: function (r, v) { return r.pk.rd === +v; } }],
      rowCls: function (r) { return r.pk.owner === me ? 'mine' : ''; },
      cols: [{ k: 'ov', l: 'Pick', cls: 'num', v: function (r) { return r.pk.ov; } }, { k: 'rd', l: 'Rd', cls: 'num', v: function (r) { return r.pk.rd; } },
        { k: 'owner', l: 'Made by', v: function (r) { return r.pk.owner || ''; }, f: function (r) { return '<b>' + esc(r.pk.owner || '?') + '</b>' + (r.pk.orig !== r.pk.owner ? ' <span class="small muted">(' + esc(r.pk.orig || '?') + '\'s pick)</span>' : ''); } },
        { k: 'n', l: 'Player', v: function (r) { return r.pk.n; }, f: function (r) { return r.p ? ui.plink(r.p) + ' <span class="faint small">' + esc(r.p.slot + ' · ' + (r.p.dr ? 'NHL ' + r.p.dr[0] + ' #' + r.p.dr[2] : '')) + '</span>' : esc(r.pk.n); } },
        { k: 'now', l: 'Now with', v: function (r) { return r.p ? (r.p.gm || 'FA') : ''; }, f: function (r) { return r.p ? ui.owner(r.p) : ''; } },
        { k: 'line', l: 'This season', v: function (r) { var l = r.rr && r.rr.lines[0]; return l ? l[5] : null; }, f: function (r) { var l = r.rr && r.rr.lines[0]; return l ? '<span class="small nw">' + esc(r.p.slot === 'G' ? l[0] + ' ' + l[2] + ' GP, ' + U.rate(l[5]) : l[0] + ' ' + l[2] + ' GP, ' + l[3] + '-' + l[4] + '-' + l[5]) + '</span>' : ''; } },
        { k: 'v', l: 'Value today', cls: 'num', v: function (r) { return r.v; }, f: function (r) { return '<b>' + U.fmt(r.v, 1) + '</b>'; } },
        { k: 'up', l: 'Stock since ' + since, cls: 'num', title: 'Change in Prospect Radar stock since the start of the season', v: function (r) { return r.rr && r.rr.d.s ? r.rr.d.s.dv : null; }, f: function (r) { return r.rr && r.rr.d.s ? ui.delta(r.rr.d.s.dv, 1) : '<span class="faint">–</span>'; } },
        { k: 'mr', l: 'Model rank', cls: 'num', v: function (r) { return r.mrank; }, f: function (r) { var d2 = r.pk.ov - r.mrank; return r.mrank + (d2 >= 8 ? ' <span class="badge good">steal</span>' : d2 <= -8 ? ' <span class="badge warn">reach</span>' : ''); } }]
    });
    ui.table(U.qs('#lg', body), {
      rows: gl, sort: 'v', rowCls: function (g) { return g.t === me ? 'mine' : ''; },
      cols: [{ k: 't', l: 'Team', v: function (g) { return U.teamName(g.t); }, f: function (g) { return '<b>' + esc(U.teamName(g.t)) + '</b>'; } }, { k: 'grade', l: 'Grade', v: function (g) { return g.v; }, f: function (g) { return '<b>' + g.grade + '</b>'; } },
        { k: 'n', l: 'Picks made', cls: 'num' }, { k: 'v', l: 'Value drafted', cls: 'num', v: function (g) { return g.v; }, f: function (g) { return U.fmt(g.v, 1); } },
        { k: 'up', l: 'Stock since ' + since, cls: 'num', title: 'Total change in Prospect Radar stock of the players picked, since the start of the season', v: function (g) { return g.up; }, f: function (g) { return ui.delta(g.up, 1); } },
        { k: 'best', l: 'Best pick', v: null, f: function (g) { return g.best && g.best.p ? ui.plink(g.best.p) + ' <span class="small muted">#' + g.best.pk.ov + '</span>' : ''; } }]
    });
  }

  // ================================================================== Mock Draft (2027 league draft)
  // pool: the 2027 class on the live board (not on a league roster) valued on the league's own rookie-draft curve at
  // its Tankathon rank, plus unowned prospects valued as MNR assets (the Prospect Radar's stock)
  function mockPool() {
    var E = DP.E, c = E.pickCurve(), V = DP.draftView(), out = [], seen = {};
    var curve = function (rank) { return c[Math.min(c.length - 1, rank - 1)] * 0.97 + 0.3 * Math.pow(0.97, rank); }; // rank breaks the curve's flat steps
    V.rows.forEach(function (x) {
      if (x.gm) return;
      var rank = x.rk || (x.pre ? x.pre + 15 : 99);   // fell off Tankathon's board: behind where September had him
      seen[x.k] = 1;
      out.push({ key: 'c:' + x.k, name: x.n, pos: x.g, team: (x.team || '') + (x.lg ? ' (' + x.lg + ')' : ''), src: x.rk ? 'Tankathon #' + x.rk : 'off Tankathon\'s board (Sep consensus #' + x.pre + ')', rank: rank, v: curve(rank), x: x, href: reportHref(x.k) });
    });
    E.prospectPool().filter(function (y) { return !y.owned && y.stock > 0.15 && !seen[DP.draftKey(y.p.n)]; }).forEach(function (y) {
      out.push({ key: y.key, name: y.p.n, pos: y.p.slot, team: y.p.t, src: y.inPool ? 'unowned prospect (Radar #' + y.rank + ')' : '2026 NHL draft #' + y.p.dr[2] + ', not in Fantrax yet', v: y.stock, p: y.inPool ? y.p : null, href: U.hash('radar', null, { p: y.key }) });
    });
    return out.sort(function (a, b) { return b.v - a.v; });
  }
  function mockOrder() {
    var E = DP.E, picks = (DP.league.picks || []).filter(function (p) { return p.year === 2027; }), order = [];
    var slot = {}; E.teams.forEach(function (t) { slot[t] = E.expSlot(t, 2027); });
    for (var r = 1; r <= (DP.league.rounds || 3); r++) {
      picks.filter(function (p) { return p.round === r; }).sort(function (a, b) { return slot[a.orig] - slot[b.orig]; }).forEach(function (p) { order.push({ r: r, orig: p.orig, owner: p.owner }); });
    }
    return order;
  }
  DP.pickLabel = function (ov) { var n = DP.E.teams.length; ov = Math.round(ov); return Math.ceil(ov / n) + '.' + ('0' + ((ov - 1) % n + 1)).slice(-2); };
  // positional need from each team's MNR pipeline (thin at D or G: those count a little more)
  function needs() {
    var E = DP.E, out = {};
    E.teams.forEach(function (t) {
      var mnr = E.rosters[t].filter(function (p) { return p.ct === 'MNR'; });
      out[t] = { F: 1, D: mnr.filter(function (p) { return p.D; }).length < 5 ? 1.08 : 1, G: mnr.filter(function (p) { return p.G; }).length < 2 ? 1.12 : 0.9 };
    });
    return out;
  }
  function aiPick(avail, need, rand) {
    var best = null, bs = -1;
    for (var i = 0; i < avail.length; i++) { var x = avail[i], s = x.v * (need[x.pos] || 1) * Math.exp(0.18 * (rand() * 2 - 1)); if (s > bs) { bs = s; best = x; } }
    return best;
  }
  function queueOf(me) { return me ? U.store.get('mockq_' + me, []) : []; }
  // your pick: the first player in your queue who is still on the board, else the model's best value
  function pickFor(st, owner, avail, taken, rand) {
    if (owner === st.me) {
      var q = queueOf(st.me);
      for (var i = 0; i < q.length; i++) { if (taken[q[i]]) continue; for (var j = 0; j < avail.length; j++) if (avail[j].key === q[i]) return avail[j]; }
    }
    return aiPick(avail, st.need[owner], rand);
  }
  function mockRun(st) {
    while (st.i < st.order.length) {
      var slot = st.order[st.i];
      if (slot.owner === st.me && !st.auto) return;
      var avail = st.pool.filter(function (x) { return !st.taken[x.key]; });
      var x = pickFor(st, slot.owner, avail, st.taken, st.rand); if (!x) break;
      st.taken[x.key] = 1; st.log.push({ slot: slot, x: x }); st.i++;
    }
  }
  // N mock drafts from the current state: for each of `me`'s picks after this one, how often each player was still there
  // (on the clock, the question is whether he will still be there next time if you pass on him now)
  function oddsFrom(st, N) {
    var mine = []; for (var j = st.i + 1; j < st.order.length; j++) if (st.order[j].owner === st.me) mine.push(j);
    var cnt = mine.map(function () { return {}; }), E = DP.E, start = st.pool.filter(function (x) { return !st.taken[x.key]; });
    for (var s = 0; s < N; s++) {
      var rand = E.rng(5150 + s), taken = {}, avail = start.slice(), mi = 0;
      for (var j2 = st.i; j2 < st.order.length && mi < mine.length; j2++) {
        if (j2 === mine[mi]) { for (var a = 0; a < avail.length; a++) cnt[mi][avail[a].key] = (cnt[mi][avail[a].key] || 0) + 1; mi++; }
        var x = pickFor(st, st.order[j2].owner, avail, taken, rand); if (!x) break;
        taken[x.key] = 1; avail.splice(avail.indexOf(x), 1);
      }
    }
    return { picks: mine, cnt: cnt, N: N, at: st.i };
  }
  // where each player goes across many all-AI mocks (Draft Center's "League pick")
  var projCache = null;
  DP.mockProjection = function () {
    var E = DP.E;
    if (projCache && projCache.v === E.version && projCache.D === DP.draft) return projCache;
    var N = 300, pool = mockPool(), order = mockOrder(), need = needs(), at = {};
    for (var s = 0; s < N; s++) {
      var rand = E.rng(31337 + s), avail = pool.slice();
      for (var j = 0; j < order.length; j++) {
        var x = aiPick(avail, need[order[j].owner], rand); if (!x) break;
        (at[x.key] = at[x.key] || []).push(j + 1); avail.splice(avail.indexOf(x), 1);
      }
    }
    var by = {};
    pool.forEach(function (x) {
      var a = (at[x.key] || []).sort(function (p, q) { return p - q; }), n = a.length, qt = function (f) { return a[Math.min(n - 1, Math.floor(f * n))]; };
      by[x.key] = { n: n, any: n / N, med: n >= N / 2 ? qt(0.5) : null, p10: n ? qt(0.1) : null, p90: n ? qt(0.9) : null, r1: a.filter(function (v) { return v <= E.teams.length; }).length / N };
    });
    return (projCache = { v: E.version, D: DP.draft, by: by, N: N });
  };

  DP._mock = { pool: mockPool, order: mockOrder, needs: needs, aiPick: aiPick, pickFor: pickFor, run: mockRun, odds: oddsFrom }; // for tools/test/check_draft.js

  var mockState = null;
  DP.pages.mock = {
    title: 'Mock Draft',
    render: function (el, hsh) {
      var E = DP.E, qt = hsh.q.team, me = qt === 'none' ? null : qt && E.rosters[qt] ? qt : DP.state.team || null;
      if (!mockState || mockState.me !== me || mockState.v !== E.version || mockState.D !== DP.draft) {
        var seed = mockState ? mockState.seed + 1 : 1;
        mockState = { me: me, v: E.version, D: DP.draft, order: mockOrder(), pool: mockPool(), need: needs(), taken: {}, log: [], i: 0, auto: !me, seed: seed, rand: E.rng(20270 + seed), odds: null };
        mockRun(mockState);
      }
      var st = mockState, onClock = st.order[st.i], done = !onClock, queue = queueOf(me), qset = {}; queue.forEach(function (k) { qset[k] = 1; });
      var odds = st.odds && st.odds.at === st.i ? st.odds : null, oNext = odds && odds.picks.length ? odds.cnt[0] : null;
      var h = '<div class="page-head"><h1>🧪 2027 League Mock Draft</h1><p class="sub">3 rounds in projected order (reverse of the simulated standings; traded picks go to their owners). Pool: the 2027 NHL draft class on Tankathon\'s live board (players already on a league roster left out) plus unowned prospects, valued on the league\'s own 2026 rookie-draft curve. The other GMs take the best value with a little randomness and a nudge toward D or G when their pipeline is thin. ★ players go in your queue: auto-pick takes them first.</p></div>';
      h += '<div class="controls"><label>I\'m drafting for ' + ui.teamSelect('mk-team', me, 'Nobody (watch only)') + '</label><button class="btn" id="mk-new">↻ New mock</button>' +
        (me && !done ? '<button class="btn ghost" id="mk-auto">Auto-pick the rest</button><button class="btn ghost" id="mk-odds">🎲 Odds at my picks</button>' : '') + (done ? '<button class="btn ghost" id="mk-copy">📋 Copy results</button>' : '') + '<span id="mk-msg" class="small muted"></span></div>';
      if (me) h += picksCard(st, me, odds);
      h += '<div class="grid g2"><div class="card"><h2>' + (done ? 'Draft complete' : onClock.owner === me ? '⏰ You\'re on the clock: pick ' + DP.pickLabel(st.i + 1) : 'Pick ' + DP.pickLabel(st.i + 1) + ' · ' + esc(onClock.owner)) + '</h2>' + (done ? gradesHtml(st, me) : '<div id="mk-avail"></div>') + '</div>';
      h += '<div class="card"><h2>Draft board</h2><div id="mk-log"></div></div></div>';
      if (me) h += '<div class="card" style="margin-top:14px"><h2>★ My queue</h2><div class="hint">Your own order. When you auto-pick (or run the odds), your pick is the first player in the queue who is still there; with none left, the model takes the best value for you. Saved on this device.</div>' +
        (queue.length ? '<ol class="small" style="margin:0;padding-left:20px">' + queue.map(function (k, i) {
          var x = st.pool.filter(function (y) { return y.key === k; })[0]; if (!x) return '';
          return '<li' + (st.taken[k] ? ' class="faint"' : '') + '><a class="plink" href="' + esc(x.href) + '">' + esc(x.name) + '</a> <span class="faint">' + esc(x.pos + ' · ' + x.src) + '</span>' + (st.taken[k] ? ' <i>taken</i>' : '') +
            ' <button class="btn sm ghost" data-qmove="' + i + '" data-dir="-1" aria-label="Move up">↑</button><button class="btn sm ghost" data-qmove="' + i + '" data-dir="1" aria-label="Move down">↓</button><button class="btn sm ghost" data-star="' + esc(k) + '" aria-label="Remove">✕</button></li>';
        }).join('') + '</ol>' : '<p class="small muted">Empty. Star (☆) players in the list to add them.</p>') + '</div>';
      el.innerHTML = h;

      if (!done) {
        var avail = st.pool.filter(function (x) { return !st.taken[x.key]; });
        ui.table(U.qs('#mk-avail', el), {
          rows: avail, sort: 'v', page: 40, search: function (x) { return x.name + ' ' + x.team; }, maxH: 560,
          filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (x, v) { return x.pos === v; } }],
          cols: [{ k: 'q', l: '', v: null, f: function (x) { return me ? '<button class="btn sm ghost" data-star="' + esc(x.key) + '" title="' + (qset[x.key] ? 'In your queue: click to remove' : 'Add to your queue') + '" aria-label="Queue">' + (qset[x.key] ? '★' : '☆') + '</button>' : ''; } },
            { k: 'name', l: 'Player', v: function (x) { return x.name; }, f: function (x) {
              var y = x.x, mv = y ? moveHtml(y.m.pre) : '';
              return '<a class="plink" href="' + esc(x.href) + '">' + esc(x.name) + '</a> <span class="faint small">' + esc(x.pos) + '</span>' + (y && y.news.length ? ' <span title="' + y.news.length + ' headlines">📰</span>' : '') +
                '<br><span class="faint small">' + esc(x.team || '') + (y && y.s ? ' · ' + esc(line(y.s)) : '') + '</span>' + (y ? '<br><span class="small">' + esc(x.src) + ' ' + mv + '</span>' : '<br><span class="small muted">' + esc(x.src) + '</span>'); } },
            { k: 'v', l: 'Value', cls: 'num', v: function (x) { return x.v; }, f: function (x) { return U.fmt(x.v, 1); } },
            oNext ? { k: 'o', l: 'Still there at ' + DP.pickLabel(odds.picks[0] + 1), cls: 'num', title: 'Share of ' + odds.N + ' simulated drafts in which he is still there at your next pick (if you pass on him now)', v: function (x) { return (oNext[x.key] || 0) / odds.N; }, f: function (x) { var p = (oNext[x.key] || 0) / odds.N; return '<span class="' + (p >= 0.6 ? 'good' : p < 0.2 ? 'bad' : '') + '">' + U.pct(p) + '</span>'; } } : null,
            { k: 'go', l: '', v: null, f: function (x) { return onClock.owner === me ? '<button class="btn sm primary" data-draft="' + esc(x.key) + '">Draft</button>' : ''; } }]
        });
      }
      U.qs('#mk-log', el).innerHTML = '<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table class="t"><thead><tr><th class="num">Pick</th><th>Team</th><th>Player</th><th class="num">Value</th></tr></thead><tbody>' + st.order.map(function (o, i) {
        var l = st.log[i], mine = o.owner === me;
        return '<tr class="' + (mine ? 'mine' : '') + '"><td class="num">' + DP.pickLabel(i + 1) + '</td><td>' + esc(o.owner) + (o.orig !== o.owner ? ' <span class="faint small">(' + esc(o.orig) + ')</span>' : '') + '</td><td>' + (l ? '<a class="plink" href="' + esc(l.x.href) + '">' + esc(l.x.name) + '</a> <span class="faint small">' + esc(l.x.pos) + '</span>' : (i === st.i ? '<b>on the clock</b>' : '')) + '</td><td class="num">' + (l ? U.fmt(l.x.v, 1) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

      U.qs('#mk-team', el).addEventListener('change', function (e) { DP.go('mock', null, { team: e.target.value || 'none' }); });
      U.qs('#mk-new', el).addEventListener('click', function () { mockState.v = -1; DP.render(); });
      var au = U.qs('#mk-auto', el); if (au) au.addEventListener('click', function () { st.auto = true; mockRun(st); DP.render(); });
      var od = U.qs('#mk-odds', el); if (od) od.addEventListener('click', function () {
        U.qs('#mk-msg', el).textContent = 'Simulating 500 drafts…';
        setTimeout(function () { st.odds = oddsFrom(st, 500); DP.render(); }, 30);
      });
      var cp = U.qs('#mk-copy', el); if (cp) cp.addEventListener('click', function () { U.copy(shareText(st, me), 'Mock results copied. Paste them in the league chat.'); });
      el.addEventListener('click', function (e) {
        var s = e.target.closest('[data-star]');
        if (s && me) { var q = queueOf(me), k = s.dataset.star, i = q.indexOf(k); if (i >= 0) q.splice(i, 1); else q.push(k); U.store.set('mockq_' + me, q); st.odds = null; DP.render(); return; }
        var mvb = e.target.closest('[data-qmove]');
        if (mvb && me) { var q2 = queueOf(me), a = +mvb.dataset.qmove, b = a + (+mvb.dataset.dir); if (b >= 0 && b < q2.length) { var t = q2[a]; q2[a] = q2[b]; q2[b] = t; U.store.set('mockq_' + me, q2); st.odds = null; DP.render(); } return; }
        var d = e.target.closest('[data-draft]'); if (!d) return;
        var x = st.pool.filter(function (y) { return y.key === d.dataset.draft; })[0]; if (!x || st.taken[x.key] || !st.order[st.i]) return;
        st.taken[x.key] = 1; st.log.push({ slot: st.order[st.i], x: x }); st.i++; st.odds = null; mockRun(st); DP.render();
      });
    }
  };
  // your picks: projected slot range, and (after "Odds at my picks") who is likely still there at each
  function picksCard(st, me, odds) {
    var E = DP.E, mine = [], n = E.teams.length, mnr = E.rosters[me] ? E.rosters[me].filter(function (p) { return p.ct === 'MNR'; }) : [];
    st.order.forEach(function (o, i) { if (o.owner === me) mine.push(i); });
    var cnt = { F: 0, D: 0, G: 0 }; mnr.forEach(function (p) { cnt[p.slot] = (cnt[p.slot] || 0) + 1; });
    var range = function (orig) {
      var d = E.slotDist(orig); if (!d) return '';
      var c = 0, lo = null, hi = null; d.forEach(function (p, k) { c += p; if (lo === null && c >= 0.1) lo = k + 1; if (hi === null && c >= 0.9) hi = k + 1; });
      return lo === hi ? '' : ' <span class="faint small">(slot ' + lo + '–' + hi + ' in 80% of season sims)</span>';
    };
    var h = '<div class="card" style="margin-bottom:14px"><h2>' + esc(U.teamName(me)) + ': picks and needs</h2><p class="small">' + (mine.length ? mine.map(function (i) {
      var o = st.order[i], l = st.log[i];
      return '<b>' + DP.pickLabel(i + 1) + '</b>' + (o.orig !== me ? ' <span class="faint">(' + esc(o.orig) + '\'s)</span>' : '') + range(o.orig) + (l ? ' → <a class="plink" href="' + esc(l.x.href) + '">' + esc(l.x.name) + '</a>' : '');
    }).join(' · ') : 'No 2027 picks (traded away).') + '</p><p class="small muted">MNR pipeline: ' + cnt.F + ' F · ' + cnt.D + ' D · ' + cnt.G + ' G. The model\'s GMs lean toward D with fewer than 5 and G with fewer than 2 in the pipeline.</p>';
    if (odds && !odds.picks.length) h += '<p class="small muted">No more picks after this one.</p>';
    if (odds && odds.picks.length) {
      h += '<div class="grid g' + Math.min(3, odds.picks.length) + '">' + odds.picks.slice(0, 3).map(function (j, mi) {
        var c = odds.cnt[mi], list = st.pool.filter(function (x) { return !st.taken[x.key] && (c[x.key] || 0) / odds.N >= 0.25; }).slice(0, 6);
        var gone = st.pool.filter(function (x) { return !st.taken[x.key] && (c[x.key] || 0) / odds.N < 0.1; }).slice(0, 3);
        return '<div><h3 class="small">At ' + DP.pickLabel(j + 1) + '</h3><ul class="list-plain small">' + (list.map(function (x) { return '<li><a class="plink" href="' + esc(x.href) + '">' + esc(x.name) + '</a> <span class="faint">' + esc(x.pos) + '</span> <b>' + U.pct((c[x.key] || 0) / odds.N) + '</b></li>'; }).join('') || '<li class="muted">nobody above 25%</li>') + '</ul>' +
          (gone.length ? '<p class="small faint">Likely gone: ' + gone.map(function (x) { return esc(x.name); }).join(', ') + '</p>' : '') + '</div>';
      }).join('') + '</div><p class="small muted">' + odds.N + ' simulated drafts from this point, in the order above: the share in which each player is still there at each of your next picks' + (st.order[st.i] && st.order[st.i].owner === me ? ' if you pass on him now' : '') + ' (your own picks follow your queue, then best value).</p>';
    }
    return h + '</div>';
  }
  // grades: value drafted vs the curve's value of the slots each team picked at
  function gradesHtml(st, me) {
    var E = DP.E, c = E.pickCurve(), g = {};
    st.log.forEach(function (l, i) { var t = l.slot.owner, o = g[t] = g[t] || { t: t, v: 0, exp: 0, list: [] }; o.v += l.x.v; o.exp += c[Math.min(c.length - 1, i)]; o.list.push(l); });
    var rows = Object.keys(g).map(function (k) { var o = g[k]; o.d = o.v - o.exp; return o; }).sort(function (a, b) { return b.d - a.d; });
    rows.forEach(function (o, i) { o.grade = ui.gradeOf(1 - i / Math.max(1, rows.length - 1)); });
    var mine = g[me];
    return (mine ? '<p>Your haul: ' + mine.list.map(function (l) { return '<b>' + DP.pickLabel(st.log.indexOf(l) + 1) + '</b> <a class="plink" href="' + esc(l.x.href) + '">' + esc(l.x.name) + '</a> <span class="faint small">' + esc(l.x.pos) + '</span>'; }).join(' · ') + '</p>' : '') +
      '<div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th>Grade</th><th class="num">Value drafted</th><th class="num">vs slot value</th><th>Picks</th></tr></thead><tbody>' + rows.map(function (o) {
        return '<tr class="' + (o.t === me ? 'mine' : '') + '"><td><b>' + esc(o.t) + '</b></td><td><b>' + o.grade + '</b></td><td class="num">' + U.fmt(o.v, 1) + '</td><td class="num">' + ui.delta(o.d, 1) + '</td><td class="small">' + o.list.map(function (l) { return esc(l.x.name); }).join(', ') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Grade = value drafted minus what the league\'s 2026 rookie-draft curve says those slots are worth, ranked across teams.</p>';
  }
  function shareText(st, me) {
    var out = ['Dynasty Puck 2027 mock draft (' + U.date(new Date()) + ', Dynasty Puck HQ)'];
    st.log.forEach(function (l, i) { out.push(DP.pickLabel(i + 1) + ' ' + l.slot.owner + (l.slot.orig !== l.slot.owner ? ' (from ' + l.slot.orig + ')' : '') + ': ' + l.x.name + ' (' + l.x.pos + (l.x.team ? ', ' + l.x.team : '') + ')' + (l.slot.owner === me ? '  <- mine' : '')); });
    return out.join('\n');
  }
})();
