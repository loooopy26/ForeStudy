# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Empty means same-origin API calls; Nginx proxies them to the backend service.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM python:3.11-slim AS backend
WORKDIR /app/backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# Keep the runtime entry point explicit so it is always refreshed with the
# current router registration when Docker reuses dependency layers.
COPY backend/main.py ./main.py
RUN mkdir -p /app/data /app/backend/uploads/generated_items /app/backend/uploads/tutor_chat_images
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM nginx:1.27-alpine AS frontend
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
