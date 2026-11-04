# Deploying Languee

Single-VPS production stack: Caddy (TLS) → languee-back / Grafana / protected
Android OTLP ingress, plus Postgres, Redis, Loki, Tempo, Prometheus, and Alloy,
all via `docker-compose.prod.yml`. Images are built
for `linux/arm64` only (the Oracle Always Free Ampere host). Moving to an x86
server such as a Hetzner CX-class requires adding `linux/amd64` to the build
first.

Configuration lives in OCI Vault ([VAULT.md](VAULT.md)); CI, the merge-triggered
dev deployment, build identity, and the branch-migration checklist are in
[CICD.md](CICD.md). The sections below describe the generic server setup and
operations; where they conflict with those two documents for the Oracle dev VM,
those win.

Cost research and provider trade-offs live in the deployment-plan artifact
(2026-08); short version: start on Oracle Always Free while solo, move to
Hetzner CX23 (~€6/mo) if Oracle friction bites or when beta users arrive.

## Server layout

```text
/opt/languee/
  docker-compose.prod.yml   # synced by the Deploy workflow
  caddy/Caddyfile           # synced by the Deploy workflow
  provision/                # Grafana, Loki, Tempo, Prometheus, Alloy config
  scripts/                  # backup-db.sh, deploy-stack.sh, sync-vault-config.py (synced)
  .env                      # generated from OCI Vault on deploy (0600, never edit)
  languee-back.env          # generated from OCI Vault on deploy
  languee-nlp.env           # generated from OCI Vault on deploy
  .deploy-state.json        # backend/NLP image tags + secret version
  backups/                  # local dump retention (7 days)
```

`COMPOSE_FILE=docker-compose.prod.yml` in `.env` makes plain `docker compose`
commands work from `/opt/languee`.

## One-time setup

### 1. Create the server

**Oracle Cloud (free, ARM):**

1. Create an Always Free account and stay on it. Do not upgrade to Pay As You
   Go as a matter of course: the claim that it removes idle-instance
   reclamation is unverified in Oracle's documentation, and it does not
   guarantee an A1 shape ("out of host capacity" errors happen at
   instance-creation time on any billing tier). The upgrade is irreversible
   (Oracle states an upgraded account cannot return to free), and budget alerts
   are soft, periodically evaluated notifications, not a hard spending cap.
   Reassess only if idle reclamation actually disrupts you, weighing it against
   a cheap paid VPS with the billing exposure made explicit.
2. Launch a VM.Standard.A1.Flex instance at 2 OCPU / 12 GB, Ubuntu 24.04, in
   your home region. This size is inside the Always Free allowance under both
   the current and the previously documented larger limits. "Out of host
   capacity" errors are common — retry at different hours or script the retry.
3. In the instance's subnet **Security List**, add ingress rules for TCP 80
   and 443 from 0.0.0.0/0 (22 is open by default).

**Hetzner (paid, x86):**

1. Create a CX23 server (2 vCPU / 4 GB), Ubuntu 24.04, EU location, SSH key
   auth.
2. Attach a Hetzner Cloud Firewall allowing inbound 22, 80, 443.
3. Optional but recommended: enable server backups (+20% ≈ €1.10/mo).

### 2. Provision

As root on the fresh server:

```bash
curl -fsSO https://raw.githubusercontent.com/Roquentin97/languee/<branch>/deploy/scripts/provision.sh
sh provision.sh
```

(or scp the script over). It installs Docker, rclone, fail2ban,
unattended-upgrades, configures ufw, creates the `deploy` user and
`/opt/languee`, and — on Oracle images — opens 80/443 in the image's
pre-seeded iptables rules, which would otherwise silently drop traffic even
with the Security List open.

### 3. GHCR pull access

Images in GHCR are private. On the server, as the `deploy` user, log in once
with a **classic** PAT that has only `read:packages` (fine-grained PATs do not
work for `docker login` to GHCR):

```bash
docker login ghcr.io -u Roquentin97
```

Credentials persist in the deploy user's Docker config.

