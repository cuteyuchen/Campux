"""Lightweight checksum helper smoke checks (no pytest dependency)."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from download_models import PINNED, sha256_bytes, sha256_file, verify_checksum


def test_sha256_bytes_and_file_agree() -> None:
    payload = b"campux-ocr-model"
    expected = sha256_bytes(payload)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "model.bin"
        path.write_bytes(payload)
        assert sha256_file(path) == expected
        verify_checksum(
            model="smoke",
            file_name="model.bin",
            path=path,
            expected=expected,
        )


def test_verify_checksum_rejects_tampered_byte() -> None:
    payload = b"campux-ocr-model"
    expected = sha256_bytes(payload)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "model.bin"
        tampered = bytearray(payload)
        tampered[0] ^= 0x01
        path.write_bytes(bytes(tampered))
        try:
            verify_checksum(
                model="smoke",
                file_name="model.bin",
                path=path,
                expected=expected,
            )
        except SystemExit as error:
            message = str(error)
            assert "model checksum mismatch" in message
            assert "model=smoke" in message
            assert "file=model.bin" in message
            assert f"expected={expected}" in message
            assert not path.exists()
        else:
            raise AssertionError("expected checksum mismatch to fail")


def test_pinned_model_hashes_are_sha256() -> None:
    for model, meta in PINNED.items():
        for file_name, digest in meta["files"].items():
            assert len(digest) == 64, (model, file_name, digest)
            assert digest == digest.lower()


if __name__ == "__main__":
    test_sha256_bytes_and_file_agree()
    test_verify_checksum_rejects_tampered_byte()
    test_pinned_model_hashes_are_sha256()
    print("OCR_CHECKSUM_SMOKE_OK")
