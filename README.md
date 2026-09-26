# Dynasty Puck HQ

The website for **Dynasty Puck**, a 14-team Fantrax dynasty hockey league:
**https://gavinpastreich.github.io/dynasty-puck/**

One fast static app (plain HTML/JS, no server, no R) with:

- **Dashboard & power rankings**: projected standings on the real H2H schedule, Monte Carlo playoff odds, bargains, graduations, leaders.
- **Team Hub**: weekly-lock lineup, 15-category profile, needs, FA targets, trade partners, cap chart, prospect pipeline.
- **Players, Free Agents (fit for your team), Compare, Leaderboards**, plus a player card for everyone (headshot, projections, NHL history, NHLe, dynasty curve, contract path).
- **Simulators**: weekly matchup (per-category win probabilities, goalie minimum), season (8-team playoff), trade machine (2–4 teams, picks, league-implied valuation lens, cap, playoff odds, share link), trade finder, offseason signing sim.
- **Cap & contracts**: league cap table 2026-27 → 2032-33, expiries, dead cap, extension calculator, 2027 offseason planner.
- **Prospects**: MNR graduation tracker (career NHL GP: 84 skaters / 42 goalies), prospect rankings, pipelines; Draft Center with the 2026 NHL draft, the league's own drafts, and 2027–2029 boards.
- **League history**: every trade judged with today's values, draft-pick ownership replayed from the trade log.

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
