/* Dynasty Puck HQ - Alerts: opt-in phone push (ntfy), calendar feeds and the weekly email digest.
 * Everything is sent by GitHub Actions (.github/workflows/alerts.yml); nothing here needs an account on this site. */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, ui = DP.ui, esc = U.esc;
  DP.pages = DP.pages || {};

  function slug(code) { return String(code).replace(/[^A-Za-z0-9]/g, ''); }
  DP.alertTopic = function (code) { var A = DP.meta.alerts || {}; return (A.ntfyPrefix || 'dynastypuck') + '-' + slug(code || 'league'); };
  function siteBase() {
    var A = DP.meta.alerts || {};
    if (/^https?:/.test(location.protocol) && location.hostname !== 'localhost') return location.origin + location.pathname.replace(/[^/]*$/, '');
    return A.siteUrl || '';
  }

  DP.pages.alerts = {
    title: 'Alerts',
    render: function (el, hsh) {
      var A = DP.meta.alerts || {}, t = hsh.q.team || U.store.get('alertTeam', null) || DP.state.team || '';
      var h = '<div class="page-head"><h1>🔔 Alerts</h1><p class="sub">Optional heads-ups for your team: pick any, all or none. Nothing goes to the league group chat, nothing needs an account here, and you can stop any time. Alerts are sent automatically by GitHub every hour (lineup reminders about ' + (A.lockReminderHours || 3) + ' hours before each lock, a morning note when something happens to your team, a Monday digest).</p></div>';
      h += '<div class="controls"><label>My team ' + ui.teamSelect('al-team', t, 'Choose your team…') + '</label></div>';
      if (!t) { el.innerHTML = h + '<div class="callout">Choose your team to get your personal links.</div>'; bind(el); return; }
      var topic = DP.alertTopic(t), league = DP.alertTopic('league'), base = siteBase();
      var ics = base + 'data/cal/' + slug(t) + '.ics', icsL = base + 'data/cal/league.ics';
      var webcal = ics.replace(/^https?:/, 'webcal:');
      h += '<div class="grid g3">';
      // push
      h += '<div class="card"><h2>📱 Phone push</h2><div class="hint">Free <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a> app, no sign-up. You get: your Fantrax lineup check before every lock (who to start or sit, injured starters, goalie-minimum risk), plus a morning note when your roster changes, a player gets hurt, or a prospect is about to graduate.</div>' +
        '<ol class="small" style="padding-left:18px"><li>Install ntfy: <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a> · <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a> (or use the <a href="https://ntfy.sh/app" target="_blank" rel="noopener">web app</a> on a computer)</li>' +
        '<li>Tap <b>Subscribe</b> below on your phone, or add this topic in the app: <code id="al-topic">' + esc(topic) + '</code> <button class="btn sm ghost" data-copy="' + esc(topic) + '">Copy</button></li>' +
        '<li>Send yourself a test to check it works.</li></ol>' +
        '<p><a class="btn primary" href="ntfy://ntfy.sh/' + esc(topic) + '">Subscribe in the app</a> <a class="btn" href="https://ntfy.sh/' + esc(topic) + '" target="_blank" rel="noopener">Open on the web</a> <button class="btn" id="al-test">Send a test</button></p>' +
        '<p class="small muted">League-wide trades topic (optional): <code>' + esc(league) + '</code> <button class="btn sm ghost" data-copy="' + esc(league) + '">Copy</button>. Topics are public by name, so they only ever carry lineup and roster notes that are already on this site.</p><div id="al-test-out" class="small"></div></div>';
      // calendar
      h += '<div class="card"><h2>🗓️ Calendar</h2><div class="hint">Every lineup lock of the season as an event with your opponent and a reminder ' + (A.lockReminderHours || 3) + ' hours before. Subscribing keeps it up to date (calendar apps refresh it every few hours).</div>' +
        '<p><a class="btn primary" href="https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcal) + '" target="_blank" rel="noopener">Add to Google Calendar</a></p>' +
        '<p><a class="btn" href="' + esc(webcal) + '">Apple / Outlook (subscribe)</a> <a class="btn ghost" href="' + esc(ics) + '" download>Download .ics</a></p>' +
        '<p class="small muted">Feed link: <code style="word-break:break-all">' + esc(ics) + '</code> <button class="btn sm ghost" data-copy="' + esc(ics) + '">Copy</button><br>Just the lock times for everyone: <a href="' + esc(icsL) + '">league feed</a>. Google Calendar ignores feed reminders, so add a notification to the calendar in Google\'s settings if you want one.</p></div>';
      // email
      h += '<div class="card"><h2>✉️ Weekly email</h2><div class="hint">Every ' + esc(A.weeklyDigestDay || 'Monday') + ' morning: this week\'s matchups and odds, lineup watch for every team, standings, graduation watch and roster moves.</div>';
      if (A.emailAddress) {
        var sub = 'mailto:' + A.emailAddress + '?subject=' + encodeURIComponent('Dynasty Puck HQ: subscribe ' + t) + '&body=' + encodeURIComponent('Please add me to the weekly Dynasty Puck digest.');
        var uns = 'mailto:' + A.emailAddress + '?subject=' + encodeURIComponent('Dynasty Puck HQ: unsubscribe');
        h += '<p class="small">Tap the button: your email app opens with a message ready to send. Send it and you\'re on the list (you\'ll get a confirmation within the hour). Your address stays private: it only lives in the league mailbox.</p>' +
          '<p><a class="btn primary" href="' + esc(sub) + '">Sign me up</a> <a class="btn ghost" href="' + esc(uns) + '">Unsubscribe</a></p>' +
          '<p class="small muted">Or email <b>' + esc(A.emailAddress) + '</b> with "subscribe" in the subject. Emails come from that league address.</p>';
      } else {
        h += '<div class="callout small">Email sign-up isn\'t switched on yet. The commissioner turns it on by connecting a league Gmail account (5 minutes, see docs/COMMISSIONER.md in the repo).</div>';
      }
      h += '</div></div>';
      h += '<div class="card" style="margin-top:14px"><h2>What a lineup reminder looks like</h2><div class="hint">Built from your lineup as set in Fantrax right now (live).</div><pre class="small" id="al-preview" style="white-space:pre-wrap;margin:0"></pre></div>';
      el.innerHTML = h;
      bind(el);
      var wi = DP.E.lockWeek(), pre = U.qs('#al-preview', el);
      if (wi !== null) {
        var c = DP.E.lineupCheck(t, wi), w = DP.E.weeks[wi];
        var lines = [(w.po ? 'Playoffs round ' + w.po : 'Week ' + w.n) + ' ' + DP.lockText(wi)];
        if (c) {
          lines.push((c.opp ? 'vs ' + U.teamName(c.opp) + ' · ' : '') + 'your Fantrax lineup projects ' + c.eSet.toFixed(1) + ' of 15 cats' + (c.eOpt - c.eSet >= 0.05 ? ' (optimal ' + c.eOpt.toFixed(1) + ').' : ', which is optimal. ✓'));
          if (c.start.length) lines.push('Start: ' + c.start.map(function (x) { return x.p.n + (x.p.fs && x.p.fs !== 'A' ? ' (' + DP.SLOT_NAME[x.p.fs] + ')' : ''); }).join(', ') + '.');
          if (c.sit.length) lines.push('Sit: ' + c.sit.map(function (x) { return x.p.n; }).join(', ') + '.');
        } else lines.push('No lineup set in Fantrax yet.');
        pre.textContent = lines.join('\n');
      } else pre.textContent = 'No lineup locks left this season.';
      U.qs('#al-test', el).addEventListener('click', function () {
        var out = U.qs('#al-test-out', el);
        fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic: topic, title: 'Dynasty Puck HQ', message: 'Test alert for ' + U.teamName(t) + ': you\'re all set ✓', tags: ['ice_hockey'], click: base + '#/team/' + encodeURIComponent(t) }) })
          .then(function (r) { out.innerHTML = r.ok ? '<span class="good">✓ Sent. It should pop up on every device subscribed to ' + esc(topic) + '.</span>' : '<span class="bad">ntfy answered ' + r.status + '.</span>'; })
          .catch(function () { out.innerHTML = '<span class="bad">Couldn\'t reach ntfy.sh from this browser.</span>'; });
      });
    }
  };
  function bind(el) {
    var s = U.qs('#al-team', el);
    if (s) s.addEventListener('change', function (e) { U.store.set('alertTeam', e.target.value); DP.go('alerts', null, { team: e.target.value }); });
    U.qsa('[data-copy]', el).forEach(function (b) {
      b.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(function () { U.toast('Copied'); }); });
    });
  }
})();
