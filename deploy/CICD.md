# CI/CD

## Pull request CI (`.github/workflows/ci.yml`, "PR CI")

Runs on pull requests (opened, synchronize, reopened) whose base is `develop`,
`staging` or `master`.
Read-only token, no secrets, no deploys, no image pushes. A newer push to the
same PR cancels the older run.

| Job | Runs when | Does |
| --- | --- | --- |
| `Detect changes` | always | diffs the PR merge commit against its base |
| `PR title` | always | commitlint (`commitlint.config.js`) on the PR title |
| `languee-back` | `apps/languee-back/**` or `ci.yml` changed | format, lint, test, build, `prisma validate` (format/lint must leave the tree clean) |
| `languee-nlp` | `apps/languee-nlp/**` or `ci.yml` changed | ruff format/check, spaCy model, pytest |
| `languee-droid` | `apps/languee-droid/**` or `ci.yml` changed | ktlint, lint, unit tests, assemble |
| `Workflows and deploy scripts` | `deploy/**`, `docker-compose.prod.yml`, `.github/workflows/**` | actionlint, shellcheck, Vault sync unit tests, `docker compose config` |
| **`required`** | always (`if: always()`) | fails unless `Detect changes` and `PR title` succeeded and every other job succeeded or was skipped |

Skipped jobs are only accepted by `required` when change detection succeeded,
so a failed or cancelled job (or a failed detector) cannot read as a pass, and
path-only PRs never leave the check pending.

The squash-merge commit title is the PR title. Use
`<type>(<scope>): <description>` for reviewable history. These commit types do not
control runtime versions or image tags.

## Deployment (`deploy.yml`, "Deploy (dev)")

Trigger: every push to `develop` and manual dispatch on `develop`. Before
building, the single approved `languee-dev` job reads the host's last verified
state and compares it with the latest develop commit affecting each component. A skipped, failed,
canceled, or superseded run therefore leaves a detectable gap for the next run,
even when that run changes an unrelated service or configuration file.

The workflow serializes with `Apply config (dev)` in concurrency group
`deploy-dev` and does not cancel a running deployment. It computes the build
patch as `github.run_number * 1000 + github.run_attempt`; stale develop heads
fail visibly before apply. A final head check runs after image builds and before
the server is changed.

Deployment files are uploaded to a per-run directory under
`/opt/languee/.deploy-staging/`. The host is marked untrusted before the staged
scripts, Compose file, Caddyfile, or provisioning tree replace live files. The
promotion replaces tracked directories as a unit; an interrupted promotion
cannot be used to run the stack script, and the next run stages and promotes a
fresh complete payload.

Backend and NLP are reconciled independently. Only stale or explicitly forced
service images are built; missing or corrupt applied state selects both. The
backend runtime and migrator images are checked and built separately so a
partial registry upload cannot leave a tag without its migration image. Images
use immutable tags `dev-<PATCH>-<12-character-commit-sha>`, runtime version
`0.0.<PATCH>`, and OCI labels for the build version, full image source revision,
and build id.

