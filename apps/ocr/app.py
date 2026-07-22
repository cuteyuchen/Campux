import logging
import os
import time
from io import BytesIO
from threading import BoundedSemaphore
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from paddleocr import PaddleOCR
from PIL import Image, UnidentifiedImageError

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("campux-ocr")

MAX_IMAGE_BYTES = int(os.getenv("OCR_MAX_IMAGE_BYTES", str(25 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("OCR_MAX_IMAGE_PIXELS", "40000000"))
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
inference_lock = BoundedSemaphore(1)
ocr: PaddleOCR | None = None

app = FastAPI(docs_url=None, redoc_url=None)


def create_ocr() -> PaddleOCR:
    return PaddleOCR(
        lang="ch",
        ocr_version="PP-OCRv4",
        # Paddle 3.3's oneDNN executor cannot run the PP-OCRv4 detection
        # graph on every x86 CPU. Keep the portable CPU executor so a
        # successful health check also means inference can actually run.
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def warm_up_ocr(model: PaddleOCR) -> None:
    # Force the inference executor to initialize before /health can report
    # healthy. Model construction alone does not exercise Paddle's CPU graph.
    blank_image = np.full((64, 128, 3), 255, dtype=np.uint8)
    list(model.predict(blank_image))


def collect_recognized_text(payload: Any) -> list[str]:
    lines: list[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            texts = value.get("rec_texts")
            if isinstance(texts, list):
                lines.extend(text.strip() for text in texts if isinstance(text, str) and text.strip())
            for key, child in value.items():
                if key != "rec_texts":
                    visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return lines


def decode_first_image_frame(raw: bytes) -> np.ndarray:
    try:
        with Image.open(BytesIO(raw)) as image:
            image.seek(0)
            return np.asarray(image.convert("RGB"))
    except Image.DecompressionBombError as error:
        raise HTTPException(status_code=413, detail="image resolution exceeds OCR limit") from error
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=415, detail="unsupported OCR image format") from error


@app.on_event("startup")
def load_ocr_model() -> None:
    global ocr
    candidate = create_ocr()
    warm_up_ocr(candidate)
    ocr = candidate
    logger.info("PaddleOCR model loaded")


@app.get("/health")
def health(response: Response) -> dict[str, bool]:
    if ocr is None:
        response.status_code = 503
        return {"ok": False, "modelLoaded": False}
    return {"ok": True, "modelLoaded": True}


@app.post("/ocr")
def recognize_image(image: UploadFile = File(...)) -> dict[str, object]:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="image file is required")

    raw = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image exceeds OCR size limit")
    if not raw:
        raise HTTPException(status_code=400, detail="image file is empty")
    if ocr is None:
        raise HTTPException(status_code=503, detail="OCR model is not ready")

    started_at = time.perf_counter()
    image_data = decode_first_image_frame(raw)
    try:
        with inference_lock:
            result = ocr.predict(image_data)
    except Exception as error:
        logger.exception("PaddleOCR inference failed")
        raise HTTPException(status_code=500, detail="OCR inference failed") from error

    lines: list[str] = []
    for item in result:
        lines.extend(collect_recognized_text(item.json))
    return {
        "text": "\n".join(lines),
        "lines": lines,
        "durationMs": int((time.perf_counter() - started_at) * 1000),
    }
