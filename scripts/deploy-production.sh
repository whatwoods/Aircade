#!/usr/bin/env bash

set -euo pipefail

APP_NAME="${APP_NAME:-aircade}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
RUN_SEED="${RUN_SEED:-0}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd pnpm
require_cmd pm2
require_cmd curl

log "deploying ${APP_NAME} from ${APP_DIR} on branch ${BRANCH}"

cd "${APP_DIR}"

if [ ! -d .git ]; then
  echo "APP_DIR is not a git worktree: ${APP_DIR}" >&2
  exit 1
fi

log "fetching latest code"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

log "installing dependencies"
pnpm install --frozen-lockfile

log "running database migrations"
pnpm db:migrate

if [ "${RUN_SEED}" = "1" ]; then
  log "running seed"
  pnpm db:seed
fi

log "building app"
pnpm build

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  log "restarting existing pm2 process"
  pm2 restart "${APP_NAME}" --update-env
else
  log "starting new pm2 process"
  pm2 start "pnpm start" --name "${APP_NAME}" --cwd "${APP_DIR}"
fi

log "saving pm2 process list"
pm2 save

log "waiting for health endpoint"
for attempt in $(seq 1 10); do
  if curl --fail --silent --show-error "${HEALTHCHECK_URL}" >/tmp/${APP_NAME}-health.json; then
    log "healthcheck passed"
    cat /tmp/${APP_NAME}-health.json
    rm -f /tmp/${APP_NAME}-health.json
    exit 0
  fi

  sleep 2
done

echo "healthcheck failed after deploy: ${HEALTHCHECK_URL}" >&2
pm2 status "${APP_NAME}" || true
exit 1
