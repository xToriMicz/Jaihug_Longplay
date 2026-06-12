@echo off
echo ===================================================
echo   Visual Music Longplay Creator - Starting Services
echo ===================================================
echo.

echo [1/2] Starting FastAPI Backend (port 28453)...
start /B python api.py

echo [2/2] Starting Next.js Dev Server (port 19385)...
timeout /t 3 /nobreak >nul
cd frontend
npm run dev