### 4. Env files

Generated, not hand-written: put the configuration JSON in OCI Vault and let
the deploy render `.env`, `languee-back.env` and `languee-nlp.env`
([VAULT.md](VAULT.md)). `deploy/env/*.env.example` are annotated key
references only. Postgres and Redis credentials live once in the secret;
compose derives `DATABASE_URL` and `REDIS_PASSWORD` from them. For a host
without OCI (for example Hetzner), the same files can be written by hand
from the templates, but then nothing regenerates them.

### 5. DNS

Point three A records at the same server IP: `DOMAIN` (API), `MONITOR_DOMAIN`
(Grafana), and `TELEMETRY_DOMAIN` (Android OTLP). Keep Cloudflare DNS on the
free plan **proxy off (grey cloud)** so Caddy can complete ACME challenges for
every hostname. All names must be publicly resolvable before the first deploy.

### 6. GitHub Actions secrets

In the repo, create environment `languee-dev` (restricted to the `develop`
branch), add the secrets below and the required variables `VAULT_SECRET_OCID` and
`OCI_REGION` ([CICD.md](CICD.md#github-environment-languee-dev)):

| Secret           | Value                                    |
| ---------------- | ---------------------------------------- |
| `DEPLOY_HOST`    | server IP or hostname                    |
| `DEPLOY_USER`    | `deploy`                                 |
| `DEPLOY_SSH_KEY` | private key matching the server's `authorized_keys` (generate a dedicated pair) |

### 7. Backups

1. Create a Cloudflare R2 bucket `languee-db-backups` (free tier: 10 GB, zero
   egress) and an R2 API token (Object Read & Write, scoped to the bucket).
2. On the server, as the deploy user: `rclone config` → new remote named `r2`,
   type `s3`, provider `Cloudflare`, enter the R2 access key/secret and
   account endpoint.
3. Install the cron: `crontab -e` →
   `10 3 * * * /opt/languee/scripts/backup-db.sh >> /opt/languee/backups/backup.log 2>&1`
4. Create a check at healthchecks.io (free) and put its ping URL into
   `BACKUP_HEALTHCHECK_URL` in the Vault secret — a silently failing backup
   then alerts you.
5. After the first run, **test a restore** (see below).

## Deploying

Merging a PR into `develop` runs **Deploy (dev)** automatically
([CICD.md](CICD.md#deployment-deployyml-deploy-dev)). Each run computes
`PATCH = github.run_number * 1000 + github.run_attempt`; backend and NLP report
runtime version `0.0.<PATCH>`. Each service publishes an immutable
`dev-<PATCH>-<12-character-commit-sha>` image tag. When both services are built,
their repositories use the same tag. Build inputs are `APP_VERSION`, full
`GIT_SHA`, and `BUILD_ID`; OCI labels `org.opencontainers.image.version`,
`org.opencontainers.image.revision`, and `org.opencontainers.image.build-id`
record the corresponding identity. The deployment pulls those artifacts, runs
Prisma migrations through the backend migrator image, recreates services,
checks backend readiness over local and public HTTPS, and checks NLP from
inside the compose network. This readiness gate depends on the backend health
endpoint change being merged first.

- **Rollback:** run Deploy (dev) manually on `develop`, setting
  `rollback_back_tag` and/or `rollback_nlp_tag` to select an immutable artifact
  for that service. This deploys selected existing artifacts; it does not
  rebuild them. Migrations are forward-only. Check application compatibility
  before rolling code back across a schema change.
  Historical `0.1.<PATCH>` images remain valid rollback targets.
- **Config-only change:** edit the Vault secret and run **Apply config (dev)**;
  deployed image artifacts and tags are preserved and no migrations run.
- **Verify deployed identity:** check the backend's public `/version` response,
  perform the internal NLP `/version` check, then compare each full commit SHA
  with the `org.opencontainers.image.revision` label, verify version and
  build-id labels, and compare each running image digest with its selected
  immutable tag. See [CICD.md](CICD.md#deployment-deployyml-deploy-dev).

First deploy on a fresh server is the same workflow — Postgres initializes
from the Vault credentials, migrations create the schema, Caddy fetches
certificates on first request.

Images build natively on a GitHub-hosted ARM64 runner; the GHA layer cache
makes rebuilds fast until `uv.lock` changes.

## Observability

Grafana is served at `https://<MONITOR_DOMAIN>` through Caddy. Log in with
`GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`; anonymous access and signup
are disabled. Loki, Tempo, Prometheus, Grafana, and Alloy expose no host ports.
Those values bootstrap Grafana only when its persistent volume is new. To rotate
an existing administrator password, update `GRAFANA_ADMIN_PASSWORD` in Vault,
apply configuration, then run this on the host without placing the password on
the command line:

```bash
cd /opt/languee
docker compose exec -T grafana sh -c \
  'grafana cli admin reset-admin-password "$GRAFANA_ADMIN_PASSWORD"'
```

Open `https://<MONITOR_DOMAIN>/login` in a private browser session and sign in
with `GRAFANA_ADMIN_USER` and the new password. This updates the existing
Grafana database; do not delete `grafana_data`.

Android development-distribution builds use `OTEL_EXPORTER_ENDPOINT` (a GitHub
environment variable set to `https://<TELEMETRY_DOMAIN>`), plus the
`TELEMETRY_USERNAME` and `TELEMETRY_PASSWORD` GitHub environment secrets. Caddy
accepts only `/v1/logs` and `/v1/traces`, enforces Basic Auth and a 1 MB body
limit, then forwards to Alloy. The server stores only `TELEMETRY_PASSWORD_HASH`,
a bcrypt hash of that same password; generate it with `caddy hash-password` and
put the hash, not plaintext, in Vault. The APK necessarily contains this
low-privilege ingestion credential, so distribute it only to trusted testers
and rotate it if an APK is shared beyond that group.

Backend and NLP exporters use `http://alloy:4318` only on the private Compose
network. Their JSON stdout, along with Caddy access logs, is labeled and sent to
Loki. Caddy logs method, safe path, status, duration, and request metadata but
removes all request headers and query strings. Alloy sends OTLP logs to Loki,
traces to Tempo, and metrics to Prometheus.

After DNS and Vault configuration, run **Apply config (dev)**. On the host,
verify without printing secrets:

```bash
cd /opt/languee
python3 scripts/sync-vault-config.py --status
docker compose ps
curl -I https://<MONITOR_DOMAIN>
curl -i https://<TELEMETRY_DOMAIN>/not-an-otlp-path
curl -i https://<TELEMETRY_DOMAIN>/v1/logs
curl -u '<TELEMETRY_USERNAME>:<TELEMETRY_PASSWORD>' \
  -H 'Content-Type: application/x-protobuf' --data-binary @otlp-logs.pb \
  https://<TELEMETRY_DOMAIN>/v1/logs
```

The unauthenticated OTLP request returns `401`; unknown paths return `404`.
Use a real OTLP protobuf payload for the authenticated smoke test. In Grafana,
open Explore → Loki and query `{service="languee-droid"}` or
`{service="languee-back"}`. Open the `TraceID` derived field to Tempo, or paste
the trace ID into Tempo search; its `tracesToLogs` link shows corresponding
backend, NLP, and Android logs. An Android failure which never reaches the API
still appears in the Android log/trace stream when the telemetry endpoint is
reachable, but has no backend log by design.

For a production verification run, install a trusted test APK, trigger one API
request and one client-side failure, then confirm the Android trace ID appears
in Tempo and its Android Loki record links back to that trace. Trigger an API
request that calls NLP and confirm the same trace has backend and NLP spans and
JSON log records. Verify Caddy access records with `{service="caddy"}`; both a
successful telemetry post and a rejected unauthenticated post must have status
records without headers or query strings. Finally run `docker compose restart
loki tempo prometheus alloy grafana`, wait for `docker compose ps`, and confirm
the earlier trace and log remain queryable. These are live-host checks and are
not run by repository tests.

Loki retains logs for 7 days, Tempo retains traces for 48 hours, and Prometheus
retains metrics for 30 days. Their named volumes persist across service restarts
and configuration recreations. On the 2 OCPU / 12 GB Oracle profile, caps are
512 MB each for Loki and Tempo, 384 MB for Prometheus, and 256 MB each for
Alloy and Grafana; monitor disk use before increasing retention.

Monitoring startup is non-blocking for application deploys. A deploy reports a
monitoring warning and continues to check the API if collector services are
unhealthy; rerun Apply config after correcting the monitoring fault.

Uptime: Better Stack free tier — one HTTPS monitor on `https://<DOMAIN>/`
(health endpoint) plus certificate expiry alerting. (UptimeRobot's free plan
prohibits commercial use since Dec 2024.)

## Infrastructure maintenance

Keep OS security updates enabled. Schedule upgrades to Docker, Compose, the
production stack's pinned service images, or the VM as explicit maintenance:
review release and compatibility notes, take a fresh database backup, and
verify that a recent backup can be restored before any operation that may
replace or reinitialize the host or database. Do not treat a VM snapshot or an
unverified dump as a tested recovery path. After the upgrade, confirm service
health, `/version` identities, image labels and digests, and the internal NLP
check. Keep the previous immutable app images available for targeted rollback.

## Restore procedure

```bash
cd /opt/languee
rclone copy r2:languee-db-backups/languee-<stamp>.sql.gz backups/
docker compose stop languee-back
gunzip -c backups/languee-<stamp>.sql.gz | docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 --single-transaction \
  -U "$LANGUEE_BACK_POSTGRES_USER" -d "$LANGUEE_BACK_POSTGRES_DB"
docker compose start languee-back
```

`ON_ERROR_STOP` and `--single-transaction` make a mid-stream failure roll back
instead of leaving a partially restored database.

The dump contains the full schema, so it must load into an empty database;
restoring over a schema that migrations already built fails with "relation
already exists". For a full server loss: provision a new server (steps 1–7),
run Deploy (dev) (it syncs the stack files and applies migrations), then
stop `languee-back`, recreate the database empty, and restore:

```bash
docker compose stop languee-back
docker compose exec -T postgres dropdb -U "$LANGUEE_BACK_POSTGRES_USER" "$LANGUEE_BACK_POSTGRES_DB"
docker compose exec -T postgres createdb -U "$LANGUEE_BACK_POSTGRES_USER" "$LANGUEE_BACK_POSTGRES_DB"
```

then run the restore command above. The dump includes Prisma's migration
history, so later deploys apply only newer migrations.

### Verifying a backup

A backup is unverified until it has been restored and its contents inspected.
Restore into a fresh, separate database and assert on content, not on the
restore command's exit code:

```bash
docker compose exec -T postgres createdb -U "$LANGUEE_BACK_POSTGRES_USER" restore_probe
gunzip -c backups/languee-<stamp>.sql.gz | docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$LANGUEE_BACK_POSTGRES_USER" -d restore_probe
docker compose exec -T postgres psql -U "$LANGUEE_BACK_POSTGRES_USER" -d restore_probe \
  -c '\dt' -c 'select count(*) from cards;'
docker compose exec -T postgres dropdb -U "$LANGUEE_BACK_POSTGRES_USER" restore_probe
```

### What is not backed up

`backup-db.sh` covers Postgres only. The Vault secret, the rclone remote
configuration, and the crontab are not included. OCI Vault is not an
off-provider copy; keep an independent, encrypted export of the secret and of
the rclone config outside the VM and outside OCI: a backup destination whose
credentials exist only on the lost host is not a recovery path.

## Moving Oracle → Hetzner (or back)

1. Provision the new server (steps 1–6).
2. Run the Deploy workflow against the new `DEPLOY_HOST`.
3. Restore the latest dump (above).
4. Flip the DNS A record. Done — config is identical (add `linux/amd64` to the
   image build first if the new host is x86).
