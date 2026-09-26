@echo off
echo ===============================================
echo   Installing R packages for Dynasty Puck...
echo   This may take a few minutes on first run.
echo ===============================================
echo.

where Rscript >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: R is not installed or not in PATH.
    echo.
    echo Please install R from: https://cran.r-project.org/bin/windows/base/
    echo After installing, restart your computer and try again.
    echo.
    pause
    exit /b 1
)

Rscript -e "pkgs <- c('shiny','DT','dplyr','readr','stringr','jsonlite','httr'); new <- pkgs[!pkgs %%in%% installed.packages()[,'Package']]; if(length(new)) install.packages(new, repos='https://cloud.r-project.org'); cat('\n\nAll packages installed!\n')"

echo.
echo ===============================================
echo   DONE! You can now launch the apps.
echo ===============================================
pause
