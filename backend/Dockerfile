# Build from the repository root:  docker build -f backend/Dockerfile -t skyline-api .
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# code, scripts, the schema for first start, and the logo used in emails and PDFs
COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY database/schema.sql /database/schema.sql
COPY frontend/public/logo.png /frontend/public/logo.png

RUN useradd --system --uid 10001 --no-create-home skyline && mkdir -p /app/uploads && chown -R skyline /app/uploads
USER skyline

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/stats', timeout=4).status == 200 else 1)"

# One worker on purpose: the reminder, e-mail and hold-cleanup loops run inside the app process.
CMD ["sh", "-c", "python -m scripts.bootstrap && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
