# 🎯 AttendFace — Facial Recognition Attendance System

A production-ready, full-stack employee attendance system using facial recognition with OT (overtime) management.

---

## 🏗 Architecture

```
attendance-facial-recognition-system/
├── backend/          → Node.js + Express REST API
├── frontend/         → React + Vite + Tailwind CSS
├── face-service/     → Python FastAPI + face_recognition
└── database/         → PostgreSQL schema
```

---

## ⚙️ Prerequisites

| Tool         | Version     |
|--------------|-------------|
| Node.js      | 18+         |
| Python       | 3.9 – 3.11  |
| MySQL        | 8.0+         |
| CMake        | Latest      |
| pip          | Latest      |

> **Windows users:** Install [CMake](https://cmake.org/download/) and [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) before installing `face_recognition`.

---

## 🚀 Quick Setup

### 1. Clone & Navigate
```bash
cd attendance-facial-recognition-system
```

### 2. PostgreSQL — Create Database & Schema
```bash
mysql -u root -p -e "CREATE DATABASE attendance_db;"
mysql -u root -p attendance_db < database/schema_mysql.sql
```

---

### 3. Backend (Node.js)
```bash
cd backend
cp .env.example .env      # Edit DB credentials and secrets
npm install
npm run dev               # Starts on http://localhost:5000
```

**Backend `.env` keys:**
```
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=attendance_db
DB_USER=root
DB_PASSWORD=yourpassword
JWT_SECRET=change_this_to_something_long_and_random
JWT_EXPIRES_IN=8h
FACE_SERVICE_URL=http://localhost:8000
UPLOAD_DIR=./uploads
```

---

### 4. Face Service (Python)
```bash
cd face-service
cp .env.example .env      # Edit DB credentials

# Create virtual environment (recommended)
python -m venv venv

# Activate
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
python main.py            # Starts on http://localhost:8000
```

> ⚠️ `face_recognition` requires `dlib` which needs CMake. On Windows install CMake + Build Tools first. On Ubuntu: `sudo apt install cmake libopenblas-dev liblapack-dev`

---

### 5. Frontend (React)
```bash
cd frontend
npm install
npm run dev               # Starts on http://localhost:5173
```

---

## 🔑 Default Login

| Field    | Value     |
|----------|-----------|
| Username | `admin`   |
| Password | `Admin@123` |

---

## 📡 API Reference

### Auth
| Method | Endpoint              | Description        |
|--------|-----------------------|--------------------|
| POST   | /api/auth/login       | Admin login        |
| PUT    | /api/auth/change-password | Change password |

### Employees
| Method | Endpoint                          | Description          |
|--------|-----------------------------------|----------------------|
| GET    | /api/employees                    | List all employees   |
| GET    | /api/employees/:id                | Get employee by ID   |
| POST   | /api/employees                    | Create employee      |
| PUT    | /api/employees/:id                | Update employee      |
| DELETE | /api/employees/:id                | Delete employee      |
| POST   | /api/employees/:id/register-face  | Register face image  |

### Attendance
| Method | Endpoint                    | Description            |
|--------|-----------------------------|------------------------|
| POST   | /api/attendance/mark        | Mark via face (no auth)|
| GET    | /api/attendance             | Get logs (filterable)  |
| GET    | /api/attendance/dashboard   | Dashboard stats        |
| PUT    | /api/attendance/ot-update   | Update OT manually     |

### Reports
| Method | Endpoint              | Query Params                          |
|--------|-----------------------|---------------------------------------|
| GET    | /api/reports/daily    | `date=YYYY-MM-DD`                     |
| GET    | /api/reports/monthly  | `year=2025&month=4`                   |
| GET    | /api/reports/export   | `type=daily/monthly&date/year/month`  |

### Face Service
| Method | Endpoint      | Description                      |
|--------|---------------|----------------------------------|
| POST   | /register     | Register face encoding           |
| POST   | /recognize    | Identify employee from image     |
| POST   | /detect       | Detect if face exists in image   |
| GET    | /health       | Health check                     |

---

## 🧠 OT Logic

```
final_ot = manual_ot   (if admin has overridden)
         = system_ot   (otherwise, auto-calculated)

system_ot = max(0, check_out_time - shift_end_time)
```

All OT edits are stored in `audit_logs` with before/after values.

---

## 🔒 Security Notes

- JWT tokens expire in 8 hours (configurable)
- Face encodings are stored as binary pickles in PostgreSQL (not raw images)
- Snapshots are stored only in `uploads/snapshots/`
- Add HTTPS in production via nginx reverse proxy
- For liveness detection, add blink/depth checks in `face-service/main.py → recognize_face()`

---

## 🗂 Database Schema

```
admins              → Admin users (JWT auth)
employees           → Employee records
face_encodings      → 128-d face encoding blobs
attendance_logs     → Daily check-in/out per employee (unique per day)
overtime_adjustments → OT data linked to attendance
audit_logs          → Full audit trail of all changes
```

---

## 🖥 IntelliJ IDEA Setup

1. Open the root folder `attendance-facial-recognition-system/` in IntelliJ
2. For **backend**: Mark `backend/` as Node.js project. Install Node.js plugin.
3. For **frontend**: Mark `frontend/` as JavaScript project.
4. For **face-service**: Open as Python project, configure your virtualenv as the interpreter.
5. Use IntelliJ's **Run Configurations** to run all 3 services simultaneously.

### Recommended IntelliJ Plugins
- Node.js
- Python (PyCharm bundled)
- Tailwind CSS
- .env files support
- Database Tools (built-in)

---

## 📦 Production Deployment

```bash
# Frontend build
cd frontend && npm run build
# Serve dist/ via nginx or express static

# Backend
NODE_ENV=production node src/index.js

# Face service
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

---

## 🤝 Contributing

PRs welcome. Please run linting before submitting.
"# ASYSTEM" 
