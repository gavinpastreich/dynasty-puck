# Dynasty Puck HQ: build notes (working log)

Decisions made with the commissioner on 2026-09-25 (cloud session):
- Playoffs: 8 teams, no byes. Weeks 25–27 (Mar 22 – Apr 10, 2027). Bracket 1v8, 4v5, 3v6, 2v7; R2 = W(1/8) v W(4/5), W(3/6) v W(2/7).
  Tie in a playoff matchup: higher seed advances (assumption, labeled in app).
- H2H schedule: real Fantrax schedule pasted -> `raw/2026-27/h2h_schedule_fantrax.txt` (24 regular-season periods, period 19 is 2 weeks).
- Team names: ROO=Kalamazoo Kangaroo, TommyG10=TommyG1095, Wags8210, BULLIES=Bethesda Bullies, nbracken=Cake Eaters,
  SPG=South Philly Gravy, BHHC=Book Hockey HC, nebsnave, M.M=Milwaukee Musketeers, mcianfra=mcianfrani,
  btsay45=Worcester Gators, PuckLuck=Beginner's Luck, CGN=Colganites, mertin=Upper Darby Rats.
- Goalie minimum: 2 goalie GP per week; below it the team loses all 4 goalie cats (both miss -> both lose, assumption).
- Dead cap: 50% salary retention on dropped contracts (applied to each remaining contract year). Commissioner may share existing dead cap later.
- NHL 2026-27 is 84 games (Sep 29 2026 – Apr 10 2027), verified from club schedules.

Data facts:
- Fantrax is the source of truth for rosters + current salary (56 rostered players are newer than the contract sheet).
- Contract sheet supplies multi-year terms. 6 BID $1M signings have no sheet row -> assumed 1 year (listed in build report).
- Cor model: Fantrax Cor ≈ 1.045·SAT(5v5) + 0.103·PPmin − 0.070·SHmin − 0.027·GP (R² 0.975, n=773).
- Tk == NHL takeaways exactly (773/773).

Sources that work from the container: api.nhle.com, api-web.nhle.com, search.d3.nhle.com, tankathon.com (HTML),
dailyfaceoff.com (__NEXT_DATA__ JSON), thehockeywriters.com, lscluster.hockeytech.com (CHL feeds).
EliteProspects returns 403 (bot protection) for both curl and WebFetch.

