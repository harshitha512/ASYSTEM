"""
Face Recognition Microservice
Uses dlib directly - finds model files without pkg_resources
"""

import os
import sys
import pickle
import glob
import numpy as np
import mysql.connector
from mysql.connector import pooling
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from PIL import Image
import io
import uuid

load_dotenv()

# ── Find model files without pkg_resources ─────────────────
def find_model_file(filename):
    """Search common locations for dlib model files."""
    search_paths = [
        # Inside venv site-packages
        os.path.join(os.path.dirname(sys.executable), "..", "Lib", "site-packages", "face_recognition_models", "models", filename),
        os.path.join(os.path.dirname(sys.executable), "Lib", "site-packages", "face_recognition_models", "models", filename),
        # Current folder
        os.path.join(os.getcwd(), filename),
        os.path.join(os.getcwd(), "models", filename),
    ]
    # Also search all site-packages
    for sp in sys.path:
        search_paths.append(os.path.join(sp, "face_recognition_models", "models", filename))
        search_paths.append(os.path.join(sp, filename))

    for p in search_paths:
        p = os.path.normpath(p)
        if os.path.exists(p):
            print(f"      Found: {p}")
            return p

    # Last resort: glob search in venv folder
    venv_dir = os.path.dirname(os.path.dirname(sys.executable))
    matches = glob.glob(os.path.join(venv_dir, "**", filename), recursive=True)
    if matches:
        print(f"      Found via glob: {matches[0]}")
        return matches[0]

    return None

print("=" * 50)
print("  Face Recognition Service Starting...")
print("=" * 50)

print("\n[1/3] Loading dlib...")
try:
    import dlib
    print("      ✅ dlib imported")
except Exception as e:
    print(f"      ❌ dlib import failed: {e}")
    sys.exit(1)

print("\n[2/3] Finding model files...")
SHAPE_FILE   = "shape_predictor_68_face_landmarks.dat"
FACE_REC_FILE = "dlib_face_recognition_resnet_model_v1.dat"

shape_path   = find_model_file(SHAPE_FILE)
face_rec_path = find_model_file(FACE_REC_FILE)

if not shape_path:
    print(f"      ❌ Cannot find {SHAPE_FILE}")
    print("      Run: python download_models.py")
    sys.exit(1)
if not face_rec_path:
    print(f"      ❌ Cannot find {FACE_REC_FILE}")
    print("      Run: python download_models.py")
    sys.exit(1)

print("\n[3/3] Loading models into dlib...")
try:
    detector        = dlib.get_frontal_face_detector()
    shape_predictor = dlib.shape_predictor(shape_path)
    face_encoder    = dlib.face_recognition_model_v1(face_rec_path)
    print("      ✅ All models loaded!")
except Exception as e:
    print(f"      ❌ Model load failed: {e}")
    sys.exit(1)

print("\n✅ Face service ready!\n")

# ── MySQL Pool ──────────────────────────────────────────────
print("\n[DB] Connecting to MySQL...")
print(f"     Host:     {os.getenv('DB_HOST', 'localhost')}")
print(f"     Port:     {os.getenv('DB_PORT', '3306')}")
print(f"     Database: {os.getenv('DB_NAME', 'attendance_db')}")
print(f"     User:     {os.getenv('DB_USER', 'root')}")

try:
    db_pool = pooling.MySQLConnectionPool(
        pool_name="attendface",
        pool_size=5,
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 3306)),
        database=os.getenv("DB_NAME", "attendance_db"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        charset="utf8mb4",
    )
    print("✅ MySQL connected successfully")
except Exception as e:
    print(f"\n❌ MySQL connection FAILED: {e}")
    print("\nFix: Check your .env file in face_service/ folder:")
    print("  DB_HOST=localhost")
    print("  DB_PORT=3306")
    print("  DB_NAME=attendance_db")
    print("  DB_USER=root")
    print("  DB_PASSWORD=your_password\n")
    sys.exit(1)

app = FastAPI(title="Face Recognition Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

TOLERANCE = float(os.getenv("TOLERANCE", "0.5"))

def get_conn():
    if db_pool is None:
        raise RuntimeError("Database not connected. Check your .env file.")
    return db_pool.get_connection()

def image_from_bytes(data: bytes):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.array(img)

def get_encodings(rgb):
    faces = detector(rgb, 1)
    encodings = []
    for face in faces:
        shape = shape_predictor(rgb, face)
        enc   = np.array(face_encoder.compute_face_descriptor(rgb, shape))
        encodings.append(enc)
    return encodings, faces

def load_all_encodings():
    conn = get_conn()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT employee_id, encoding_data FROM face_encodings")
        rows = cur.fetchall()
        encs, ids = [], []
        for row in rows:
            encs.append(pickle.loads(bytes(row["encoding_data"])))
            ids.append(str(row["employee_id"]))
        return encs, ids
    finally:
        cur.close(); conn.close()

# ── Endpoints ───────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "engine": "dlib-direct"}

@app.post("/register")
async def register_face(employee_id: str = Form(...), image: UploadFile = File(...)):
    contents = await image.read()
    rgb = image_from_bytes(contents)
    encs, faces = get_encodings(rgb)
    if not encs:
        raise HTTPException(422, "No face detected")
    if len(encs) > 1:
        raise HTTPException(422, "Multiple faces detected. Use single-face photo.")

    blob = pickle.dumps(encs[0])
    conn = get_conn(); cur = conn.cursor()
    try:
        # Remove old encoding for this employee (if any), then insert fresh
        cur.execute("DELETE FROM face_encodings WHERE employee_id = %s", (employee_id,))
        cur.execute(
            "INSERT INTO face_encodings (id, employee_id, encoding_data) VALUES (%s, %s, %s)",
            (str(uuid.uuid4()), employee_id, blob)
        )
        conn.commit()
    finally:
        cur.close(); conn.close()
    return {"message": "Face registered", "employee_id": employee_id, "encoding": encs[0].tolist()}

@app.post("/recognize")
async def recognize_face(image: UploadFile = File(...)):
    contents = await image.read()
    rgb = image_from_bytes(contents)
    encs, _ = get_encodings(rgb)
    if not encs:
        return {"employee_id": None, "reason": "No face detected"}

    unknown   = encs[0]
    known_encs, known_ids = load_all_encodings()
    if not known_encs:
        return {"employee_id": None, "reason": "No registered faces"}

    dists    = np.linalg.norm(np.array(known_encs) - unknown, axis=1)
    best_idx = int(np.argmin(dists))
    best_dist = float(dists[best_idx])

    if best_dist <= TOLERANCE:
        return {"employee_id": known_ids[best_idx], "confidence": round(1 - best_dist, 4)}
    return {"employee_id": None, "reason": "No match", "distance": round(best_dist, 4)}

@app.post("/detect")
async def detect_face(image: UploadFile = File(...)):
    contents = await image.read()
    rgb = image_from_bytes(contents)
    _, faces = get_encodings(rgb)
    return {"detected": len(faces) > 0, "count": len(faces)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=False)