@echo off
echo Starting Dynasty Puck - FA App...
echo Open http://127.0.0.1:7878 in your browser
echo Press Ctrl+C to stop the app
echo.
Rscript -e "shiny::runApp('fa-app', port=7878, launch.browser=TRUE)"
pause
