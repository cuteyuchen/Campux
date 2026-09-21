import logging
import os
import time
from io import BytesIO
from pathlib import Path
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
MODELS_DIR = Path(os.getenv("CAMPUX_OCR_MODELS_DIR", str(Path(__file__).resolve().parent / "models")))
DET_MODEL_DIR = MODELS_DIR / "PP-OCRv4_mobile_det"
REC_MODEL_DIR = MODELS_DIR / "PP-OCRv4_mobile_rec"

app = FastAPI(docs_url=None, redoc_url=None)


def create_ocr() -> PaddleOCR:
    kwargs: dict[str, Any] = {
        "lang": "ch",
        "ocr_version": "PP-OCRv4",
        # ONNX Runtime executor keeps PP-OCRv4 portable across linux/amd64 and
        # linux/arm64 without paddlepaddle wheels. Official hosts do not publish
        # PP-OCRv4 ONNX packages, so model dirs carry pre-converted weights.
        # `enable_mkldnn` only configures the Paddle static executor and is omitted.
        "device": "cpu",
        "engine": "onnxruntime",
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
    }
    det_cfg = DET_MODEL_DIR / "inference.yml"
    rec_cfg = REC_MODEL_DIR / "inference.yml"
    if det_cfg.exists() and rec_cfg.exists():
        # Model names must match the yml Global.model_name in each package.
        kwargs["text_detection_model_name"] = "PP-OCRv4_mobile_det"
        kwargs["text_recognition_model_name"] = "PP-OCRv4_mobile_rec"
        kwargs["text_detection_model_dir"] = str(DET_MODEL_DIR)
        kwargs["text_recognition_model_dir"] = str(REC_MODEL_DIR)
        # Explicit dirs mean lang/ocr_version are only documentation.
        kwargs.pop("lang", None)
        kwargs.pop("ocr_version", None)
        logger.info("using local PP-OCRv4 ONNX model dirs under %s", MODELS_DIR)
    else:
        logger.warning(
            "local PP-OCRv4 ONNX model dirs missing under %s; "
            "official onnx packages are unavailable for PP-OCRv4",
            MODELS_DIR,
        )
    return PaddleOCR(**kwargs)


def warm_up_ocr(model: PaddleOCR) -> None:
    # Force the inference executor to initialize before /health can report
    # healthy. Model construction alone does not exercise the ONNX graph.
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


def extract_result_lines(item: Any) -> list[str]:
    # PaddleOCR 3.x results expose `.json` (often nested under "res") and are
    # also dict-like. Prefer `.json`, then fall back to the dict payload.
    json_payload = getattr(item, "json", None)
    found = collect_recognized_text(json_payload) if json_payload is not None else []
    if not found and hasattr(item, "keys"):
        found = collect_recognized_text(item)
    return found


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
    logger.info("PaddleOCR model loaded (PP-OCRv4 / onnxruntime)")


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
        lines.extend(extract_result_lines(item))
    return {
        "text": "\n".join(lines),
        "lines": lines,
        "durationMs": int((time.perf_counter() - started_at) * 1000),
    }