Trade history (uploaded 2026-09-25): raw/2026-27/league/trades_*.csv -> 17 trades (Nov 2025 – Aug 2026).
- Old team names: Cawlidge Hockey = ROO, Gavitron = M.M (commissioner's own team, confirmed), Lsleeves = BULLIES.
- League draft: 3 rounds; picks exist through 2029; each year adds a new row. Ownership replayed from trades
  (each team starts with its own picks). 2026 picks assumed used (2026 draftees are on MNR rosters).
- Told the commissioner M.M's picks: 2027 R1, R2, R2(ROO), R2(SPG), R3(BULLIES); 2028 R3; 2029 R1-R3.
  Awaiting confirmation + draft-order rule (assumed reverse standings, no lottery).
- Commissioner confirmed M.M picks are correct (2026-09-25). Draft order: reverse standings, worst = 1, champion = 14 (playoff teams by result). All 2026 picks used. Offered: intro minor-league draft + 2026 rookie draft records (requested).

## 2026-09-26: Fantrax sync + contract rules v2
Fantrax: the league's public read-only API works without login (and sends `Access-Control-Allow-Origin: *`):
getLeagueInfo (teams, divisions East/West, matchups, lock times, roster rules), getTeamRosters (`&period=N` gives the
lineup set for that period), getDraftPicks (future picks with original owner), getStandings, getPlayerIds, getAdp.
- tools/fantrax_api.py writes raw/2026-27/fantrax/snapshot.json and appends night-to-night roster changes to moves.json.
- Build: Fantrax overrides CSV owner/contract/salary and adds lineup slot (A/R/M/IR); future pick ownership from Fantrax
  (all 126 picks for 2027-29 matched the trade-history replay exactly).
- Browser: assets/js/live.js pulls rosters (next lock period) + standings on every visit and applies changes.
- Headless Chromium in the cloud sandbox doesn't trust the proxy CA; tools/test/browser_check.js relays Fantrax
  requests through curl instead of loosening TLS.

Tests (run before pushing; the browser ones need Playwright via PW_PATH):
- `node tools/test/check_trade.js`: assertions for contention weights, use value, in-season proration, IR cap, picks.
- `node tools/test/check_scoreboard.js`: the scoreboard is not empty once a week has locked, weekly history adds up
  and stays within 5% of the Fantrax standings, category strength / partner fit, live-day fractions.
- `node tools/test/check_engine.js`: engine diagnostics (prints, no asserts).
- `node tools/test/browser_check.js`: every route at desktop + phone width; page errors, sideways scroll, and
  oversized widgets (a badge once inherited the page-layout `.wrap` class and grew 850px tall).
- `node tools/test/flows_check.js`: multi-step flows with expected results (trade machine, finder, signing sim,
  mock draft, auction tracker, search, team picker, theme, CSV upload + reset, phone menu).
- `node tools/test/interact_check.js`: fuzz; uses every select / tab / slider / button / sort on every route and
  flags page errors, render failures and junk text (NaN, undefined, [object Object]). Slow (~25 min).
- Pages attach click handlers to their container; app.js gives each render a fresh `<main>` so they never stack
  (stacked handlers made one Mock Draft click take two picks and crash at the end of the draft).

Contract rules from the commissioner (2026-09-26, with screenshots of the constitution):
- Cap: $104M 2026-27, $113.5M 2027-28 (NHL/NHLPA agreement), $127.5M 2028-29 (NHL projection to the Board of
  Governors, reported by Elliotte Friedman; commissioner had heard ~$129M). Held flat after that (assumption).
- Auction bands: 2025 initial ($95.5M) $1-2.49 1y, 2.5-3.99 2y, 4-6.49 3y, 6.5-8.99 4y, 9-12.5 5y, 12.5+ 6y.
  2026 and 2027 offseasons ($104M): 1-2.9 1y, 3-4.4 2y, 4.5-7.4 3y, 7.5-9.9 4y, 10-13.9 5y, 14+ 6y. The six $1M
  2026 BIDs missing from the sheet are therefore 1-year deals.
- ELC up: release, 2y $2.5M, 3y $4.0M, 4y $5.5M, 5y $7.0M, 6y $9.0M, or one more ELC year at $1.75M then UFA.
- RFA up (under 27 on June 30): 2-6 yrs at 1.5x (2-4) / 1.75x (5-6) premium; base can't decrease; offer sheets exist.
- Initial-auction RFAs follow the contract sheet's Offseason Action formula: price = mult x salary + add-on,
  mult [1, 1.5, 1.5, 1.5, 1.75, 1.75]; add-on 2026 [1,1,2,3,4,5], 2027 [1.5,1.5,3,4,5,6].
- MNR graduation mid-season: stays $0, ELC in the offseason; graduated on the active roster = locked to active.
- Open questions sent to the commissioner: 1-yr ELC option (Savoie/Silovs signed 1-yr ELCs in 2026 and the sheet's
  2027 tab prices them with the initial-auction formula, not the ELC menu), offer-sheet rules, bands for 2028+,
  whether divisions matter for playoff seeding, in-season FA pickup contract terms.

2026 auction calibration: 62 BID signings, $147.9M spent out of ~$247M league space. Paid $/projected win: under-27
1.10, 27-31 0.39, 31+ 0.26, so price is modeled on 3-season value. 2027 price level = space ratio / supply ratio.

## 2026-09-26 (later): commissioner answers round 3 + upkeep
- ELCs: most are 2 yrs at $1.5M (a 1-yr ELC has been used). Initial-auction players: first RFA deal = sheet formula,
  the next one = constitution premium rule. Auction bands stay at the $104M set (no scaling) until changed.
- Hometown discount exists (a bid can keep a player below band, e.g. Evangelista's 1-yr-band salary on 2 yrs); the app
  trusts the contract sheet's terms. Offer sheets: offers/trade packages for post-ELC RFAs, no set compensation.
- Graduating in the minors: can stay down; promoted after graduating = can't go back. Offseason: ELC or release.
- Division winners are playoff seeds 1-2. Dead cap: only BID (and ELC) drops count; FA-contract drops are free
  (RFA1 assumed to count, to confirm). Penalties: raw/2026-27/league/cap_penalties.csv (Olivier $1.4M confirmed).
- Upkeep: everything automatic on GitHub (nightly + 1 AM ET refresh, hourly alerts) + config/league.json settings file.
- Fantrax's internal API (live scoring, trading block, cap penalties) needs a login, so those are computed instead.

## 2026-09-26: commissioner answers round 4
- RFA1 drops count as dead cap (confirmed). TommyG10's Lundkvist/Buchnevich penalties match Fantrax.
- IR (commissioner, 2026-09-26): a player in a Fantrax IR slot doesn't count against the current season's cap
  (`irCapExempt`). The slot comes from the nightly/live Fantrax sync (`p.fs`); future seasons are unaffected.
  Lineup check + lock alerts warn when activating an IR player would put the team over the cap.
- Hometown discount (HTD): anyone on the team's roster continuously from the trade deadline to season end; 10% off
  the winning bid, the bid still sets the term (Evangelista: $3.1M bid = 2-yr band, paid $2.79M). Deadline date not
  yet known (config hometownDiscount.tradeDeadline); until then the current owner is assumed eligible.
- ELCs: $1.5M for 1 or 2 years (Savoie, Silovs signed 1-yr). Model uses 2.
- Zacha's "RFA" cell in the contract sheet is wrong (he's 29); the age rule already sends him to the auction.
- RFAs on auction contracts (BID -> RFA1 -> ...) keep the sheet formula; the constitution premium rule is only for
  post-ELC players. Numbers for 2027 not final; commissioner: base them on this past summer's (+$1M) formula.

## League guide PDF (assets/Dynasty-Puck-HQ-Guide.pdf)
Regenerate after big changes: `node tools/guide/shoot.js <work>/shots` (the 'live' shot needs a temporary
`DP_SCORE_TEST=2026-03-02:2026-03-05:7` build, restored afterwards), then `python3 tools/guide/build_guide.py <work> --font Inter-latin.woff2`.
Text lives in tools/guide/guide.html. Linked from the site menu.

Scoreboard + weekly history (2026-11-09):
- Bug: the Live Scoreboard was empty all season. `week_scoreboard` looked for weeks whose lock time had passed, but
  lock times were attached to the weeks a few lines later (in `apply_fantrax_league`), so it always returned None.
  Pre-season testing used DP_SCORE_TEST, which skipped that branch. Fixed by `attach_locks` before anything asks for
  the current week; the build now logs `!!` and check_scoreboard.js fails if the season has started with no score.
- tools/scoreboard.py: `scoreboard()` (week in progress) and `history()` (finished weeks -> raw/2026-27/weekly/
  week_NN.json, frozen 3 days after the week ends; data/weeks/wNN.js holds the player lines for the page).
  Fantrax's public API returns the locked lineup of any period (`getTeamRosters&period=N`), so a week = Active slots
  x NHL date-range stats. Pt-D counts points from players in D slots. Checked against the Fantrax standings after
  6 weeks: 26 of 1,260 team-category decisions differ (near-ties in estimated Cor).
- Game day in progress (until 4 AM Eastern): NHL live feeds. Box score = G, A, PIM, SOG, hits, blocks, takeaways,
  goalie lines (all exact vs the stats API on an 11-game night); play-by-play = special-teams points (a goal with
  more players on the ice than the opponent); Cor = 5v5 on-ice shot attempts rebuilt from play-by-play + shift
  charts x the model's SAT coefficient (mean abs error ~4 per team per night; replaced by the stats API next morning).
- Neither NHL API sends CORS headers, so the browser can't read them. The "Live scoreboard" Action runs
  `python tools/scoreboard.py --out score.json` every 10 minutes and force-pushes a one-commit `live-data` branch;
  the page polls raw.githubusercontent.com (CORS *) every 2.5 minutes and takes the file when it is newer than the
  build's `DP.league.score`. `DP_NOW=<iso>` pretends it is another time (the output is marked test and ignored by
  the site).
