@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22.13 or newer.
  pause
  exit /b 1
)
echo.
echo PROTOCOL ZERO / THE INHERITANCE ENGINE
 echo Open http://127.0.0.1:8787 in your browser after launch.
echo Press Ctrl+C to stop the server.
echo.
call npm start
if errorlevel 1 pause
