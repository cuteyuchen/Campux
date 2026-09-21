"""Download portable PP-OCRv4 ONNX model packages used by campux-ocr.

Official PaddlePaddle model hosts do not publish ONNX packages for PP-OCRv4.
Runtime images therefore load pre-converted PP-OCRv4 ONNX weights through
PaddleOCR engine=onnxruntime, without installing paddlepaddle.

Expected SHA-256 digests were computed from files downloaded at the exact
pinned revisions below (not TOFU, not main).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import urllib.request

PINNED = {
    "PP-OCRv4_mobile_det": {
        "repo": "tobiichioriguchi/PP-OCRv4_mobile_det_onnx",
        "revision": "5cd2cac1bd4243c43ea2e3742b1b4bbef0a28aed",
        "files": {
            "inference.onnx": "64f2f901ba4ea646f448c7df57f299bdda3e74718a3ef585d65e29eca2b7a1a2",
            "inference.yml": "4f5bd0def48e20194d87d4c184a3ae3007a1299de7fed0ef763d3e7e873e77f6",
        },
    },
    "PP-OCRv4_mobile_rec": {
        "repo": "tobiichioriguchi/PP-OCRv4_mobile_rec_onnx",
        "revision": "f3c998207ce616320461cf55a3b88d67910b90a5",
        "files": {
            "inference.onnx": "682a725637aeda8e774197d404e0bd2b109ffcfca69af9f309c8e7c4d8bb20e2",
            "inference.yml": "1207e8ba3d3dad6b99115f7febf515f5ffc0d87ed77366d7a4b4b3f1709c005d",
        },
    },
}

DEFAULT_OUT = Path(__file__).resolve().parent / "models"
MIN_ONNX_BYTES = 1024


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(*, model: str, file_name: str, path: Path, expected: str) -> None:
    actual = sha256_file(path)
    if actual != expected:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        raise SystemExit(
            "model checksum mismatch:\n"
            f"model={model}\n"
            f"file={file_name}\n"
            f"expected={expected}\n"
            f"actual={actual}"
        )


def download(url: str, dest: Path, *, model: str, file_name: str, expected_sha256: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    print(f"downloading {url} -> {dest}")
    try:
        urllib.request.urlretrieve(url, tmp)
        if file_name.endswith(".onnx") and tmp.stat().st_size < MIN_ONNX_BYTES:
            tmp.unlink(missing_ok=True)
            raise SystemExit(f"model download failed for {model}/{file_name}: file too small")
        verify_checksum(model=model, file_name=file_name, path=tmp, expected=expected_sha256)
        tmp.replace(dest)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def main() -> None:
    out = Path(os.environ.get("CAMPUX_OCR_MODELS_DIR", DEFAULT_OUT))
    for name, meta in PINNED.items():
        target_dir = out / name
        for file_name, expected_sha256 in meta["files"].items():
            url = (
                f"https://huggingface.co/{meta['repo']}"
                f"/resolve/{meta['revision']}/{file_name}"
            )
            download(
                url,
                target_dir / file_name,
                model=name,
                file_name=file_name,
                expected_sha256=expected_sha256,
            )
            print(f"verified {name}/{file_name} sha256={expected_sha256}")
        onnx = target_dir / "inference.onnx"
        print(f"ready {name}: {onnx.stat().st_size} bytes")
    print(f"OCR models ready under {out}")


if __name__ == "__main__":
    main()
