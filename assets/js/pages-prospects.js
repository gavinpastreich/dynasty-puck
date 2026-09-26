/* Dynasty Puck HQ - Prospects & MNR, Draft Center (NHL 2026 draft, league drafts, 2027-2029 boards). */
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
      var mnr = E.P.filter(function (p) { return p.gm && p.ct === 'MNR'; });
      var h = '<div class="page-head"><h1>Prospects & MNR</h1><p class="sub">' + mnr.length + ' rostered MNR players. <b>Graduation rule:</b> an MNR player graduates at <b>82 career NHL regular-season GP (skaters)</b> or <b>41 (goalies)</b>, counted from the NHL API\'s career totals (all past seasons, not just last year, and goalies included). A graduated player must sign an ELC ($1.5M) or be dropped. One who hasn\'t graduated by the end of the regular season stays at $0. MNR players can be started in your weekly lineup.</p></div>';
      h += tabs(tab, [['grad', 'Graduation tracker'], ['rank', 'Prospect rankings'], ['pipes', 'Team pipelines']]);
      h += '<div id="pr-body"></div>';
      el.innerHTML = h;
      wireTabs(el, 'prospects', q);
      var body = U.qs('#pr-body', el);
      var teamF = { l: 'Team', opts: [['', 'All']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: ft, fn: function (p, v) { return (p.p || p).gm === v; } };
      if (tab === 'grad') {
        var rows = mnr.map(function (p) { return { p: p, g: E.graduation(p) }; });
        var soon = rows.filter(function (x) { return x.g.week !== null && x.g.week < 6; }).length;
        body.innerHTML = '<div class="stats">' + DP.statTile('Projected to graduate in 2026-27', String(rows.filter(function (x) { return x.g.week !== null; }).length), 'of ' + mnr.length + ' MNR') + DP.statTile('In the first 6 weeks', String(soon), 'Oct–early Nov') +
          DP.statTile('Within 10 GP of the line', String(rows.filter(function (x) { return x.g.need > 0 && x.g.need <= 10; }).length), 'career GP') + DP.statTile('ELC cap impact', U.m(rows.filter(function (x) { return x.g.week !== null; }).length * 1.5), 'if all are signed') + '</div><div id="gt"></div>';
        ui.table(U.qs('#gt', body), {
          rows: rows, sort: 'wk', desc: false, csv: 'mnr-graduation-tracker.csv', search: function (x) { return x.p.n + ' ' + x.p.gm; }, filters: [teamF,
            { l: 'Status', opts: [['', 'All'], ['proj', 'Projected to graduate'], ['stay', 'Stays MNR'], ['none', 'No NHL projection']], fn: function (x, v) { return v === 'proj' ? x.g.week !== null : v === 'stay' ? x.g.status === 'stays MNR' : x.g.status === 'not projected'; } }],
          rowCls: function (x) { return x.p.gm === me ? 'mine' : ''; },
          cols: [{ k: 'n', l: 'Player', v: function (x) { return x.p.n; }, f: function (x) { return ui.pcell(x.p); } }, { k: 'pos', l: 'Pos', v: function (x) { return x.p.slot; }, f: function (x) { return ui.pos(x.p); } }, { k: 'gm', l: 'GM', v: function (x) { return x.p.gm; } },
            { k: 'cgp', l: 'Career GP', v: function (x) { return x.g.cgp / x.g.thr; }, f: function (x) { var fr = x.g.cgp / x.g.thr; return '<div class="pbar" title="' + x.g.cgp + ' of ' + x.g.thr + '">' + ui.meter(fr, fr >= 0.9 ? 'bad' : fr >= 0.6 ? 'warn' : '') + '<span class="num small" style="width:52px">' + x.g.cgp + '/' + x.g.thr + '</span></div>'; } },
            { k: 'need', l: 'Needs', cls: 'num', v: function (x) { return x.g.need; } },
            { k: 'proj', l: 'Proj GP 26-27', cls: 'num', v: function (x) { return x.p.projGP; } },
            { k: 'wk', l: 'Proj. graduation', cls: 'num', v: function (x) { return x.g.week === null ? 99 : x.g.week; }, f: function (x) { return x.g.week === null ? '<span class="faint">' + esc(x.g.status) + '</span>' : '<b>Wk ' + (x.g.week + 1) + '</b> <span class="small muted">' + U.date(x.g.date) + '</span>'; } },
            { k: 'prob', l: 'P(grad 26-27)', cls: 'num', v: function (x) { return x.g.prob; }, f: function (x) { return U.pct(x.g.prob); } },
            { k: 'war', l: 'WAR', cls: 'num', v: function (x) { return x.p.r ? x.p.WAR : null; }, f: function (x) { return x.p.r ? ui.warCell(x.p.WAR) : '–'; } },
            { k: 'dv', l: 'Dynasty', cls: 'num', v: function (x) { return x.p.DV; }, f: function (x) { return U.fmt(x.p.DV, 1); } }]
        });
      } else if (tab === 'rank') {
        var pool = E.P.filter(function (p) { return (p.ct === 'MNR' && p.gm) || (!p.gm && (p.age || 30) <= 22 && (p.cgp || 0) < 82); });
        body.innerHTML = '<p class="small muted">Rostered MNR players plus unowned prospects aged 22 or under. Value = dynasty value (prospect model: age-adjusted NHLe blended with a draft-slot prior, probability of becoming an NHL regular, ETA, then league contract rules). "Brings" = the categories he projects to help most.</p><div id="rk"></div>';
        ui.table(U.qs('#rk', body), {
          rows: pool, sort: 'dv', csv: 'prospect-rankings.csv', search: function (p) { return p.n + ' ' + (p.gm || 'FA') + ' ' + p.t; },
          filters: [{ l: 'Owner', opts: [['', 'All'], ['__owned', 'Owned'], ['__fa', 'Unowned']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: ft, fn: function (p, v) { return v === '__owned' ? !!p.gm : v === '__fa' ? !p.gm : p.gm === v; } },
            { l: 'Pos', opts: [['', 'All'], ['F', 'F'], ['D', 'D'], ['G', 'G']], fn: function (p, v) { return p.slot === v; } }],
          rowCls: function (p) { return p.gm === me && me ? 'mine' : ''; },
          cols: [{ k: 'n', l: 'Player', v: function (p) { return p.n; }, f: function (p) { return ui.pcell(p); } }, { k: 'pos', l: 'Pos', v: function (p) { return p.slot; }, f: ui.pos }, { k: 'gm', l: 'Owner', v: function (p) { return p.gm || 'zz'; }, f: ui.owner },
            { k: 'dr', l: 'Drafted', v: function (p) { return p.dr ? p.dr[2] : 999; }, f: function (p) { return p.dr ? p.dr[0] + ' #' + p.dr[2] : '<span class="faint">undrafted</span>'; }, asc: true },
            { k: 'line', l: 'Best recent line', v: null, f: function (p) { var l = p._pros && p._pros.line; return l ? '<span class="small">' + esc(U.season(l.season) + ' ' + l.lg) + ' ' + l.pts + 'P/' + l.gp + 'GP</span>' : '–'; } },
            { k: 'nhle', l: 'NHLe', cls: 'num', title: 'NHL-equivalent points per 82 games', v: function (p) { return p._pros && p._pros.line ? p._pros.line.pace : null; }, f: function (p) { return p._pros && p._pros.line ? U.fmt(p._pros.line.pace, 0) : '–'; } },
            { k: 'peak', l: 'Peak pts/82', cls: 'num', v: function (p) { return p._pros ? p._pros.peakPts : null; }, f: function (p) { return p._pros && p._pros.peakPts ? U.fmt(p._pros.peakPts, 0) : '–'; } },
            { k: 'pn', l: 'P(NHL)', cls: 'num', v: function (p) { return p._pros ? p._pros.p : null; }, f: function (p) { return p._pros ? U.pct(p._pros.p) : '–'; } },
            { k: 'eta', l: 'ETA', cls: 'num', v: function (p) { return p._pros ? p._pros.eta : null; }, f: function (p) { return p._pros ? (p._pros.eta === 0 ? 'now' : E.YEARS[Math.min(6, p._pros.eta)].slice(2)) : '–'; } },
            { k: 'cats', l: 'Brings', v: null, f: function (p) { return '<span class="small">' + DP.prospectCats(p).map(esc).join(', ') + '</span>'; } },
            { k: 'cgp', l: 'Career GP', cls: 'num', v: function (p) { return p.cgp || 0; }, f: function (p) { return (p.cgp || 0) + '<span class="faint">/' + p.gradThr + '</span>'; } },
            { k: 'dv', l: 'Value', cls: 'num', v: function (p) { return p.DV; }, f: function (p) { return '<b>' + U.fmt(p.DV, 1) + '</b>'; } }]
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

  // ------------------------------------------------------------ Draft Center
  DP.pages.draft = {
    title: 'Draft Center',
    render: function (el, hsh) {
      var E = DP.E, q = hsh.q, tab = q.tab || 'nhl26', PR = DP.prospects || {}, me = DP.state.team;
      var boards = PR.boards || {};
      var h = '<div class="page-head"><h1>Draft Center</h1><p class="sub">2026 NHL Draft results (NHL API) with the pre-draft scouting notes, the league\'s own rookie drafts, and early boards for 2027, 2028 and 2029 built from public rankings.</p></div>';
      h += tabs(tab, [['nhl26', '2026 NHL Draft'], ['league', 'League drafts'], ['b2027', '2027 board'], ['b2028', '2028 board'], ['b2029', '2029 board']]);
      h += '<div id="dc-body"></div>';
      el.innerHTML = h;
      wireTabs(el, 'draft', q);
      var body = U.qs('#dc-body', el);
      if (tab === 'nhl26') {
        var picks = PR.draft2026 || [];
        body.innerHTML = '<p class="small muted">' + picks.length + ' picks. "League" = the Dynasty Puck team that owns him now. Scouting notes, styles, category profiles and risers/fallers come from the pre-draft notes in the old Prospect app (prospect-app/draft_2026.csv).</p><div id="d26"></div>';
        ui.table(U.qs('#d26', body), {
          rows: picks, sort: 'ov', desc: false, csv: 'nhl-draft-2026.csv', page: 64, search: function (r) { return r.n + ' ' + r.team + ' ' + (r.club || '') + ' ' + (r.gm || ''); },
          filters: [{ l: 'Round', opts: [['', 'All'], ['1', '1'], ['2', '2'], ['3', '3'], ['4+', '4+']], fn: function (r, v) { return v === '4+' ? r.rd >= 4 : r.rd === +v; } },
            { l: 'League status', opts: [['', 'All'], ['owned', 'Owned in league'], ['avail', 'Unowned']], fn: function (r, v) { return v === 'owned' ? !!r.gm : !r.gm; } }],
          rowCls: function (r) { return r.gm && r.gm === me ? 'mine' : ''; },
          cols: [{ k: 'ov', l: '#', cls: 'num', v: function (r) { return r.ov; } }, { k: 'team', l: 'NHL', v: function (r) { return r.team; } },
            { k: 'n', l: 'Player', v: function (r) { return r.n; }, f: function (r) { var p = r.fid && E.byId[r.fid]; return (p ? ui.plink(p) : '<b>' + esc(r.n) + '</b>') + ' <span class="faint small">' + esc(r.pos || '') + ' · ' + esc(r.nat || '') + '</span>'; } },
            { k: 'club', l: 'Club', v: function (r) { return (r.lg || '') + ' ' + (r.club || ''); }, f: function (r) { return '<span class="small">' + esc((r.club || '') + (r.lg ? ' (' + r.lg + ')' : '')) + '</span>'; } },
            { k: 'gm', l: 'League', v: function (r) { return r.gm || 'zz'; }, f: function (r) { return r.gm ? '<b>' + esc(r.gm) + '</b>' : '<span class="faint">unowned</span>'; } },
            { k: 'pre', l: 'Pre-draft rank', cls: 'num', v: function (r) { return r.pre ? r.pre.rank : null; }, f: function (r) { return r.pre ? r.pre.rank + (r.pre.rank - r.ov >= 10 ? ' <span class="badge good" title="Went earlier than the pre-draft rank">↑</span>' : r.ov - r.pre.rank >= 10 ? ' <span class="badge warn" title="Slid past the pre-draft rank">↓</span>' : '') : '–'; } },
            { k: 'style', l: 'Style', v: function (r) { return r.pre ? r.pre.style : ''; }, f: function (r) { return r.pre ? '<span class="small">' + esc(r.pre.style) + '</span>' : ''; } },
            { k: 'cats', l: 'Fantasy cats', v: function (r) { return r.pre ? r.pre.cats : ''; }, f: function (r) { return r.pre ? '<span class="small">' + esc(r.pre.cats) + '</span>' : ''; } },
            { k: 'trend', l: 'Trend', v: function (r) { return r.pre ? r.pre.trend : ''; }, f: function (r) { return r.pre && r.pre.trend ? (r.pre.trend === 'up' ? '<span class="good">▲ riser</span>' : r.pre.trend === 'down' ? '<span class="bad">▼ faller</span>' : '<span class="muted">stable</span>') : ''; } },
            { k: 'line', l: '2025-26', v: null, f: function (r) { var s = (r.car || []).filter(function (x) { return x[0] === 20252026; }).sort(function (a, b) { return b[3] - a[3]; })[0]; return s ? '<span class="small">' + esc(s[1]) + ' ' + s[3] + 'GP ' + (r.pos === 'G' ? U.rate(s[6]) : s[4] + '-' + s[5] + '-' + s[6]) + '</span>' : ''; } },
            { k: 'note', l: 'Scouting note', v: null, f: function (r) { return r.pre ? '<span class="small">' + esc(r.pre.note) + (r.pre.stock ? ' <i class="muted">' + esc(r.pre.stock) + '</i>' : '') + '</span>' : ''; } }]
        });
      } else if (tab === 'league') {
        leagueDrafts(body, q);
      } else {
        var y = tab.slice(1), b = boards[y];
        if (!b || !b.players || !b.players.length) { body.innerHTML = '<div class="callout warn">The ' + y + ' board is being researched and will appear here after the next data build.</div>'; return; }
        body.innerHTML = '<p class="small muted">' + esc(b.note || '') + ' Updated ' + esc(b.updated || '') + '. Sources: ' + (b.sources || []).map(function (s) { return '<a target="_blank" rel="noopener" href="' + esc(s.url) + '">' + esc(s.name) + '</a>'; }).join(', ') + '. Stats are from the listed sources; blank means not found. Style, categories, ceiling, comparison and notes are fantasy-focused analysis, not facts.</p><div id="bd"></div>';
        ui.table(U.qs('#bd', body), {
          rows: b.players, sort: 'rank', desc: false, csv: 'draft-board-' + y + '.csv', page: 80, search: function (r) { return r.name + ' ' + (r.team || '') + ' ' + (r.league || ''); },
          filters: [{ l: 'Pos', opts: [['', 'All'], ['F', 'Forwards'], ['D', 'Defense'], ['G', 'Goalies']], fn: function (r, v) { var ps = (r.pos || '').toUpperCase(); return v === 'G' ? ps === 'G' : v === 'D' ? /D/.test(ps) && ps.length <= 2 : !/^(G|LD|RD|D)$/.test(ps); } }],
          cols: [{ k: 'rank', l: '#', cls: 'num', v: function (r) { return r.rank; } },
            { k: 'name', l: 'Player', v: function (r) { return r.name; }, f: function (r) { return '<b>' + esc(r.name) + '</b> <span class="faint small">' + esc([r.pos, r.shoots ? 'shoots ' + r.shoots : '', r.nat].filter(Boolean).join(' · ')) + '</span>' + (r.gm ? ' <span class="badge info">' + esc(r.gm) + '</span>' : ''); } },
            { k: 'bio', l: 'Born / size', v: function (r) { return r.dob || ''; }, f: function (r) { return '<span class="small">' + esc([r.dob, r.height, r.weight ? r.weight + ' lb' : ''].filter(Boolean).join(' · ')) + '</span>'; } },
            { k: 'team', l: 'Team', v: function (r) { return (r.team || '') + ' ' + (r.league || ''); }, f: function (r) { return '<span class="small">' + esc((r.team || '') + (r.league ? ' (' + r.league + ')' : '')) + '</span>'; } },
            { k: 'ls', l: 'Last season', v: function (r) { return r.last_season && r.last_season.pts; }, f: function (r) { var s = r.last_season; return s && s.gp ? '<span class="small">' + esc((s.season || '') + ' ' + (s.league || '')) + ' ' + s.gp + 'GP ' + (s.g !== undefined && s.g !== null ? s.g + '-' + s.a + '-' + s.pts : (s.sv ? s.sv : '')) + '</span>' : '<span class="faint">–</span>'; } },
            { k: 'style', l: 'Style', v: function (r) { return r.style || ''; }, f: function (r) { return '<span class="small">' + esc(r.style || '') + '</span>'; } },
            { k: 'cats', l: 'Our cats', v: function (r) { return (r.cats || []).join(', '); }, f: function (r) { return '<span class="small">' + esc((r.cats || []).join(', ')) + '</span>'; } },
            { k: 'ceiling', l: 'Ceiling', v: function (r) { return r.ceiling || ''; }, f: function (r) { return '<span class="small">' + esc(r.ceiling || '') + '</span>'; } },
            { k: 'comp', l: 'NHL comp', v: function (r) { return r.comp || ''; }, f: function (r) { return '<span class="small">' + esc(r.comp || '') + '</span>'; } },
            { k: 'note', l: 'Fantasy note', v: null, f: function (r) { return '<span class="small">' + esc(r.note || '') + '</span>' + (r.tags && r.tags.length ? ' ' + r.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join(' ') : ''); } },
            { k: 'src', l: 'Sources', v: null, f: function (r) { return '<span class="small">' + (r.sources || []).map(function (s) { return typeof s === 'string' ? esc(s) : '<a target="_blank" rel="noopener" href="' + esc(s.url || '#') + '">' + esc(s.name + (s.rank ? ' #' + s.rank : '')) + '</a>'; }).join(', ') + '</span>'; } }]
        });
      }
    }
  };

  function leagueDrafts(body, q) {
    var E = DP.E, D = (DP.league && DP.league.drafts) || {}, which = q.d || '2026', me = DP.state.team;
    var d = D[which];
    var h = '<div class="controls"><div class="seg">' + Object.keys(D).sort().reverse().map(function (k) { return '<button data-d="' + k + '" class="' + (k === which ? 'on' : '') + '">' + esc(D[k].name) + '</button>'; }).join('') + '</div></div>';
    if (!d) { body.innerHTML = h + '<p class="muted">No league draft data.</p>'; return; }
    var rows = d.picks.map(function (pk) { var p = pk.id && E.byId[pk.id]; return { pk: pk, p: p, v: p ? p.DV : 0 }; });
    // model rank of each pick within the draft (by today's value) -> steal / reach
    var byV = rows.slice().sort(function (a, b) { return b.v - a.v; });
    byV.forEach(function (r, i) { r.mrank = i + 1; });
    // grades: value drafted per team (by who made the pick)
    var grade = {};
    rows.forEach(function (r) { var t = r.pk.owner; if (!t) return; grade[t] = grade[t] || { t: t, n: 0, v: 0, best: null }; grade[t].n++; grade[t].v += Math.max(0, r.v); if (!grade[t].best || r.v > grade[t].best.v) grade[t].best = r; });
    var gl = Object.keys(grade).map(function (k) { return grade[k]; }).sort(function (a, b) { return b.v - a.v; });
    gl.forEach(function (g, i) { g.grade = ui.gradeOf(1 - i / Math.max(1, gl.length - 1)); });
    h += '<div class="grid g2"><div class="card span2"><h2>' + esc(d.name) + '</h2><div class="hint">' + d.picks.length + ' picks, ' + d.rounds + ' rounds' + (d.snake ? ' (snake)' : ' (straight order, reverse standings)') + '. Value = each player\'s dynasty value today. <b>Steal</b> = the model ranks him 8+ spots above where he went; <b>reach</b> = 8+ below. ' + (which === '2026' ? 'This draft sets the pick-value curve used for future picks.' : 'Picks are credited to today\'s team. Three 2025 franchises have since changed hands (now Beginner\'s Luck, Colganites and Bethesda Bullies), inferred from where their picks sit today.') + '</div><div id="ld"></div></div>';
    h += '<div class="card span2"><h2>Draft grades (by value drafted)</h2><div id="lg"></div></div></div>';
    body.innerHTML = h;
    U.qsa('[data-d]', body).forEach(function (b) { b.addEventListener('click', function () { DP.go('draft', null, { tab: 'league', d: b.dataset.d }); }); });
    ui.table(U.qs('#ld', body), {
      rows: rows, sort: 'ov', desc: false, page: 60, csv: 'league-draft-' + which + '.csv', search: function (r) { return r.pk.n + ' ' + (r.pk.owner || '') + ' ' + (r.pk.orig || ''); },
      filters: [{ l: 'Team', opts: [['', 'All']].concat(DP.meta.gms.map(function (g) { return [g.code, g.code]; })), def: me && which === '2026' ? '' : '', fn: function (r, v) { return r.pk.owner === v || r.pk.orig === v; } },
        { l: 'Round', opts: [['', 'All']].concat(Array.apply(null, Array(d.rounds)).map(function (_, i) { return [String(i + 1), 'R' + (i + 1)]; })), fn: function (r, v) { return r.pk.rd === +v; } }],
      rowCls: function (r) { return r.pk.owner === me ? 'mine' : ''; },
      cols: [{ k: 'ov', l: 'Pick', cls: 'num', v: function (r) { return r.pk.ov; } }, { k: 'rd', l: 'Rd', cls: 'num', v: function (r) { return r.pk.rd; } },
        { k: 'owner', l: 'Made by', v: function (r) { return r.pk.owner || ''; }, f: function (r) { return '<b>' + esc(r.pk.owner || '?') + '</b>' + (r.pk.orig !== r.pk.owner ? ' <span class="small muted">(' + esc(r.pk.orig || '?') + '\'s pick)</span>' : ''); } },
        { k: 'n', l: 'Player', v: function (r) { return r.pk.n; }, f: function (r) { return r.p ? ui.plink(r.p) + ' <span class="faint small">' + esc(r.p.slot + ' · ' + (r.p.dr ? 'NHL ' + r.p.dr[0] + ' #' + r.p.dr[2] : '')) + '</span>' : esc(r.pk.n); } },
        { k: 'now', l: 'Now with', v: function (r) { return r.p ? (r.p.gm || 'FA') : ''; }, f: function (r) { return r.p ? ui.owner(r.p) : ''; } },
        { k: 'ct', l: 'Contract now', v: function (r) { return r.p ? r.p.ct : ''; }, f: function (r) { return r.p ? ui.pill(r.p.ct) : ''; } },
        { k: 'v', l: 'Value today', cls: 'num', v: function (r) { return r.v; }, f: function (r) { return '<b>' + U.fmt(r.v, 1) + '</b>'; } },
        { k: 'mr', l: 'Model rank', cls: 'num', v: function (r) { return r.mrank; }, f: function (r) { var d2 = r.pk.ov - r.mrank; return r.mrank + (d2 >= 8 ? ' <span class="badge good">steal</span>' : d2 <= -8 ? ' <span class="badge warn">reach</span>' : ''); } }]
    });
    ui.table(U.qs('#lg', body), {
      rows: gl, sort: 'v', rowCls: function (g) { return g.t === me ? 'mine' : ''; },
      cols: [{ k: 't', l: 'Team', v: function (g) { return U.teamName(g.t); }, f: function (g) { return '<b>' + esc(U.teamName(g.t)) + '</b>'; } }, { k: 'grade', l: 'Grade', v: function (g) { return g.v; }, f: function (g) { return '<b>' + g.grade + '</b>'; } },
        { k: 'n', l: 'Picks made', cls: 'num' }, { k: 'v', l: 'Value drafted', cls: 'num', v: function (g) { return g.v; }, f: function (g) { return U.fmt(g.v, 1); } },
        { k: 'best', l: 'Best pick', v: null, f: function (g) { return g.best && g.best.p ? ui.plink(g.best.p) + ' <span class="small muted">#' + g.best.pk.ov + '</span>' : ''; } }]
    });
  }
})();
