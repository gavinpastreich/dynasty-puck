/* Dynasty Puck HQ - Prospects & MNR (graduation tracker, team pipelines). The Draft Center and Mock Draft are in pages-draft.js. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc, C = DP.C;
  DP.pages = DP.pages || {};

  function tabs(cur, list, route, q) {
    return '<div class="tabs" role="tablist">' + list.map(function (t) {
      return '<button role="tab" aria-selected="' + (t[0] === cur) + '" class="' + (t[0] === cur ? 'on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
    }).join('') + '</div>';
  }
  function wireTabs(el, route, q) {
    U.qsa('[data-tab]', el).forEach(function (b) { b.addEventListener('click', function () { DP.go(route, null, Object.assign({}, q, { tab: b.dataset.tab })); }); });
  }

  // what a prospect brings in our categories: from projections if any, else from the scoring profile of his best line
  DP.prospectCats = function (p) {
    var E = DP.E;
    if (p.r && p.projGP >= 20 && !p.G) {
      var keys = ['PtD', 'G', 'A', 'PIM', 'SOG', 'STP', 'Hit', 'Blk', 'Tk', 'Cor'];
      var labs = { PtD: 'Pt-D', G: 'G', A: 'A', PIM: 'PIM', SOG: 'SOG', STP: 'STP', Hit: 'Hit', Blk: 'Blk', Tk: 'Tk', Cor: 'Cor' };
      return keys.filter(function (k) { return p.war && p.war[k] > 0.3; }).sort(function (a, b) { return p.war[b] - p.war[a]; }).slice(0, 4).map(function (k) { return labs[k]; });
    }
    if (p.G) return ['W', 'SV%', 'GAA'];
    var line = E.nhle(p.car, p.dob), out = [];
    if (!line) return p.D ? ['Pt-D', 'Blk'] : [];
    var s = (p.car || []).find(function (x) { return x[0] === line.season && x[1] === line.lg; });
    if (!s) return [];
    var gp = s[3] || 1, g = s[4] / gp, a = s[5] / gp, pim = s[7] / gp;
    if (p.D) { out.push('Pt-D'); if (a > 0.5) out.push('A', 'STP'); out.push('Blk'); }
    else { if (g >= 0.4) out.push('G', 'SOG'); if (a >= 0.6) out.push('A'); if ((g + a) >= 1.1) out.push('STP'); }
    if (pim >= 1.2) out.push('PIM', 'Hit');
    return U.uniq(out).slice(0, 4);
  };

  // ------------------------------------------------------------ Prospects & MNR
  DP.pages.prospects = {
    title: 'Prospects & MNR',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, tab = q.tab || 'grad', me = DP.state.team, ft = q.team || '';
      if (tab === 'rank') { location.replace(U.hash('radar', null, { tab: 'rank', scope: ft })); return; }   // the rankings live on the Radar now
      var mnr = E.P.filter(function (p) { return p.gm && p.ct === 'MNR'; });
      var h = '<div class="page-head"><h1>Prospects & MNR</h1><p class="sub">' + mnr.length + ' rostered MNR players. <b>Graduation rule:</b> an MNR player graduates at <b>' + E.RULES.gradSkater + ' career NHL regular-season GP (skaters)</b> or <b>' + E.RULES.gradGoalie + ' (goalies)</b>, counted from the NHL API\'s career totals (all past seasons, not just last year, and goalies included). A player who graduates during the season <b>stays at $0 for the rest of it</b> and signs his ELC ($1.5M) in the offseason (or is dropped). If he is on your <b>active roster</b> when he graduates he has to stay there; if he is in the minors he can stay down, but once promoted he can\'t be sent back. One who hasn\'t graduated by the end of the regular season stays at $0. MNR players can be started in your weekly lineup.</p></div>';
      h += tabs(tab, [['grad', 'Graduation tracker'], ['pipes', 'Team pipelines'], ['rank', 'Rankings & news: Prospect Radar →']]);
      h += '<div id="pr-body"></div>';
      el.innerHTML = h;
      wireTabs(el, 'prospects', q);
      var body = U.qs('#pr-body', el);
      var teamF = { l: 'Team', opts: [['', 'All']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: ft, fn: function (p, v) { return (p.p || p).gm === v; } };
      if (tab === 'grad') {
        var rows = mnr.map(function (p) { return { p: p, g: E.graduation(p) }; });
        var cw = Math.max(0, E.nowWeek()), soon = rows.filter(function (x) { return x.g.week !== null && x.g.week <= cw + 3; }).length;
        body.innerHTML = '<div class="stats">' + DP.statTile('Still to graduate in 2026-27', String(rows.filter(function (x) { return x.g.week !== null; }).length), 'projected, of ' + mnr.length + ' MNR · ' + rows.filter(function (x) { return x.g.status === 'graduated'; }).length + ' already have') + DP.statTile('In the next 4 weeks', String(soon), 'weeks ' + (cw + 1) + '–' + Math.min(E.NW, cw + 4)) +
          DP.statTile('Within 10 GP of the line', String(rows.filter(function (x) { return x.g.need > 0 && x.g.need <= 10; }).length), 'career GP') + DP.statTile('ELC cap impact', U.m(rows.filter(function (x) { return x.g.week !== null; }).length * 1.5), 'if all are signed') + '</div><div id="gt"></div>';
        ui.table(U.qs('#gt', body), {
          rows: rows, sort: 'wk', desc: false, csv: 'mnr-graduation-tracker.csv', search: function (x) { return x.p.n + ' ' + x.p.gm; }, filters: [teamF,
            { l: 'Status', opts: [['', 'All'], ['proj', 'Projected to graduate'], ['stay', 'Stays MNR'], ['none', 'No NHL projection']], fn: function (x, v) { return v === 'proj' ? x.g.week !== null : v === 'stay' ? x.g.status === 'stays MNR' : x.g.status === 'not projected'; } }],
          rowCls: function (x) { return x.p.gm === me ? 'mine' : ''; },
          cols: [{ k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p); } }, { k: 'pos', l: 'Pos', v: function (x) { return x.p.slot; }, f: function (x) { return ui.pos(x.p); } }, { k: 'gm', l: 'GM', v: function (x) { return x.p.gm; } },
            { k: 'cgp', l: 'Career GP', v: function (x) { return x.g.cgp / x.g.thr; }, f: function (x) { var fr = x.g.cgp / x.g.thr; return '<div class="pbar" title="' + x.g.cgp + ' of ' + x.g.thr + '">' + ui.meter(fr, fr >= 0.9 ? 'bad' : fr >= 0.6 ? 'warn' : '') + '<span class="num small" style="width:52px">' + x.g.cgp + '/' + x.g.thr + '</span></div>'; } },
            { k: 'need', l: 'Needs', cls: 'num', v: function (x) { return x.g.need; } },
            { k: 'proj', l: 'Proj GP 26-27', cls: 'num', v: function (x) { return x.p.projGP; } },
            { k: 'wk', l: 'Proj. graduation', cls: 'num', v: function (x) { return x.g.week === null ? 99 : x.g.week; }, f: function (x) { return x.g.week === null ? '<span class="faint">' + esc(x.g.status) + '</span>' : '<b>Wk ' + (x.g.week + 1) + '</b> <span class="small muted">' + U.date(x.g.date) + '</span>' + (x.p.inj ? ' <span class="badge warn" title="Currently injured or holding out: graduation likely delayed">delay?</span>' : ''); } },
            { k: 'prob', l: 'P(grad 26-27)', cls: 'num', v: function (x) { return x.g.prob; }, f: function (x) { return U.pct(x.g.prob); } },
            { k: 'war', l: 'WAR', cls: 'num', v: function (x) { return x.p.r ? x.p.WAR : null; }, f: function (x) { return x.p.r ? ui.warCell(x.p.WAR) : '–'; } },
            { k: 'dv', l: 'Dynasty', cls: 'num', v: function (x) { return x.p.DV; }, f: function (x) { return U.fmt(x.p.DV, 1); } }]
        });
      } else {
        var TS = DP.teamSummary();
        body.innerHTML = '<div class="grid g2">' + E.teams.slice().sort(function (a, b) { return TS[b].pros - TS[a].pros; }).map(function (tm) {
          var list = mnr.filter(function (p) { return p.gm === tm; }).sort(U.by(function (p) { return p.DV; }, true));
          var grads = list.filter(function (p) { return E.graduation(p).week !== null; }).length;
          return '<div class="card' + (tm === me ? '" style="border-color:var(--accent)' : '') + '"><h3>' + esc(U.teamName(tm)) + ' <span class="badge info">' + TS[tm].prosGrade + '</span> <span class="faint small">#' + TS[tm].prosRank + ' · ' + list.length + ' MNR · value ' + U.fmt(TS[tm].pros, 1) + ' · ' + grads + ' graduating</span></h3><ul class="list-plain">' +
            list.slice(0, 5).map(function (p) { return '<li>' + ui.pos(p) + '<span>' + ui.pcell(p) + '</span><span class="small muted" style="margin-left:auto">' + DP.prospectCats(p).slice(0, 3).map(esc).join(', ') + '</span><span class="num" style="width:44px">' + U.fmt(p.DV, 1) + '</span></li>'; }).join('') +
            '</ul><p class="small"><a href="' + U.hash('prospects', null, { tab: 'rank', team: tm }) + '">All ' + list.length + ' →</a></p></div>';
        }).join('') + '</div>';
      }
    }
  };

})();
