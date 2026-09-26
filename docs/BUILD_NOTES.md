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
