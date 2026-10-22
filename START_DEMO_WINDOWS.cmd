@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required: https://nodejs.org/
  pause
  exit /b 1
)
echo Launching PROTOCOL ZERO with a separate local partner sandbox...
node examples\start-demo.js
pause
