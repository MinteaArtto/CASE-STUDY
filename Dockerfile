FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHON=python3 \
    ML_PROFILE=starter \
    TORCH_HOME=/opt/torch-cache \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

COPY ml/requirements-render.txt ml/requirements-render.txt
RUN python -m pip install --no-cache-dir --upgrade pip
RUN python -m pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    "torch==2.7.1+cpu" \
    "torchvision==0.22.1+cpu"
RUN python -m pip install --no-cache-dir -r ml/requirements-render.txt
RUN python -c "from torchvision import models; models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)"

COPY backend/package.json backend/package-lock.json backend/
RUN npm ci --prefix backend --omit=dev

COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend

COPY . .
RUN npm run build --prefix frontend

EXPOSE 10000
CMD ["node", "backend/server.js"]
