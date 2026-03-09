#!/bin/sh
set -e

# Ensure tools are on PATH (defensive in case ENV is overridden)
export PROTO_HOME="${PROTO_HOME:-/root/.proto}"
export PATH="$HOME/.local/bin:${PROTO_HOME}/shims:$PATH"
export UV_LINK_MODE="${UV_LINK_MODE:-copy}"

echo "[dev.sh] Installing Python dependencies with uv..."
cd /workspace/server
uv sync

echo "[dev.sh] Installing frontend dependencies with bun..."
cd /workspace/client
bun install

echo "[dev.sh] Starting FastAPI server with uvicorn..."
cd /workspace/server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
SERVER_PID=$!

echo "[dev.sh] Starting Vite dev server..."
cd /workspace/client
bun run dev --host 0.0.0.0 --port 5173 &
CLIENT_PID=$!

wait $SERVER_PID $CLIENT_PID
