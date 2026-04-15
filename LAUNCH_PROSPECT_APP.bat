@echo off
echo Starting Dynasty Puck - Prospect App...
echo Open http://127.0.0.1:7879 in your browser
echo Press Ctrl+C to stop the app
echo.
Rscript -e "shiny::runApp('prospect-app', port=7879, launch.browser=TRUE)"
pause
