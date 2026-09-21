import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import create_ocr, collect_recognized_text, extract_result_lines, warm_up_ocr
import numpy as np

print(f"platform={sys.platform}")
print("paddlepaddle installed?", end=" ")
try:
    import paddle  # noqa: F401
    print("yes", paddle.__version__)
except Exception:
    print("no")

model = create_ocr()
warm_up_ocr(model)
img = np.full((80, 200, 3), 255, dtype=np.uint8)
# draw simple black bars to encourage text detection path
img[20:30, 20:180] = 0
img[40:50, 20:150] = 0
result = list(model.predict(img))
lines = []
for item in result:
    lines.extend(extract_result_lines(item))
print("items", len(result), "lines", lines)
print("OCR_SMOKE_OK")
