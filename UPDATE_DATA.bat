@echo off
REM Dynasty Puck HQ - rebuild data/*.js from raw/2026-27 + NHL public APIs (cached in tools\cache)
REM Needs Python 3.9+ with openpyxl:  py -m pip install openpyxl
cd /d "%~dp0"
py -3 tools\build_data.py %*
if errorlevel 1 (
  echo.
  echo Build failed. If Python is missing, install it from https://www.python.org/downloads/
  pause
  exit /b 1
)
echo.
echo Done. See tools\build_report.txt for sanity checks.
echo Commit and push to main (GitHub Desktop or git) to publish:  https://gavinpastreich.github.io/dynasty-puck/
pause
