# Dynasty Puck: instructions for Claude

This repo powers the website for **Dynasty Puck**, a 14-team Fantrax dynasty hockey league:
https://gavinpastreich.github.io/dynasty-puck/ (deployed by GitHub Pages from `main`).

## Ground rules
- **Only work in this repository.** Do not read, clone, fork, or modify any other repository.
- When a piece of work is done and verified, **commit and push to `main`** so the league sees it.
  Don't leave finished work unpushed. End commit messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The owner wants you to **go the extra mile without being asked**: research anything missing on the
  public web, add features you think a serious dynasty league would love, and polish them. Ask questions
  only when a decision is genuinely theirs (league rules, schedule, preferences). Otherwise pick a
  sensible default, label it in the app, and keep moving.
- **Never invent stats.** Every number shown must come from the raw files, a public source, or a
  documented model. Label projections and estimates as such.
- Verify before pushing: run the data build, open the site in a browser, click through every page,
  check the console for errors, and test at phone width.

## Current mission
Build **Dynasty Puck HQ**: one fast static HTML/JS app that merges and replaces the old R/shinylive FA
app (`fa-app/`) and Prospect app (`prospect-app/`). The full plan, verified data definitions, and tested
data sources are in **`docs/REBUILD_PLAN.md`**. Read it first. The feature checklist and "extra mile"
list are in **`docs/FEATURE_CHECKLIST.md`**. Work through all of it.

## League facts (quick reference)
- 15 weekly H2H categories. Skaters: Pt-D, G, A, 2G+A, PIM, SOG, STP, Hit, Blk, Tk, Cor.
  Goalies: W, GAA (lower wins), SV%, SHO. Season standings = total category W-L-T.
- Lineups lock **weekly**: 12F / 6D / 2G starters + 3 bench. MNR-contract players can be started.
- Cap follows the NHL cap: $104M (2026-27), $113.5M (2027-28), $127.5M projected (2028-29).
  Contracts: BID, RFA1, ELC1 ($1.5M), MNR ($0), FA.
- MNR graduation uses **career** NHL GP: 82 skaters / 41 goalies. A player who graduates mid-season stays at $0
  and signs his ELC (or is dropped) in the offseason; if he's on the active roster when he graduates he can't be
  moved back down to the minors. One not graduated by the end of the regular season can stay at $0.
- Auction: winning bid sets the term (2026/2027 bands: $1-2.9M 1y, $3-4.4M 2y, $4.5-7.4M 3y, $7.5-9.9M 4y,
  $10-13.9M 5y, $14M+ 6y). ELC up: 2y $2.5M / 3y $4M / 4y $5.5M / 5y $7M / 6y $9M / 1-yr ELC ext $1.75M then UFA.
  Post-ELC RFA up (under 27 on June 30): 1.5x (2-4y) or 1.75x (5-6y) premium on a base that can't drop; 27+ = UFA.
  RFAs on auction contracts (BID, and RFA1 deals signed off them) use the sheet formula instead (mult x salary + add-on).
  Hometown discount: the team that held the player from the trade deadline to season end pays 10% less than its
  winning bid (the bid sets the term). ELCs are $1.5M for 1 or 2 years. Dead cap: BID/RFA1/ELC drops only.
- League settings live in `config/league.json` (commissioner edits it on GitHub; the site rebuilds itself).
- Fantrax league `cbufqc8umo5xrjzu`: public API at `https://www.fantrax.com/fxea/general/` (tools/fantrax_api.py).
- Raw data: `raw/2026-27/`. Fantrax's "+/-" column is roster-% change, not plus-minus.
