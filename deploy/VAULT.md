# Configuration in OCI Vault

OCI Secrets Management ("Vault") is the single human-maintained source of
application and backup configuration for the dev VM. One versioned JSON secret
holds every setting. `/opt/languee/.env`, `languee-back.env` and
`languee-nlp.env` are **generated artifacts**: every deploy overwrites them, so
never edit them on the server.

| Item            | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Region          | `eu-frankfurt-1`                                                      |
| Vault / key     | `languee-vault` / `languee-config-key`                                |
| Secret          | `languee-dev-config` (OCID is a non-secret identifier, kept in the `VAULT_SECRET_OCID` GitHub variable) |
| Auth            | Instance Principal: dynamic group `languee-dev-instances` limited to the VM, policy `read secret-bundles` on that one secret. No user API keys on the host. |

Vault is not an off-provider disaster-recovery copy: if the tenancy is lost the
secret goes with it. Keep an encrypted export elsewhere (see
[Off-provider copy](#off-provider-copy)).

## What the deploy does

`scripts/deploy-stack.sh` (on the server, called by the workflows) runs
`scripts/sync-vault-config.py`, which

1. fetches the secret bundle with the OCI CLI (`--auth instance_principal`);
2. decodes and validates it entirely in memory: JSON object, no duplicate or
   unknown keys, every required key present, per-key format, relationships
   (fixed compose values, tracing endpoints, etc.). Errors name keys and rules,
   never values. Nothing is written if anything fails;
3. renders the three env files through an explicit key allowlist into private
   temp files (mode `0600`), snapshots the current files to `.config-previous/`,
   then atomically replaces them. A failure mid-replacement restores the
   snapshot;
4. records the selected backend and NLP image tags and applied secret
   **version number** in `.deploy-state.json` (bookkeeping, not configuration).

The OCI region is required. Set `OCI_REGION` in the deploy environment or
pass `--region` when running the sync script directly.

Then the stack is pulled, migrated (code deploys only) and the app services are
force-recreated so changed env values take effect. If any later step fails the
previous config is restored and the app services are recreated with it
(migrations are not reverted).

## Secret schema

Flat JSON object, string values (booleans and integers are normalized to
strings). The complete key list is in
[`env/vault-config.example.json`](env/vault-config.example.json); the unit
tests assert it matches the script's allowlist. Unknown keys are rejected.

| Written to          | Keys |
| ------------------- | ---- |
| `.env` (compose + backup script) | `DOMAIN`, `MONITOR_DOMAIN`, `TELEMETRY_DOMAIN`, `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, `TELEMETRY_USERNAME`, `TELEMETRY_PASSWORD_HASH`, `LANGUEE_BACK_POSTGRES_USER`, `LANGUEE_BACK_POSTGRES_PASSWORD`, `LANGUEE_BACK_POSTGRES_DB`, `LANGUEE_BACK_REDIS_PASSWORD`, `BACKUP_RCLONE_REMOTE`, `BACKUP_RETENTION_DAYS`, `BACKUP_HEALTHCHECK_URL` (may be empty; sensitive) |
| `languee-back.env`  | `PORT`, `NODE_ENV`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `BASIC_AUTH`, `BASIC_PASSWORD`, `LANGUEE_NLP_BASE_URL`, `LANGUEE_NLP_BASIC_AUTH_LOGIN`, `LANGUEE_NLP_BASIC_AUTH_PASSWORD`, `LOG_FORMAT`, `SERVICE_NAME`, `PRINT_DEBUG_LOGS`, `PRINT_PRETTY_JSON_LOGS`, `TRACING_ENABLED=true`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318` |
| `languee-nlp.env`   | `LANGUEE_NLP_SPACY_MODEL`, `LANGUEE_NLP_LOG_FORMAT`, `LANGUEE_NLP_LOG_LEVEL`, `LANGUEE_NLP_SERVICE_NAME`, `LANGUEE_NLP_ENVIRONMENT`, `LANGUEE_NLP_TRACING_ENABLED=true`, `LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318` |
| derived             | `languee-nlp.env` `BASIC_LOGIN` / `BASIC_PASSWORD` come from `LANGUEE_NLP_BASIC_AUTH_LOGIN` / `LANGUEE_NLP_BASIC_AUTH_PASSWORD` (stored once). The backend's `BASIC_PASSWORD` is Swagger auth and is never used for NLP. |
| fixed by the deploy | `COMPOSE_FILE=docker-compose.prod.yml`, `LANGUEE_BACK_TAG`, `LANGUEE_NLP_TAG` (deployment-controlled) — not in Vault |

Value rules worth knowing: values must be printable ASCII on one line, no
leading/trailing whitespace. `.env` is also sourced by `backup-db.sh`, so its
values are limited to `A-Za-z0-9_.@%+=:,/~-`. Service env values may not contain
`$ " ' \` \ #`. Postgres and Redis passwords must be 16+ characters from
`A-Za-z0-9._~-` (the Postgres password is interpolated into `DATABASE_URL`).
`PORT`, `REDIS_HOST`, `REDIS_PORT`, `LANGUEE_NLP_BASE_URL`, and both internal
OTLP endpoints must equal the fixed private Compose values. `MONITOR_DOMAIN`
and `TELEMETRY_DOMAIN` are lowercase public DNS hostnames. The telemetry hash
must be a Caddy-compatible bcrypt hash; the plaintext `TELEMETRY_PASSWORD` is
an Android build-time secret and is intentionally not accepted by this schema.

`GRAFANA_ADMIN_PASSWORD` bootstraps a new Grafana database only. For rotation on
an existing `grafana_data` volume, update the Vault value, apply configuration,
then use the stdin-based `grafana cli admin reset-admin-password` command in
[README.md](README.md#observability). Never remove the volume to rotate credentials.

> **Postgres credentials only apply on first initialization.** Changing
> `LANGUEE_BACK_POSTGRES_USER/PASSWORD/DB` in Vault later does not change an
> existing database; change the role password in Postgres first, then the
> secret. Redis credentials take effect on recreate.

## Changing configuration

1. Edit the secret in the OCI console (Identity & Security → Vault →
   `languee-dev-config` → Create new version). Each save is a new version.
2. Run the **Apply config (dev)** workflow (Actions tab, branch `develop`), or
   on the server:
   `OCI_REGION=eu-frankfurt-1 VAULT_SECRET_OCID=<ocid> /opt/languee/scripts/deploy-stack.sh --preserve-tags`.
   The selected backend and NLP image tags are preserved and no migrations run.
3. Inspect what is applied: `python3 /opt/languee/scripts/sync-vault-config.py --status`
   (secret version, both image tags, previous state, timestamp — no values).

`Apply config (dev)` changes configuration only. It reuses the existing
immutable backend and NLP artifacts, does not build or select new images, and
does not run migrations.

Dry-run a new version without touching the server's files:
`OCI_REGION=eu-frankfurt-1 python3 scripts/sync-vault-config.py --check --secret-version <n>`.

### Rolling back a bad configuration

- Validation failures never reach the server's files, so the running config
  stays as it was; fix the secret and re-apply.
- A bad value that validates but breaks the app: the deploy's health check
  fails and restores the previous files automatically. To do it by hand:
  `sync-vault-config.py --restore-previous` then
  `docker compose up -d --force-recreate --no-deps languee-nlp languee-back`.
- To return to an older secret version, run Apply config with `secret_version`
  set (or `deploy-stack.sh --preserve-tags --secret-version <n>`). Creating a
  new Vault version is still needed to make that choice stick for later
  `current` applies.

## OCI CLI on the VM (one-time, as `deploy`)

```bash
python3 -m venv ~/.venvs/oci
~/.venvs/oci/bin/pip install oci-cli
# Metadata only; this must not print the secret content:
~/.venvs/oci/bin/oci secrets secret-bundle get --secret-id "$VAULT_SECRET_OCID" \
  --auth instance_principal --region eu-frankfurt-1 \
  --query 'data.{version: "version-number", stages: stages}'
```

The script finds the CLI via `--oci-bin`, `$OCI_CLI_BIN`, `~/.venvs/oci/bin/oci`,
then `PATH`.

### Reusable setup commands (already done for this VM)

Placeholders only; run with an admin identity:

```bash
oci iam dynamic-group create --name languee-dev-instances \
  --description "Languee dev VM" \
  --matching-rule "instance.id = '<instance-ocid>'"
oci iam policy create --compartment-id <compartment-ocid> --name languee-dev-read-config \
  --description "Dev VM reads its config secret" \
  --statements '["allow dynamic-group languee-dev-instances to read secret-bundles in compartment id <compartment-ocid> where target.secret.id = '"'"'<secret-ocid>'"'"'"]'
```

Vault and key creation (`languee-vault`, `languee-config-key`) and secret
creation are done in the console. Stay within Always Free limits; this design
does not require Pay As You Go.

## Security notes

- The deploy user is in the `docker` group, which is root-equivalent, and Docker
  exposes container env (and the Redis password via process arguments) to
  privileged host users. This design centralizes maintenance and recovery; it
  does not protect secrets from a compromised VM.
- Secret values are never put on command lines, in workflow logs, outputs, or
  the PR. Do not run the workflows' scripts with `set -x`.
- `.config-previous/` holds the prior generated files at mode `0600`/`0700`.
- Never commit a local copy of the secret (`languee-*-config.json` is ignored).

## Off-provider copy

OCI Vault does not protect against losing the tenancy. After meaningful
changes, export the current secret JSON and store it encrypted away from OCI,
for example `age`/`gpg`-encrypted in a password manager or a private R2 bucket
with a key you hold elsewhere. Likewise keep the rclone R2 config and the
crontab outside the VM; `backup-db.sh` backs up Postgres only.
