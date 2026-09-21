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

replace_env_value() {
  key="$1"
  value="$2"
  input_file="$3"
  output_file="$4"

  awk -v wanted_key="$key" -v wanted_value="$value" '
    BEGIN { replaced = 0 }
    index($0, wanted_key "=") == 1 {
      print wanted_key "=" wanted_value
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) print wanted_key "=" wanted_value
    }
  ' "$input_file" > "$output_file"
}

[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found"
command -v awk >/dev/null 2>&1 || fail "awk not found"
command -v openssl >/dev/null 2>&1 || fail "openssl not found"

trap 'stty echo 2>/dev/null || true' EXIT INT TERM HUP

maps_key="$(read_hidden 'Google Maps API key: ')"
valid_token "$maps_key" || fail "API key contains unsupported characters"

printf 'Google Map ID: ' >&2
IFS= read -r map_id
valid_token "$map_id" || fail "Map ID contains unsupported characters"

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
work_a="$APP_DIR/.env.configure-a-$$"
work_b="$APP_DIR/.env.configure-b-$$"
cp "$ENV_FILE" "$backup_file"
cp "$ENV_FILE" "$work_a"

replace_env_value GOOGLE_MAPS_API_KEY "$maps_key" "$work_a" "$work_b"
mv "$work_b" "$work_a"
replace_env_value GOOGLE_MAP_ID "$map_id" "$work_a" "$work_b"
mv "$work_b" "$work_a"
replace_env_value APP_PASSWORD "$admin_password" "$work_a" "$work_b"
mv "$work_b" "$work_a"
replace_env_value SECRET_KEY "$secret_key" "$work_a" "$work_b"

mv "$work_b" "$ENV_FILE"
chmod 600 "$ENV_FILE" "$backup_file"
rm -f "$work_a"

unset maps_key map_id admin_password confirm_password secret_key
trap - EXIT INT TERM HUP

printf '\nSettings saved. A private backup was created at:\n%s\n' "$backup_file"
printf 'Restarting JOY MAP...\n'
sudo /bin/sh "$APP_DIR/scripts/synology-auto-deploy.sh"

