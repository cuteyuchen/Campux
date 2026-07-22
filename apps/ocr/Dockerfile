FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    PADDLE_PDX_MODEL_SOURCE=BOS

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/ocr/app.py ./app.py

# Download the lightweight Chinese PP-OCRv4 models during image build so the
# production container never waits for external model downloads at startup.
RUN python -c "from app import create_ocr; create_ocr()"

EXPOSE 9001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "9001", "--workers", "1"]
