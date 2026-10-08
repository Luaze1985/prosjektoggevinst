# start-app.ps1 — Ett-klikks lokal oppstart av Business Case-screening
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starter Business Case-screening & KI-Sensor lokalt" -ForegroundColor Cyan
Write-Host "  100 % uavhengig • 0 Lovable-credits • 0 kr i drift" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    Write-Host "Installerer nødvendige avhengigheter (første gangs oppstart)..." -ForegroundColor Yellow
    npm install
}

Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:5173"
} | Out-Null

Write-Host "Starter lokal utviklingsserver på http://localhost:5173 ..." -ForegroundColor Green
Write-Host "Trykk Ctrl + C for å stoppe serveren når du er ferdig." -ForegroundColor Gray
Write-Host ""

npm run dev
