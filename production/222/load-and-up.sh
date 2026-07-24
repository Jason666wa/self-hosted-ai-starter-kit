#!/bin/bash
# 222 服务器：加载离线镜像并启动带 SSO + external runners 的 n8n
# 将本目录（production/222）整体拷到服务器后，在该目录执行：
#   bash load-and-up.sh
#
# 期望布局（示例）：
#   /home/ai/project/n8n/222/
#     n8n/                 (SSO hooks + runners 配置)
#     docker-compose*.yml
#     *.tar
#     .env
#     load-and-up.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_BASE="docker-compose.yml"
COMPOSE_OVERRIDE="docker-compose.emagy-sso.override.yml"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$COMPOSE_BASE" ]]; then
  echo "Error: $COMPOSE_BASE not found in $SCRIPT_DIR"
  exit 1
fi
if [[ ! -f "$COMPOSE_OVERRIDE" ]]; then
  echo "Error: $COMPOSE_OVERRIDE not found in $SCRIPT_DIR"
  exit 1
fi
if [[ ! -f "$SCRIPT_DIR/n8n/emagy-sso-hooks.js" ]]; then
  echo "Error: n8n/emagy-sso-hooks.js not found"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$SCRIPT_DIR/.env.example" ]]; then
    echo "Error: $ENV_FILE not found. Copy and edit first:"
    echo "  cp .env.example .env"
    echo "  # then set POSTGRES_PASSWORD / N8N_ENCRYPTION_KEY / N8N_SSO_JWT_SECRET ..."
  else
    echo "Error: $ENV_FILE not found"
  fi
  exit 1
fi

if grep -qE 'CHANGE_ME|^N8N_SSO_JWT_SECRET=\s*$|^POSTGRES_PASSWORD=\s*$|^N8N_ENCRYPTION_KEY=\s*$|^N8N_RUNNERS_AUTH_TOKEN=\s*$' "$ENV_FILE"; then
  echo "Error: $ENV_FILE still has empty or placeholder secrets"
  echo "Fill POSTGRES_PASSWORD / N8N_ENCRYPTION_KEY / N8N_USER_MANAGEMENT_JWT_SECRET /"
  echo "N8N_RUNNERS_AUTH_TOKEN / N8N_SSO_JWT_SECRET (must match electromagnify production .env)."
  exit 1
fi

load_tar_if_present() {
  local file="$1"
  local required="${2:-optional}"
  if [[ -f "$file" ]]; then
    echo "  Loading $file..."
    docker load -i "$file"
  elif [[ "$required" == "required" ]]; then
    echo "  Error: $file not found (run build-and-export-local.ps1 on build machine)."
    exit 1
  else
    echo "  ($file not found, skip; compose may try docker pull)"
  fi
}

echo "[0/5] Using env: $ENV_FILE"

echo "[1/5] Loading image tars in $SCRIPT_DIR (if present)..."
shopt -s nullglob
tars=( "$SCRIPT_DIR"/*.tar )
if ((${#tars[@]} == 0)); then
  echo "  No *.tar found; assuming images already loaded or registry pull is available."
else
  for f in "${tars[@]}"; do
    load_tar_if_present "$f" optional
  done
fi

echo "[2/5] Starting n8n with SSO override + task-runners..."
docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_OVERRIDE" up -d

echo "[3/5] Checking SSO hook mount on n8n..."
docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_OVERRIDE" exec -T n8n \
  ls -l /home/node/.n8n/emagy-sso-hooks.js

echo "[4/5] Waiting for n8n to register runners..."
sleep 8
docker logs n8n 2>&1 | tail -n 40 || true

echo "[5/5] Done."
echo "Accept:"
echo "  curl -I http://10.10.10.222:5678"
echo "  curl -s -o - -w '\\nHTTP_CODE=%{http_code}\\n' http://10.10.10.222:5678/emagy-sso/consume"
echo "Expect HTTP 400/401/403 (missing/invalid ticket), not SPA HTML 404."
echo "Editor: http://10.10.10.222:5678"
