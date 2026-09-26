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
