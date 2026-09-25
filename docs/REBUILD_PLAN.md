# Dynasty Puck HQ: merged app rebuild plan (handoff notes)

Written 2026-09-25 before moving the session to Claude Code cloud. The goal is to merge the FA app
(`fa-app/`) and the Prospect app (`prospect-app/`) into ONE fast static web app for the 14-team league,
then push it to `main` so GitHub Pages deploys it. The user's direction: "go wild."

## Decisions the user made
- **Tech:** rebuild as a plain static HTML/JS site. Drop R/shinylive, which took 30-60+ seconds to load.
  Use classic `<script>` tags with a global namespace (no ES modules), so `index.html` also opens
  from `file://`. Put data in generated `data/*.js` files (`window.DP = {...}`), not fetched JSON.
  Only allowed CDNs are cdnjs / jsdelivr (e.g. Chart.js).
- **No default team.** Every visitor picks a team; remembering the choice in localStorage is fine.
- **Lineups lock WEEKLY.** Each week a team sets 12F / 6D / 2G starters (plus 3 bench = 23 active)
  and they're locked. Only starters' stats count. MNR-contract players CAN be started (ROO has only
  17 non-MNR players), so the lineup optimizer picks from every owned player.
- **Prospects: do all of it.** (1) Deep work on the ~290 rostered MNR players. (2) 2026 NHL draft
  results. (3) Draft boards for 2027 (top ~64), 2028 (~32), and 2029 (~20), as far out as
  EliteProspects goes.
- The user may later supply league trade history for trade-value calibration.

## Raw inputs (committed in `raw/2026-27/`)
- `Fantrax-Players-Dynasty Puck_Skaters_Official2526.csv`: 7,590 rows of actual 2025-26 stats.
- `..._Skaters_Projected2627.csv`: Fantrax 2026-27 projections. **Tk and Cor are 0**, so we must project them.
- `..._Goalies_Official2526.csv` / `..._Goalies_Projected2627.csv`: 1,157 rows each.
- Skater columns: ID, Player, Team, Position, Prim Pos, Rookie, RkOv, Status(owner or FA), Age, Salary,
  Contract, Score, Ros, +/- (this is **roster-% change, NOT plus-minus**), GP, Pt-D, G, A, 2G+A, PIM, SOG, STP,
  Hit, Blk, Tk, Cor. Goalies: ... GP, W, GAA, SV%, SHO. A few Status values are waiver claims like
  `W <small>(Sun)</small>`.
- `Contract Sheet 2026-27.xlsx`
  - Sheet "Contract Sheet": 610 rows. Columns: Player, Team, Position, GM, Age (9/16/26), Salary,
    Contract, Contract Signed, Term Length, 27 Offseason Action Required (x), 2025-26 ... 2032-33.
    Year cells hold $M, or text like `UFA | BID` / `RFA`. 86 rows are `FA` (dropped/expired, GM blank).
    Contract counts: MNR 257, BID 224, FA 86, RFA1 27, ELC1 16.
  - Sheet "2027 Offseason Action": 21 players with extension price columns.
    **2027 extension formulas ($M, S = salary):** 1yr S+1.5, 2yr 1.5S+1.5, 3yr 1.5S+3, 4yr 1.5S+4,
    5yr 1.75S+5, 6yr 1.75S+6. (The 2026 sheet used +1.0 bases: S+1, 1.5S+1, 1.5S+2, 1.5S+3,
    1.75S+4, 1.75S+5.) ELC re-sign for goalies/MNR is $1.5M.
  - Sheet "2026 Offseason Action": last year's decisions (Resign/Drop). Useful history.
- 14 GMs: ROO, TommyG10, Wags8210, BULLIES, nbracken, SPG, BHHC, nebsnave, M.M, mcianfra, btsay45,
  PuckLuck, CGN, mertin. 2026-27 payrolls run $88.9M–$103.3M against a **$104M cap**.

## Scoring: 15 weekly H2H categories
Skaters (11): **Pt-D** (points by defensemen only), **G**, **A**, **2G+A** (=2*G+A), **PIM**, **SOG**,
**STP** (PPP+SHP), **Hit**, **Blk**, **Tk** (takeaways), **Cor**. Goalies (4): **W**, **GAA** (lower wins),
**SV%**, **SHO**. Each week vs one opponent yields category W/L/T. Season standings = total category
W-L-T, which also decides playoff seeding.

### Verified against the NHL stats API (2025-26)
G, A, PIM, SOG, STP (ppPoints+shPoints), Hit, Blk, Tk (takeaways) and GP match NHL exactly (~99.5%).
**Cor ≠ NHL 5v5 SAT diff** (`summaryshooting.satTotal`): r=0.985, but Fantrax runs higher for PP-heavy
players (Hutson 226 vs 132, Bouchard 341 vs 290). It is likely all-situations Corsi differential. Plan:
regress Fantrax Cor on 5v5 satTotal + PP/SH TOI (`skater/timeonice` report) to estimate prior-season Cor,
then project the 2026-27 per-GP Cor rate (weighted recent seasons, regressed to position mean) x projected GP.
Project Tk the same way from NHL `takeaways`.

## Public data sources (all tested and working from Python urllib with a User-Agent)
- Bulk season stats (`limit=-1`, `cayenneExp=seasonId=20252026 and gameTypeId=2`):
  `https://api.nhle.com/stats/rest/en/skater/{summary|realtime|summaryshooting|bios|timeonice}` and
  `.../goalie/{summary|bios}`. Pull 2022-23 → 2025-26 for history and aging.
