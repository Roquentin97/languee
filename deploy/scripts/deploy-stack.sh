#!/bin/bash
# Apply a selected immutable artifact set on the server. This script never
# selects `latest`: sync-vault-config owns the persisted image references.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/languee}
IMAGE_PREFIX=${IMAGE_PREFIX:-ghcr.io/roquentin97/languee}
cd "$APP_DIR"

back_tag=
nlp_tag=
secret_version=
rollback=false
preserve_tags=false
allow_persistent_infra=false
config_changed=false
infra_services=()
back_version=
back_revision=
nlp_version=
nlp_revision=

usage() {
  cat >&2 <<'EOF'
Usage: deploy-stack.sh [--back-tag TAG] [--nlp-tag TAG] [--preserve-tags]
                       [--rollback] [--secret-version N] [--infra SERVICE]
                       [--config] [--allow-persistent-infra]
EOF
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --back-tag) back_tag=${2:?missing backend tag}; shift 2 ;;
    --nlp-tag) nlp_tag=${2:?missing NLP tag}; shift 2 ;;
    --preserve-tags) preserve_tags=true; shift ;;
    --rollback) rollback=true; shift ;;
    --secret-version) secret_version=${2:?missing secret version}; shift 2 ;;
    --infra)
      case ${2:?missing infrastructure service} in postgres|redis|caddy) infra_services+=("$2") ;; *) usage ;; esac
      shift 2 ;;
    --allow-persistent-infra) allow_persistent_infra=true; shift ;;
    --config) config_changed=true; shift ;;
    *) usage ;;
  esac
done

if [ "$preserve_tags" = true ] && { [ -n "$back_tag" ] || [ -n "$nlp_tag" ]; }; then
  echo "--preserve-tags cannot be combined with an image tag" >&2
  exit 2
fi

vault_sync() { python3 scripts/sync-vault-config.py --app-dir "$APP_DIR" "$@"; }
sync_args=()
[ -n "$back_tag" ] && sync_args+=(--back-tag "$back_tag")
[ -n "$nlp_tag" ] && sync_args+=(--nlp-tag "$nlp_tag")
[ "$preserve_tags" = true ] && sync_args+=(--preserve-tags)
[ -n "$secret_version" ] && sync_args+=(--secret-version "$secret_version")
if [ "${#sync_args[@]}" -eq 0 ]; then sync_args+=(--preserve-tags); fi

state_before=$(vault_sync --status)
initial=false
if ! grep -q '"back_tag": "' <<<"$state_before"; then initial=true; fi

# Artifact labels are checked before state is changed. A missing artifact never
# falls back to a moving tag.
verify_artifact() {
  local service=$1 tag=$2 image version revision patch
  image="$IMAGE_PREFIX/$service:$tag"
  docker pull "$image"
  version=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$image")
  revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")
  if ! [[ "$revision" =~ ^[0-9a-f]{40}$ ]]; then
    echo "$image is missing a full OCI source revision label" >&2
    exit 1
  fi
  if [[ "$tag" =~ ^dev-([0-9]+)-[0-9a-f]{12}$ ]]; then
    patch=${BASH_REMATCH[1]}
    if { [ "$version" != "0.0.$patch" ] && [ "$version" != "0.1.$patch" ]; } || [ "${revision:0:12}" != "${tag##*-}" ]; then
      echo "$image OCI labels do not match its build tag" >&2
      exit 1
    fi
  fi
  if [ "$service" = languee-back ]; then back_version=$version; back_revision=$revision; fi
  if [ "$service" = languee-nlp ]; then nlp_version=$version; nlp_revision=$revision; fi
}

if [ -n "$back_tag" ]; then
  verify_artifact languee-back "$back_tag"
  verify_artifact languee-back-migrator "$back_tag"
fi
if [ -n "$nlp_tag" ]; then verify_artifact languee-nlp "$nlp_tag"; fi

for service in "${infra_services[@]}"; do
  if { [ "$service" = postgres ] || [ "$service" = redis ]; } && [ "$allow_persistent_infra" != true ]; then
    echo "$service updates need --allow-persistent-infra after a verified backup and compatibility review" >&2
    exit 2
  fi
