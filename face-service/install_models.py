"""
Run this if model files are missing: python download_models.py
Downloads dlib model files directly (no Git needed)
"""
import urllib.request
import bz2
import os

MODELS = {
    "shape_predictor_68_face_landmarks.dat": "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2",
    "dlib_face_recognition_resnet_model_v1.dat": "http://dlib.net/files/dlib_face_recognition_resnet_model_v1.dat.bz2",
}

os.makedirs("models", exist_ok=True)

for filename, url in MODELS.items():
    out_path = os.path.join("models", filename)
    if os.path.exists(out_path):
        print(f"✅ Already exists: {filename}")
        continue
    print(f"Downloading {filename}...")
    bz2_path = out_path + ".bz2"
    urllib.request.urlretrieve(url, bz2_path)
    print(f"Extracting...")
    with bz2.open(bz2_path, "rb") as f_in, open(out_path, "wb") as f_out:
        f_out.write(f_in.read())
    os.remove(bz2_path)
    print(f"✅ Done: {filename}")

print("\n✅ All models downloaded to ./models/")
print("Now run: python main.py")