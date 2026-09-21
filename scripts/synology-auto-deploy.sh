#!/bin/sh

set -eu

PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:${PATH:-}"
export PATH

APP_DIR="${APP_DIR:-/volume1/docker/joy-map}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:7330/api/health}"
STATE_DIR="$APP_DIR/.deploy-state"
LOCK_DIR="$STATE_DIR/lock"
LAST_SUCCESS_FILE="$STATE_DIR/last-successful-commit"

for required_command in git docker curl; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

mkdir -p "$STATE_DIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] A deployment is already running."
  exit 0
fi
cleanup() { rmdir "$LOCK_DIR" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

cd "$APP_DIR"
if [ ! -d .git ]; then
  echo "Git repository not found: $APP_DIR" >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Tracked local changes found; automatic deployment stopped." >&2
  git status --short >&2
  exit 1
fi

git fetch --prune "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
target_commit="$(git rev-parse "$DEPLOY_REMOTE/$DEPLOY_BRANCH")"
current_commit="$(git rev-parse HEAD)"
last_success=""
if [ -f "$LAST_SUCCESS_FILE" ]; then last_success="$(sed -n '1p' "$LAST_SUCCESS_FILE")"; fi

if [ "$current_commit" != "$target_commit" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Updating $current_commit -> $target_commit"
  git merge --ff-only "$target_commit"
fi
if [ "$last_success" = "$target_commit" ] && curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Already deployed: $target_commit"
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building and starting $target_commit"
docker compose up -d --build

attempt=1
while [ "$attempt" -le 45 ]; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    printf '%s\n' "$target_commit" > "$LAST_SUCCESS_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deployment succeeded: $target_commit"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Health check failed after deployment." >&2
docker compose logs --tail=80 joy-map >&2 || true
exit 1
