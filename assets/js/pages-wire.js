/* Dynasty Puck HQ - Transactions: every move this season (Fantrax log: adds, drops, trades, picks, cap space), the
   best pickups (dynasty value when added vs now from data/values.js, and what they produced in the adding team's
   locked lineups from data/weeks/wNN.js), the drops that got away, and how active each GM has been. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};
  var KIND = { add: ['Add', 'good'], drop: ['Drop', 'bad'], move: ['Trade', 'info'], pick: ['Pick', 'info'], cap: ['Cap space', 'warn'] };
  function day(d) { return U.date(new Date(d + 'T12:00:00Z')); }

  // value of a player on the first night on file on or after date d (null = not on file)
  DP.valueAt = function (id, d) {
    var V = DP.values, o = V && V.p[id]; if (!o) return null;
    for (var i = 0; i < V.dates.length; i++) if (V.dates[i] >= d) return o.v[i];
    return o.v[V.dates.length - 1];
  };
  // a player's lines in one team's locked lineups over the finished weeks starting on or after `from`
  DP.startsFor = function (id, team, from, details) {
    var E = DP.E, out = { wk: 0, line: null };
    details.forEach(function (W) {
      var w = E.weeks[W.n - 1], T = W.teams && W.teams[team];
      if (!w || w.end < from || !T || (T.active || []).indexOf(id) < 0) return;
      out.wk++;
      var l = T.pl && T.pl[id]; if (!l) return;
      if (!out.line) out.line = l.map(function () { return 0; });
      l.forEach(function (v, i) { out.line[i] += v; });
    });
    return out;
  };
  function lineTxt(p, s) {
    if (!s.line) return s.wk ? 'no games' : '';
    var l = s.line;
    if (p && p.G) return l[0] + ' GP · ' + l[1] + ' W · ' + (l[3] ? U.rate(1 - l[2] / l[3]) : '–') + ' SV%' + (l[4] ? ' · ' + l[4] + ' SO' : '');
    return l[0] + ' GP · ' + l[1] + ' G · ' + l[2] + ' A · ' + l[4] + ' SOG · ' + (l[6] + l[7]) + ' hits+blocks';
  }
  DP.transactions = function (details) {
    var E = DP.E, M = (DP.league.moves || []).slice(), V = DP.values, n = V ? V.dates.length - 1 : 0;
    var now = function (id) { var o = V && V.p[id]; return o ? o.v[n] : null; };
    var adds = M.filter(function (m) { return m.type === 'add'; }).map(function (m) {
      var p = E.byId[m.id], v0 = DP.valueAt(m.id, m.d), v1 = now(m.id), st = DP.startsFor(m.id, m.to, m.d, details);
      return { m: m, p: p, v0: v0, v1: v1, d: v0 !== null && v1 !== null ? v1 - v0 : null, st: st, kept: p && p.gm === m.to };
    });
    var drops = M.filter(function (m) { return m.type === 'drop'; }).map(function (m) {
      var p = E.byId[m.id], v0 = DP.valueAt(m.id, m.d), v1 = now(m.id);
      return { m: m, p: p, v0: v0, v1: v1, d: v0 !== null && v1 !== null ? v1 - v0 : null, gm: p && p.gm };
    });
    var act = {}; E.teams.forEach(function (t) { act[t] = { t: t, add: 0, drop: 0, trade: 0, cap: 0 }; });
    var tradeDays = {};
    M.forEach(function (m) {
      if (m.type === 'add' && act[m.to]) act[m.to].add++;
      else if (m.type === 'drop' && act[m.from]) act[m.from].drop++;
      else if (m.type === 'move' || m.type === 'pick' || m.type === 'cap') { [m.from, m.to].forEach(function (t) { if (act[t]) (tradeDays[t] = tradeDays[t] || {})[m.d] = 1; }); if (m.type === 'cap') { if (act[m.from]) act[m.from].cap -= m.amt / 1e6; if (act[m.to]) act[m.to].cap += m.amt / 1e6; } }
    });
    E.teams.forEach(function (t) { act[t].trade = Object.keys(tradeDays[t] || {}).length; act[t].total = act[t].add + act[t].drop + act[t].trade; });
    return { all: M, adds: adds, drops: drops, act: E.teams.map(function (t) { return act[t]; }) };
  };

  DP.pages.moves = {
    title: 'Transactions',
    render: function (el, hsh) {
      var E = DP.E, me = DP.state.team, q = hsh.q;
      var h = '<div class="page-head"><h1>🧾 Transactions</h1><p class="sub">Every move this season from the Fantrax log: adds, drops, trades, picks and cap space. Plus the best pickups (dynasty value when added vs now, and what they did in the locked lineup of the team that added them), the drops that got away, and how busy each GM has been.</p></div>';
      el.innerHTML = h + '<div class="lz"><p class="muted small">Loading the value history and the weekly lines…</p></div>';
      var weeks = E.history().weeks.map(function (w) { return w.n; });
      DP.loadValues(function () {
        DP.loadWeeks(weeks, function (details) {
          var box = U.qs('.lz', el); if (!box) return;
          var X = DP.transactions(details), hh = '';
          var pk = X.adds.filter(function (a) { return a.p; });
          var score = function (a) { return (a.d || 0) + 0.6 * a.st.wk; };
          var best = pk.slice().sort(function (a, b) { return score(b) - score(a); }).slice(0, 10);
          var li = function (a) {
            return '<li><div class="fml">' + ui.pcell(a.p, { pos: 1 }) + '<div class="fmd small muted">' + esc(day(a.m.d)) + ' · ' + U.teamLabel(a.m.to) + (a.kept ? '' : ' · <span class="faint">since moved on</span>') + (a.st.wk ? ' · ' + a.st.wk + ' week' + (a.st.wk > 1 ? 's' : '') + ' started: ' + esc(lineTxt(a.p, a.st)) : ' · not started yet') + '</div></div>' +
              '<span class="fmr small">' + (a.v0 === null ? '–' : U.fmt(a.v0, 1)) + ' → <b>' + (a.v1 === null ? '–' : U.fmt(a.v1, 1)) + '</b><br>' + ui.delta(a.d, 1) + '</span></li>';
          };
          var gone = X.drops.filter(function (d) { return d.p && d.d !== null && d.d > 0.3; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 8);
          hh += '<div class="grid g2"><div class="card"><h2>🏅 Best pickups of the season</h2><div class="hint">Value gained since the add plus weeks in the adding team\'s locked lineup. Value then → now (model estimate).</div>' + (best.length ? '<ul class="list-plain fmlist">' + best.map(li).join('') + '</ul>' : '<p class="small muted">No pickups yet.</p>') + '</div>';
          hh += '<div class="card"><h2>🎣 The ones that got away</h2><div class="hint">Dropped players whose value has gone up most since.</div>' + (gone.length ? '<ul class="list-plain fmlist">' + gone.map(function (d) {
            return '<li><div class="fml">' + ui.pcell(d.p, { pos: 1 }) + '<div class="fmd small muted">dropped ' + esc(day(d.m.d)) + ' by ' + U.teamLabel(d.m.from) + ' · now ' + (d.gm ? 'with ' + U.teamLabel(d.gm) : 'a free agent') + '</div></div><span class="fmr small">' + U.fmt(d.v0, 1) + ' → <b>' + U.fmt(d.v1, 1) + '</b><br>' + ui.delta(d.d, 1) + '</span></li>';
          }).join('') + '</ul>' : '<p class="small muted">No dropped player has gained much value since.</p>') + '</div></div>';
          var A = X.act.slice().sort(function (a, b) { return b.total - a.total; });
          hh += '<div class="card" style="margin-top:14px"><h2>📊 GM activity</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Team</th><th class="num">Adds</th><th class="num">Drops</th><th class="num">Trades</th><th class="num">Cap space traded</th></tr></thead><tbody>' +
            A.map(function (a) { return '<tr class="' + (a.t === me ? 'mine' : '') + '"><td>' + U.teamChip(a.t, { link: 1 }) + '</td><td class="num">' + a.add + '</td><td class="num">' + a.drop + '</td><td class="num">' + a.trade + '</td><td class="num">' + (a.cap ? ui.delta(a.cap, 1) + 'M' : '–') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="small muted">Trades = days with a trade. Cap space: + received, − sent (this season only).</p></div>';
          hh += '<div class="card flush" style="margin-top:14px"><h2>Every move</h2><div id="mv-log" style="padding:0 12px 12px"></div></div>';
          box.innerHTML = hh;
          var byAdd = {}; X.adds.forEach(function (a) { byAdd[a.m.d + a.m.id] = a; });
          ui.table(U.qs('#mv-log', el), {
            rows: X.all.slice().reverse(), sort: 'd', csv: 'transactions.csv', search: function (m) { return m.n + ' ' + (m.from || '') + ' ' + (m.to || ''); },
            rowCls: function (m) { return me && (m.to === me || m.from === me) ? 'mine' : ''; },
            filters: [{ l: 'Type', opts: [['', 'All'], ['add', 'Adds'], ['drop', 'Drops'], ['move', 'Trades'], ['pick', 'Picks'], ['cap', 'Cap space']], fn: function (m, v) { return m.type === v; } },
              { l: 'Team', opts: [['', 'Everyone']].concat(E.teams.map(function (t) { return [t, U.teamName(t)]; })), fn: function (m, v) { return m.to === v || m.from === v; }, def: q.team || '' }],
            cols: [
              { k: 'd', l: 'Date', v: function (m) { return m.d; }, f: function (m) { return '<span class="small nw">' + esc(day(m.d)) + '</span>'; } },
              { k: 'type', l: 'Type', v: function (m) { return m.type; }, f: function (m) { var k = KIND[m.type] || [m.type, '']; return '<span class="badge ' + k[1] + '">' + esc(k[0]) + '</span>'; } },
              { k: 'n', l: 'What', v: function (m) { return m.n; }, f: function (m) { var p = DP.E.byId[m.id]; return p ? ui.pcell(p, { pos: 1 }) : esc(m.n); } },
              { k: 'from', l: 'From', v: function (m) { return m.from || ''; }, f: function (m) { return m.from ? U.teamLabel(m.from) : '<span class="muted">FA</span>'; } },
              { k: 'to', l: 'To', v: function (m) { return m.to || ''; }, f: function (m) { return m.to ? U.teamLabel(m.to) : '<span class="muted">FA</span>'; } },
              { k: 'ct', l: 'Contract', v: function (m) { return m.sal || 0; }, f: function (m) { return m.type === 'cap' ? U.m(m.amt / 1e6, 2) : m.ct ? esc(m.ct) + (m.sal ? ' ' + U.m(m.sal / 1e6, 2) : '') : ''; } },
              { k: 'val', l: 'Value then → now', cls: 'num', v: function (m) { var v1 = DP.values && DP.values.p[m.id]; return v1 ? v1.v[DP.values.dates.length - 1] : null; }, f: function (m) { var v0 = DP.valueAt(m.id, m.d), o = DP.values && DP.values.p[m.id]; if (!o) return ''; var v1 = o.v[DP.values.dates.length - 1]; return (v0 === null ? '–' : U.fmt(v0, 1)) + ' → ' + U.fmt(v1, 1); } },
              { k: 'st', l: 'Since', v: function (m) { var a = byAdd[m.d + m.id]; return a ? a.st.wk : -1; }, f: function (m) { var a = byAdd[m.d + m.id]; return a && a.st.wk ? '<span class="small">' + a.st.wk + ' wk: ' + esc(lineTxt(a.p, a.st)) + '</span>' : ''; } }
            ]
          });
        });
      });
    }
  };
})();
