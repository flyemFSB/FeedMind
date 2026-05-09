FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

FROM base AS deps

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM base AS dev

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8000

CMD ["fastapi", "dev", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS runtime

COPY --from=deps /app/.venv /app/.venv
COPY app ./app

ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8000

USER app

CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
