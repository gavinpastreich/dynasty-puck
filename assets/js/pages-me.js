/* Dynasty Puck HQ - personal touches kept on this device: the prospect watchlist (star a prospect, see how his stock
   moved since) and "since your last visit" on the Dashboard. Nothing leaves the browser (localStorage via U.store). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;

  // ------------------------------------------------------------ watchlist: { radar key: { s: stock, r: rank, d: date starred } }
  DP.watch = {
    all: function () { return U.store.get('watch', {}) || {}; },
    has: function (k) { return !!DP.watch.all()[k]; },
    toggle: function (k) {
      var W = DP.watch.all(), V = DP.radarView ? DP.radarView() : null, row = V && V.by[k];
      if (W[k]) delete W[k];
      else W[k] = { s: row ? +row.stock.toFixed(2) : null, r: row ? row.rank : null, d: new Date().toISOString().slice(0, 10), n: row ? row.p.n : k };
      U.store.set('watch', W);
      return !!W[k];
    },
    btn: function (k) { var on = DP.watch.has(k); return '<button type="button" class="btn sm star' + (on ? ' on' : '') + '" data-watch="' + esc(k) + '" aria-pressed="' + on + '" title="' + (on ? 'Remove from' : 'Add to') + ' your watchlist (kept on this device)">' + (on ? '★ Watching' : '☆ Watch') + '</button>'; }
  };
  // one click handler for every star on the page
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-watch]'); if (!b) return;
    var on = DP.watch.toggle(b.dataset.watch);
    U.qsa('[data-watch="' + b.dataset.watch + '"]').forEach(function (x) { x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); x.textContent = x.classList.contains('mini') ? (on ? '★' : '☆') : (on ? '★ Watching' : '☆ Watch'); });
    U.toast(on ? 'Added to your watchlist (Prospect Radar → Watchlist)' : 'Removed from your watchlist');
  });
  // the Radar's Watchlist tab
  DP.watchTab = function (body) {
    var W = DP.watch.all(), V = DP.radarView(), R = V.R, keys = Object.keys(W);
    if (!keys.length) { body.innerHTML = '<div class="callout">No one on your watchlist yet. Open any prospect\'s report and press <b>☆ Watch</b>, or use the ☆ in the Rankings table. The list is kept on this device.</div>'; return; }
    var rows = keys.map(function (k) { var row = V.by[k]; return { k: k, w: W[k], row: row }; });
    body.innerHTML = '<div id="wl-t"></div><p class="small muted">Stock and rank when you starred him, and now (Prospect Radar model). Kept on this device only.</p>';
    ui.table(U.qs('#wl-t', body), {
      rows: rows, sort: 'chg', csv: 'my-prospect-watchlist.csv',
      cols: [
        { k: 'n', l: 'Prospect', v: function (r) { return r.w.n; }, f: function (r) { return r.row ? '<a class="plink" href="' + U.hash('radar', null, { p: r.k }) + '">' + esc(r.row.p.n) + '</a> <span class="faint small">' + esc(r.row.p.t || '') + '</span>' : esc(r.w.n) + ' <span class="faint small">no longer in the pool</span>'; } },
        { k: 'own', l: 'Owner', v: function (r) { return r.row && r.row.p.gm || 'zz'; }, f: function (r) { return r.row ? (r.row.x.owned ? U.teamLabel(r.row.p.gm) : '<span class="muted">' + (r.row.x.inPool ? 'unowned' : 'not in Fantrax') + '</span>') : '–'; } },
        { k: 'where', l: 'Playing', v: null, f: function (r) { return r.row && r.row.where ? esc(r.row.where.lg) + ' <span class="faint small">' + esc(r.row.where.team || '') + '</span>' : '–'; } },
        { k: 'since', l: 'Starred', v: function (r) { return r.w.d; }, f: function (r) { return '<span class="small">' + esc(U.date(new Date(r.w.d + 'T12:00:00Z'))) + '</span>'; } },
        { k: 'stock', l: 'Stock', cls: 'num', v: function (r) { return r.row ? r.row.stock : null; }, f: function (r) { return r.row ? U.fmt(r.row.stock, 1) + ' <span class="faint small">#' + r.row.rank + '</span>' : '–'; } },
        { k: 'chg', l: 'Since starred', cls: 'num', v: function (r) { return r.row && r.w.s !== null ? r.row.stock - r.w.s : null; }, f: function (r) { if (!r.row || r.w.s === null) return '–'; var d = +(r.row.stock - r.w.s).toFixed(1) || 0, dr = r.w.r ? r.w.r - r.row.rank : 0; return ui.delta(d, 1) + (dr ? ' <span class="small ' + (dr > 0 ? 'good' : 'bad') + '">' + (dr > 0 ? '▲' : '▼') + Math.abs(dr) + '</span>' : ''); } },
        { k: 'news', l: 'Latest headline', v: null, f: function (r) { var it = r.row && r.row.news[0]; return it ? '<span class="small"><a target="_blank" rel="noopener" href="' + esc(it.u) + '">' + esc(it.t.slice(0, 70)) + (it.t.length > 70 ? '…' : '') + '</a> <span class="faint">' + esc(U.date(new Date(it.d + 'T12:00:00Z'))) + '</span></span>' : '<span class="faint small">–</span>'; } },
        { k: 'x', l: '', v: null, csv: false, f: function (r) { return '<button type="button" class="btn sm star on mini" data-watch="' + esc(r.k) + '" aria-pressed="true" title="Remove">★</button>'; } }
      ]
    });
  };

  // ------------------------------------------------------------ since your last visit
  // visitAt = this device's last activity; when a visit starts more than 3 hours after it, that time becomes visitSince
  DP.noteVisit = function () {
    var now = Date.now(), last = U.store.get('visitAt', null);
    if (last && now - last > 3 * 3600e3) U.store.set('visitSince', last);
    U.store.set('visitAt', now);
  };
  DP.sinceData = function (me, since) {
    var E = DP.E, d0 = new Date(since).toISOString().slice(0, 10), out = { since: since, d0: d0, items: [] };
    var trades = (DP.league.trades || []).filter(function (t) { return t.date >= d0; });
    var moves = (DP.league.moves || []).filter(function (m) { return m.d >= d0; });
    if (trades.length) out.items.push({ ic: '🔁', html: trades.length + ' trade' + (trades.length > 1 ? 's' : '') + ': ' + trades.slice(0, 3).map(function (t) { return t.teams.map(esc).join(' / '); }).join('; '), href: '#/history' });
    var adds = moves.filter(function (m) { return m.type === 'add'; }), drops = moves.filter(function (m) { return m.type === 'drop'; });
    if (adds.length || drops.length) {
      var mine = me ? moves.filter(function (m) { return (m.to === me || m.from === me) && (m.type === 'add' || m.type === 'drop'); }).length : 0;
      out.items.push({ ic: '📝', html: adds.length + ' pickup' + (adds.length === 1 ? '' : 's') + ' and ' + drops.length + ' drop' + (drops.length === 1 ? '' : 's') + ' around the league' + (mine ? ' (' + mine + ' yours)' : ''), href: '#/home' });
    }
    if (me) {
      var hurt = E.rosters[me].filter(function (p) { return p.inj && p.inj[3] >= d0; });
      if (hurt.length) out.items.push({ ic: '🩹', html: 'New on the injury report: ' + hurt.slice(0, 4).map(function (p) { return ui.plink(p) + ' (' + esc(p.inj[0]) + (p.inj[1] ? ', ' + esc(p.inj[1]) : '') + ')'; }).join(', ') + (hurt.length > 4 ? ' +' + (hurt.length - 4) : ''), href: '#/injuries' });
      var H = E.history(), wk = H.weeks.filter(function (w) { return w.games && w.games.length && w.to >= d0; });
      wk.forEach(function (w) {
        var g = w.games.filter(function (x) { return x.a === me || x.b === me; })[0]; if (!g) return;
        var s = g.a === me ? g.sa : g.sb, o = g.a === me ? g.b : g.a;
        out.items.push({ ic: s.W > s.L ? '✅' : s.W < s.L ? '❌' : '➖', html: 'Week ' + w.n + ': ' + (s.W > s.L ? 'beat ' : s.W < s.L ? 'lost to ' : 'tied ') + esc(U.teamName(o)) + ' ' + s.W + '-' + s.L + '-' + s.T, href: U.hash('weekly', null, { w: w.n }) });
      });
      // the newest Power Rankings, if a week finished since the last visit
      var lastW = wk.length ? wk[wk.length - 1].n : null;
      if (lastW && DP.powerAfter) {
        var P1 = DP.powerAfter(lastW), P0 = lastW > 1 ? DP.powerAfter(lastW - 1) : null, r1 = P1 && P1.by[me];
        if (r1) { var dd = P0 && P0.by[me] ? P0.by[me].rank - r1.rank : 0; out.items.push({ ic: '⚡', html: 'Power Rankings after week ' + lastW + ': <b>' + U.ord(r1.rank) + '</b>' + (dd > 0 ? ' <span class="good">▲' + dd + '</span>' : dd < 0 ? ' <span class="bad">▼' + (-dd) + '</span>' : ''), href: U.hash('power', null, { w: lastW }) }); }
      }
    }
    // prospect stock: yours and your watchlist, from the nightly radar history
    var V = DP.radarView ? DP.radarView() : null, R = V && V.R;
    if (R && R.dates.length) {
      var i0 = R.dates.findIndex(function (d) { return d >= d0; }), last = R.dates.length - 1;
      if (i0 >= 0 && i0 < last) {
        var W = DP.watch.all();
        var moved = V.rows.filter(function (r) { return r.h && ((me && r.x.owned && r.p.gm === me) || W[r.key]) && r.h.r[i0] && r.h.r[last]; }).map(function (r) { return { r: r, dr: r.h.r[i0] - r.h.r[last] }; })
          .filter(function (x) { return Math.abs(x.dr) >= 5; }).sort(function (a, b) { return Math.abs(b.dr) - Math.abs(a.dr); }).slice(0, 4);
        if (moved.length) out.items.push({ ic: '📡', html: 'Prospect stock: ' + moved.map(function (x) { return '<a href="' + U.hash('radar', null, { p: x.r.key }) + '">' + esc(x.r.p.n) + '</a> <span class="' + (x.dr > 0 ? 'good' : 'bad') + '">' + (x.dr > 0 ? '▲' : '▼') + Math.abs(x.dr) + '</span>'; }).join(', '), href: '#/radar' });
        var news = V.rows.filter(function (r) { return (me && r.x.owned && r.p.gm === me) || W[r.key]; }).reduce(function (n, r) { return n + r.news.filter(function (it) { return it.d >= d0; }).length; }, 0);
        if (news) out.items.push({ ic: '📰', html: news + ' new headline' + (news > 1 ? 's' : '') + ' about your prospects', href: '#/radar?tab=news&scope=mine' });
      }
    }
    return out;
  };
  DP.sinceCard = function (me) {
    var since = U.store.get('visitSince', null); if (!since) return '';
    var X = DP.sinceData(me, since); if (!X.items.length) return '';
    var when = new Date(since).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return '<div class="card since" style="margin-bottom:14px"><h2>🕒 Since your last visit <span class="small muted">' + esc(when) + '</span></h2><ul class="list-plain">' +
      X.items.map(function (it) { return '<li><span class="ic" aria-hidden="true">' + it.ic + '</span><span>' + it.html + '</span>' + (it.href ? '<a class="small" style="margin-left:auto" href="' + it.href + '">→</a>' : '') + '</li>'; }).join('') + '<li data-since-lines="' + esc(new Date(since).toISOString().slice(0, 10)) + '" hidden></li></ul></div>';
  };
})();
