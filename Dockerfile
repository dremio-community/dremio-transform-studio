# ── Dremio Transform Studio — Production Docker Image ────────────────────────
# Single container: builds React frontend then serves everything from FastAPI.
# Usage:
#   docker build -t transform-studio .
#   docker run -p 8000:8000 -v ts-data:/data transform-studio
#   Open http://localhost:8000

# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend into a location FastAPI can find
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Data directory for SQLite
RUN mkdir -p /data
ENV DB_PATH=/data/transforms.db

EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
