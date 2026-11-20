/* Dynasty Puck HQ - Title Path: which one player would raise a team's title odds the most? Each candidate (the best
   free agents and the best players on other teams by projected 2026-27 WAR) is added to the team's roster for the rest
   of the season, every week still to lock is re-built with the optimal lineup (E.weeksFor), and the season is
   re-simulated with the same random numbers as the baseline (common seed), so the difference is the player's effect.
   For a player on another team, his old team's odds without him come from the same simulation. What the team would
   give up is not counted: the Trade Machine prices a full deal. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var SEED = 7331;

  DP.pathCandidates = function (t, nFA, nOwned) {
    var E = DP.E, ok = function (p) { return p.r && (p.WAR || 0) > 0 && !(p.inj && /OUT|IR/i.test(p.inj[0] || '') && /season/i.test(String(p.inj[1] || ''))); };
    var fa = E.P.filter(function (p) { return !p.gm && ok(p); }).sort(function (a, b) { return b.WAR - a.WAR; }).slice(0, nFA);
    var own = E.P.filter(function (p) { return p.gm && p.gm !== t && ok(p); }).sort(function (a, b) { return b.WAR - a.WAR; }).slice(0, nOwned);
    return fa.concat(own);
  };
  // one candidate: { p, po, ch, dPo, dCh, from: {t, dPo, dCh} }
  DP.pathEval = function (t, p, base, n) {
    var E = DP.E, R = {}, teams = [t];
    R[t] = E.rosters[t].concat([p]);
    if (p.gm && p.gm !== t) { R[p.gm] = E.rosters[p.gm].filter(function (q) { return q.id !== p.id; }); teams.push(p.gm); }
    var res = E.simSeason({ n: n, seed: SEED, weeks: E.weeksFor(R, teams) }), by = {};
    res.forEach(function (r) { by[r.t] = r; });
    var out = { p: p, po: by[t].po, ch: by[t].champ, dPo: by[t].po - base[t].po, dCh: by[t].champ - base[t].champ };
    if (teams[1]) out.from = { t: teams[1], dPo: by[teams[1]].po - base[teams[1]].po, dCh: by[teams[1]].champ - base[teams[1]].champ };
    return out;
  };
  DP.pathBase = function (n) { var by = {}; DP.E.simSeason({ n: n, seed: SEED }).forEach(function (r) { by[r.t] = r; }); return by; };

  DP.pages.path = {
    title: 'Title Path',
    render: function (el, hsh) {
      var E = DP.E, t = hsh.q.team || DP.state.team, n = +hsh.q.n || 1000;
      var h = '<div class="page-head"><h1>🗺️ Title Path</h1><p class="sub">Which single player would do the most for a team\'s title odds this season? Each candidate is added to the roster, the lineup re-optimized for every week still to lock, and the season re-simulated against the same luck as the baseline, so the difference is his effect. A model estimate; what you would give up isn\'t counted (price a full deal in the Trade Machine).</p></div>';
      h += '<div class="controls"><label>Team ' + ui.teamSelect('pt-team', t, 'Choose a team…') + '</label><label>Seasons per player <select id="pt-n">' + [500, 1000, 2000].map(function (x) { return '<option value="' + x + '"' + (x === n ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label><button class="btn" id="pt-go"' + (t ? '' : ' disabled') + '>▶ Run the search</button></div>';
      h += '<div id="pt-out">' + (t ? '<p class="small muted">Checks the 12 best free agents and the 24 best players on other teams (by projected 2026-27 WAR): about ' + Math.max(5, Math.round(36 * n / 2000)) + ' seconds at ' + n + ' seasons each. Your device does the work; nothing leaves it.</p>' : '<div class="callout">Pick a team.</div>') + '</div>';
      el.innerHTML = h;
      U.qs('#pt-team', el).addEventListener('change', function (e) { DP.go('path', null, { team: e.target.value, n: n !== 1000 ? n : undefined }); });
      U.qs('#pt-n', el).addEventListener('change', function (e) { DP.go('path', null, { team: t, n: +e.target.value !== 1000 ? e.target.value : undefined }); });
      var go = U.qs('#pt-go', el);
      go.addEventListener('click', function () {
        go.disabled = true;
        var out = U.qs('#pt-out', el), C = DP.pathCandidates(t, 12, 24), rows = [], i = 0, base = null;
        out.innerHTML = '<p class="small muted" id="pt-prog">Simulating the baseline…</p><div class="tbl-wrap"><table class="t" id="pt-tab"><thead><tr><th>Player</th><th>Owner</th><th class="num">WAR</th><th class="num">Value</th><th class="num">Title odds</th><th class="num">Playoffs</th><th>His old team</th><th class="num">Title pts per value</th></tr></thead><tbody></tbody></table></div>';
        var draw = function () {
          var s = rows.slice().sort(function (a, b) { return b.dCh - a.dCh || b.dPo - a.dPo; }), tb = U.qs('#pt-tab tbody', out); if (!tb) return;
          tb.innerHTML = s.map(function (r) {
            var v = r.p.DV || 0;
            return '<tr><td>' + ui.pcell(r.p, { pos: 1 }) + '</td><td>' + ui.owner(r.p) + '</td><td class="num">' + U.fmt(r.p.WAR, 1) + '</td><td class="num">' + U.fmt(v, 1) + '</td>' +
              '<td class="num"><b>' + ui.delta(r.dCh * 100, 1) + '</b> <span class="faint">→ ' + U.pct(r.ch, 1) + '</span></td><td class="num">' + ui.delta(r.dPo * 100, 0) + ' <span class="faint">→ ' + U.pct(r.po) + '</span></td>' +
              '<td class="small">' + (r.from ? U.teamChip(r.from.t, { link: 1 }) + ' ' + ui.delta(r.from.dCh * 100, 1) + ' title' : '<span class="faint">free agent</span>') + '</td><td class="num">' + (v > 0.5 && r.dCh > 0 ? U.fmt(r.dCh * 100 / v, 2) : '–') + '</td></tr>';
          }).join('');
        };
        var step = function () {
          if (!document.body.contains(out)) return;
          if (!base) { base = DP.pathBase(n); var pr = U.qs('#pt-prog', out); if (pr) pr.innerHTML = 'Baseline: ' + esc(U.teamName(t)) + ' ' + U.pct(base[t].champ, 1) + ' title, ' + U.pct(base[t].po) + ' playoffs. Checking players: 0 of ' + C.length + '…'; return setTimeout(step, 20); }
          if (i < C.length) {
            rows.push(DP.pathEval(t, C[i], base, n)); i++;
            var pr2 = U.qs('#pt-prog', out); if (pr2) pr2.innerHTML = 'Baseline: ' + esc(U.teamName(t)) + ' ' + U.pct(base[t].champ, 1) + ' title, ' + U.pct(base[t].po) + ' playoffs. ' + (i < C.length ? 'Checking players: ' + i + ' of ' + C.length + '…' : 'Done: ' + C.length + ' players, ' + n + ' seasons each.');
            draw(); return setTimeout(step, 20);
          }
          go.disabled = false;
          out.insertAdjacentHTML('beforeend', '<p class="small muted">Title odds and playoffs: the change in ' + esc(U.teamName(t)) + '\'s odds with him added (percentage points; the same simulated luck as the baseline, so small differences are noise at ' + n + ' seasons). His old team: their title odds without him. Title pts per value: title-odds points per point of his dynasty value, a rough "bang for the buck" for a win-now move.</p>');
        };
        setTimeout(step, 30);
      });
    }
  };
})();