- Engine: `E.gamesFrom(p, wi, d0, today)` counts a game in progress for the share left (goalie GP counts whole games
  only); `E.history()` scores every finished week on the real schedule (category records, all-play, luck).

Scheduler reality + live session (2026-11-10):
- GitHub's cron barely fires here: zero scheduled live-score runs in the first 5 hours, Alerts ("hourly") at 19:46,
  23:47, 06:49, 17:38, 01:37. So `python tools/scoreboard.py --session` covers a night in one run: poll every
  live.everySeconds while games are on, wait up to live.waitHours for the next puck drop (schedule API), exit when
  nothing is within reach, and start its successor (workflow_dispatch with the job token) if it nears the 6-hour job
  limit. Finished games are cached in memory 20 minutes after they go final. refresh-data.yml and alerts.yml dispatch
  it at the end of every run; the session dispatches alerts.yml every 55 minutes (heartbeat).
- alerts.js windows no longer assume hourly runs: lock = first run within 8h (ntfy title dedupe, 12h cache) + "Last
  call" within 90 min when the lineup check still shows a problem; daily = first run 11:00-22:00 UTC; deadline = first
  run 13-24h before; weekly digest = first run on digest day from the configured hour while the previewed week hasn't
  locked, and alerts_email.py skips it if the subject is already in [Gmail]/Sent Mail (if that folder can't be read
  it only sends in the exact hour, as before).

