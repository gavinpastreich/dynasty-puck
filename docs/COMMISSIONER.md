# Dynasty Puck HQ: commissioner guide

Everything below runs on GitHub. None of it uses Claude, and all of it is free on a public repository.

## What runs by itself

| Job | When | What it does |
| --- | --- | --- |
| **Nightly data refresh** (`.github/workflows/refresh-data.yml`) | 10:17 UTC daily, when you edit `config/` or `raw/`, or on demand | Syncs Fantrax (rosters, contracts, salaries, lineup slots, standings, future picks), pulls NHL stats/schedules, Daily Faceoff injuries and lines, rebuilds `data/`, commits, redeploys the site |
| **Live scoreboard** (`.github/workflows/live-score.yml`) | One run covers a game night: it waits for the next puck drop (up to `live.waitHours`, default 9), re-scores every 3 minutes while NHL games are on, and stops when the night is over | Scores the week in progress (locked Fantrax lineups × NHL stats and live game feeds) and publishes one small file, `score.json`, to the `live-data` branch. The Live Scoreboard page reads it. Nothing is committed to `main` and the site isn't redeployed |
| **Alerts** (`.github/workflows/alerts.yml`) | Whenever GitHub starts it (see the note on timing below); sends only when it's time, never twice | Lineup-lock reminders to each team's phone topic, a morning note when something happens to a team, the Monday email digest |
| **Deploy** (`.github/workflows/deploy.yml`) | Every push to `main` | Publishes the site to GitHub Pages |

The site also re-syncs Fantrax live every time someone opens it, so rosters and lineups are never more than a page load old.

To run a job right now: GitHub → **Actions** → pick the workflow → **Run workflow**. If a run fails, GitHub emails you and the
site keeps the last good version. The nightly refresh ends with sanity checks; if one fails (for example the scoreboard
came out empty during the season) the run is marked failed and you get that email, but the site is still updated.

