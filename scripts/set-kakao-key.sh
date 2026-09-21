#!/bin/sh

set -eu

APP_DIR="${APP_DIR:-/volume1/docker/joy-map}"
ENV_FILE="$APP_DIR/.env"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found"

trap 'stty echo 2>/dev/null || true' EXIT INT TERM HUP
printf 'Kakao REST API key: ' >&2
stty -echo
IFS= read -r kakao_key
stty echo
printf '\n' >&2

case "$kakao_key" in
  ''|*[!A-Za-z0-9._@%+=:_-]*) fail "Kakao REST API key contains unsupported characters" ;;
esac

umask 077
timestamp="$(date '+%Y%m%d-%H%M%S')"
backup_file="$APP_DIR/.env.backup-$timestamp"
work_file="$APP_DIR/.env.kakao-$$"
cp "$ENV_FILE" "$backup_file"

awk -v kakao_key="$kakao_key" '
  BEGIN { found = 0 }
  /^KAKAO_REST_API_KEY=/ {
    print "KAKAO_REST_API_KEY=" kakao_key
    found = 1
    next
  }
  { print }
  END {
    if (!found) print "KAKAO_REST_API_KEY=" kakao_key
  }
' "$ENV_FILE" > "$work_file"

mv "$work_file" "$ENV_FILE"
chmod 600 "$ENV_FILE" "$backup_file"
unset kakao_key
trap - EXIT INT TERM HUP

printf 'Kakao key saved. Restarting JOY MAP...\n'
sudo /bin/sh "$APP_DIR/scripts/synology-auto-deploy.sh"
