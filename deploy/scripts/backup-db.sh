#!/bin/sh
# Nightly Postgres backup: pg_dump -> gzip -> rclone copy to object storage,
# with local + remote retention and an optional healthchecks.io heartbeat.
# Runs on the server from /opt/languee. Install as a cron for the deploy user:
#   10 3 * * * /opt/languee/scripts/backup-db.sh >> /opt/languee/backups/backup.log 2>&1
set -eu

APP_DIR=/opt/languee
cd "$APP_DIR"

# Load compose-level env (Postgres creds, backup settings).
set -a
. ./.env
set +a

: "${BACKUP_RCLONE_REMOTE:=r2:languee-db-backups}"
: "${BACKUP_RETENTION_DAYS:=90}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="backups/languee-$STAMP.sql.gz"

docker compose exec -T postgres pg_dump \
  -U "$LANGUEE_BACK_POSTGRES_USER" \
  -d "$LANGUEE_BACK_POSTGRES_DB" | gzip > "$FILE"

# A dump of an empty-ish database still has a few hundred bytes of DDL;
# treat anything smaller as a failed dump.
size=$(wc -c < "$FILE")
if [ "$size" -lt 200 ]; then
  echo "backup looks empty ($size bytes), refusing to upload" >&2
  exit 1
fi

rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE/"
rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" "$BACKUP_RCLONE_REMOTE/"
find backups -name 'languee-*.sql.gz' -mtime +7 -delete

if [ -n "${BACKUP_HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEALTHCHECK_URL" > /dev/null
fi

echo "backup ok: $FILE ($size bytes) -> $BACKUP_RCLONE_REMOTE"
