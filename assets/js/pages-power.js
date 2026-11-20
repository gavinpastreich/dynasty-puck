/* Dynasty Puck HQ - Power Rankings: a weekly ranking with movement and an auto-written line for every team, all from
   the site's numbers. Score = 45% season all-play (share of the league each team's weekly categories beat) + 25% the
   last three weeks' all-play + 30% rest-of-season projected strength (category z-scores of today's rosters, as a
   rank percentile). Movement compares with the same formula through the week before (projection part held at
   today's rosters, so movement comes from results). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var W_SEASON = 0.45, W_RECENT = 0.25, W_PROJ = 0.30, RECENT = 3;

  function ap(w, t) { var a = w.ap && w.ap[t]; return a ? DP.E.sum(a) / a.length : null; }
  function projPct() {
    var E = DP.E, P = E.teamCats(null, E.openFrom()), m = {};
    E.teams.forEach(function (t) { m[t] = E.sum(P.z[t]) / P.z[t].length; });
    var order = E.teams.slice().sort(function (a, b) { return m[b] - m[a]; }), out = {};
    order.forEach(function (t, i) { out[t] = { pct: 1 - i / (order.length - 1), rank: i + 1, z: m[t] }; });
    return out;
  }
  // rankings after week n (weeks 1..n played)
  DP.powerAfter = function (n, proj) {
    var E = DP.E, H = E.history(), wk = H.weeks.filter(function (w) { return w.n <= n && w.games && w.games.length; });
    if (!wk.length) return null;
    proj = proj || projPct();
    var rows = E.teams.map(function (t) {
      var all = wk.map(function (w) { return ap(w, t); }).filter(function (x) { return x !== null; }), rec = all.slice(-RECENT);
      var sA = all.length ? E.sum(all) / all.length : 0.5, sR = rec.length ? E.sum(rec) / rec.length : sA;
      return { t: t, season: sA, recent: sR, proj: proj[t].pct, projRank: proj[t].rank, score: W_SEASON * sA + W_RECENT * sR + W_PROJ * proj[t].pct };
    }).sort(function (a, b) { return b.score - a.score; });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    var rk = function (k) { rows.slice().sort(function (a, b) { return b[k] - a[k]; }).forEach(function (r, i) { r[k + 'Rank'] = i + 1; }); };
    rk('season'); rk('recent');
    return { n: n, rows: rows, by: rows.reduce(function (o, r) { o[r.t] = r; return o; }, {}) };
  };
  // one auto-written line per team: last week's result, form, the week's standout and moves, what's next
  DP.powerBlurb = function (t, n, P, prev, W) {
    var E = DP.E, H = E.history(), w = H.weeks.filter(function (x) { return x.n === n; })[0], r = P.by[t], bits = [];
    var g = w && w.games.filter(function (x) { return x.a === t || x.b === t; })[0];
    if (g) {
      var me = g.a === t ? g.sa : g.sb, op = g.a === t ? g.b : g.a, res = me.W > me.L ? 'Beat' : me.W < me.L ? 'Lost to' : 'Tied';
      bits.push(res + ' ' + esc(U.teamName(op)) + ' ' + me.W + '-' + me.L + (me.T ? '-' + me.T : '') + '.');
    }
    var a = w && ap(w, t);
    if (a !== null && a !== undefined) bits.push('Week ' + n + ' all-play ' + U.pct(a) + (a >= 0.65 ? ' (a big week)' : a <= 0.35 ? ' (a rough week)' : '') + '.');
    if (W && W.teams && W.teams[t]) {
      var T = W.teams[t], best = null;
      Object.keys(T.pl || {}).forEach(function (id) { var p = E.byId[id], l = T.pl[id]; if (!p || p.G) return; var s = 2 * l[1] + l[2]; if (!best || s > best.s) best = { p: p, s: s, l: l }; });
      if (best && best.s >= 5) bits.push(ui.plink(best.p) + ' led the way (' + best.l[1] + ' G, ' + best.l[2] + ' A).');
    }
    if (r.recentRank <= 3 && P.rows.length > 6) bits.push('Top-3 form over the last ' + RECENT + ' weeks.');
    else if (r.recentRank >= P.rows.length - 2) bits.push('Bottom-3 form over the last ' + RECENT + ' weeks.');
    if (prev && prev.by[t]) { var d = prev.by[t].rank - r.rank; if (Math.abs(d) >= 3) bits.push(d > 0 ? 'Up ' + d + ' spots.' : 'Down ' + (-d) + ' spots.'); }
    var nx = DP.meta.h2h.filter(function (m) { return m[0] === n + 1 && (m[1] === t || m[2] === t); })[0];
    if (nx && E.baseline && E.baseline[t] && E.weeks[n]) {
      var o = nx[1] === t ? nx[2] : nx[1], pr = E.matchupProbs(E.baseline[t][n], E.baseline[o][n]), ex = E.sum(pr.map(function (x) { return x.w + x.t / 2; }));
      bits.push('Next: ' + esc(U.teamName(o)) + ' (projected ' + U.fmt(ex, 1) + ' of 15 categories).');
    }
    return bits.join(' ');
  };

  DP.pages.power = {
    title: 'Power Rankings',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, H = E.history(), done = H.weeks.filter(function (w) { return w.games && w.games.length; });
      var h = '<div class="page-head"><h1>⚡ Power Rankings</h1><p class="sub">Every team ranked after each week, with movement and a line on each, all from the site\'s numbers: 45% season all-play strength (the share of the league each team\'s weekly categories beat), 25% the last ' + RECENT + ' weeks, 30% rest-of-season projected strength of today\'s roster. A model, not an opinion (see Rules & Methods).</p></div>';
      if (!done.length) { el.innerHTML = h + '<div class="callout">Power rankings start after week 1.</div>'; return; }
      var n = +hsh.q.w || done[done.length - 1].n; if (!done.some(function (w) { return w.n === n; })) n = done[done.length - 1].n;
      var proj = projPct(), P = DP.powerAfter(n, proj), prev = n > 1 ? DP.powerAfter(n - 1, proj) : null;
      h += '<div class="controls"><label>After <select id="pw-w">' + done.slice().reverse().map(function (w) { return '<option value="' + w.n + '"' + (w.n === n ? ' selected' : '') + '>Week ' + w.n + '</option>'; }).join('') + '</select></label><button class="btn sm" id="pw-img">🖼️ Share as image</button><button class="btn sm" id="pw-copy">📋 Copy for the chat</button></div>';
      h += '<div class="card flush"><ol class="list-plain pwlist">' + P.rows.map(function (r) {
        var d = prev && prev.by[r.t] ? prev.by[r.t].rank - r.rank : 0;
        var mv = !prev ? '' : d > 0 ? '<span class="good">▲' + d + '</span>' : d < 0 ? '<span class="bad">▼' + (-d) + '</span>' : '<span class="faint">–</span>';
        var rec = DP._weekly && DP._weekly.standingsAfter ? DP._weekly.standingsAfter(H, n).by[r.t] : null;
        return '<li class="' + (r.t === me ? 'mine' : '') + '" style="--tc:' + U.teamColor(r.t) + '"><span class="pw-rk num">' + r.rank + '</span><span class="pw-mv small">' + mv + '</span>' +
          '<div class="pw-body"><div class="pw-top">' + U.teamChip(r.t, { link: 1, b: 1 }) + (rec ? '<span class="small muted num">' + rec.W + '-' + rec.L + '-' + rec.T + '</span>' : '') +
          '<span class="small muted" style="margin-left:auto" title="Season all-play · last ' + RECENT + ' weeks · rest-of-season projection rank">season ' + U.pct(r.season) + ' · last ' + RECENT + ' ' + U.pct(r.recent) + ' · proj ' + U.ord(r.projRank) + '</span></div>' +
          '<div class="pw-blurb small" data-blurb="' + esc(r.t) + '">' + DP.powerBlurb(r.t, n, P, prev, null) + '</div></div></li>';
      }).join('') + '</ol></div>';
      el.innerHTML = h;
      U.qs('#pw-w', el).addEventListener('change', function (e) { DP.go('power', null, { w: e.target.value }); });
      // the week's standouts need the week's player lines
      if (DP.loadWeek) DP.loadWeek(n, function (W) { if (!W) return; U.qsa('[data-blurb]', el).forEach(function (b) { b.innerHTML = DP.powerBlurb(b.dataset.blurb, n, P, prev, W); }); });
      var mvTxt = function (r) { var d = prev && prev.by[r.t] ? prev.by[r.t].rank - r.rank : 0; return !prev ? '' : d > 0 ? ' (▲' + d + ')' : d < 0 ? ' (▼' + (-d) + ')' : ' (–)'; };
      U.qs('#pw-copy', el).addEventListener('click', function () {
        var txt = 'Dynasty Puck power rankings after week ' + n + '\n' + P.rows.map(function (r) { var b = U.qs('[data-blurb="' + r.t + '"]', el); return r.rank + '. ' + U.teamName(r.t) + mvTxt(r) + (b ? ': ' + b.textContent : ''); }).join('\n') + '\n' + location.href;
        U.copy(txt, 'Power rankings copied. Paste them in the league chat.');
      });
      U.qs('#pw-img', el).addEventListener('click', function () {
        DP.shareCard({ title: 'Power Rankings · Week ' + n, sub: 'season all-play 45% · last ' + RECENT + ' weeks 25% · projection 30%', rows: P.rows.map(function (r) { return { kind: 'team', t: r.t, text: r.rank + '. ' + U.teamName(r.t) + mvTxt(r), right: U.pct(r.season) + ' all-play' }; }), foot: ((DP.meta.alerts || {}).siteUrl || '') + '#/power?w=' + n }, 'dynasty-puck-power-' + n + '.png');
      });
    }
  };
})();
