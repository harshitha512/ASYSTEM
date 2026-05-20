@echo off
title AttendFace - Start All Services

echo ==========================================
echo   AttendFace - Starting All Services
echo ==========================================

:: Check .env files
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
    echo WARNING: Created backend/.env from example - update DB credentials!
)
if not exist "face-service\.env" (
    copy "face-service\.env.example" "face-service\.env"
    echo WARNING: Created face-service/.env from example - update DB credentials!
)

echo.
echo Starting Face Service (Python)...
start "Face Service" cmd /k "cd face-service && (if exist venv\Scripts\activate.bat (call venv\Scripts\activate.bat) ) && python main.py"

timeout /t 3 /nobreak >nul

echo Starting Backend (Node.js)...
start "Backend" cmd /k "cd backend && npm run dev"

timeout /t 2 /nobreak >nul

echo Starting Frontend (React)...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ==========================================
echo   All services launched in separate windows
echo   Frontend  -^> http://localhost:5173
echo   Backend   -^> http://localhost:5000
echo   Face API  -^> http://localhost:8000
echo ==========================================
pause
