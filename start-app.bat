@echo off
title Starter Business Case-screening
echo ==========================================================
echo   Starter Business Case-screening & KI-Sensor lokalt
echo   100%% uavhengig - 0 Lovable-credits - 0 kr i drift
echo ==========================================================
echo.
cd /d "%~dp0"
if not exist node_modules (
    echo Installerer moduler foerste gang...
    call npm install
)
start http://localhost:5173
echo Starter server paa http://localhost:5173 ...
call npm run dev
pause
