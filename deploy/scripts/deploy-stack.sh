#!/bin/bash
# Apply Vault configuration and (re)start the stack. Runs on the server as the
# deploy user from /opt/languee; the Deploy and Apply config workflows call it.
#
#   deploy-stack.sh --back-tag TAG [--nlp-tag TAG] [--secret-version N]
#   deploy-stack.sh --preserve-tags [--secret-version N] [--restart back,nlp]
#
# Needs VAULT_SECRET_OCID (and optionally OCI_REGION) in the environment. The
# configuration is fetched and validated before anything is stopped or migrated;
# if a later step fails, the previous configuration is restored and the app
# services are recreated with it. The very first apply has no previous
# configuration, so a failure there is reported as is. Database migrations are
# not reverted.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/languee}
cd "$APP_DIR"

back_tag=""
nlp_tag=""
preserve=false
restart=""
while (($#)); do
  case "$1" in
    --back-tag) back_tag=$2; shift 2 ;;
    --nlp-tag) nlp_tag=$2; shift 2 ;;
    --preserve-tags|--preserve-tag) preserve=true; shift ;;
    --tag) back_tag=$2; nlp_tag=$2; shift 2 ;;
    --restart) restart=$2; shift 2 ;;
    --secret-version) secret_version=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$back_tag" || -n "$nlp_tag" || "$preserve" == true ]] || { echo 'select image tags or --preserve-tags' >&2; exit 2; }
migrate=false
[[ -n "$back_tag" ]] && migrate=true

vault_sync() { python3 scripts/sync-vault-config.py --app-dir "$APP_DIR" "$@"; }

state_before=$(vault_sync --status)
initial=false
if [ "$state_before" = "{}" ]; then initial=true; fi
sync_args=()
[[ -n "$back_tag" ]] && sync_args+=(--back-tag "$back_tag")
[[ -n "$nlp_tag" ]] && sync_args+=(--nlp-tag "$nlp_tag")
[[ "$preserve" == true ]] && sync_args+=(--preserve-tags)
[[ -n "${secret_version:-}" ]] && sync_args+=(--secret-version "$secret_version")
vault_sync "${sync_args[@]}"
# Only roll back what this run changed; a no-op apply must not resurrect an
# older snapshot.
changed=false
if [ "$(vault_sync --status)" != "$state_before" ]; then changed=true; fi

on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$changed" = true ]; then
    if [ "$initial" = true ]; then
      echo "deploy failed on the initial configuration apply; there is no earlier configuration to restore" >&2
    else
      echo "deploy failed; restoring previous configuration" >&2
      if vault_sync --restore-previous; then
        docker compose up -d --no-deps languee-nlp languee-back || true
      fi
    fi
  fi
}
trap on_exit EXIT

services=()
[[ -n "$back_tag" ]] && services+=(languee-back migrate)
[[ -n "$nlp_tag" ]] && services+=(languee-nlp)
if ((${#services[@]})); then docker compose pull "${services[@]}"; fi
deps=()
if [[ "$initial" == true ]]; then deps+=(postgres redis caddy); fi
if ((${#deps[@]})); then docker compose pull "${deps[@]}"; docker compose up -d --wait "${deps[@]}"; fi

if [[ "$migrate" == true ]]; then
  docker compose run --rm migrate
fi

if [[ -n "$nlp_tag" || "$restart" == *nlp* ]]; then
  docker compose up -d --no-deps --wait languee-nlp
fi
if [[ -n "$back_tag" || "$restart" == *back* ]]; then
  docker compose up -d --no-deps --wait languee-back
fi
if [[ "$initial" == true ]]; then docker compose up -d --wait; fi

domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
curl -fsS -o /dev/null --max-time 15 --retry 10 --retry-delay 6 --retry-all-errors \
  --resolve "$domain:443:127.0.0.1" "https://$domain/"

docker image prune -f > /dev/null
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo "deployed: $(vault_sync --status | tr -d '\n ')"
