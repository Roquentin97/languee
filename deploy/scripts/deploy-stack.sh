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
monitoring_services=(loki tempo prometheus alloy grafana)
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

cleanup_images() {
  APP_DIR="$APP_DIR" IMAGE_PREFIX="$IMAGE_PREFIX" python3 scripts/cleanup-images.py ||
    echo "WARNING: image cleanup failed; continuing deployment" >&2
}
cleanup_images

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
updated_files=${sync_result##*updated: }
has_updated_file() {
  case ",${updated_files// /}," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}
env_values_changed() {
  local name=$1 previous="$APP_DIR/.config-previous/$1"
  has_updated_file "$name" || return 1
  [ -f "$previous" ] || return 0
  ! cmp -s <(sed '/^#/d' "$previous") <(sed '/^#/d' "$APP_DIR/$name")
}

back_env_changed=false
nlp_env_changed=false
stack_config_changed=false
env_values_changed languee-back.env && back_env_changed=true
env_values_changed languee-nlp.env && nlp_env_changed=true
if has_updated_file .env; then
  previous_stack_env="$APP_DIR/.config-previous/.env"
  if [ ! -f "$previous_stack_env" ] || ! cmp -s \
    <(sed -E '/^#/d; /^LANGUEE_(BACK|NLP)_TAG=/d' "$previous_stack_env") \
    <(sed -E '/^#/d; /^LANGUEE_(BACK|NLP)_TAG=/d' "$APP_DIR/.env"); then
    stack_config_changed=true
  fi
fi

# Resolve the desired pinned images from the uploaded Compose file. Existing
# persistent services never advance implicitly; an image mismatch requires an
# explicit backup/compatibility confirmation before it can be pulled.
compose_config=$(docker compose config --format json)
for service in postgres redis; do
  expected_image=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["services"][sys.argv[2]]["image"])' "$compose_config" "$service")
  containers=$(docker compose ps -aq "$service" 2>/dev/null || true)
  container=${containers%%$'\n'*}
  actual_image=
  if [ -n "$container" ]; then
    actual_image=$(docker inspect --format '{{.Config.Image}}' "$container")
  else
    volumes=$(docker volume ls -q --filter "label=com.docker.compose.volume=${service}_data" || true)
    volume=${volumes%%$'\n'*}
    if [ -n "$volume" ]; then actual_image=unknown; fi
  fi
  if [ -n "$actual_image" ] && [ "$actual_image" != "$expected_image" ]; then
    if [ "$allow_persistent_infra" != true ]; then
      echo "$service image differs from the pinned Compose image; confirm a verified backup and compatibility review before updating it" >&2
      exit 2
    fi
    case " ${infra_services[*]} " in
      *" $service "*) ;;
      *) infra_services+=("$service") ;;
    esac
    echo "persistent infrastructure update approved: $service ($actual_image -> $expected_image)"
  fi
done

# `--no-recreate` intentionally protects persistent services from implicit
# changes to commands, environment, healthchecks, mounts, and other Compose
# settings. Compare the full rendered definition with the last verified apply
# so changes cannot be silently certified as applied.
require_persistent_maintenance() {
  local service=$1 detail=$2
  if [ "$allow_persistent_infra" != true ]; then
    echo "$service Compose definition differs from its running container ($detail); confirm a verified backup and compatibility review before updating it" >&2
    exit 2
  fi
  case " ${infra_services[*]} " in
    *" $service "*) ;;
    *) infra_services+=("$service") ;;
  esac
  echo "persistent infrastructure update approved: $service ($detail)"
}

for service in postgres redis; do
  expected_hash=$(docker compose config --hash "$service" | awk -v service="$service" '$1 == service { print $2; exit }')
  if [ -z "$expected_hash" ]; then
    echo "could not determine the rendered $service Compose definition hash" >&2
    exit 1
  fi
  previous_hash=$(
    python3 - "$APP_DIR/.applied-deploy-state.json" "$service" <<'PY'
import json
import pathlib
import sys

try:
    state = json.loads(pathlib.Path(sys.argv[1]).read_text())
except (OSError, UnicodeDecodeError, json.JSONDecodeError):
    state = {}
if state.get("phase") == "applying" and state.get("baseline_verified") is True:
    print((state.get("persistent_config_hashes") or {}).get(sys.argv[2], ""))
PY
  )
  container_ids=$(docker compose ps -aq "$service" 2>/dev/null || true)
  volumes=$(docker volume ls -q --filter "label=com.docker.compose.volume=${service}_data" || true)
  if { [ -n "$container_ids" ] || [ -n "$volumes" ]; } && [ -z "$previous_hash" ]; then
    # Compose records the rendered service hash on each container it creates.
    # Bootstrap only when every existing container proves it matches; a volume
    # without a container cannot establish the applied definition.
    matching=true
    [ -n "$container_ids" ] || matching=false
    for container in $container_ids; do
      actual_hash=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.config-hash" }}' "$container")
      [ "$actual_hash" = "$expected_hash" ] || matching=false
    done
    if [ "$matching" != true ]; then
      require_persistent_maintenance "$service" "no verified prior service definition is recorded"
    fi
  elif [ -n "$previous_hash" ] && [ "$expected_hash" != "$previous_hash" ]; then
    require_persistent_maintenance "$service" "the rendered service definition changed since its last verified apply"
  fi
