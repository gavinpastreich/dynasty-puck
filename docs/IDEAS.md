# Dynasty Puck HQ: ideas for what's next

Built so far (beyond the checklist): Trade Value Chart, Contention Windows, Weekly Preview generator, punt check,
lineup-usage table, trade balancer, salary-vs-WAR bargain chart, league-implied valuation lens fitted to real trades,
draft grades, graduation delay from injuries/holdouts, nightly auto-refresh workflow.

## Next up (high value, feasible)
1. ~~Fantrax auto-sync~~ **done 2026-09-26** (nightly + live). Next on top of it: Fantrax ADP (`getAdp`) as a
   market signal next to our values, and a transactions timeline with dead-cap bookkeeping from the moves log.
2. **Live weekly scoreboard.** During the season, pull NHL game logs for every starter each night and show the
   current category score of every matchup plus the projected final (the rest of the week simulated).
3. **Rest-of-season projections.** Blend each player's 2026-27 stats-to-date with the preseason projection
   (Marcel-style), so values react to breakouts and slumps.
4. **Prospect stock watch.** Nightly AHL/CHL/NCAA/Europe lines for every MNR prospect (NHL landing + CHL HockeyTech
   feeds) with "heating up / cooling off" flags and NHLe trend.
5. **2027 league-draft war room.** Live board with the real pick order, best available by model and by consensus,
   a mock-draft simulator (AI teams pick by need + value), and pick-trade calculator during the draft.
6. **Discord/GroupMe bot.** Post the weekly preview, graduation alerts ("X just hit 82 GP: sign or drop"),
   and a Monday recap automatically (GitHub Action + webhook secret).
7. **Auction planner for the 2027 UFA auction.** Expected price for every UFA given league-wide cap space
   (supply vs demand inflation), max-bid calculator per team, and "nominate to drain rivals' cap" hints.
8. **Luck and awards.** Actual vs expected category wins each week, "unluckiest team", best trade of the year,
   best waiver pickup, most valuable MNR, season-end Wrapped page.
9. **Trade block & wish lists.** Each GM marks players available or wanted (stored in a small shared DB), and
   the trade finder matches them automatically.
10. **Keeper-league history.** Once several seasons exist: franchise history, champions, all-time trade ledger,
    draft hit rates by GM.

## Wild ones
- **"GM brain" personas.** Fit each GM's own valuation lens from their trades (who overpays for picks, who chases
  vets) and show "how X values your offer" before you send it.
- **Rival scouting report.** Before each week: your opponent's weakest categories, which of their players are
  on back-to-backs, and the lineup tweak that maximizes your win probability against *that* opponent.
- **Monte Carlo "what would it take to win the title?"** Search trades and FA adds that raise title odds the most per
  unit of dynasty value spent.
- **Injury-adjusted everything.** Feed Daily Faceoff injury status and line changes into weekly projections
  automatically (the plumbing exists; lineups can already auto-bench injured players).
- **Voice-of-the-league newsletter.** A weekly auto-written column (power-ranking movers, trade grades, prospect
  of the week) published as a page on the site.
