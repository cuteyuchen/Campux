FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    PADDLE_PDX_MODEL_SOURCE=BOS \
    CAMPUX_OCR_MODELS_DIR=/app/models

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/ocr/app.py ./app.py
COPY apps/ocr/download_models.py ./download_models.py

# Official hosts do not publish PP-OCRv4 ONNX packages. Download pinned
# portable ONNX weights (arch-independent) and warm them up with onnxruntime
# so a successful image build also proves runtime inference can initialize.
RUN python download_models.py \
    && python -c "from app import create_ocr, warm_up_ocr; model = create_ocr(); warm_up_ocr(model)"

EXPOSE 9001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9001", "--workers", "1"]
