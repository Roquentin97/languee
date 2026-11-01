#!/bin/bash
# Apply Vault configuration and (re)start the stack. Runs on the server as the
# deploy user from /opt/languee; the Deploy and Apply config workflows call it.
#
#   deploy-stack.sh --tag sha-1a2b3c4 [--secret-version N]   code deploy (+ migrations)
#   deploy-stack.sh --preserve-tag    [--secret-version N]   config-only apply
#
# Needs VAULT_SECRET_OCID (and optionally OCI_REGION) in the environment. The
# configuration is fetched and validated before anything is stopped or migrated;
# if a later step fails, the previous configuration is restored and the app
# services are recreated with it. Database migrations are not reverted.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/languee}
cd "$APP_DIR"

migrate=false
for arg in "$@"; do
  if [ "$arg" = "--tag" ]; then migrate=true; fi
done

vault_sync() { python3 scripts/sync-vault-config.py --app-dir "$APP_DIR" "$@"; }

state_before=$(vault_sync --status)
vault_sync "$@"
# Only roll back what this run changed; a no-op apply must not resurrect an
# older snapshot.
changed=false
if [ "$(vault_sync --status)" != "$state_before" ]; then changed=true; fi

on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$changed" = true ]; then
    echo "deploy failed; restoring previous configuration" >&2
    if vault_sync --restore-previous; then
      docker compose up -d --force-recreate --no-deps languee-nlp languee-back || true
    fi
  fi
}
trap on_exit EXIT

docker compose --profile tools pull
docker compose up -d --remove-orphans --wait postgres redis

if [ "$migrate" = true ]; then
  docker compose run --rm migrate
fi

# Env files are read at container creation, so app services are always
# recreated: a config-only apply must pick up changed values.
docker compose up -d --force-recreate --no-deps --wait languee-nlp
docker compose up -d --force-recreate --no-deps --wait languee-back
docker compose up -d --remove-orphans --wait

domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
curl -fsS -o /dev/null --max-time 15 --retry 10 --retry-delay 6 --retry-all-errors \
  --resolve "$domain:443:127.0.0.1" "https://$domain/"

docker image prune -f > /dev/null
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo "deployed: $(vault_sync --status | tr -d '\n ')"