done

# --no-recreate starts first-install or stopped dependencies but protects
# existing persistent databases when no reviewed definition update was selected.
docker compose up -d --no-recreate --wait postgres redis

# Monitoring is deliberately non-blocking: API availability, migrations, and
# rollback must not depend on an optional telemetry service being healthy.
# Compose preserves the named monitoring volumes when it retries on a later deploy.
if [ "$config_changed" = true ]; then
  if ! docker compose up -d --force-recreate --wait "${monitoring_services[@]}"; then
    echo "WARNING: monitoring stack did not become healthy; continuing application deployment" >&2
  fi
elif ! docker compose up -d --wait "${monitoring_services[@]}"; then
  echo "WARNING: monitoring stack did not become healthy; continuing application deployment" >&2
fi
for service in "${infra_services[@]}"; do
  before_image=$(docker compose images -q "$service" 2>/dev/null || true)
  docker compose pull "$service"
  docker compose up -d --wait "$service"
  after_image=$(docker compose images -q "$service" 2>/dev/null || true)
  echo "infrastructure $service: ${before_image:-absent} -> ${after_image:-absent}"
  if [ "$service" = postgres ] || [ "$service" = redis ]; then affected+=(languee-back); fi
done

# Resolve app updates independently from the Vault tag selectors. Compose
# recreates a service only when its rendered image or service configuration
# changed, so a backend-only tag update cannot restart an unchanged NLP service.
reconcile_nlp=false
reconcile_backend=false
back_tag_changed=false
nlp_tag_changed=false
[ -n "$back_tag" ] && back_tag_changed=true
[ -n "$nlp_tag" ] && nlp_tag_changed=true
if [ -n "$nlp_tag" ] || [ "$nlp_env_changed" = true ] || [ "$config_changed" = true ]; then
  reconcile_nlp=true
fi
if [ -n "$back_tag" ] || [ "$back_env_changed" = true ] || [ "$stack_config_changed" = true ] || \
  [ "$config_changed" = true ] || [[ " ${affected[*]} " == *" languee-back "* ]]; then
  reconcile_backend=true
fi
echo "app deltas: backend tag=$back_tag_changed, backend env=$back_env_changed, NLP tag=$nlp_tag_changed, NLP env=$nlp_env_changed, stack config=$stack_config_changed, tracked config=$config_changed"

if [ "$reconcile_nlp" = true ]; then
  case " ${affected[*]} " in *" languee-nlp "*) ;; *) affected+=(languee-nlp) ;; esac
  docker compose up -d --no-deps --wait languee-nlp
else
  echo "NLP selectors and rendered configuration are unchanged"
fi
if [ -n "$nlp_tag" ]; then
  docker compose exec -T -e EXPECTED_VERSION="$nlp_version" -e EXPECTED_COMMIT="$nlp_revision" languee-nlp python -c \
    "import json, os, urllib.request; value=json.load(urllib.request.urlopen('http://localhost:8000/version', timeout=10)); assert value == {'version': os.environ['EXPECTED_VERSION'], 'commit': os.environ['EXPECTED_COMMIT']}, value"
fi

if [ -n "$back_tag" ] && [ "$rollback" != true ]; then docker compose run --rm migrate; fi
if [ "$reconcile_backend" = true ]; then
  case " ${affected[*]} " in *" languee-back "*) ;; *) affected+=(languee-back) ;; esac
  docker compose up -d --no-deps --wait languee-back
else
  echo "backend selectors and rendered configuration are unchanged"
fi

# Start Caddy on a first deployment without disturbing it in ordinary app
# deploys. A reviewed Compose/Caddy configuration change recreates only Caddy.
if [ "$config_changed" = true ]; then
  affected+=(caddy)
  docker compose up -d --force-recreate --no-deps --wait caddy
else
  docker compose up -d --no-deps --wait caddy
fi

domain=$(grep '^DOMAIN=' .env | cut -d= -f2-)
curl -fsS -o /dev/null --max-time 15 --retry 10 --retry-delay 6 --retry-all-errors \
  --resolve "$domain:443:127.0.0.1" "https://$domain/health/ready"

if [ -n "$back_tag" ]; then
  curl -fsS --max-time 15 --resolve "$domain:443:127.0.0.1" "https://$domain/version" | \
    BACK_VERSION="$back_version" BACK_REVISION="$back_revision" \
    python3 -c 'import json, os, sys; value=json.load(sys.stdin); assert value == {"version": os.environ["BACK_VERSION"], "commit": os.environ["BACK_REVISION"]}, value'
fi
docker compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
echo "deployed: $(vault_sync --status | tr -d '\n ')"

cleanup_images
