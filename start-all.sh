#!/bin/bash
# start-all.sh — Starts backend, face-service, and frontend in parallel

set -e

ROOT=$(pwd)

echo "=========================================="
echo "  AttendFace — Starting All Services"
echo "=========================================="

# Check .env files exist
if [ ! -f "$ROOT/backend/.env" ]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "⚠️  Created backend/.env from example — update DB credentials!"
fi

if [ ! -f "$ROOT/face-service/.env" ]; then
  cp "$ROOT/face-service/.env.example" "$ROOT/face-service/.env"
  echo "⚠️  Created face-service/.env from example — update DB credentials!"
fi

# Start face service
echo ""
echo "▶ Starting Face Service (Python)..."
cd "$ROOT/face-service"
if [ -d "venv" ]; then
  source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
fi
python main.py &
FACE_PID=$!

sleep 2

# Start backend
echo "▶ Starting Backend (Node.js)..."
cd "$ROOT/backend"
npm run dev &
BACKEND_PID=$!

sleep 2

# Start frontend
echo "▶ Starting Frontend (React)..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "  All services started!"
echo "  Frontend  → http://localhost:5173"
echo "  Backend   → http://localhost:5000"
echo "  Face API  → http://localhost:8000"
echo "  Press Ctrl+C to stop all"
echo "=========================================="

# Wait and handle Ctrl+C
trap "kill $FACE_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'All services stopped.'; exit 0" INT
wait
