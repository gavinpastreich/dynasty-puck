@echo off
echo Starting Dynasty Puck - Both Apps...
echo.
echo FA App:       http://127.0.0.1:7878
echo Prospect App: http://127.0.0.1:7879
echo.
echo Press Ctrl+C in either window to stop.
echo.
start "Dynasty Puck FA" cmd /c "Rscript -e \"shiny::runApp('fa-app', port=7878, launch.browser=TRUE)\" & pause"
timeout /t 3 >nul
start "Dynasty Puck Prospects" cmd /c "Rscript -e \"shiny::runApp('prospect-app', port=7879, launch.browser=TRUE)\" & pause"
