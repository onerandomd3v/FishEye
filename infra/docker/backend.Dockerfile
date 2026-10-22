FROM ghcr.io/astral-sh/uv:0.13.4 AS uv

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

COPY --from=uv /uv /uvx /bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY apps/backend ./apps/backend

RUN uv sync --locked --no-dev --package fisheye-api --package fisheye-worker \
    && useradd --system --uid 10001 --create-home fisheye \
    && mkdir -p /var/lib/fisheye/artifacts \
    && chown -R fisheye:fisheye /app /opt/venv /var/lib/fisheye

USER 10001:10001

EXPOSE 8000
