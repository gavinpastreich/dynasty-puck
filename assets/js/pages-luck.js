/* Dynasty Puck HQ - Buy Low / Sell High: who is scoring (or stopping pucks) above or below his own normal rate this
 * season, the classic regression signal for trades and pickups.
 *   Skaters: goals vs expected goals = this season's shots x his normal shooting % (his last three NHL seasons, shrunk
 *     toward the league rate for his position with 120 shots of weight).
 *   Goalies: goals saved vs his normal save % (last three seasons, shrunk toward the league with 1,500 shots) on an
 *     estimate of this season's shots against (GAA x games / (1 - SV%)).
 * Only facts go in (NHL stats); the "normal" rate and the flags are a documented model, shown as such. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var LUCK = { shPrior: 120, svPrior: 1500, minSOG: 15, minGP: 4, sk: { goals: 3, z: 1.5 }, g: { goals: 6, z: 1.5 } };
  DP.LUCK = LUCK;

  var cache = null;
  DP.luck = function () {
    var E = DP.E;
    if (cache && cache.v === E.version) return cache;
    var cur = DP.meta.seasonId, prev = cur - 10001, first = cur - 3 * 10001;
    var agg = { F: [0, 0], D: [0, 0] }, gsa = 0, gsv = 0;
    E.P.forEach(function (p) {
      (p.h || []).forEach(function (r) {
        if (r[0] !== prev) return;
        if (p.G) { gsa += r[6] || 0; gsv += (r[6] || 0) * r[4]; } else { var k = p.D ? 'D' : 'F'; agg[k][0] += r[2]; agg[k][1] += r[5]; }
      });
    });
    var lg = { F: agg.F[1] ? agg.F[0] / agg.F[1] : 0.11, D: agg.D[1] ? agg.D[0] / agg.D[1] : 0.055, G: gsa ? gsv / gsa : 0.9 };
    var rows = [];
    E.P.forEach(function (p) {
      var y = p.ytd; if (!y) return;
      var hist = (p.h || []).filter(function (r) { return r[0] >= first && r[0] <= prev; });
      if (!p.G) {
        var S = y[5], G = y[2]; if (!(S >= LUCK.minSOG)) return;
        var G0 = E.sum(hist.map(function (r) { return r[2]; })), S0 = E.sum(hist.map(function (r) { return r[5]; }));
        var base = (G0 + lg[p.D ? 'D' : 'F'] * LUCK.shPrior) / (S0 + LUCK.shPrior), xg = S * base, d = G - xg, z = d / Math.sqrt(S * base * (1 - base));
        var p26 = p.p26, rosG = p26 ? p26[2] - G : null, rosS = p26 ? p26[5] - S : null;
        // the rest-of-season shooting % the projection implies (none when its full-season total is already behind him)
        rows.push({ p: p, kind: 'S', gp: y[0], G: G, S: S, sh: G / S, base: base, S0: S0, xg: xg, d: d, z: z, ros: rosS > 5 && rosG >= 0 ? rosG / rosS : null,
          sig: d >= LUCK.sk.goals && z >= LUCK.sk.z ? 'sell' : d <= -LUCK.sk.goals && z <= -LUCK.sk.z ? 'buy' : null });
      } else {
        var gp = y[0], gaa = y[2], sv = y[3]; if (!(gp >= LUCK.minGP) || !(sv > 0 && sv < 1)) return;
        var SA0 = E.sum(hist.map(function (r) { return r[6] || 0; })), SV0 = E.sum(hist.map(function (r) { return (r[6] || 0) * r[4]; }));
        var gb = (SV0 + lg.G * LUCK.svPrior) / (SA0 + LUCK.svPrior), sa = gaa * gp / (1 - sv), gd = sa * (sv - gb), gz = gd / Math.sqrt(sa * gb * (1 - gb));
        rows.push({ p: p, kind: 'G', gp: gp, sv: sv, base: gb, S0: SA0, sa: sa, d: gd, z: gz,
          sig: gd >= LUCK.g.goals && gz >= LUCK.g.z ? 'sell' : gd <= -LUCK.g.goals && gz <= -LUCK.g.z ? 'buy' : null });
      }
    });
    var by = {}; rows.forEach(function (r) { by[r.p.id] = r; });
    return (cache = { v: E.version, rows: rows, by: by, lg: lg });
  };
  function sigBadge(r) {
    if (!r.sig) return '<span class="faint small">–</span>';
    return r.sig === 'sell' ? '<span class="badge warn" title="Running well above his normal rate: likely to cool off">sell high</span>' : '<span class="badge good" title="Running well below his normal rate: likely to pick up">buy low</span>';
  }
  function howTxt(r) { var a = Math.abs(r.z); return a >= 3 ? 'extreme' : a >= 2 ? 'strong' : a >= 1.5 ? 'clear' : a >= 1 ? 'mild' : 'normal'; }
  function why(r) {
    if (r.kind === 'S') return r.G + ' goals on ' + r.S + ' shots (' + U.pct(r.sh, 1) + ') vs his normal ' + U.pct(r.base, 1) + ': ' + (r.d > 0 ? '+' : '') + U.fmt(r.d, 1) + ' goals vs expected' + (r.ros !== null ? '; the projection assumes ' + U.pct(r.ros, 1) + ' from here' : '');
    return U.rate(r.sv) + ' save % vs his normal ' + U.rate(r.base) + ' on ~' + Math.round(r.sa) + ' shots: ' + (r.d > 0 ? '+' : '') + U.fmt(r.d, 1) + ' goals saved vs his norm';
  }
  DP.luckWhy = why;

  // Team Hub card: one team's sell-high and buy-low players, and buy-low targets elsewhere
  DP.luckTeamCard = function (t) {
    var L = DP.luck(), mine = L.rows.filter(function (r) { return r.p.gm === t && r.sig; }), me = DP.state.team;
    var sell = mine.filter(function (r) { return r.sig === 'sell'; }).sort(function (a, b) { return b.z - a.z; }).slice(0, 4);
    var buy = mine.filter(function (r) { return r.sig === 'buy'; }).sort(function (a, b) { return a.z - b.z; }).slice(0, 4);
    if (!sell.length && !buy.length) return '';
    var li = function (r) { return '<li>' + ui.plink(r.p) + ' <span class="small muted">' + esc(why(r)) + '</span></li>'; };
    return '<div class="card"><h2>🎰 Luck check</h2><div class="hint">Players on this roster scoring (or saving) well away from their own normal rate this season. <a href="' + U.hash('luck', null, { owner: t === me ? 'mine' : t }) + '">Buy Low / Sell High →</a></div>' +
      (sell.length ? '<h3 class="small">Running hot (sell-high candidates)</h3><ul class="small" style="padding-left:18px;margin:0 0 8px">' + sell.map(li).join('') + '</ul>' : '') +
      (buy.length ? '<h3 class="small">Running cold (likely to pick up)</h3><ul class="small" style="padding-left:18px;margin:0">' + buy.map(li).join('') + '</ul>' : '') + '</div>';
  };

  DP.pages.luck = {
    title: 'Buy Low / Sell High',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, me = DP.state.team, L = DP.luck(), kind = q.k === 'G' ? 'G' : 'S';
      var owner = q.owner || '', sig = q.sig !== undefined ? q.sig : 'flag';
      var go = function (o) { DP.go('luck', null, Object.assign({ k: kind === 'G' ? 'G' : undefined, owner: owner || undefined, sig: sig === 'flag' ? undefined : sig || 'all' }, o)); };
      var h = '<div class="page-head"><h1>🎰 Buy Low / Sell High</h1><p class="sub">Who is scoring or stopping pucks well above or below his own normal rate this season. Shooting and save percentages swing a lot over a few hundred shots and tend to drift back, so a hot shooter is a sell-high candidate and a cold one a buy-low target, especially when his shots are still coming. ' +
        'Normal rate = his last three NHL seasons, pulled toward the league average (' + U.pct(L.lg.F, 1) + ' for forwards, ' + U.pct(L.lg.D, 1) + ' for D, ' + U.rate(L.lg.G) + ' save %) when he has few shots. A model read, not a forecast: role, linemates and injuries change real talent too.</p></div>';
      if (me) {
        var mineSell = L.rows.filter(function (r) { return r.p.gm === me && r.sig === 'sell'; }).sort(function (a, b) { return b.z - a.z; }).slice(0, 5);
        var tgt = L.rows.filter(function (r) { return r.p.gm && r.p.gm !== me && r.sig === 'buy'; }).sort(function (a, b) { return b.p.DV - a.p.DV; }).slice(0, 5);
        var fa = L.rows.filter(function (r) { return !r.p.gm && r.sig === 'buy' && r.p.WAR > 0; }).sort(function (a, b) { return b.p.WAR - a.p.WAR; }).slice(0, 5);
        var card = function (title, list, act, empty) {
          return '<div class="card"><h2>' + title + '</h2>' + (list.length ? '<ul class="list-plain mvlist">' + list.map(function (r) {
            return '<li>' + ui.plink(r.p) + ' <span class="faint small">' + esc(r.p.t || '') + (r.p.gm && r.p.gm !== me ? ' · ' + r.p.gm : '') + '</span> ' + sigBadge(r) + (act ? ' ' + act(r) : '') + '<br><span class="small muted">' + esc(why(r)) + '</span></li>';
          }).join('') + '</ul>' : '<p class="small muted">' + empty + '</p>') + '</div>';
        };
        h += '<div class="grid g3">' +
          card('Sell high on your roster', mineSell, function (r) { return '<a class="btn sm" href="' + U.hash('finder', null, { mode: 'give', p: r.p.id }) + '">Find deals</a>'; }, 'Nobody on your roster is running far above his normal rate.') +
          card('Buy-low targets', tgt, function (r) { return '<a class="btn sm" href="' + U.hash('finder', null, { mode: 'get', p: r.p.id }) + '">What would it take?</a>'; }, 'No rostered player elsewhere is running far below his normal rate.') +
          card('Cold free agents', fa, null, 'No free agent with a positive projection is running far below his normal rate.') + '</div>';
      }
      h += '<div class="controls" style="margin-top:14px"><div class="seg"><button data-k="S" class="' + (kind === 'S' ? 'on' : '') + '">Skaters: shooting</button><button data-k="G" class="' + (kind === 'G' ? 'on' : '') + '">Goalies: save %</button></div>' +
        '<label>Owner <select id="lk-owner"><option value="">Everyone</option>' + (me ? '<option value="mine"' + (owner === 'mine' ? ' selected' : '') + '>My team</option><option value="others"' + (owner === 'others' ? ' selected' : '') + '>Other teams</option>' : '') + '<option value="fa"' + (owner === 'fa' ? ' selected' : '') + '>Free agents</option>' + DP.meta.gms.map(function (g) { return '<option value="' + esc(g.code) + '"' + (owner === g.code ? ' selected' : '') + '>' + esc(g.code) + '</option>'; }).join('') + '</select></label>' +
        '<label>Show <select id="lk-sig"><option value="flag"' + (sig === 'flag' ? ' selected' : '') + '>Flagged only</option><option value="sell"' + (sig === 'sell' ? ' selected' : '') + '>Sell high</option><option value="buy"' + (sig === 'buy' ? ' selected' : '') + '>Buy low</option><option value="all"' + (sig === 'all' ? ' selected' : '') + '>Everyone (' + (kind === 'S' ? LUCK.minSOG + '+ shots' : LUCK.minGP + '+ GP') + ')</option></select></label></div><div id="lk-t"></div>';
      h += '<p class="small muted">Flag: ' + (kind === 'S' ? 'at least ' + LUCK.sk.goals + ' goals away from expected' : 'at least ' + LUCK.g.goals + ' goals saved away from his norm') + ' and at least ' + LUCK.sk.z + ' standard deviations from it (about a 1-in-15 swing by chance alone). ' +
        (kind === 'S' ? '<b>Projection assumes</b> = the shooting % the site\'s rest-of-season projection implies from here (it blends this season into the preseason projection), so you can see whether his value already expects him to cool off.' : 'Shots against are estimated from GAA × games ÷ (1 − SV%), so they are approximate for goalies who were pulled or came on in relief.') + '</p>';
      el.innerHTML = h;
      U.qsa('[data-k]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go('luck', null, { k: b.dataset.k === 'G' ? 'G' : undefined, owner: owner || undefined, sig: sig === 'flag' ? undefined : sig }); }); });
      U.qs('#lk-owner', el).addEventListener('change', function (e) { owner = e.target.value; go({}); });
      U.qs('#lk-sig', el).addEventListener('change', function (e) { sig = e.target.value; go({}); });
      var rows = L.rows.filter(function (r) {
        if (r.kind !== kind) return false;
        if (owner === 'mine' && r.p.gm !== me) return false;
        if (owner === 'others' && (!r.p.gm || r.p.gm === me)) return false;
        if (owner === 'fa' && r.p.gm) return false;
        if (owner && !/^(mine|others|fa)$/.test(owner) && r.p.gm !== owner) return false;
        return sig === 'all' ? true : sig === 'flag' ? !!r.sig : r.sig === sig;
      });
      var cols = kind === 'S' ? [
        { k: 'n', l: 'Player', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p); } },
        { k: 'gm', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); } },
        { k: 'sig', l: 'Signal', v: function (r) { return r.z; }, f: sigBadge },
        { k: 'gp', l: 'GP', cls: 'num' },
        { k: 'G', l: 'G', cls: 'num' }, { k: 'S', l: 'SOG', cls: 'num' },
        { k: 'sh', l: 'Sh%', cls: 'num', v: function (r) { return r.sh; }, f: function (r) { return U.pct(r.sh, 1); } },
        { k: 'base', l: 'Normal', cls: 'num', title: 'His normal shooting %: last three seasons, pulled toward the league with 120 shots', v: function (r) { return r.base; }, f: function (r) { return U.pct(r.base, 1) + ' <span class="faint small">' + r.S0 + ' sh</span>'; } },
        { k: 'd', l: 'Goals vs expected', cls: 'num', v: function (r) { return r.d; }, f: function (r) { return ui.delta(r.d, 1); } },
        { k: 'z', l: 'How unusual', cls: 'num', v: function (r) { return Math.abs(r.z); }, f: function (r) { return '<span title="' + U.fmt(r.z, 2) + ' standard deviations">' + howTxt(r) + '</span>'; } },
        { k: 'ros', l: 'Projection assumes', cls: 'num', v: function (r) { return r.ros; }, f: function (r) { return r.ros === null ? '–' : U.pct(r.ros, 1); } },
        { k: 'dv', l: 'Value', cls: 'num', v: function (r) { return r.p.DV; }, f: function (r) { return U.fmt(r.p.DV, 1); } }
      ] : [
        { k: 'n', l: 'Goalie', v: function (r) { return r.p.n; }, f: function (r) { return ui.pcell(r.p); } },
        { k: 'gm', l: 'Owner', v: function (r) { return r.p.gm || 'zz'; }, f: function (r) { return ui.owner(r.p); } },
        { k: 'sig', l: 'Signal', v: function (r) { return r.z; }, f: sigBadge },
        { k: 'gp', l: 'GP', cls: 'num' },
        { k: 'sv', l: 'SV%', cls: 'num', v: function (r) { return r.sv; }, f: function (r) { return U.rate(r.sv); } },
        { k: 'base', l: 'Normal', cls: 'num', v: function (r) { return r.base; }, f: function (r) { return U.rate(r.base) + ' <span class="faint small">' + r.S0 + ' sh</span>'; } },
        { k: 'sa', l: 'Shots ≈', cls: 'num', v: function (r) { return r.sa; }, f: function (r) { return U.fmt(r.sa, 0); } },
        { k: 'd', l: 'Saved vs norm', cls: 'num', v: function (r) { return r.d; }, f: function (r) { return ui.delta(r.d, 1); } },
        { k: 'z', l: 'How unusual', cls: 'num', v: function (r) { return Math.abs(r.z); }, f: function (r) { return '<span title="' + U.fmt(r.z, 2) + ' standard deviations">' + howTxt(r) + '</span>'; } },
        { k: 'dv', l: 'Value', cls: 'num', v: function (r) { return r.p.DV; }, f: function (r) { return U.fmt(r.p.DV, 1); } }
      ];
      ui.table(U.qs('#lk-t', el), { rows: rows, sort: 'z', cols: cols, csv: 'buy-low-sell-high.csv', page: 50, search: function (r) { return r.p.n + ' ' + (r.p.gm || 'FA') + ' ' + (r.p.t || ''); }, rowCls: function (r) { return r.p.gm && r.p.gm === me ? 'mine' : ''; }, empty: 'Nobody matches this filter.' });
    }
  };
})();
