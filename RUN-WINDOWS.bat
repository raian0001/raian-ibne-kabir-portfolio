@echo off
setlocal
cd /d "%~dp0"
echo ===============================================
echo   RAIAN IBNE KABIR - PORTFOLIO SERVER
echo ===============================================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the Node.js LTS version from https://nodejs.org/en/download
  echo Then close and reopen VS Code before running this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with the PATH option enabled, then reopen VS Code.
  pause
  exit /b 1
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example.
  echo Open .env and replace ADMIN_PASSWORD with a private password of at least 8 characters.
  notepad .env
)
if not exist "node_modules" (
  echo Installing project packages...
  call npm install
  if errorlevel 1 (
    echo Package installation failed. Check your internet connection and try npm install in the VS Code terminal.
    pause
    exit /b 1
  )
)
echo Starting portfolio at http://localhost:3000
call npm start
pause