- Player search → NHL id: `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=NAME`
- Player landing: `https://api-web.nhle.com/v1/player/{id}/landing` gives careerTotals (**career NHL GP
  for MNR graduation**), seasonTotals for all leagues (AHL/CHL/NCAA/Europe history → NHLe), draftDetails,
  and the headshot URL.
- 2026-27 schedule: `https://api-web.nhle.com/v1/club-schedule-season/{TEAM}/20262027`
  (gameType 2 = regular season). Build games per NHL team per fantasy week (Mon–Sun).
- 2026 draft results: `https://api-web.nhle.com/v1/draft/picks/2026/all`. Merge in the scouting notes
  from `prospect-app/draft_2026.csv` (Style / Fantasy_Cats / Scouting_Note / Trend / Stock_Note).
- `https://api-web.nhle.com/v1/draft/rankings/now` still shows 2026 (2027 isn't published yet), so the
  2027-2029 boards need web research (EliteProspects, McKeen's, Smaht, FCHockey, Recrutes, Daily Faceoff,
  THW, TSN/McKenzie, Dobber). Record per prospect: rank, name, pos, shoots, dob, nat, height, weight, team,
  league, last_season {season, league, gp, g, a, pts}, style, cats (up to 4 of the 15 codes), ceiling,
  comp, note (fantasy-focused), tags, sources. **Don't invent stats.**
- Cache every API response under `tools/cache/` so rebuilds are fast and offline-safe.

## Proposed structure
```
index.html                 the app (hash router)
assets/app.css, assets/js/{util,engine,ui-*,app}.js
data/league.js             generated: players, contracts, schedule, meta
data/prospects.js          generated: prospect histories, draft 2026, boards 2027-29
tools/build_data.py        pipeline: raw/ + NHL API (cached) -> data/*.js
UPDATE_DATA.bat            runs the pipeline
fa/index.html, prospects/index.html  -> redirect to the new app (the league has these URLs bookmarked)
legacy/                    old R sources (drop shinylive/ runtime + app.json from deploy)
```
Keep data small: only rostered players plus FAs with 2025-26 GP>0 or projected 2026-27 GP>0 (~1,500),
not all 8,700.

## Model (JS engine, so in-browser CSV re-uploads can recompute)
- Per-game rates = 2026-27 projection / projected GP (Tk/Cor from the pipeline).
  Availability = projGP/82.
- Weekly expectation = rate x team games that week x availability. Weekly-lock optimizer picks the
  best 12F/6D/2G by weekly value.
- Goalies: GA = GAA*GP, SA = GA/(1-SV%). Team weekly GAA = ΣGA/ΣGP; SV% = 1-ΣGA/ΣSA
  (use the delta method for variance).
- Matchup win prob per category: normal approximation on the difference, with a ±0.5 continuity
  correction for ties on count stats. Suggested per-game variance/mean dispersion: G/A 1.0, SOG 1.2,
  Hit 1.5, Blk 1.3, Tk 1.2, PIM ~3, STP 1.0, 2G+A var = 4μG+μA, Cor var ≈ 30-38 per game.
- Player value = expected season **category wins above replacement** (WAR in cat-win units):
  (season total − replacement) × φ(0)/σ_c, where σ_c = SD of the weekly difference between two average
  teams. Replacement = players just past the 14×(12F/6D/2G) starter cutoff. $/WAR comes from league
  salary spent above replacement, which gives market value and contract surplus.
- Dynasty value: project future seasons with position age curves (F peak 24-28, D 26-29, G 27-31,
  steeper decline after 31-33), discount ~0.85/yr, count contract surplus through expiry, add RFA
  control value using the extension formulas, UFA = 0.
- MNR: career NHL GP vs 82/41. Project the graduation week from projected GP and the schedule. A player
  not graduated by season end stays at $0; one who graduates must sign an ELC ($1.5M) or be dropped.
  Prospect value comes from draft slot, age-adjusted NHLe (AHL .389, KHL .77, SHL .57, Liiga .44,
  NCAA .19, OHL .14, WHL .14, QMJHL .11, USHL .09, J20 ~.05), and NHL rate if any.

## Pages
Dashboard (power rankings, projected standings + playoff odds, bargains, graduations) · Team Hub
(roster, multi-year cap chart, 15-cat ranks, needs → FA/trade targets, pipeline) · Players database +
player modal (bio, 25-26 vs 26-27, NHL history, contract timeline, dynasty curve, links) · Free Agents
(fit-for-team) · Trade Machine (multi-year cap, cat impact, standings delta, dynasty balance, fairness) ·
Matchup Simulator (pick week, weekly-lock lineups, per-cat probs) · Season Simulator (Monte Carlo,
configurable playoff teams; round-robin schedule unless the user gives the real one) · Contracts & Cap
(2026-27 → 2032-33 grid, 2027 actions, extension calculator) · Prospects (graduation tracker, rankings,
team pipelines, NHLe histories) · Draft Center (2026 results + 2027/28/29 boards) · Rules & Methods ·
Data (drag-drop Fantrax CSVs to refresh).

## Open questions to ask the user when relevant
Playoff format (how many teams, which weeks) · the actual H2H schedule (Fantrax) · goalie minimum
starts / GP caps (none assumed) · whether dropping a BID contract leaves dead cap.

## Deploy
`.github/workflows/deploy.yml` uploads the repo root to Pages on push to `main`. Site:
https://gavinpastreich.github.io/dynasty-puck/ (league bookmarks `/fa/` and `/prospects/`). The user wants
every update committed and pushed so the league sees it.
