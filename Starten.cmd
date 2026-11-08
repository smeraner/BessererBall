@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Bitte zuerst Node.js ab Version 22.12 installieren.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 (
    echo Die Installation ist fehlgeschlagen. Bitte die Internetverbindung pruefen.
    pause
    exit /b 1
  )
)
call npm run dev -- --open
if errorlevel 1 pause
