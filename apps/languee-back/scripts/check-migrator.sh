#!/usr/bin/env bash
set -euo pipefail

docker build --target migrator -t migrator-ci .
status=0
out=$(docker run --rm -e DATABASE_URL=postgresql://ci:ci@127.0.0.1:1/ci \
  migrator-ci yarn prisma migrate deploy 2>&1) || status=$?
printf '%s\n' "$out"
if [ "$status" -eq 0 ] || ! grep -q 'P1001' <<< "$out"; then
  echo 'migrator did not reach the database connection stage' >&2
  exit 1
fi
