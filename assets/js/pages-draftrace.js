/* Dynasty Puck HQ - Draft Race: the race for the top of the 2027 league draft. The league draft runs in reverse order of
   finish (non-playoff teams worst record first, then playoff teams by the round they went out, the champion last), so the
   season simulation's draft-slot odds (E.baseSim, 1,500 seasons) give every team's chance at each pick. A pick's value
   = the slot odds x the pick curve (dynasty value of the league's 2026 draft by slot), the same formula as E.pickValue
   (model lens). "What a win costs": the team's next matchup is simulated as a win and as a loss (E.simSeason with
   force, common random numbers, 1,500 seasons each), and the playoff odds and the value of its own 2027 picks
   compared. A model estimate, not a recommendation to lose. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var N = 1500, SEED = 9091, YEAR = 2027;

  // value of a YEAR pick of `round` whose original team has draft-slot odds d (same as E.pickValue, model lens)
  DP.slotPickValue = function (d, round) {
    var E = DP.E, c = E.pickCurve(), n = E.teams.length, L = E.LENS_MODEL, v = 0;
    for (var k = 0; k < n; k++) v += (d ? d[k] : 1 / n) * c[Math.max(0, Math.min(c.length - 1, (round - 1) * n + k))];
    return v * Math.pow(L.disc, Math.max(0, YEAR - 2026)) * L.pick;
  };
  var expSlot = function (d) { return d.reduce(function (a, x, k) { return a + x * (k + 1); }, 0); };

  DP.draftRaceData = function (sim) {
    var E = DP.E, picks = (DP.league.picks || []).filter(function (p) { return p.year === YEAR; }), act = E.actual();
    var rows = sim.map(function (r) {
      var own = picks.filter(function (p) { return p.orig === r.t; }).sort(function (a, b) { return a.round - b.round; });
      var vals = own.map(function (p) { return { pk: p, v: DP.slotPickValue(r.slot, p.round) }; });
      return { t: r.t, slot: r.slot, exp: expSlot(r.slot), p1: r.slot[0], top3: r.slot[0] + r.slot[1] + r.slot[2], po: r.po, champ: r.champ,
        rec: act && !act.odd && act.rec[r.t] ? act.rec[r.t] : null, own: vals, r1: vals.filter(function (x) { return x.pk.round === 1; })[0] || null,
        tot: E.sum(vals.map(function (x) { return x.v; })) };
    }).sort(function (a, b) { return a.exp - b.exp; });
    // who holds the tickets: every YEAR pick's value, by its current owner
    var hold = {};
    E.teams.forEach(function (t) { hold[t] = { t: t, v: 0, picks: [] }; });
    var by = {}; rows.forEach(function (r) { by[r.t] = r; });
    picks.forEach(function (p) { if (!hold[p.owner] || !by[p.orig]) return; var v = DP.slotPickValue(by[p.orig].slot, p.round); hold[p.owner].v += v; hold[p.owner].picks.push({ pk: p, v: v, exp: by[p.orig].exp }); });
    var holders = Object.keys(hold).map(function (k) { var o = hold[k]; o.picks.sort(function (a, b) { return a.pk.round - b.pk.round || a.exp - b.exp; }); return o; }).sort(function (a, b) { return b.v - a.v; });
    return { rows: rows, by: by, holders: holders };
  };

  // the team's next matchup as a win and as a loss: {wk, opp, win: {po, ch, exp, val}, loss: {...}} (null when none left)
  DP.winCost = function (t, n) {
    var E = DP.E, wks = DP.scenarioWeeks ? DP.scenarioWeeks() : [], wk = wks[0]; if (!wk) return null;
    var g = DP.meta.h2h.filter(function (x) { return x[0] === wk && (x[1] === t || x[2] === t); })[0]; if (!g) return null;
    var key = wk + '|' + g[1] + '|' + g[2], sideA = g[1] === t, out = { wk: wk, opp: sideA ? g[2] : g[1] };
    var picks = (DP.league.picks || []).filter(function (p) { return p.year === YEAR && p.orig === t; });
    [['win', sideA ? 1 : -1], ['loss', sideA ? -1 : 1]].forEach(function (x) {
      var f = {}; f[key] = x[1];
      var r = E.simSeason({ n: n || N, seed: SEED, force: f }).filter(function (y) { return y.t === t; })[0];
      out[x[0]] = { po: r.po, ch: r.champ, exp: expSlot(r.slot), p1: r.slot[0], val: E.sum(picks.map(function (p) { return DP.slotPickValue(r.slot, p.round); })) };
    });
    out.picks = picks;
    return out;
  };

  var heat = function (d) {
    return '<span class="dr-heat" aria-hidden="true">' + d.map(function (x, k) { return '<i style="--v:' + Math.min(1, x * 2.2).toFixed(2) + '" title="Pick ' + (k + 1) + ': ' + U.pct(x, 1) + '"></i>'; }).join('') + '</span>';
  };

  DP.pages.draftrace = {
    title: 'Draft Race',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, q = hsh.q;
      var h = '<div class="page-head"><h1>🏁 Draft Race</h1><p class="sub">The race for the top of the ' + YEAR + ' league draft. Our draft runs in reverse order of finish (the worst record picks first, the champion last), so every loss moves a team up. Each team\'s chance at every pick comes from the season simulation; who owns the pick decides who is really rooting for those losses.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Simulating the season…</p></div>';
      DP.getSim(function (sim) {
        var box = U.qs('.lz', el); if (!box) return;
        var D = DP.draftRaceData(sim);
        var hh = '<div class="card flush"><div class="tbl-wrap"><table class="t dr-t"><thead><tr><th class="num" title="Expected draft slot">Exp.</th><th>Team</th><th class="num">Record</th><th class="num">Playoffs</th><th class="num">#1 pick</th><th class="num">Top 3</th><th>Pick 1 → 14</th><th>' + YEAR + ' 1st owned by</th><th class="num" title="Model value of the team\'s own ' + YEAR + ' picks, all rounds, wherever they are now">Pick value</th></tr></thead><tbody>' +
          D.rows.map(function (r) {
            var o1 = r.r1 ? r.r1.pk.owner : null;
            return '<tr class="' + (r.t === me ? 'mine' : o1 === me ? 'opp' : '') + '"><td class="num"><b>' + U.fmt(r.exp, 1) + '</b></td><td class="nw">' + U.teamChip(r.t, { link: 1 }) + '</td><td class="num">' + (r.rec ? r.rec.W + '-' + r.rec.L + '-' + r.rec.T : '–') + '</td><td class="num">' + U.pct(r.po) + '</td><td class="num">' + U.pct(r.p1, 1) + '</td><td class="num">' + U.pct(r.top3) + '</td><td>' + heat(r.slot) + '</td><td class="nw">' +
              (o1 ? (o1 === r.t ? '<span class="muted small">own pick</span>' : U.teamChip(o1, { link: 1 }) + ' <span class="badge info">traded</span>') + ' <span class="faint small">' + U.fmt(r.r1.v, 1) + '</span>' : '<span class="faint">–</span>') + '</td><td class="num"><b>' + U.fmt(r.tot, 1) + '</b></td></tr>';
          }).join('') + '</tbody></table></div></div><p class="small muted">Exp. = the expected draft slot. Each square is one pick (1 to 14), darker = likelier. Pick values are model dynasty value (the same scale as players): the slot odds × the value the league\'s 2026 draft produced at each slot.' + (me ? ' Your row is highlighted; a row marked like an opponent is a team whose ' + YEAR + ' 1st you own.' : '') + '</p>';
        // holders
        hh += '<div class="grid g2" style="margin-top:14px"><div class="card"><h2>🎟️ Who holds the tickets</h2><div class="hint">Every ' + YEAR + ' pick by its current owner, valued with the original team\'s slot odds.</div><ol class="list-plain drh">' + D.holders.filter(function (o) { return o.picks.length; }).map(function (o) {
          return '<li class="' + (o.t === me ? 'mine' : '') + '"><span class="drh-t">' + U.teamChip(o.t, { link: 1 }) + '</span><span class="drh-p small">' + o.picks.map(function (x) { return 'R' + x.pk.round + (x.pk.orig !== o.t ? ' <span class="muted">(' + esc(U.teamAbbr(x.pk.orig)) + ', ~' + Math.round(x.exp) + ')</span>' : ' <span class="faint">~' + Math.round(x.exp) + '</span>'); }).join(' · ') + '</span><b class="drh-v num">' + U.fmt(o.v, 1) + '</b></li>';
        }).join('') + '</ol></div>';
        // what a win costs
        var wt = q.t && E.teams.indexOf(q.t) >= 0 ? q.t : me || D.rows[0].t;
        hh += '<div class="card"><h2>⚖️ What a win costs</h2><div class="hint">The team\'s next matchup simulated as a win and as a loss (the rest of the season the same, ' + N.toLocaleString() + ' seasons each): playoff odds against the value of its own ' + YEAR + ' picks.</div><div class="controls"><label>Team <select id="dr-t">' + E.teams.map(function (t) { return '<option value="' + esc(t) + '"' + (t === wt ? ' selected' : '') + '>' + esc(U.teamName(t)) + '</option>'; }).join('') + '</select></label></div><div id="dr-wc"><p class="small muted">Simulating…</p></div></div></div>';
        hh += '<p class="small muted" style="margin-top:10px">A model estimate from projections and the remaining schedule, not advice to lose: lineups lock weekly and the standings are the standings. Later rounds and later years are on the <a href="#/picks">Draft Picks</a> page; the prospects are on the <a href="#/draft">Draft Center</a>.</p>';
        box.innerHTML = hh;
        var sel = U.qs('#dr-t', el);
        sel.addEventListener('change', function () { DP.go('draftrace', null, { t: sel.value === me ? undefined : sel.value }); });
        setTimeout(function () {
          var W = U.qs('#dr-wc', el); if (!W) return;
          var C = DP.winCost(wt);
          if (!C) { W.innerHTML = '<p class="small muted">No regular-season matchups left.</p>'; return; }
          var dv = C.win.val - C.loss.val, dpo = C.win.po - C.loss.po;
          W.innerHTML = '<p class="small">Week ' + C.wk + ' vs ' + U.teamChip(C.opp, { link: 1 }) + '</p><table class="t small"><thead><tr><th></th><th class="num">If they win</th><th class="num">If they lose</th><th class="num">Difference</th></tr></thead><tbody>' +
            '<tr><td>Playoff odds</td><td class="num">' + U.pct(C.win.po) + '</td><td class="num">' + U.pct(C.loss.po) + '</td><td class="num"><b>' + U.sgn(dpo * 100, 1) + ' pts</b></td></tr>' +
            '<tr><td>Title odds</td><td class="num">' + U.pct(C.win.ch, 1) + '</td><td class="num">' + U.pct(C.loss.ch, 1) + '</td><td class="num">' + U.sgn((C.win.ch - C.loss.ch) * 100, 1) + ' pts</td></tr>' +
            '<tr><td>Expected draft slot</td><td class="num">' + U.fmt(C.win.exp, 2) + '</td><td class="num">' + U.fmt(C.loss.exp, 2) + '</td><td class="num">' + U.sgn(C.win.exp - C.loss.exp, 2) + '</td></tr>' +
            '<tr><td>#1 pick</td><td class="num">' + U.pct(C.win.p1, 1) + '</td><td class="num">' + U.pct(C.loss.p1, 1) + '</td><td class="num">' + U.sgn((C.win.p1 - C.loss.p1) * 100, 1) + ' pts</td></tr>' +
            '<tr><td>Value of its own ' + YEAR + ' picks</td><td class="num">' + U.fmt(C.win.val, 2) + '</td><td class="num">' + U.fmt(C.loss.val, 2) + '</td><td class="num"><b>' + U.sgn(dv, 2) + '</b></td></tr></tbody></table>' +
            '<p class="small" style="margin-top:6px">' + (C.picks.some(function (p) { return p.owner !== wt; }) ? 'Its picks now belong to ' + C.picks.map(function (p) { return 'R' + p.round + ' ' + esc(U.teamAbbr(p.owner)); }).join(', ') + ': the pick value moves for them. ' : '') +
            (Math.abs(dv) < 0.05 ? 'This result barely moves its draft position.' : 'A win is worth ' + U.sgn(dpo * 100, 1) + ' points of playoff odds and costs ' + U.fmt(Math.max(0, -dv), 2) + ' in pick value (dynasty value units, the same scale as players).') + '</p>';
        }, 40);
      });
    }
  };

  // My Page widget: the top of the draft race
  if (DP.regWidget) DP.regWidget('draftrace', { name: 'Draft race', ic: '🏁', cat: 'prospects', ns: [4, 6, 14], n: 5, desc: 'The teams heading for the top ' + YEAR + ' picks: expected slot, the chance at #1 and who owns the 1st.', link: function () { return '#/draftrace'; },
    render: function (box, o) {
      var H = DP.myWidgetHelpers;
      DP.getSim(function (sim) {
        var D = DP.draftRaceData(sim);
        box.innerHTML = H.list(D.rows.slice(0, o.n || 5).map(function (r) { var o1 = r.r1 ? r.r1.pk.owner : null; return H.li(U.teamChip(r.t, { link: 1 }) + (o1 && o1 !== r.t ? ' <span class="faint small">→ ' + esc(U.teamAbbr(o1)) + '</span>' : ''), '~' + U.fmt(r.exp, 1) + ' <span class="faint small">#1 ' + U.pct(r.p1, 0) + '</span>'); }));
      });
    } });
})();
