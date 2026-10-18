@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24 LTS from https://nodejs.org
  echo Then close this window and double-click START_WINDOWS.bat again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('Please use Node.js 24 LTS. Current: '+process.version);process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Starting Sushi Clinic. Keep this window open while using the application.
node --env-file-if-exists=.env server/main.mjs --open
if errorlevel 1 (
  echo.
  echo Startup failed. Review the error above and START_HERE.txt.
  pause
)
