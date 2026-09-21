#!/bin/sh

set -eu

APP_DIR="${APP_DIR:-/volume1/docker/joy-map}"
ENV_FILE="$APP_DIR/.env"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

read_hidden() {
  prompt="$1"
  printf '%s' "$prompt" >&2
  stty -echo
  IFS= read -r answer
  stty echo
  printf '\n' >&2
  printf '%s' "$answer"
}

valid_token() {
  case "$1" in
    ''|*[!A-Za-z0-9._@%+=:_-]*) return 1 ;;
    *) return 0 ;;
  esac
}

[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found"
command -v openssl >/dev/null 2>&1 || fail "openssl not found"
command -v id >/dev/null 2>&1 || fail "id not found"

trap 'stty echo 2>/dev/null || true' EXIT INT TERM HUP

maps_key="$(read_hidden 'Google Maps API key: ')"
valid_token "$maps_key" || fail "API key contains unsupported characters"

printf 'Google Map ID: ' >&2
IFS= read -r map_id
valid_token "$map_id" || fail "Map ID contains unsupported characters"

kakao_key="$(read_hidden 'Kakao REST API key (press Enter to skip): ')"
if [ -n "$kakao_key" ]; then
  valid_token "$kakao_key" || fail "Kakao REST API key contains unsupported characters"
fi

admin_password="$(read_hidden 'New JOY MAP admin password (16+ characters): ')"
[ "${#admin_password}" -ge 16 ] || fail "Admin password must be at least 16 characters"
valid_token "$admin_password" || fail "Use letters, numbers, and . _ - @ % + = : only"

confirm_password="$(read_hidden 'Repeat admin password: ')"
[ "$admin_password" = "$confirm_password" ] || fail "Passwords do not match"

secret_key="$(openssl rand -hex 32)"
[ "${#secret_key}" -ge 64 ] || fail "Could not generate SECRET_KEY"

umask 077
timestamp="$(date '+%Y%m%d-%H%M%S')"
backup_file="$APP_DIR/.env.backup-$timestamp"
work_file="$APP_DIR/.env.configure-$$"
cp "$ENV_FILE" "$backup_file"
app_uid="$(id -u)"
app_gid="$(id -g)"

{
  printf 'APP_USERNAME=admin\n'
  printf 'APP_PASSWORD=%s\n' "$admin_password"
  printf 'SECRET_KEY=%s\n' "$secret_key"
  printf 'SESSION_HOURS=168\n'
  printf 'COOKIE_SECURE=true\n'
  printf 'GOOGLE_MAPS_API_KEY=%s\n' "$maps_key"
  printf 'GOOGLE_MAP_ID=%s\n' "$map_id"
  printf 'KAKAO_REST_API_KEY=%s\n' "$kakao_key"
  printf 'JOY_MAP_PORT=7330\n'
  printf 'JOY_MAP_UID=%s\n' "$app_uid"
  printf 'JOY_MAP_GID=%s\n' "$app_gid"
} > "$work_file"

mv "$work_file" "$ENV_FILE"
chmod 600 "$ENV_FILE" "$backup_file"

unset maps_key map_id kakao_key admin_password confirm_password secret_key app_uid app_gid
trap - EXIT INT TERM HUP

printf '\nSettings saved. A private backup was created at:\n%s\n' "$backup_file"
printf 'Restarting JOY MAP...\n'
sudo /bin/sh "$APP_DIR/scripts/synology-auto-deploy.sh"