The deployment applies selected artifacts and configuration
([details](VAULT.md#what-the-deploy-does)): Vault fetch/validate, pinned image
verification, migrations when backend code changes, service recreation, local
readiness checks, and public backend readiness from the runner. The NLP image
is also checked internally over the Compose network. App service updates use
Compose's rendered image and service configuration, so a tag-only backend
change leaves NLP alone, while Vault env-file or tracked Compose changes update
the affected services. Persistent Postgres and Redis services still use
`--no-recreate` unless an explicitly approved infrastructure update is selected.

Before applying stack changes, the workflow marks applied state as in progress.
Only after host and public readiness pass does a separate atomic state write
record each applied source revision, image tag, artifact revision, and
configuration revision. A separate durable dirty marker remains until the
verified write and directory sync both complete, so a failed state write cannot
make an earlier JSON record trusted again. The next run rebuilds both
application services and reapplies configuration conservatively, including
after force deploys and rollbacks. A manual partial rollback is rejected before
build or mutation if host state is missing, corrupt, or interrupted; first run a
normal Deploy (dev) reconciliation. A full rollback from unknown state must
select artifacts for both services and apply current configuration so the run
can verify every recorded component.

Postgres and Redis use `--no-recreate` unless maintenance is explicitly
approved. Reconciliation detects changes to their full Compose service blocks,
including command, environment, healthcheck, mount, and dependency settings,
plus top-level volume, network, config, secret, and project-name definitions.
Before `--no-recreate`, the host compares each rendered service hash with the
last verified hash stored in applied state. A pre-existing host state without
these hashes can be bootstrapped when every existing container has a matching
Compose configuration hash label. A missing container or mismatched label
requires the same one-time maintenance approval. Any hash
mismatch fails visibly unless the manual Deploy (dev) run has
`allow_persistent_infra` enabled. This requires a verified backup and
compatibility review; a config-only or ordinary deploy does not implicitly
recreate persistent services. Successful Deploy (dev) runs record the new
hashes for later comparisons.

Every run's summary lists desired versus last verified source revisions and
whether backend, NLP, or deployment configuration will be applied. A run with
no drift says that no deployment was attempted. An SSH failure while reading
state fails before builds, and a stale run cannot report a successful deploy.

Manual runs (`workflow_dispatch`, branch `develop` only):

- **Deploy (dev)**: build and deploy the develop head, or set
  `rollback_back_tag` and/or `rollback_nlp_tag` to roll back only the selected
  service. A rollback records the artifact's actual source revision, so a later
  normal reconciliation still detects that it differs from desired develop
  source. Tags identify existing artifacts and are not rebuilt during rollback.
  Migrations are forward-only; rolling code back does not reverse a migration.
  Check application compatibility before rolling code back across a schema
  change.
- **Apply config (dev)**: Vault config-only apply, both service tags preserved, no migrations,
  no new code (see [VAULT.md](VAULT.md)). It marks state before changing Vault
  values and checks public readiness. If state was verified beforehand, it
  preserves those exact source revisions; if state was already unknown, it
  stays unknown. Its summary compares current develop revisions with the last
  verified host state and calls out any source drift. In particular, a green
  manual Vault apply does not apply tracked Compose or deployment-script
  changes from a develop commit, and does not certify code convergence.

After a deploy, compare each `GET /version` response with its image's
`org.opencontainers.image.revision` label and the image digest reported by
`docker image inspect` / `docker compose images`. Verify the `version` and
`build-id` labels too. Backend and NLP tags can be selected independently; the
backend `/version` endpoint is public through Caddy. The NLP `/version` check
is internal to the compose network and is not a public route.

### GitHub environment `languee-dev`

Replaces the old `production` environment (this VM is dev; move the three
secrets across, then delete `production` if unused).

- Secrets: `DEPLOY_HOST` (`languee-dev.aroquentin.com`), `DEPLOY_USER`
  (`deploy`), `DEPLOY_SSH_KEY`.
- Variables: `VAULT_SECRET_OCID`, `OCI_REGION` (`eu-frankfurt-1`), and
  `DEPLOY_HEALTHCHECK_URL` set to the complete public readiness URL (for
  example, `https://languee-dev.aroquentin.com/health/ready`). The deployment
  fails if this variable is absent or targets a different path.
- Deployment branches: **selected branches → `develop`** only.
- Android distribution also needs `OTEL_EXPORTER_ENDPOINT` as a GitHub
  environment variable set to `https://<TELEMETRY_DOMAIN>`, and
  `TELEMETRY_USERNAME` / `TELEMETRY_PASSWORD` as environment secrets. These
  values are used only for trusted `develop` distribution builds, never PR CI.
  The server gets only the matching `TELEMETRY_PASSWORD_HASH` in OCI Vault.

### First-run host prerequisites

- Docker logged in to GHCR as `deploy` with a **classic** PAT scoped
  `read:packages` (fine-grained PATs cannot pull private GHCR images with
  `docker login`): `docker login ghcr.io -u Roquentin97`.
- OCI CLI at `~/.venvs/oci/bin/oci` ([VAULT.md](VAULT.md#oci-cli-on-the-vm-one-time-as-deploy)).
- SSH key for `deploy` in `authorized_keys`; `deploy` in the `docker` group. No
  `sudo` is used.
- Layout after a deploy:

```text
/opt/languee/
  docker-compose.prod.yml, caddy/Caddyfile, provision/ # synced
  scripts/{backup-db.sh,deploy-stack.sh,deploy-state.py,sync-vault-config.py} # synced
  .env languee-back.env languee-nlp.env           # generated from Vault, 0600
  .deploy-state.json  .applied-deploy-state.json  # bookkeeping, 0600
  .applied-deploy-state.dirty                    # transaction sentinel, 0600
  .config-previous/                               # snapshots, 0700
  backups/
```

Existing hand-maintained env files are replaced on the first Vault deploy (the
old copies land in `.config-previous/`). Populate the secret and run
`OCI_REGION=eu-frankfurt-1 sync-vault-config.py --check --preserve-tags` first.

### Recovering deployment drift

After this workflow is installed, every develop push compares current desired
component revisions with `.applied-deploy-state.json`; the next successful run
automatically retries components left behind by a failed, canceled, or skipped
run. If the applied state file is absent or invalid, the workflow rebuilds both
application artifacts and reapplies configuration conservatively. If the host
cannot be reached to read that state, the workflow fails before building or
claiming convergence.

For the previously observed backend/NLP split deployment, run **Deploy (dev)**
manually on `develop` with `force_deploy` enabled after this change is available.
That builds and deploys both current develop services. Do not use rollback tags
for this recovery. The run must finish its public readiness check and state
write; verify the backend `/version`, internal NLP `/version`, and
`python3 /opt/languee/scripts/deploy-state.py status` before considering the
stack reconciled. Merging this change does not run recovery on the current
server.

Migrations run before backend recreation and remain forward-only. If migration
or readiness fails, the deployment workflow fails and the state remains
untrusted. A failure during the deployment script restores the previous
image/config references and attempts to recreate affected services; it never
resets the database or reverses a migration. Any failure after the in-progress
marker leaves source state untrusted, so the next reconciliation rebuilds both
application artifacts and reapplies configuration. Inspect migration/readiness
logs and verify schema/code compatibility before any rollback.

## Build identity and releases

Backend and NLP runtime versions are deployment build identities, not a
release-PR sequence: `0.0.<github.run_number * 1000 + github.run_attempt>`.
Each service has its own immutable `dev-<patch>-<12-character-commit-sha>` tag;
the full commit SHA is carried in runtime responses and OCI image labels. Android
release numbering remains independent. Conventional Commits remain required for
PR titles and history, but do not generate or select these runtime identities.

## Backups

`backup-db.sh` keeps `#!/bin/bash` and `set -euo pipefail`; the dump is gzipped,
size-checked, copied to R2 (`languee-db-backups`), and pings the healthchecks.io
URL held in Vault. Cron (03:10 UTC) and the rclone remote are configured on the
VM and need their own off-VM copy. Restore into a clean database with
`psql -v ON_ERROR_STOP=1 --single-transaction` (see [README](README.md#restore-procedure)).