done
changed=false
affected=()
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$changed" = true ]; then
    if [ "$initial" = true ]; then
      echo "deploy failed on the initial configuration apply; there is no earlier configuration to restore" >&2
    else
      echo "deploy failed; restoring the previous image references and configuration" >&2
      if vault_sync --restore-previous && [ "${#affected[@]}" -gt 0 ]; then
        docker compose up -d --force-recreate --no-deps "${affected[@]}" || true
      fi
    fi
  fi
}
trap on_exit EXIT

sync_result=$(vault_sync "${sync_args[@]}")
printf '%s\n' "$sync_result"
if [ "$(vault_sync --status)" != "$state_before" ]; then changed=true; fi
back_container_before=$(docker compose ps -q languee-back 2>/dev/null || true)
nlp_container_before=$(docker compose ps -q languee-nlp 2>/dev/null || true)

# No blanket compose pull: normal app deploys cannot advance infrastructure.
docker compose up -d --wait postgres redis
for service in "${infra_services[@]}"; do
  before_image=$(docker compose images -q "$service" 2>/dev/null || true)
  docker compose pull "$service"
  docker compose up -d --wait "$service"
  after_image=$(docker compose images -q "$service" 2>/dev/null || true)
  echo "infrastructure $service: ${before_image:-absent} -> ${after_image:-absent}"
  if [ "$service" = postgres ] || [ "$service" = redis ]; then affected+=(languee-back); fi
done

if [ -n "$back_tag" ] && [ "$rollback" != true ]; then docker compose run --rm migrate; fi
if [ -n "$back_tag" ]; then affected+=(languee-back); fi
if [ -n "$nlp_tag" ]; then affected+=(languee-nlp); fi

# A config-only no-op retains running containers. Any changed Vault-rendered
# app env is applied explicitly; secrets cannot be inferred safely by paths.
if [ "$preserve_tags" = true ] && ! grep -q 'updated: no env changes' <<<"$sync_result"; then
  affected+=(languee-back languee-nlp)
fi

if [ "${#affected[@]}" -gt 0 ]; then
  mapfile -t affected < <(printf '%s\n' "${affected[@]}" | awk '!seen[$0]++')
  docker compose up -d --force-recreate --no-deps --wait "${affected[@]}"
else
  echo "no application container changes"
fi

# Start Caddy on a first deployment without disturbing it in ordinary app
# deploys. A reviewed Compose/Caddy configuration change recreates only Caddy.
if [ "$config_changed" = true ]; then
  affected+=(caddy)
  docker compose up -d --force-recreate --no-deps --wait caddy
else
  docker compose up -d --wait caddy
fi

domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
curl -fsS -o /dev/null --max-time 15 --retry 10 --retry-delay 6 --retry-all-errors \
  --resolve "$domain:443:127.0.0.1" "https://$domain/health/ready"

if [ -n "$back_tag" ]; then
  curl -fsS --max-time 15 --resolve "$domain:443:127.0.0.1" "https://$domain/version" | \
    BACK_VERSION="$back_version" BACK_REVISION="$back_revision" \
    python3 -c 'import json, os, sys; value=json.load(sys.stdin); assert value == {"version": os.environ["BACK_VERSION"], "commit": os.environ["BACK_REVISION"]}, value'
fi
if [ -n "$nlp_tag" ]; then
  docker compose exec -T -e EXPECTED_VERSION="$nlp_version" -e EXPECTED_COMMIT="$nlp_revision" languee-nlp python -c \
    "import json, os, urllib.request; value=json.load(urllib.request.urlopen('http://localhost:8000/version', timeout=10)); assert value == {'version': os.environ['EXPECTED_VERSION'], 'commit': os.environ['EXPECTED_COMMIT']}, value"
fi

if [ "$config_changed" != true ] && [ "${#infra_services[@]}" -eq 0 ]; then
  if [ -z "$back_tag" ] && [ "$back_container_before" != "$(docker compose ps -q languee-back 2>/dev/null || true)" ]; then
    echo "unchanged backend container was recreated" >&2
    exit 1
  fi
  if [ -z "$nlp_tag" ] && [ "$nlp_container_before" != "$(docker compose ps -q languee-nlp 2>/dev/null || true)" ]; then
    echo "unchanged NLP container was recreated" >&2
    exit 1
  fi
fi

docker compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
echo "deployed: $(vault_sync --status | tr -d '\n ')"
