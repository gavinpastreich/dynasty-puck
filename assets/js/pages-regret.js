/* Dynasty Puck HQ - lineup regrets: for every finished week, what one swap would have changed. Each bench player (and
   each minor-leaguer who played NHL games that week: MNR players can be started) is put in place of each starter at
   the same position, the team's week totals are recomputed, and the matchup is re-scored exactly like the standings
   (E.weekVec + E.catResults, goalie minimum included). Lines come from data/weeks/wNN.js (bench / minors lines from
   tools/scoreboard.py bench_lines). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;

  function grp(p) { return p.G ? 'G' : p.pos === 'D' ? 'D' : 'F'; }
  // a player's weekly line as additions to the team's week totals
  function delta(p, l, isD) {
    if (p.G) return { W: l[1], GA: l[2], SA: l[3], SHO: l[4], GGP: l[0], GTOI: l[5] };
    var d = { G: l[1], A: l[2], GA2: 2 * l[1] + l[2], PIM: l[3], SOG: l[4], STP: l[5], Hit: l[6], Blk: l[7], Tk: l[8], Cor: l[9], SGP: l[0] };
    if (isD) d.PtD = l[1] + l[2];
    return d;
  }
  function score(r) { var x = [0, 0, 0]; r.forEach(function (v) { if (v === 1) x[0]++; else if (v === -1 || v === -2) x[1]++; else x[2]++; }); return x; }
  DP.regretLine = function (p, l) {
    if (!l) return 'no games';
    return p.G ? l[0] + ' GP, ' + l[1] + ' W, ' + (l[3] ? U.rate(1 - l[2] / l[3]) : '–') + ' SV%' : l[0] + ' GP, ' + l[1] + ' G, ' + l[2] + ' A, ' + l[4] + ' SOG, ' + (l[6] + l[7]) + ' Hit+Blk';
  };
  // every team's best single swap in week n: { t, o, s0, s1, gain, flip, inP, inL, outP, outL, from }
  DP.lineupRegrets = function (n) {
    var E = DP.E, W = DP.weekDetail && DP.weekDetail[n], w = E.history().weeks.filter(function (x) { return x.n === n; })[0];
    if (!W || !w || !w.games) return null;
    var out = [], minG = (E.RULES && E.RULES.goalieMinGP) || 2;
    w.games.forEach(function (g) {
      [[g.a, g.b], [g.b, g.a]].forEach(function (pr) {
        var t = pr[0], o = pr[1], T = W.teams[t]; if (!T || !T.bench) return;
        var s0 = score(E.catResults(w.vec[t], w.vec[o])), best = null;
        ['bench', 'minors'].forEach(function (from) {
          Object.keys(T[from] || {}).forEach(function (bid) {
            var pb = E.byId[bid], lb = T[from][bid]; if (!pb || !lb || !lb[0]) return;
            var gb = grp(pb);
            (T.active || []).forEach(function (sid) {
              var ps = E.byId[sid]; if (!ps || grp(ps) !== gb) return;
              var ls = (T.pl || {})[sid] || null, tot = Object.assign({}, w.tot[t]);
              var din = delta(pb, lb, gb === 'D'), dout = ls ? delta(ps, ls, gb === 'D') : {};
              Object.keys(din).forEach(function (k) { tot[k] = (tot[k] || 0) + din[k]; });
              Object.keys(dout).forEach(function (k) { tot[k] = (tot[k] || 0) - dout[k]; });
              var s1 = score(E.catResults(E.weekVec(tot), w.vec[o])), gain = (s1[0] - s1[1]) - (s0[0] - s0[1]);
              if (gain > 0 && (!best || gain > best.gain || (gain === best.gain && from === 'bench' && best.from !== 'bench'))) best = { gain: gain, s1: s1, inP: pb, inL: lb, outP: ps, outL: ls, from: from, gmin: (w.tot[t].GGP || 0) < minG && (tot.GGP || 0) >= minG };
            });
          });
        });
        if (best) out.push(Object.assign({ n: n, t: t, o: o, s0: s0, flip: (s0[0] <= s0[1]) && best.s1[0] > best.s1[1] }, best));
      });
    });
    return out.sort(function (a, b) { return (b.flip - a.flip) || b.gain - a.gain; });
  };
  DP.regretText = function (r, opt) {
    var res = function (s) { return s[0] + '-' + s[1] + (s[2] ? '-' + s[2] : ''); };
    return (opt && opt.team === false ? '' : '<b>' + esc(U.teamName(r.t)) + '</b>: ') + 'starting ' + ui.plink(r.inP) + ' (' + esc(DP.regretLine(r.inP, r.inL)) + (r.from === 'minors' ? ', in the minors' : ', on the bench') + ') instead of ' + ui.plink(r.outP) + ' (' + esc(DP.regretLine(r.outP, r.outL)) + ') would have made it ' + res(r.s1) + ' instead of ' + res(r.s0) + (r.gmin ? ' (the swap gets the team to the ' + ((DP.E.RULES && DP.E.RULES.goalieMinGP) || 2) + '-start goalie minimum)' : '') + (r.flip ?' and <b>won the matchup</b>' : '') + '.';
  };
  // a team's regrets over every finished week (needs the week files loaded)
  DP.teamRegrets = function (t, ns) {
    var out = [];
    ns.forEach(function (n) { var R = DP.lineupRegrets(n); if (R) R.forEach(function (r) { if (r.t === t) out.push(r); }); });
    return out;
  };
})();
