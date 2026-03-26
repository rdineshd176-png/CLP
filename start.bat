@echo off
echo Starting Career Launch Pad...

:: Start Frontend Server (Python HTTP Server on port 3000)
start "CLP Frontend" cmd /k "echo Starting frontend on http://localhost:3000 & python -m http.server 3000"

:: Wait a moment to ensure frontend starts (optional)
timeout /t 2 /nobreak >nul

:: Start Backend Server (Uvicorn on port 8000)
cd backend
start "CLP Backend" cmd /k "echo Starting backend on http://localhost:8000 & uvicorn main:app --reload --port 8000"

echo Both servers started. Access the application at http://localhost:3000
echo Close each terminal window to stop the respective server.
pause