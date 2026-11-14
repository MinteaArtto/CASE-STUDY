FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHON=python3

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

COPY ml/requirements-render.txt ml/requirements-render.txt
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --no-cache-dir -r ml/requirements-render.txt

COPY backend/package.json backend/package-lock.json backend/
RUN npm ci --prefix backend --omit=dev

COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend

COPY . .
RUN npm run build --prefix frontend

EXPOSE 10000
CMD ["node", "backend/server.js"]
