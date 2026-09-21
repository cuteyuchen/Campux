import io
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("CAMPUX_OCR_MODELS_DIR", str(Path(__file__).resolve().parent / "models"))

from fastapi.testclient import TestClient
from app import app, load_ocr_model

print("loading model via startup hook")
load_ocr_model()
client = TestClient(app)

r = client.get("/health")
print("health", r.status_code, r.json())
assert r.status_code == 200 and r.json()["ok"] is True

# build a PNG with English/Chinese-like strokes
img = Image.new("RGB", (320, 96), "white")
pixels = np.asarray(img).copy()
# simple black rectangles as stand-in glyphs
pixels[20:40, 20:280] = 0
pixels[50:70, 20:200] = 0
img = Image.fromarray(pixels)
buf = io.BytesIO()
img.save(buf, format="PNG")
png = buf.getvalue()

r = client.post("/ocr", files={"image": ("test.png", png, "image/png")})
print("ocr", r.status_code, r.json())
assert r.status_code == 200
assert "text" in r.json() and "lines" in r.json() and "durationMs" in r.json()

r = client.post("/ocr", files={"image": ("test.txt", b"not-image", "text/plain")})
print("bad mime", r.status_code)
assert r.status_code == 415

r = client.post("/ocr", files={"image": ("empty.png", b"", "image/png")})
print("empty", r.status_code)
assert r.status_code == 400

print("OCR_API_CONTRACT_OK")
