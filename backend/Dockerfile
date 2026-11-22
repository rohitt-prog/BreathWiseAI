# ==============================================================================
# BreatheWise AI — Production Backend Dockerfile
# Multi-stage build for FastAPI service on Python 3.11-slim
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependency Builder
# ------------------------------------------------------------------------------
FROM python:3.11-slim AS builder

# Prevent Python from writing bytecode and keep stdout/stderr unbuffered
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

# Create isolated virtual environment for runtime dependencies
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install backend dependencies without pip caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# Runtime environment settings:
# - Unbuffered output guarantees logs stream immediately to Docker stdout/stderr
# - Disable bytecode generation for clean, reproducible runtime
# - Place virtual environment at the front of PATH
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Create dedicated unprivileged runtime user and group (UID/GID 10001)
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /sbin/nologin -d /app -M appuser

# Copy isolated virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv

# Copy application code with unprivileged ownership
COPY --chown=appuser:appgroup app/ ./app/

# Switch to non-root execution
USER appuser:appgroup

# Expose internal service port (not published publicly on host)
EXPOSE 8000

# Health check using Python standard library (no curl/wget package overhead)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request, json, sys; res = urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3); sys.exit(0 if (res.getcode() == 200 and json.loads(res.read()).get('status') == 'healthy') else 1)"]

# Production Uvicorn Server Startup:
# - Binds to 0.0.0.0:8000 for Docker internal network access
# - Single worker process to preserve process-local in-memory sliding-window rate limiting
# - Proxy headers enabled with trusted reverse-proxy assumption (internal Docker bridge)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips=*"]