**Timing.** GitHub's scheduler is "best effort", and on this repository it starts timed jobs hours apart: the hourly
alerts job has really been running every 3 to 7 hours, and the 10:17 UTC refresh anywhere up to 10 hours late. The
jobs are built for that: every job that does run nudges the live scoreboard, the live scoreboard nudges the alerts job
about once an hour while it is up, lock reminders go out on the first run inside the 8 hours before a lock (plus a
"last call" in the final 90 minutes to teams whose lineup still has a problem), and the weekly email goes out on the
first run on digest day after the configured hour (the mailbox's Sent folder is checked so it never goes twice).
If a game night isn't being followed, start it by hand: **Actions** → **Live scoreboard** → **Run workflow**.

The `live-data` branch holds only `score.json` (one commit, overwritten each time). Leave it alone. To pause live
updates in the offseason: **Actions** → **Live scoreboard** → **⋯** → **Disable workflow**; to turn them off for good,
clear `live.url` in `config/league.json`. The scoreboard then moves with the nightly builds only.

## Changing league settings

All league rules live in **`config/league.json`**. On GitHub, open the file, click the pencil, edit, then **Commit changes**.
The site rebuilds itself about 3 minutes later.

| Setting | Meaning |
| --- | --- |
| `capByYear` | Cap per season in $M. Add the new season each year. |
| `deadCapPct`, `deadCapContracts` | Dead cap on dropped contracts (50% of each remaining year; which contract types count). |
| `irCapExempt` | `true`: players in an IR slot in Fantrax don't count against the current season's cap. |
| `lineup`, `goalieMinGP` | Weekly lineup slots and the goalie-games minimum. |
| `graduation`, `elc` | Career-GP lines for MNR graduation; ELC salary and length. |
| `elcExpiry` | The menu when an ELC is up (years → AAV), plus the 1-year extension price. |
| `rfa` | RFA age limit and premiums (index = years − 1). |
| `initialAuctionRfa` | Contract-sheet formula for the first RFA deal of 2025 auction players. |
| `auctionBands` | Winning bid → contract length. Add a new set (keyed by the offseason year) when the league changes them. |
| `playoffs` | Teams, weeks, and whether division winners take seeds 1-2. |
| `teams`, `oldTeamNames` | Team codes and Fantrax names (codes must match Fantrax's short names). |
| `alerts` | Phone-topic prefix, the league email address, reminder timing. |
| `hometownDiscount` | Share off the winning bid for the player's own team, and the trade deadline (`"2027-01-29T23:59:00-05:00"`) that decides who qualifies. Update the deadline every season. |

Cap hit penalties: `raw/2026-27/league/cap_penalties.csv` (one row per player, $M per season). The build starts it from
the contract sheet; edit it to match Fantrax's "Cap hit penalties". Drops seen in Fantrax are added automatically.

You can also replace any file in `raw/` (contract sheet, Fantrax CSV exports) with GitHub's **Add file → Upload files**; the
rebuild starts on its own.

What updates itself vs. what needs you:
- Automatic: rosters, contract types, salaries, lineups, standings, draft picks, adds/drops, **trades** (detected nightly
  when players or picks switch teams; a one-way move is treated as a waiver claim), cap penalties from drops, NHL stats,
  injuries, projections, alerts.
- Needs an upload now and then: the **contract sheet**, because Fantrax doesn't store contract lengths. Upload it after
  the offseason (RFA/ELC decisions, auction) or whenever multi-year deals change. Uploading Fantrax's trade-history
  export is optional (it only adds exact trade dates).

## Turning on the weekly email (5 minutes, once)

The league inbox is **dynastypucknotifications@gmail.com** (already set in `config/league.json` → `alerts.emailAddress`,
so the sign-up button is live on the Alerts page). What's left happens in that Gmail account and on GitHub:

1. Sign in to dynastypucknotifications@gmail.com → **Google Account → Security → 2-Step Verification** → turn it on
   (a phone number or the Google Authenticator app works).
2. Go to **https://myaccount.google.com/apppasswords** (same account), create an app password named "Dynasty Puck", and copy
   the 16-character password it shows (spaces don't matter).
3. On GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**. Name: `DP_EMAIL_APP_PASSWORD`,
   value: the app password. **Don't paste it anywhere else** (not in chat, not in a file); GitHub keeps it encrypted.
4. Test it: from your personal email, send a message to dynastypucknotifications@gmail.com with the subject
   `subscribe M.M`. Then GitHub → **Actions → Alerts → Run workflow** (leave the mode empty). Within a minute you should get a
   "You're on the Dynasty Puck HQ list" email. To see a digest right away, run it again with mode `weekly`.

How it works: GMs sign up by sending a pre-filled email from the Alerts page and leave by replying "unsubscribe". The list
lives only in that mailbox, so nobody's address is ever published. Sign-ups sent before step 3 wait in the inbox and are
picked up on the first run after the secret is added. If Gmail ever asks, IMAP access must be on (Gmail settings →
Forwarding and POP/IMAP).

## Phone push and calendar

Nothing to set up. Each team has its own ntfy topic (`<ntfyPrefix>-<team code letters>`) and its own calendar feed
(`data/cal/<team>.ics`). GMs subscribe from the Alerts page. If spam ever shows up on a topic, change `alerts.ntfyPrefix` and
everyone re-subscribes.

## New season checklist (each summer)

1. Fantrax usually creates a new league ID when a league is renewed. Copy it from the league URL
   (`fantrax.com/fantasy/league/<ID>/home`) into `fantraxLeagueId`.
2. Set `season` (e.g. `"2027-28"`), `rawFolder` (e.g. `"raw/2027-28"`), `contractSheet`, and add the new `capByYear` values.
3. Create the new raw folder with the new contract sheet, the Fantrax CSV exports (skaters and goalies: last season's
   official stats + the new projections, same file names as before) and the H2H schedule text.
4. After the league draft, add the new year to `leagueDraft.pickYears` (Fantrax's pick list is used automatically).
5. Commit, then watch **Actions → Nightly data refresh** go green.
