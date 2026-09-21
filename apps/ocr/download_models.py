"""Download portable PP-OCRv4 ONNX model packages used by campux-ocr.

Official PaddlePaddle model hosts do not publish ONNX packages for PP-OCRv4.
Runtime images therefore load pre-converted PP-OCRv4 ONNX weights through
PaddleOCR engine=onnxruntime, without installing paddlepaddle.
"""
from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

PINNED = {
    "PP-OCRv4_mobile_det": {
        "repo": "tobiichioriguchi/PP-OCRv4_mobile_det_onnx",
        "revision": "5cd2cac1bd4243c43ea2e3742b1b4bbef0a28aed",
        "files": ["inference.onnx", "inference.yml"],
    },
    "PP-OCRv4_mobile_rec": {
        "repo": "tobiichioriguchi/PP-OCRv4_mobile_rec_onnx",
        "revision": "f3c998207ce616320461cf55a3b88d67910b90a5",
        "files": ["inference.onnx", "inference.yml"],
    },
}

DEFAULT_OUT = Path(__file__).resolve().parent / "models"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    print(f"downloading {url} -> {dest}")
    urllib.request.urlretrieve(url, tmp)
    tmp.replace(dest)


def main() -> None:
    out = Path(os.environ.get("CAMPUX_OCR_MODELS_DIR", DEFAULT_OUT))
    for name, meta in PINNED.items():
        target_dir = out / name
        for filename in meta["files"]:
            url = (
                f"https://huggingface.co/{meta['repo']}"
                f"/resolve/{meta['revision']}/{filename}"
            )
            download(url, target_dir / filename)
        onnx = target_dir / "inference.onnx"
        if not onnx.exists() or onnx.stat().st_size < 1024:
            raise SystemExit(f"model download failed for {name}")
        print(f"ready {name}: {onnx.stat().st_size} bytes")
    print(f"OCR models ready under {out}")


if __name__ == "__main__":
    main()