Category Insights (2026-11-10): E.catStrength(mode) = z-scores/ranks from E.history() (actual), E.teamCats(null,
E.openFrom()) (rest of season) or a blend (actual weight n/(n+6) weeks). E.partnerFit is rank-based and two-way:
10 x (min(get, give) + 0.25 x (get + give)), get = sum need(myRank) x spare(theirRank). Player suggestions leave out
the league's 40 most valuable players.

Prospect model (2026-11-10): E.prospect used the single most recent season with >= 8 GP but ignored it below 15 GP,
so from game 8 to 14 of a new season a prospect was valued on draft slot alone, then jumped to a small-sample pace.
Now E.nhleBlend: every line this season and last in a league with an NHLe factor, weighted by games x recency
(1 / 0.65) x 2 for NHL games; age multiplier min(3.3, 1 + 0.5 per year under 22) for non-NHL lines and
min(2, 1 + 0.12 per year under 25) for NHL lines; shrunk to the draft-slot prior with K = 48 weighted games.
Goalies: SV% vs approximate league averages (E.G_BASE), +45% / -30% at most, full weight at ~40 weighted games.

Prospect Radar (2026-11-10):
- Pool = E.prospectPool(): rostered MNR + unowned <= 22 with < 82 NHL GP + unowned 2026 NHL draft picks Fantrax hasn't
  added (synthetic players from DP.prospects.draft2026, id/key 'n' + NHL id). "Stock" = dynastyOf(copy as MNR, rem = 1):
  value as an MNR asset with the full season counted, so unowned players get a real number (their DV is ~0 because a
  free agent's future seasons aren't controllable) and nothing drifts as weeks lock. Keys are 'n' + NHL id so history
  survives Fantrax adding a player.
