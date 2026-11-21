# Dynasty Puck HQ

The website for **Dynasty Puck**, a 14-team Fantrax dynasty hockey league:
**https://gavinpastreich.github.io/dynasty-puck/**

One fast static app (plain HTML/JS, no server, no R). Rosters, contracts, lineups and standings come live from our
Fantrax league; NHL stats, schedules, lines, injuries, prospects and values refresh nightly. Every model number is
explained under **Rules & Methods** in the app, and the **league guide PDF** (`assets/Dynasty-Puck-HQ-Guide.pdf`)
walks through the main pages with screenshots. Main areas:

- **Your team**: Dashboard, My Page (build your own from ~50 boxes), Team Hub (lineup check against Fantrax, needs,
  cap by season, prospects, trade strategy), alerts (phone, calendar, email; opt-in).
- **This week**: Live Scoreboard (category score during games, projected finals, win odds by day), Weekly Matchup,
  Opponent Scouting, Category Outlook, Weekly Calendar, Pickup Planner, Weekly Preview and The Weekly (copy for the chat).
- **Players**: Players, Player Rater, Free Agents (free agents on the rise), Hot & Cold, Ice Time (points per 60,
  underused scorers), Breakout Watch, Buy Low / Sell High, Line & PP Changes, Market Movers, Compare, Leaderboards.
  Every player page: projections, this season, dynasty value with a floor and ceiling, contract path, NHL history,
  development curve, linemates, Fantrax ADP, "plays like", historical comps (similar seasons at his age and what
  happened next), season log in our league, moves.
- **Trades**: Trade Machine (2-4 teams, picks, cap space), Trade Finder, Trade Value Chart, Market Check (our
  categories vs Fantrax ADP), Trade Deadline hub, Trade History with grades, Transactions, Draft Picks.
- **Models & sims**: Season Sim, Scenario Builder, Title Path, Punt Planner (with swap ideas), Model Scorecard, Aging
  Curves (ten NHL seasons, goalies included, optional survivor-bias correction), Signing Sim.
- **League**: Standings, Playoff Picture, Rankings Hub, Power Rankings, Elo & Luck, Rivalries, Tale of the Tape, Record
  Book, GM Report Cards, Trophy Case, Category Insights, Contention Windows, Awards, League Feed.
- **Cap & contracts**: Contracts & Cap (dead cap, IR and minors relief), Offseason Planner, Auction War Room.
- **Prospects**: Prospect Radar (re-ranked nightly with headlines), Prospects & MNR graduation tracker (84 / 42 career
  NHL GP), World Juniors, Draft Center (live 2027 board), Mock Draft, Draft Race.
- **Schedule**: Season Grid, Schedule Tools (games per week, streaming, goalie planner), NHL Team Stacks.

What changed and when is listed under **What's new** on the Data & Updates page; how it is built is in
`docs/BUILD_NOTES.md`, and upkeep for the commissioner in `docs/COMMISSIONER.md`.

## Updating the data

1. Drop new Fantrax exports / the contract sheet into `raw/2026-27/` (trades and league drafts in `raw/2026-27/league/`).
2. Run `UPDATE_DATA.bat` (or `python tools/build_data.py`). NHL API responses are cached in `tools/cache/`.
   The run writes `data/*.js` and a sanity report in `tools/build_report.txt`.
3. Commit and push to `main`. GitHub Pages redeploys automatically.

During the season anyone can also drop Fantrax CSVs on the app's **Data & Updates** page to refresh their own view.

## Layout

```
index.html, manifest.json      the app (hash router, works from file:// too)
assets/app.css, assets/js/*    UI, model engine (engine.js), charts, pages
data/*.js                      generated data (window.DP = {...})
raw/2026-27/                   Fantrax exports, contract sheet, H2H schedule, league trades & drafts
tools/build_data.py            data pipeline (+ nhl_api.py cached client, research/*.json)
tools/test/                    node engine checks + headless-browser smoke test
docs/                          rebuild plan, feature checklist, build notes
legacy/                        the retired R/shinylive apps
```
