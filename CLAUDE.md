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
- Cap $104M (2026-27). Contracts: BID, RFA1, ELC1 ($1.5M), MNR ($0), FA.
- MNR graduation uses **career** NHL GP: 82 skaters / 41 goalies. A graduated player must sign an ELC
  or be dropped. One not graduated by the end of the regular season can stay at $0.
- Raw data: `raw/2026-27/`. Fantrax's "+/-" column is roster-% change, not plus-minus.
