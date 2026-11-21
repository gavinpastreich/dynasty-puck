/* Dynasty Puck HQ - Aging Curves: how production in each of our categories changes with age, from four NHL seasons
   (data/aging.js, built nightly by tools/build_data.py write_aging). The delta method: every skater with two straight
   seasons of 20+ GP gives one pair; his per-game rates (relative to the league's that season, so scoring trends and
   stat-keeping changes cancel out) in the second season over the first, weighted by the harmonic mean of the two GPs,
   averaged by position and age. The log ratios are smoothed over neighbouring ages (weights 1-2-1 times the number of
   pairs) and chained into a curve, scaled so the peak = 100. Ages need 8+ pairs. Players who leave the NHL can't give a
   second season, so decline is understated (survivor bias). Compared with the curve the dynasty values use (E.AGE). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var MIN_N = 8;
  var LAB = { pts: 'Points', g: 'Goals', a: 'Assists', pim: 'PIM', sog: 'SOG', stp: 'STP', hit: 'Hits', blk: 'Blocks', tk: 'Takeaways', toi: 'Ice time' };
  DP.AGING_LAB = LAB;

  DP.loadAging = function (done) {
    if (DP.aging) return done(DP.aging);
    var s = document.createElement('script');
    s.src = 'data/aging.js';
    s.onload = function () { done(DP.aging || null); }; s.onerror = function () { done(null); };
    document.head.appendChild(s);
  };

  // { F: {ages, n, cur: {key: {age: 0..1}}, peak: {key: age}, step: {key: {age: ratio age -> age+1}}}, D: ... }
  DP.agingCurves = function (A) {
    if (!A) return null;
    if (A._c) return A._c;
    var out = {};
    ['F', 'D'].forEach(function (pos) {
      var T = A[pos] || {}, ages = Object.keys(T).map(Number).filter(function (a) { return T[a].n >= MIN_N; }).sort(function (a, b) { return a - b; });
      // the longest run of consecutive ages
      var best = [], run = [];
      ages.forEach(function (a) { if (run.length && a !== run[run.length - 1] + 1) run = []; run.push(a); if (run.length > best.length) best = run.slice(); });
      ages = best;
      var o = { ages: ages.concat(ages.length ? [ages[ages.length - 1] + 1] : []), n: {}, cur: {}, peak: {}, step: {} };
      ages.forEach(function (a) { o.n[a] = T[a].n; });
      A.keys.forEach(function (k, i) {
        var lr = {}, sm = {};
        ages.forEach(function (a) { var t = T[a]; lr[a] = t.a[i] > 0 && t.b[i] > 0 ? Math.log(t.b[i] / t.a[i]) : 0; });
        ages.forEach(function (a) {
          var s = 0, w = 0;
          [[a - 1, 1], [a, 2], [a + 1, 1]].forEach(function (x) { if (lr[x[0]] !== undefined) { var ww = x[1] * T[x[0]].n; s += ww * lr[x[0]]; w += ww; } });
          sm[a] = w ? s / w : 0;
        });
        var c = 0, cur = {}, st = {};
        if (ages.length) cur[ages[0]] = 0;
        ages.forEach(function (a) { c += sm[a]; cur[a + 1] = c; st[a] = Math.exp(sm[a]); });
        var mx = -1e9, pk = null;
        Object.keys(cur).forEach(function (a) { if (cur[a] > mx) { mx = cur[a]; pk = +a; } });
        Object.keys(cur).forEach(function (a) { cur[a] = Math.exp(cur[a] - mx); });
        o.cur[k] = cur; o.peak[k] = pk; o.step[k] = st;
      });
      out[pos] = o;
    });
    A._c = out;
    return out;
  };

  // the model's own curve (E.AGE, WAR multiplier, peak = 1) at whole ages
  function modelCurve(pos, ages) { var E = DP.E, sl = pos === 'D' ? 'D' : 'F'; return ages.map(function (a) { return E.ageMult(sl, a); }); }

  // average change next season for a skater of this position and age: {age, k: ratio} (null outside the data)
  DP.agingNext = function (p, Cv) {
    if (!p || p.G || !p.age || !Cv) return null;
    var o = Cv[p.pos === 'D' ? 'D' : 'F'], a = Math.floor(p.age); if (!o || !o.step.pts || o.step.pts[a] === undefined) return null;
    var r = { age: a }; Object.keys(o.step).forEach(function (k) { r[k] = o.step[k][a]; });
    return r;
  };

  // player page / card: what a typical skater of his position and age does next season, filled once data/aging.js loads
  DP.fillAgeOutlook = function (root) {
    if (!root) return;
    U.qsa('[data-ageout]', root).forEach(function (box) {
      var p = DP.E.byId[box.dataset.ageout]; if (!p || box.dataset.done) return; box.dataset.done = '1';
      DP.loadAging(function (A) {
        var nx = DP.agingNext(p, DP.agingCurves(A)); if (!nx || !document.body.contains(box)) return;
        var sl = p.pos === 'D' ? 'D' : 'F', m = DP.E.ageMult(sl, nx.age + 1) / DP.E.ageMult(sl, nx.age);
        var f = function (k) { var d = (nx[k] - 1) * 100; return esc(LAB[k].toLowerCase().replace('pim', 'PIM').replace('sog', 'SOG')) + ' <b class="' + (d >= 3 ? 'good' : d <= -3 ? 'bad' : '') + '">' + (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(0) + '%</b>'; };
        box.innerHTML = '<span class="pct-k">📉 Age outlook</span> From ' + nx.age + ' to ' + (nx.age + 1) + ', a typical ' + (sl === 'D' ? 'defenseman' : 'forward') + ': ' + ['g', 'a', 'sog', 'hit', 'blk'].map(f).join(', ') + ' a game (four NHL seasons of data); the dynasty values assume ' + (m >= 1 ? '+' : '−') + Math.abs((m - 1) * 100).toFixed(0) + '%. <a href="#/aging' + (sl === 'D' ? '?pos=D' : '') + '">Aging Curves →</a>';
        box.classList.add('on');
      });
    });
  };
  var pctCell = function (r) { if (r === undefined || r === null) return '<span class="faint">–</span>'; var d = (r - 1) * 100; return '<span class="' + (d >= 3 ? 'good' : d <= -3 ? 'bad' : 'muted') + '">' + (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(0) + '%</span>'; };

  DP.pages.aging = {
    title: 'Aging Curves',
    render: function (el, hsh) {
      var q = hsh.q, pos = q.pos === 'D' ? 'D' : 'F', me = DP.state.team;
      var h = '<div class="page-head"><h1>📉 Aging Curves</h1><p class="sub">When do players peak in each of our categories, and how fast do they fall off? Built from every NHL skater with two straight seasons of 20+ games over the last four seasons, compared with the curve the dynasty values use. Goals, assists and the banger stats age differently, and that matters when you trade for a 29-year-old.</p></div>';
      h += '<div class="controls"><div class="seg" role="group" aria-label="Position"><button data-pos="F" class="' + (pos === 'F' ? 'on' : '') + '">Forwards</button><button data-pos="D" class="' + (pos === 'D' ? 'on' : '') + '">Defense</button></div></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading four seasons of NHL data…</p></div>';
      U.qsa('[data-pos]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('aging', null, { pos: b.dataset.pos === 'D' ? 'D' : undefined }); }); });
      DP.loadAging(function (A) {
        var box = U.qs('.lz', el); if (!box) return;
        var CV = DP.agingCurves(A);
        if (!CV || !CV[pos].ages.length) { box.innerHTML = '<div class="callout">The aging data arrives with the next nightly update.</div>'; return; }
        var o = CV[pos], ages = o.ages, labs = ages.map(String), C = DP.C, model = modelCurve(pos, ages);
        var ser = function (k, color, dash) { return { name: LAB[k], values: ages.map(function (a) { return o.cur[k][a] === undefined ? null : +(o.cur[k][a] * 100).toFixed(1); }), color: color, dash: dash, dots: false }; };
        var mser = { name: 'Dynasty value model', values: model.map(function (x) { return +(x * 100).toFixed(1); }), color: 'var(--muted)', dash: true, dots: false };
        var opt = function (t) { return { height: 220, title: t, min: 20, max: 105, zero: false, fmt: function (v) { return Math.round(v) + '% of peak'; }, tickFmt: function (t) { return t + '%'; } }; };
        // findings, read off the curves
        var at = function (k, a) { return o.cur[k][a] === undefined ? null : Math.round(o.cur[k][a] * 100); };
        var late = ['hit', 'blk', 'pim'].sort(function (x, y) { return (at(y, 32) || 0) - (at(x, 32) || 0); });
        var hh = '<div class="callout info"><b>' + (pos === 'D' ? 'Defensemen' : 'Forwards') + '</b>: goals peak at <b>' + o.peak.g + '</b>, assists at <b>' + o.peak.a + '</b>, points at <b>' + o.peak.pts + '</b>. At 32 a typical ' + (pos === 'D' ? 'defenseman' : 'forward') + ' keeps about ' + at('g', 32) + '% of his peak goals and ' + at('a', 32) + '% of his assists, but ' + at(late[0], 32) + '% of his ' + esc(/^[A-Z]+$/.test(LAB[late[0]]) ? LAB[late[0]] : LAB[late[0]].toLowerCase()) + ' (peak ' + o.peak[late[0]] + '). The dynasty values assume ' + Math.round(DP.E.ageMult(pos === 'D' ? 'D' : 'F', 32) * 100) + '% of peak value at 32.</div>';
        hh += '<div class="grid g2"><div class="card"><h3>Scoring</h3>' + C.lines(labs, [ser('g', 'var(--s1)'), ser('a', 'var(--s2)'), ser('sog', 'var(--s3)'), ser('stp', 'var(--s4)'), mser], opt('Scoring categories by age')) + '</div>' +
          '<div class="card"><h3>Banger stats and ice time</h3>' + C.lines(labs, [ser('hit', 'var(--s1)'), ser('blk', 'var(--s2)'), ser('pim', 'var(--s3)'), ser('tk', 'var(--s4)'), ser('toi', 'var(--s5)'), mser], opt('Banger categories and ice time by age')) + '</div></div>';
        // heatmap
        var keys = A.keys;
        hh += '<div class="card flush" style="margin-top:14px"><h3 style="padding:12px 14px 0">Every category, % of peak by age</h3><div class="tbl-wrap"><table class="t small olk"><thead><tr><th>Category</th><th class="num">Peak</th>' + ages.map(function (a) { return '<th class="num">' + a + '</th>'; }).join('') + '</tr></thead><tbody>' +
          keys.map(function (k) { return '<tr><td class="nw">' + esc(LAB[k]) + '</td><td class="num"><b>' + o.peak[k] + '</b></td>' + ages.map(function (a) { var v = o.cur[k][a]; return v === undefined ? '<td></td>' : '<td class="olc" style="--v:' + v.toFixed(2) + '">' + Math.round(v * 100) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '<tr><td class="nw muted">Dynasty value model</td><td class="num muted">' + ages.filter(function (a, i) { return model[i] >= 0.999; })[0] + '</td>' + model.map(function (v) { return '<td class="olc" style="--v:' + v.toFixed(2) + '">' + Math.round(v * 100) + '</td>'; }).join('') + '</tr>' +
          '<tr><td class="nw faint">Season pairs</td><td></td>' + ages.map(function (a) { return '<td class="num faint">' + (o.n[a] || '') + '</td>'; }).join('') + '</tr></tbody></table></div></div>';
        if (DP.ageDriftCard) hh += DP.ageDriftCard(CV, me);
        // veterans next season
        if (me && DP.E.rosters[me]) {
          var vets = DP.E.rosters[me].filter(function (p) { return !p.G && p.age >= 27; }).map(function (p) { return { p: p, nx: DP.agingNext(p, CV) }; }).filter(function (x) { return x.nx; }).sort(function (a, b) { return b.p.DV - a.p.DV; });
          if (vets.length) {
            var VK = ['g', 'a', 'sog', 'hit', 'blk', 'pim', 'toi'];
            hh += '<div class="card flush" style="margin-top:14px"><h3 style="padding:12px 14px 0">' + esc(U.teamName(me)) + ': your veterans next season</h3><div class="hint" style="padding:0 14px">The average change from this age to the next for a player of his position, per game (data above), next to the change the dynasty values assume. A typical player, not a projection for him.</div><div class="tbl-wrap"><table class="t small"><thead><tr><th>Player</th><th class="num">Age</th>' + VK.map(function (k) { return '<th class="num">' + esc(LAB[k]) + '</th>'; }).join('') + '<th class="num">Model</th></tr></thead><tbody>' +
              vets.map(function (x) { var sl = x.p.pos === 'D' ? 'D' : 'F', m = DP.E.ageMult(sl, x.nx.age + 1) / DP.E.ageMult(sl, x.nx.age); return '<tr><td>' + ui.pcell(x.p, { pos: 1 }) + '</td><td class="num">' + x.nx.age + '</td>' + VK.map(function (k) { return '<td class="num">' + pctCell(x.nx[k]) + '</td>'; }).join('') + '<td class="num">' + pctCell(m) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
          }
        }
        hh += '<p class="small muted">Method: ' + A.players + ' skaters, seasons ' + esc(U.season(A.seasons[0])) + ' to ' + esc(U.season(A.seasons[A.seasons.length - 1])) + '. For every player with two straight seasons of ' + A.minGP + '+ games, his per-game rate in each category, relative to the league\'s that season (so league-wide changes don\'t look like aging), second season over first, weighted by the two seasons\' games; averaged by position and age on Dec 31; smoothed over neighbouring ages and chained into a curve (peak = 100; ages need ' + MIN_N + '+ pairs). Players who drop out of the NHL never give a second season, so the decline is if anything understated. STP for defensemen is a small sample. Corsi is left out (it can be negative). The dashed line is the age curve the dynasty values use (Rules &amp; Methods).</p>';
        box.innerHTML = hh;
      });
    }
  };
})();
