#!/bin/bash
# Promote a complete per-run deployment payload after the host is marked dirty.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/languee}
DEPLOY_STAGE=${DEPLOY_STAGE:?DEPLOY_STAGE is required}

case "$DEPLOY_STAGE" in
  "$APP_DIR"/.deploy-staging/*) ;;
  *)
    echo "deployment stage must be a direct child of $APP_DIR/.deploy-staging" >&2
    exit 2
    ;;
esac
stage_id=${DEPLOY_STAGE##*/}
if [[ ! "$stage_id" =~ ^[0-9]+-[0-9]+$ ]]; then
  echo "deployment stage must use a run-attempt identifier" >&2
  exit 2
fi

for relative in \
  docker-compose.prod.yml \
  caddy/Caddyfile \
  scripts/backup-db.sh \
  scripts/check-disk-health.py \
  scripts/classify-deploy-changes.py \
  scripts/cleanup-images.py \
  scripts/deploy-stack.sh \
  scripts/deploy-state.py \
  scripts/promote-deploy-assets.sh \
  scripts/provision.sh \
  scripts/reconcile-deploy.py \
  scripts/sync-vault-config.py \
  provision/alloy/config.alloy \
  provision/grafana/provisioning/dashboards/dashboards.yaml \
  provision/grafana/provisioning/dashboards/languee-red.json \
  provision/grafana/provisioning/datasources/loki.yaml \
  provision/grafana/provisioning/datasources/prometheus.yaml \
  provision/grafana/provisioning/datasources/tempo.yaml \
  provision/loki-config.yaml \
  provision/prometheus/prometheus.yml \
  provision/tempo/tempo.yaml; do
  required="$DEPLOY_STAGE/$relative"
  if [ ! -f "$required" ]; then
    echo "staged deployment payload is incomplete: $relative" >&2
    exit 1
  fi
done

replace_directory() {
  local name=$1 source="$DEPLOY_STAGE/$1" destination="$APP_DIR/$1"
  local previous="$DEPLOY_STAGE/.previous-$1"
  rm -rf -- "$previous"
  if [ -e "$destination" ]; then
    mv -- "$destination" "$previous"
  fi
  if ! mv -- "$source" "$destination"; then
    if [ -e "$previous" ] && [ ! -e "$destination" ]; then
      mv -- "$previous" "$destination" || true
    fi
    echo "could not promote staged $name directory" >&2
    return 1
  fi
  rm -rf -- "$previous"
}

# Whole-directory renames remove obsolete tracked provisioning files. If any
# promotion step is interrupted, the applying marker stays present and a later
# run uploads a fresh payload before it can invoke deploy-stack.sh.
replace_directory scripts
replace_directory caddy
replace_directory provision
mv -f -- "$DEPLOY_STAGE/docker-compose.prod.yml" "$APP_DIR/docker-compose.prod.yml"

echo "promoted staged deployment assets for run $stage_id"
