# Deploying Languee

Single-VPS production stack: Caddy (TLS) → languee-back → languee-nlp, plus
Postgres and Redis, all via `docker-compose.prod.yml`. Images are built
multi-arch (`linux/amd64` + `linux/arm64`), so the **same setup runs unchanged
on an Oracle Always Free Ampere (ARM) instance or a Hetzner CX-class (x86)
server** — switching provider later means re-running provisioning and restoring
a backup, nothing else.

Cost research and provider trade-offs live in the deployment-plan artifact
(2026-08); short version: start on Oracle Always Free while solo, move to
Hetzner CX23 (~€6/mo) if Oracle friction bites or when beta users arrive.

## Server layout

```text
/opt/languee/
  docker-compose.prod.yml   # synced by the Deploy workflow
  caddy/Caddyfile           # synced by the Deploy workflow
  scripts/backup-db.sh      # synced by the Deploy workflow
  .env                      # from deploy/env/stack.env.example  (never in git)
  api.env                   # from deploy/env/api.env.example    (never in git)
  nlp.env                   # from deploy/env/nlp.env.example    (never in git)
  backups/                  # local dump retention (7 days)
```

`COMPOSE_FILE=docker-compose.prod.yml` in `.env` makes plain `docker compose`
commands work from `/opt/languee`.

## One-time setup

### 1. Create the server

**Oracle Cloud (free, ARM):**

1. Create an Always Free account, then **upgrade to Pay As You Go** (Billing →
   Upgrade). This removes idle-instance reclamation and most capacity errors
   while still costing $0 within Always Free limits. Do not skip this.
2. Launch a VM.Standard.A1.Flex instance (2 OCPU / 12 GB fits the free cap),
   Ubuntu 24.04, in your home region. "Out of host capacity" errors are
   common — retry at different hours or script the retry.
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
with a fine-grained PAT that has only `read:packages`:

```bash
docker login ghcr.io -u Roquentin97
```

Credentials persist in the deploy user's Docker config.

### 4. Env files

Copy the three templates from `deploy/env/` to the server as
`/opt/languee/.env`, `/opt/languee/api.env`, `/opt/languee/nlp.env`; fill in
real secrets; `chmod 600` all three. Cross-file values that must match are
commented in the templates (Postgres creds, Redis password, NLP basic auth).

### 5. DNS

Point an A record (e.g. `api.languee.example`) at the server IP — Cloudflare
DNS on the free plan, **proxy off (grey cloud)** so Caddy can complete the
ACME challenge. Set the same name as `DOMAIN` in `/opt/languee/.env`.

### 6. GitHub Actions secrets

In the repo, create environment `production` and add secrets:

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
   `BACKUP_HEALTHCHECK_URL` in `/opt/languee/.env` — a silently failing backup
   then alerts you.
5. After the first run, **test a restore** (see below).

## Deploying

Run the **Deploy** workflow from the Actions tab (branch of your choice):

- **Empty `tag` input:** builds all three images (`languee-back`,
  `languee-back-migrator`, `languee-nlp`) for amd64+arm64, pushes them to GHCR
  as `sha-<short>` and `latest`, then on the server: syncs stack files, pins
  `TAG` in `.env`, `docker compose pull`, runs `prisma migrate deploy` via the
  migrator image, `docker compose up -d`.
- **`tag` set (e.g. `sha-1a2b3c4`):** skips the build and redeploys that
  existing tag — this is the rollback path. Note: `migrate` runs Prisma's
  forward migrations only; rolling back code is safe, rolling back a deployed
  migration is manual.

First deploy on a fresh server is the same workflow — Postgres initializes
from env, migrations create the schema, Caddy fetches certificates on first
request.

The arm64 half of the NLP image builds under QEMU emulation (spaCy model
download included), so an uncached build takes a while (~10–20 min); the GHA
layer cache makes subsequent builds fast until `uv.lock` changes.

## Observability (Grafana Cloud free tier)

Self-hosted Loki/Tempo/Prometheus/Grafana from the dev compose file stay off
the server. When wanted: create a free Grafana Cloud stack, then in `api.env`
set `TRACING_ENABLED=true` and uncomment the `OTEL_EXPORTER_OTLP_*` lines with
the stack's OTLP gateway URL and basic-auth token (Grafana Cloud → OpenTelemetry
→ instance ID + token, base64 `id:token`). For the NLP service, set
`LANGUEE_NLP_TRACING_ENABLED=true` and its endpoint var. Container logs remain
on the host via `docker logs` / `docker compose logs` until a collector is
added.

Uptime: Better Stack free tier — one HTTPS monitor on `https://<DOMAIN>/`
(health endpoint) plus certificate expiry alerting. (UptimeRobot's free plan
prohibits commercial use since Dec 2024.)

## Restore procedure

```bash
cd /opt/languee
rclone copy r2:languee-db-backups/languee-<stamp>.sql.gz backups/
docker compose stop api
gunzip -c backups/languee-<stamp>.sql.gz | docker compose exec -T postgres \
  psql -U "$LANGUEE_BACK_POSTGRES_USER" -d "$LANGUEE_BACK_POSTGRES_DB"
docker compose start api
```

For a full server loss: provision a new server (steps 1–7), then restore the
dump before the first deploy's migration step has anything to conflict with —
i.e. deploy first (creates empty schema), then `psql` the dump in.

## Moving Oracle → Hetzner (or back)

1. Provision the new server (steps 1–6).
2. Run the Deploy workflow against the new `DEPLOY_HOST`.
3. Restore the latest dump (above).
4. Flip the DNS A record. Done — images are multi-arch, config is identical.
