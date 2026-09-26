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
trap 'stty echo 2>/dev/null || true' EXIT INT TERM HUP

new_password="$(read_hidden 'New JOY MAP password (8+ characters): ')"
[ "${#new_password}" -ge 8 ] || fail "Password must be at least 8 characters"
valid_token "$new_password" || fail "Use letters, numbers, and . _ - @ % + = : only"

confirm_password="$(read_hidden 'Repeat password: ')"
[ "$new_password" = "$confirm_password" ] || fail "Passwords do not match"

umask 077
timestamp="$(date '+%Y%m%d-%H%M%S')"
backup_file="$APP_DIR/.env.backup-$timestamp"
work_file="$APP_DIR/.env.password-$$"
cp "$ENV_FILE" "$backup_file"
found_password=false

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    APP_PASSWORD=*)
      printf 'APP_PASSWORD=%s\n' "$new_password"
      found_password=true
      ;;
    *) printf '%s\n' "$line" ;;
  esac
done < "$ENV_FILE" > "$work_file"

if [ "$found_password" = false ]; then
  printf 'APP_PASSWORD=%s\n' "$new_password" >> "$work_file"
fi

mv "$work_file" "$ENV_FILE"
chmod 600 "$ENV_FILE" "$backup_file"
unset new_password confirm_password
trap - EXIT INT TERM HUP

printf '\nPassword updated. A private backup was created at:\n%s\n' "$backup_file"
printf 'Restarting JOY MAP...\n'
sudo /bin/sh "$APP_DIR/scripts/synology-auto-deploy.sh"
