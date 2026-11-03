# CI/CD

## Pull request CI (`.github/workflows/ci.yml`, "PR CI")

Runs on pull requests (opened, synchronize, reopened) whose base is `develop`,
`staging` or `master`. `bb_develop` is also listed while it is the active
integration branch; delete that line when development moves to `develop`.
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

Trigger: `push` to `develop` (that is, a merged PR; the ruleset forbids direct
pushes). The workflow builds and deploys `github.sha`, the merged commit.

1. `resolve` — computes the build patch as
   `github.run_number * 1000 + github.run_attempt` and skips the run if the
   commit is no longer the `develop` head. Concurrency group `deploy-dev` (no
   cancel) serializes runs; a run queued behind another is replaced by newer
   ones, so the latest head wins.
2. `build` — builds the backend, backend migrator, and NLP images for
   `linux/arm64` on a native ARM64 runner. Backend and NLP publish independent
   immutable tags `dev-<PATCH>-<12-character-commit-sha>`. Both service
   repositories use the same tag when both are built. The runtime version is
   `0.1.<PATCH>`, where `PATCH = github.run_number * 1000 + github.run_attempt`.
   Build arguments/environment provide `APP_VERSION`, full `GIT_SHA`, and
   `BUILD_ID`. OCI labels `org.opencontainers.image.version`,
   `org.opencontainers.image.revision`, and `org.opencontainers.image.build-id`
   carry those values. Do not use a mutable alias to identify a deployed
   artifact.
3. `deploy` (environment `languee-dev`) — copies compose, Caddyfile, backup
   script, `deploy-stack.sh`, `sync-vault-config.py` to `/opt/languee`, then
   deploys the selected backend and NLP tags ([details](VAULT.md#what-the-deploy-does)):
   Vault fetch/validate, pull, Postgres/Redis up, `migrate`, recreate services,
   wait for liveness, then gates completion on the backend's `/health/ready`
   endpoint over local Caddy HTTPS and public HTTPS from the runner. It also
   performs an internal NLP check over the compose network.

Manual runs (`workflow_dispatch`, branch `develop` only):

- **Deploy (dev)**: build and deploy the develop head, or set
  `rollback_back_tag` and/or `rollback_nlp_tag` to roll back only the selected
  service. These inputs set `LANGUEE_BACK_TAG` and `LANGUEE_NLP_TAG` in
  deployment state. Tags identify already-built artifacts and are not rebuilt
  during rollback. Migrations are forward-only; rolling code back does not
  reverse a migration.
- **Apply config (dev)**: Vault config-only apply, both service tags preserved, no migrations,
  no new code (see [VAULT.md](VAULT.md)).

After a deploy, compare each `GET /version` response with its image's
`org.opencontainers.image.revision` label and the image digest reported by
`docker image inspect` / `docker compose images`. Verify the `version` and
`build-id` labels too. Backend and NLP tags can be selected independently; the
backend `/version` endpoint is public through Caddy. The NLP `/version` check
is internal to the compose network and is not a public route.

Nothing deploys from `bb_develop`, so merging this change does not deploy.
Until `develop` contains these workflows there is no automatic deployment.

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
  docker-compose.prod.yml, caddy/Caddyfile        # synced
  scripts/{backup-db.sh,deploy-stack.sh,sync-vault-config.py}   # synced
  .env languee-back.env languee-nlp.env           # generated from Vault, 0600
  .deploy-state.json  .config-previous/           # bookkeeping, 0600/0700
  backups/
```

Existing hand-maintained env files are replaced on the first Vault deploy (the
old copies land in `.config-previous/`). Populate the secret and run
`sync-vault-config.py --check --preserve-tag` first.

## Build identity and releases

Backend and NLP runtime versions are deployment build identities, not a
release-PR sequence: `0.1.<github.run_number * 1000 + github.run_attempt>`.
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

## Migration checklist (`bb_develop` → `develop`)

Do this after the PR containing these changes is reviewed and merged into
`bb_develop`. None of it is done by the PR.

1. Open a PR that brings `develop` up to date with `bb_develop` (compare
   histories first; no force push). Merge it.
2. Settings → Branches: change the default branch to `develop`. Retarget open PRs.
3. Create environment `languee-dev` with the secrets/variables above and the
   `develop`-only deployment-branch policy.
4. Settings → Actions → General: allow Actions to create pull requests.
5. Open a trivial PR to `develop`; confirm `PR CI / required` appears and passes.
6. Ruleset `Protected branches`: add required status check **`PR CI / required`**
   (select the check named `required`, source GitHub Actions). Also add
   `PR title` only if you want it listed separately; `required` already covers it.
7. Remove the `bb_develop` entry from `ci.yml` triggers (and later retire the branch).
8. Merge a small change to `develop`: expect one Deploy (dev) run, service build
   identities, Vault sync, migration, HTTPS health check, and internal NLP check.
9. `staging` and `master` stay protected and receive PR CI only; no deploy
   workflows exist for them.
