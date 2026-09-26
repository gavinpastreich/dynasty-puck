/* Dynasty Puck HQ - live Fantrax sync.
 * Fantrax's public league API allows cross-origin reads, so every visit pulls the current rosters (for the next
 * lineup lock) and standings straight from Fantrax and applies whatever changed since the nightly build:
 * owners, contracts, salaries, lineup slots. Values and sims recompute only when ownership or contracts changed. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  var FX = DP.league && DP.league.fantrax;
  var BASE = 'https://www.fantrax.com/fxea/general/';
  var SLOT = { ACTIVE: 'A', RESERVE: 'R', MINORS: 'M', INJURED_RESERVE: 'IR' };
  DP.SLOT_NAME = { A: 'Active', R: 'Bench', M: 'Minors', IR: 'IR' };
  var live = DP.live = { state: FX ? 'idle' : 'off', changes: [], unknown: [], standings: null, at: null, period: null };

  function getJSON(ep, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 8000);
    return fetch(BASE + ep, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function chip() {
    var b = U.qs('#livebtn'); if (!b) return;
    var st = live.state, t = live.at ? live.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    var n = live.changes.length;
    b.className = 'livebtn ' + st;
    b.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="lt">' +
      (st === 'ok' ? 'Live' : st === 'loading' ? 'Syncing' : st === 'off' ? 'Nightly' : 'Nightly') + '</span>';
    b.title = st === 'ok' ? 'Rosters, contracts, lineups and standings synced live from Fantrax at ' + t + '. ' +
      (n ? n + ' change' + (n > 1 ? 's' : '') + ' since the nightly build (click for details).' : 'No changes since the nightly build.')
      : st === 'loading' ? 'Syncing with Fantrax…'
      : st === 'fail' ? 'Could not reach Fantrax; showing the nightly build from ' + DP.meta.built.replace('T', ' ') + '. Click to retry.'
      : 'Live sync is off; showing the nightly build. Click to turn it on.';
  }

  function teamCode(tid, name) {
    if (FX.teamIds && FX.teamIds[tid]) return FX.teamIds[tid];
    var g = DP.meta.gms.find(function (x) { return x.name === name; });
    return g ? g.code : null;
  }

  // apply a getTeamRosters response; returns {changes, slots}
  live.apply = function (ros) {
    var byId = {}; DP.players.forEach(function (p) { byId[p.id] = p; });
    var seen = {}, changes = [], slots = 0, unknown = [];
    Object.keys(ros.rosters || {}).forEach(function (tid) {
      var t = ros.rosters[tid], gm = teamCode(tid, t.teamName);
      if (!gm) return;
      (t.rosterItems || []).forEach(function (it) {
        var id = '*' + it.id + '*', p = byId[id];
        if (!p) { unknown.push({ id: it.id, gm: gm }); return; }
        seen[id] = 1;
        var ct = (it.contract && it.contract.name) || p.ct, sal = Math.round(+it.salary || 0), fs = SLOT[it.status] || it.status;
        if (p.gm !== gm) { changes.push({ p: p, type: p.gm ? 'move' : 'add', from: p.gm, to: gm, ct: ct, sal: sal }); p.gm = gm; p.wv = 0; }
        else if (p.ct !== ct || p.sal !== sal) changes.push({ p: p, type: 'contract', to: gm, ct: ct, sal: sal, was: [p.ct, p.sal] });
        if (p.ct !== ct) p.ct = ct;
        if (p.sal !== sal) {
          p.sal = sal;
          if (p.c && p.c.y && typeof p.c.y[0] === 'number' && ct !== 'MNR') p.c.y[0] = sal / 1e6;
        }
        if (p.fs !== fs) { p.fs = fs; slots++; }
      });
    });
    DP.players.forEach(function (p) {
      if (p.gm && !seen[p.id]) { changes.push({ p: p, type: 'drop', from: p.gm, ct: p.ct, sal: p.sal }); p.gm = null; p.fs = null; }
    });
    return { changes: changes, slots: slots, unknown: unknown };
  };

  live.start = function (force) {
    if (!FX || !window.fetch) { live.state = 'off'; chip(); return; }
    if (!force && U.store.get('liveOff', false)) { live.state = 'off'; chip(); return; }
    live.state = 'loading'; chip();
    var E = DP.E, lw = E.lockWeek(), period = lw === null ? E.NW : lw + 1;
    Promise.all([
      getJSON('getTeamRosters?leagueId=' + FX.id + '&period=' + period),
      getJSON('getStandings?leagueId=' + FX.id).catch(function () { return null; })
    ]).then(function (res) {
      var r = live.apply(res[0]);
      live.period = res[0].period || period;
      if (Array.isArray(res[1])) {
        live.standings = res[1].map(function (x) {
          var w = String(x.points || '0-0-0').split('-').map(Number);
          return { t: teamCode(x.teamId, x.teamName), rank: x.rank, W: w[0] || 0, L: w[1] || 0, T: w[2] || 0, gb: x.gamesBack, pct: x.winPercentage };
        }).filter(function (x) { return x.t; });
      }
      live.changes = r.changes; live.unknown = r.unknown; live.at = new Date(); live.state = 'ok';
      var stChanged = live.standings && JSON.stringify(live.standings.map(function (x) { return [x.t, x.W, x.L, x.T]; })) !==
        JSON.stringify((DP.league.standings || []).map(function (x) { return [x.t, x.W, x.L, x.T]; }));
      if (r.changes.length || stChanged) { E.init(); DP._ts = null; DP.simCache = null; }
      chip();
      var route = U.parseHash().route;
      if (r.changes.length || stChanged || (r.slots && /^(home|team|matchup|preview|standings)$/.test(route || 'home'))) {
        if (!document.querySelector('.modal-bg.open') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) DP.render();
      }
      if (r.changes.length) U.toast('Fantrax: ' + r.changes.length + ' roster change' + (r.changes.length > 1 ? 's' : '') + ' since last night applied');
    }).catch(function (e) {
      live.state = 'fail'; chip();
      if (window.console) console.info('Fantrax live sync unavailable:', e && e.message);
    });
  };

  live.describe = function (c) {
    var p = c.p, money = function (s) { return c.ct === 'MNR' ? 'MNR' : c.ct + ' ' + U.m(s / 1e6); };
    if (c.type === 'add') return esc(c.to) + ' added ' + DP.ui.plink(p) + ' (' + money(c.sal) + ')';
    if (c.type === 'drop') return esc(c.from) + ' dropped ' + DP.ui.plink(p);
    if (c.type === 'move') return DP.ui.plink(p) + ': ' + esc(c.from) + ' → ' + esc(c.to);
    return DP.ui.plink(p) + ' (' + esc(c.to) + '): ' + esc(c.was[0]) + ' ' + U.m(c.was[1] / 1e6) + ' → ' + money(c.sal);
  };

  live.panel = function () {
    var h = '<h2>Fantrax live sync</h2>';
    if (live.state === 'ok') {
      h += '<p class="small">Synced ' + esc(live.at.toLocaleString()) + ' (lineups for Fantrax period ' + live.period + '). ' +
        (live.changes.length ? live.changes.length + ' change' + (live.changes.length > 1 ? 's' : '') + ' since the nightly build:' : 'Nothing changed since the nightly build.') + '</p>';
      if (live.changes.length) h += '<ul class="small">' + live.changes.map(function (c) { return '<li>' + live.describe(c) + '</li>'; }).join('') + '</ul>';
      if (live.unknown.length) h += '<p class="small muted">' + live.unknown.length + ' rostered player' + (live.unknown.length > 1 ? 's are' : ' is') + ' new to Fantrax since the nightly build; they appear after the next build.</p>';
    } else if (live.state === 'fail') h += '<p class="small bad">Fantrax could not be reached. Showing the nightly build.</p>';
    else if (live.state === 'off') h += '<p class="small">Live sync is off on this device.</p>';
    else h += '<p class="small muted">Syncing…</p>';
    h += '<p><button class="btn sm" data-live="sync">↻ Sync now</button> <button class="btn sm ghost" data-live="toggle">' + (U.store.get('liveOff', false) ? 'Turn live sync on' : 'Turn live sync off') + '</button> <a class="btn sm ghost" href="' + esc(FX.url) + '" target="_blank" rel="noopener">Open Fantrax ↗</a></p>';
    return h;
  };

  if (typeof document !== 'undefined') document.addEventListener('click', function (e) {
    var b = e.target.closest('#livebtn');
    if (b) { DP.ui.modal(live.panel()); return; }
    var a = e.target.closest('[data-live]'); if (!a) return;
    if (a.dataset.live === 'sync') { DP.ui.closeModal(); live.start(true); }
    if (a.dataset.live === 'toggle') { var off = !U.store.get('liveOff', false); U.store.set('liveOff', off); DP.ui.closeModal(); if (!off) live.start(true); else { live.state = 'off'; chip(); } }
  });
  live.chip = chip;
})();
