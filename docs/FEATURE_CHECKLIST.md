# Dynasty Puck HQ: feature checklist

Everything the league owner has asked for across sessions, plus extras. Check items off in this file
as you ship them, and add any new ideas you come up with.

## A. Must-haves (explicitly requested)
- [ ] ONE merged app replacing the FA app and Prospect app. Static HTML/JS that loads in about a second,
      works on phones, and needs no R.
- [ ] Old links still work: `/fa/` and `/prospects/` redirect into the matching section of the new app.
- [ ] No default team. Visitors pick their team (remember it in localStorage).
- [ ] Data from `raw/2026-27/`: official 2025-26 stats, projected 2026-27 stats, and the contract sheet
      (all years through 2032-33, the 2027 offseason actions, the extension price scale).
- [ ] Project **Tk and Cor** for 2026-27 (0 in the Fantrax projections) from past seasons (see the plan).
- [ ] Values and projections built on **our 15 categories and weekly H2H format**, not generic points.
- [ ] **Trade simulator**: any two (ideally 3+) teams, multi-year cap impact, category impact,
      projected standings change, dynasty value balance, fairness meter, shareable trade link.
- [ ] **Weekly matchup simulator** with the real 2026-27 NHL schedule (games per team per week),
      weekly-lock lineup optimization, and per-category win/tie/loss probabilities.
- [ ] **Season simulator**: projected category W-L-T for every team, Monte Carlo playoff odds.
- [ ] **Offseason signing simulator** (from the old FA app): one dropdown for all free agents, a
      separate dropdown for the selected team's own MNR/ELC players, a custom salary for each add
      (e.g. $1.5M for a graduated player, $0 for a non-graduated one), and before/after cap, roster, and
      category ranks.
- [ ] **Graduation logic uses CAREER NHL GP** (82 skaters / 41 goalies) from the NHL API, covering
      skaters AND goalies (goalies are in a separate file; that bug once hid Yaroslav Askarov).
      Explain the thresholds clearly in the UI.
- [ ] **Every rostered MNR prospect**: career GP vs threshold, projected graduation week this season,
      full league-by-league history (NHL API landing `seasonTotals`), NHLe, draft info, ETA,
      prospect value, and what they'll bring in our categories.
- [ ] **2026 NHL Draft results** (NHL API), merged with the pre-draft scouting notes, styles,
      category profiles, and risers/fallers in `prospect-app/draft_2026.csv`. Show which draftees are
      on league rosters.
- [ ] **Draft boards for 2027 (~64), 2028 (~32), and 2029 (~20)**, researched from EliteProspects,
      McKeen's, Smaht Scouting, FCHockey, Recrutes, Daily Faceoff, The Hockey Writers,
      TSN/McKenzie, and Dobber. Each prospect gets a style, the categories they'll help, a ceiling,
      an NHL comparison, a fantasy-focused note, and their sources. No invented stats.
- [ ] Multi-year contracts and cap tools: a team cap chart by year, league cap table, expiring and
      RFA/UFA timelines, the 2027 offseason action list, and an extension price calculator.
- [ ] Commit and push to `main` when work is verified.

## B. Extra mile (do these without being asked)
- [ ] **Dashboard**: power rankings, projected standings and playoff odds, best bargains, worst
      contracts, prospects about to graduate, top free agents, league leaders by category.
- [ ] **Team Hub** for each GM: roster by slot with contracts and values, 15-category rank chart vs
      league, strengths/weaknesses, "what this team should do" recommendations (FA targets that fix
      weak categories, trade partners with complementary needs), age profile, prospect pipeline grade.
- [ ] **Player pages/modals**: headshot (NHL API), bio, 2025-26 actual vs 2026-27 projection per
      category, percentile bars, multi-season NHL history chart, contract timeline, dynasty value curve,
      links (NHL.com, EliteProspects, Hockey-Reference, news).
- [ ] **Player compare** (2-4 players side by side) and a **trade finder** ("who could I get for X?").
- [ ] **Free agent finder** ranked by fit for the selected team's weak categories.
- [ ] **Schedule tools**: games-per-week heat map for all 32 NHL teams, strength-of-schedule for each
      fantasy team, goalie start planner, best streaming weeks.
- [ ] **Preseason injury report and depth notes** from public sources (sourced and dated).
- [ ] **2027 offseason planner**: re-sign/drop helper using the extension formulas and projected value.
- [ ] **Leaderboards**: contract value, dynasty value, prospect pools, youngest/oldest rosters,
      cap efficiency (value per $).
- [ ] **Rules & Methods page**: league rules as understood, how every model number is calculated,
      data sources and dates, and assumptions (e.g. round-robin schedule if the real one is unknown).
- [ ] **Data page**: drag-and-drop new Fantrax CSV exports to refresh the app in the browser during
      the season, plus a `tools/build_data.py` / `UPDATE_DATA.bat` pipeline with cached API calls.
- [ ] **Quality**: fast (small data files, only relevant players), responsive, dark theme, readable
      tables with sort/search/filter and CSV export, no console errors, accessible labels.
- [ ] **Sanity checks** in the build: team payrolls match the contract sheet, rosters match Fantrax,
      every category total reconciles, and a report prints on mismatches.

## C. Later / ask first
- [ ] League **trade history** valuations. The owner will supply the history when ready.
- [ ] Ask about: playoff format (# teams, weeks), the actual Fantrax H2H schedule, goalie
      minimums or GP caps, and whether dropping a BID contract leaves dead cap.
