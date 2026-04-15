===============================================
  DYNASTY PUCK - Fantasy Hockey League Tools
  14-Team Dynasty League Apps
===============================================

Two apps for offseason planning:
  1. FA App    - Free agency, contracts, signing simulator, budget planner
  2. Prospect App - MNR prospects, pipeline, draft board, trade values

-----------------------------------------------
SETUP (one-time, ~2 minutes)
-----------------------------------------------

1. Install R (free):
   https://cran.r-project.org/bin/windows/base/
   - Download and install with all defaults
   - Mac users: https://cran.r-project.org/bin/macosx/

2. Double-click: INSTALL_PACKAGES.bat
   - This installs the required R packages
   - Only need to do this once
   - Wait for it to say "DONE"

3. To update the data:
   - Go to Fantrax > Players > Skaters > Export CSV
   - Go to Fantrax > Players > Goalies > Export CSV
   - Upload the CSVs in the "Data Upload" tab of each app
   - OR replace the CSV files in each app's folder

-----------------------------------------------
RUNNING THE APPS
-----------------------------------------------

Double-click: LAUNCH_FA_APP.bat
  -> Opens FA app at http://127.0.0.1:7878

Double-click: LAUNCH_PROSPECT_APP.bat
  -> Opens prospect app at http://127.0.0.1:7879

Double-click: LAUNCH_BOTH.bat
  -> Opens both apps at once

Then open the URL in your browser (Chrome/Edge/Firefox).

-----------------------------------------------
WHAT'S IN EACH APP
-----------------------------------------------

FA APP (Port 7878):
  - 2026 Free Agents with projected values
  - Signing Simulator (plan your offseason)
  - Budget Planner (cap space for all 14 teams)
  - Trade Analyzer (compare up to 4 players)
  - Trade Block (sell high, buy low, dead weight)
  - Category Analysis (team strengths/weaknesses)
  - Team Needs & Targets (with category impact)
  - Contract Value Over Time projections
  - Power Rankings

PROSPECT APP (Port 7879):
  - MNR Prospect Roster with Dynasty Scores
  - Fantasy Readiness ratings (0-100)
  - Prospect-to-Roster Pipeline
  - Pool Rankings
  - Trade Value Board (prospect trade evaluator)
  - 2026 Draft Board with projections
  - ELC Bargain Projections
  - Per-game production rates

-----------------------------------------------
TROUBLESHOOTING
-----------------------------------------------

"R is not recognized":
  -> Make sure R is installed. Try restarting your computer.

"Package not found" error:
  -> Run INSTALL_PACKAGES.bat again.

App won't start:
  -> Make sure nothing else is using port 7878/7879
  -> Try closing and reopening

Data looks wrong:
  -> Upload fresh CSVs from Fantrax

Mac/Linux users:
  -> Open Terminal, cd to this folder, run:
     Rscript -e "shiny::runApp('fa-app', port=7878)"
     Rscript -e "shiny::runApp('prospect-app', port=7879)"
