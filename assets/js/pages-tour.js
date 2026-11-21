/* Dynasty Puck HQ - Start Here: a two-minute tour for GMs who are new to the site. What each part is for and when to
   use it, in the order a week actually goes. Links follow the menu (assets/js/app.js NAV). */
(function () {
  'use strict';
  var DP = window.DP, U = DP.U, esc = U.esc;
  DP.pages = DP.pages || {};

  var STEPS = [
    ['Set up once', 'Thirty seconds and the whole site is about your team.', [
      ['pick', '🧢', 'Pick your team', 'Top right. Every page then highlights your players, your matchup and your cap. Stored on this device only.'],
      ['home', '🏠', 'Dashboard', 'Your week at a glance: this matchup, the to-do list (lineup, IR, pickups), news and what changed since your last visit.'],
      ['mypage', '🛠️', 'My Page', 'Build your own page from nearly 50 widgets; keep it on your phone, share the layout with a link.'],
      ['install', '📱', 'Add it to your home screen', 'On a phone: Share → Add to Home Screen (iPhone) or ⋮ → Install app (Android). It opens like an app and keeps working offline with the last data it loaded.']
    ]],
    ['Before the Monday lock', 'Lineups lock for the whole week, so this is the one moment that counts.', [
      ['scout', '🔭', 'Opponent Scouting', 'Next week\'s opponent: their likely lineup, the swing categories, and the lineup tweaks that move your odds most.'],
      ['matchup', '🥊', 'Weekly Matchup', 'Simulates the week thousands of times: win chance and every category\'s odds.'],
      ['pickup', '📥', 'Pickup Planner', 'Every free agent with games next week, added to your roster one at a time and scored against your opponent, plus who to move to make room.'],
      ['team', '🧢', 'Team Hub', 'Your roster, the best lineup by games played, the IR and cap check, and your season so far.']
    ]],
    ['During the week', 'Follow along and spot the next move early.', [
      ['feed', '📣', 'League Feed', 'Everything that happened, on one timeline: trades, moves, line changes, value swings, results.'],
      ['live', '📺', 'Live Scoreboard', 'Every matchup with live NHL stats, updating during games, and the odds with the rest of the week simulated.'],
      ['form', '🔥', 'Hot & Cold', 'The last 14 days against each player\'s projection: who is running hot, who is cold, hot free agents.'],
      ['lines', '🔀', 'Line & PP Changes', 'Night-to-night moves in NHL depth charts: who got promoted to PP1 or the top six, who got scratched, which goalie took the net.'],
      ['fixtures', '📅', 'Season Grid', 'Every team\'s 24 weeks on one screen: results so far and projected odds ahead.'],
      ['injuries', '🩹', 'Injuries & Depth', 'The injury report and each NHL team\'s current lines.'],
      ['playoffs', '🏆', 'Playoff Picture', 'The projected bracket, odds by round and through the season, and what this week\'s matchups are worth.']
    ]],
    ['Trading', 'From "who should I call?" to a link you can send.', [
      ['finder', '🔎', 'Trade Finder', 'Pick a player to get or give: it searches every team for deals that work for both sides.'],
      ['trade', '🔁', 'Trade Machine', '2 to 4 teams, players, picks and cap space: value under different lenses, category impact, cap and odds. Share the link to propose it.'],
      ['tape', '📏', 'Tale of the Tape', 'Any two teams side by side: record, value, cap, all 15 categories, head to head and trade fit.'],
      ['values', '💎', 'Trade Value Chart', 'Every player and pick on one dynasty value scale.'],
      ['moves', '🧾', 'Transactions', 'Every add, drop and trade this season, the best pickups and the drops that got away.'],
      ['deadline', '⏳', 'Trade Deadline', 'Countdown, buyers and sellers, rentals, and the hometown discount.'],
      ['path', '🗺️', 'Title Path', 'Which one player would raise your title odds the most, re-simulated player by player.']
    ]],
    ['The long game', 'Dynasty means next season matters too.', [
      ['cap', '💰', 'Contracts & Cap', 'Every contract, cap space by season (traded cap and IR relief included) and dead cap.'],
      ['offseason', '📅', 'Offseason Planner', 'Your roster season by season: ELC choices, RFA prices, who to keep and the cap that leaves.'],
      ['movers', '📈', 'Market Movers', 'Every player\'s dynasty value night by night: risers, fallers and why.'],
      ['windows', '📈', 'Contention Windows', 'Which teams are built for this season and which for later.']
    ]],
    ['Prospects', 'Find the next star before he graduates.', [
      ['radar', '📡', 'Prospect Radar', 'Every prospect ranked by the model, with this season\'s stats, news and a ⭐ watchlist.'],
      ['prospects', '🌱', 'Prospects & MNR', 'Minor-league contracts and how close each player is to graduating (84 GP skaters / 42 goalies).'],
      ['draft', '🎯', 'Draft Center', 'The 2027 class: live public rankings, risers and fallers, reports, and every team\'s picks.'],
      ['mock', '🧪', 'Mock Draft', 'Run your own mock with availability odds for your picks.']
    ]],
    ['For fun', 'Bragging rights, with receipts.', [
      ['weekly', '🗞️', 'The Weekly', 'An auto-written recap of every finished week, shareable as an image.'],
      ['power', '⚡', 'Power Rankings', 'Every team ranked each week from the results, with movement and a line on each.'],
      ['rivals', '⚔️', 'Rivalries', 'The standings race and who has whose number in all-play.'],
      ['records', '📚', 'Record Book', 'Best weeks, biggest wins, streaks and individual highs.'],
      ['grades', '📝', 'GM Report Cards', 'Every GM graded on results, lineup calls, pickups, trades and roster value.'],
      ['awards', '🏅', 'Awards & Wrapped', 'Season awards and your team\'s year in review.'],
      ['trophies', '🏅', 'Trophy Case', 'The badges every team has earned, each from a real result.']
    ]]
  ];

  DP.tourSteps = STEPS;
  DP.pages.tour = {
    title: 'Start Here',
    render: function (el) {
      var me = DP.state.team;
      var h = '<div class="page-head"><h1>🧭 Start Here</h1><p class="sub">A two-minute tour: what the site does and when to use each part, in the order a week goes. Everything is optional; use what helps you.</p></div>';
      h += '<div class="callout info">' + (me ? 'You\'re set up as <b>' + esc(U.teamName(me)) + '</b>. ' : '<b>First:</b> <button class="btn sm" data-pick>Pick your team</button> ') +
        'How the numbers work: Fantrax league data and NHL stats refresh every night (the scoreboard is live during games). Projections, values and odds are model estimates, explained on <a href="#/rules">Rules & Methods</a>. Search any player, team or page with the box at the top (or press /).</div>';
      h += STEPS.map(function (s, i) {
        return '<div class="card tour-step"><h2><span class="tour-n">' + (i + 1) + '</span>' + esc(s[0]) + '</h2><div class="hint">' + esc(s[1]) + '</div><div class="tour-grid">' + s[2].map(function (x) {
          var href = x[0] === 'pick' || x[0] === 'install' ? null : '#/' + x[0];
          var inner = '<span class="tour-ic">' + x[1] + '</span><span><b>' + esc(x[2]) + '</b><span class="small muted">' + esc(x[3]) + '</span></span>';
          return href ? '<a class="tour-item" href="' + href + '">' + inner + '</a>' : x[0] === 'pick' ? '<button class="tour-item" data-pick>' + inner + '</button>' : '<div class="tour-item">' + inner + '</div>';
        }).join('') + '</div></div>';
      }).join('');
      h += '<p class="small muted">Something missing or wrong? Tell the commissioner. The site is rebuilt from the league\'s own data every night.</p>';
      el.innerHTML = h;
      U.qsa('[data-pick]', el).forEach(function (b) { b.addEventListener('click', function () { DP.openPicker(); }); });
    }
  };
})();
