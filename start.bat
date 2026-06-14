@echo off
title Trifold RTS server
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is required to run the game server.
  echo   Install it from https://nodejs.org  then double-click start.bat again.
  echo.
  pause
  exit /b
)
echo Starting the Trifold RTS server...
start "" http://localhost:8080
node "%~dp0server.js"
echo.
echo Server stopped.
pause
