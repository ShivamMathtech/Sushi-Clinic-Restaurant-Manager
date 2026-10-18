@echo off
setlocal
cd /d "%~dp0"
node --env-file-if-exists=.env scripts/backup.mjs
pause
