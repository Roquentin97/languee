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
| `Workflows and deploy scripts` | `deploy/**`, `docker-compose.prod.yml`, `.github/workflows/**`, release config changed | actionlint, shellcheck, Vault sync unit tests, `docker compose config` |
| **`required`** | always (`if: always()`) | fails unless `Detect changes` and `PR title` succeeded and every other job succeeded or was skipped |

Skipped jobs are only accepted by `required` when change detection succeeded,
so a failed or cancelled job (or a failed detector) cannot read as a pass, and
path-only PRs never leave the check pending.

The squash-merge commit title is the PR title, which Release Please reads.
Use `<type>(<scope>): <description>`. Release Please's own PRs
(`chore(release): release ...`) satisfy the same rule.

## Deployment (`deploy.yml`, "Deploy (dev)")

Trigger: `push` to `develop` (that is, a merged PR; the ruleset forbids direct
pushes). The workflow builds and deploys `github.sha`, the merged commit.
Release Please never pushes to `develop`, and merging its release PR is a normal
merge that deploys once.

1. `resolve` — computes `sha-<7>` and skips the run if the commit is no longer
   the `develop` head. Concurrency group `deploy-dev` (no cancel) serializes
   runs; a run queued behind another is replaced by newer ones, so the latest
   head wins.
2. `build` — builds `languee-back`, `languee-back-migrator`, `languee-nlp` for
   amd64+arm64 and pushes `sha-<7>` (+ `latest`) to GHCR.
3. `deploy` (environment `languee-dev`) — copies compose, Caddyfile, backup
   script, `deploy-stack.sh`, `sync-vault-config.py` to `/opt/languee`, then runs
   `deploy-stack.sh --tag sha-<7>` ([details](VAULT.md#what-the-deploy-does)):
   Vault fetch/validate, pull, Postgres/Redis up, `migrate`, recreate services,
   wait for health, HTTPS check against Caddy. Optionally curls
   `DEPLOY_HEALTHCHECK_URL` from the runner.

Manual runs (`workflow_dispatch`, branch `develop` only):

- **Deploy (dev)**, empty `tag`: rebuild and deploy the develop head.
- **Deploy (dev)** with `tag: sha-<commit>`: roll back to an existing image. The
  commit must be an ancestor of `develop`. Migrations are forward-only.
- **Apply config (dev)**: Vault config-only apply, tag preserved, no migrations,
  no new code (see [VAULT.md](VAULT.md)).

Nothing deploys from `bb_develop`, so merging this change does not deploy.
Until `develop` contains these workflows there is no automatic deployment.

### GitHub environment `languee-dev`

Replaces the old `production` environment (this VM is dev; move the three
secrets across, then delete `production` if unused).

- Secrets: `DEPLOY_HOST` (`languee-dev.aroquentin.com`), `DEPLOY_USER`
  (`deploy`), `DEPLOY_SSH_KEY`.
- Variables: `VAULT_SECRET_OCID`, `OCI_REGION` (`eu-frankfurt-1`), optional
  `DEPLOY_HEALTHCHECK_URL` (e.g. `https://languee-dev.aroquentin.com/`).
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

## Release Please (`release-please.yml`)

Runs on push to `develop` (and manually from `develop`). Config is unchanged:
`apps/languee-back`, `apps/languee-nlp`, `apps/languee-droid` keep independent
versions, tags and changelogs, and standard Release Please opens or updates
release PRs; it never merges them. The owner merges release PRs by hand.

**Interaction with required checks:** PRs opened by `GITHUB_TOKEN` (which
Release Please uses) do not trigger `pull_request` workflows, so `PR CI /
required` will not report on release PRs. Options: rely on the owner's
for-pull-requests-only bypass (current ruleset); close and reopen the release PR
to trigger CI; or give Release Please a PAT/GitHub App token with only
`contents: write` and `pull-requests: write` on this repo (not stored in code).
Do not give the bot a bypass or auto-merge. Under Settings → Actions → General,
"Allow GitHub Actions to create and approve pull requests" must be enabled.
Release Please ignores its own release commits when proposing the next release,
but verify on the first merged release PR.

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
   Check how the owner bypass and Release Please PRs behave in practice.
7. Remove the `bb_develop` entry from `ci.yml` triggers (and later retire the branch).
8. Merge a small change to `develop`: expect one Deploy (dev) run, Vault sync,
   migration, health check; and Release Please opening release PRs per service.
9. `staging` and `master` stay protected and receive PR CI only; no deploy
   workflows exist for them.