- tools/research/scrape_news.py: NHL.com content API (forge-dapi.d3.nhle.com/v2/content/en-us/stories?tags.slug=
  playerid-<id>; use `headline`, `title` is often a slug) + RSS feeds in tools/research/feeds.json. Feed match = full
  name in the headline, or in the summary under a headline matching RELEVANT (prospects, roster moves, injuries...);
  recaps and game threads are dropped. Google News RSS is not used (its feed terms restrict it to personal readers).
  EliteProspects / EP Rinkside / PuckPedia / FCHockey / Oilers Nation return 403 to scripts: left alone.
  Output raw/<season>/prospects/news.json (45 days, 12 per player).
- tools/prospect_radar.js: runs the real engine in a vm context on data/league.js + data/prospects.js, appends tonight
  to raw/<season>/prospects/history.json (v, g, s, c, e, k per player per date; nightly for 21 days, Mondays before),
  writes data/radar.js (value + rank at every kept date; games/points/NHL GP/projection/model read at now, -7, -14,
  -30 days and the first night). `--backfill` re-scores every nightly data commit in git with today's engine (needs a
  full clone). When the prospect model changes: bump E.PROSPECT_MODEL, run --backfill, commit history.json;
  check_radar.js fails in the nightly sanity step if the models differ.
- Model changes made while building it: goalie "if he makes it" value was a flat 5 WAR (a top-ten starter; a goalie
  picked 40th was worth ~8x a forward picked 40th). Now E.gPeak = mean of max(0, WAR) over the 64 NHL goalies with the
  most projected GP (1.83 today). P(NHL) was a step at 40 NHL GP; now E.careerOdds ramps from the draft-slot rate to
  85% at 40 GP (95% at 82 for skaters), so crossing game 40 is no longer a one-night spike.
- Data fix: two 2026 picks (Kent Sauer #136, Ryan Brown #155) were name-matched to players born in the 1970s. The
  build now rejects a landing page whose draft year isn't 2026 (or birth year < 2003 with no draft record). fix_text()
  repairs team names the NHL API serves double-encoded (BÃ­lÃ­ TygÅ™i -> Bílí Tygři).
- Mock Draft pool now takes unowned prospects from the Radar pool (stock > 0.15) instead of E.P free agents with
  DV > 0.2, which was always empty.

In-season sweep (2026-11-10), bugs that only showed once weeks had been played:
- E.injuredOut(p, wi) compared the absolute week index to "weeks out" (wi < 2 for week-to-week), i.e. it counted from
  opening night. From week 3 on only season-long injuries were ever treated as out, so the lineup check, lock
  reminders and lineup watch suggested IR players as starts and never flagged an injured starter. Now counted from
  E.lockWeek(): a player on tonight's list misses the week in progress and the next `weeks` lineup weeks.
- E.graduation(p) added expected games from week 1 against the games still needed, so mid-season it showed
  graduation weeks that had already passed ("73/84 GP, ~wk 4" in week 7). Now it walks the NHL games on or after the
  data build day (E.dataDay()); the probability uses the games left.
- E.gradYear(p) asked whether the full-season GP projection covers the games still needed, but career GP already
  holds the games played, so it double counted them. Thirteen prospects (McKenna, Stenberg, Hagens ...) were priced as
  graduating this season when they project to fall a few games short, which starts their ELC a year early. It now
  uses E.remGP(p) (availability x team games from the data build on). Prospect model version 4; history re-scored.
- Weekly Preview for the week in progress now links to the Live Scoreboard and to the week being set (where the
  lineup watch lives). check_trade.js covers all three.
- Guide PDF (tools/guide): 15 pages, new Category Insights and Prospect Radar pages, the Live Scoreboard shot is the
  real week in progress (the demo hack in shoot.js is gone). Needs Pillow built for the running Python
  (python3 -m pip install --force-reinstall pillow), segno, and an Inter woff2 (npm pack @fontsource-variable/inter).

