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

is_kakao_rest_key() {
  [ "${#1}" -eq 32 ] || return 1
  case "$1" in
    *[!A-Fa-f0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found"
trap 'stty echo 2>/dev/null || true' EXIT INT TERM HUP

kakao_key="$(read_hidden 'Kakao REST API key (32 characters): ')"
is_kakao_rest_key "$kakao_key" || fail "Copy the 32-character REST API key exactly once"

confirm_key="$(read_hidden 'Repeat Kakao REST API key: ')"
[ "$kakao_key" = "$confirm_key" ] || fail "REST API keys do not match"

umask 077
timestamp="$(date '+%Y%m%d-%H%M%S')"
backup_file="$APP_DIR/.env.backup-$timestamp"
work_file="$APP_DIR/.env.kakao-$$"
cp "$ENV_FILE" "$backup_file"
found_key=false

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    KAKAO_REST_API_KEY=*)
      printf 'KAKAO_REST_API_KEY=%s\n' "$kakao_key"
      found_key=true
      ;;
    *) printf '%s\n' "$line" ;;
  esac
done < "$ENV_FILE" > "$work_file"

if [ "$found_key" = false ]; then
  printf 'KAKAO_REST_API_KEY=%s\n' "$kakao_key" >> "$work_file"
fi

mv "$work_file" "$ENV_FILE"
chmod 600 "$ENV_FILE" "$backup_file"
unset kakao_key confirm_key
trap - EXIT INT TERM HUP

printf '\nKakao REST API key updated. A private backup was created at:\n%s\n' "$backup_file"
printf 'Restarting JOY MAP...\n'
sudo /bin/sh "$APP_DIR/scripts/synology-auto-deploy.sh"
