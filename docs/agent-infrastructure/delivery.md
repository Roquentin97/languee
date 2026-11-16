# Local delivery

Run from the repository root. Python 3 and Git are required. Git preflight is independent of GitHub CLI; `pr watch` and gated `pr publish` require an authenticated `gh`.

```sh
python3 scripts/dev_delivery.py impact --base origin/develop --working-tree --json
python3 scripts/dev_delivery.py check --base origin/develop --working-tree --json
```

Unknown paths block selection for review. `--working-tree` includes staged, unstaged and untracked files. Full command output is saved in a private temporary directory reported in each result. Deploy-tooling checks are reported as unverified when selected; run the relevant CI checks separately. Remove old `/tmp/languee-delivery-*` and `/tmp/languee-ci-*` directories when no longer needed.

After the final commit, produce committed-head results and prepare the PR:

```sh
python3 scripts/dev_delivery.py check --base origin/develop --json > /tmp/languee-checks.json
python3 scripts/dev_delivery.py pr preflight --base origin/develop --title 'feat(scope): summary' --check-results /tmp/languee-checks.json --json
python3 scripts/dev_delivery.py pr body --trello-url 'https://trello.com/c/example' --summary-file /tmp/pr-summary.md --check-results /tmp/languee-checks.json --output /tmp/pr-body.md --json
```

The summary file must describe the change, components, release impact and limitations. Preflight compares the live remote head and may fetch a missing commit object; a local-ahead branch passes but must be pushed separately before publication. Remote-ahead, diverged and unverifiable branches block preflight. GitHub MCP remains the PR creation mechanism until the `gh` transition is verified. The `pr publish` command fails closed until evidence for creation, update, watch and an operational comparison is recorded in `gh-transition-verified.json`; do not create that file without performing the gate. An existing PR is returned without overwriting its body. To monitor an existing PR:

```sh
python3 scripts/dev_delivery.py pr watch --pr 256 --head db66646a43a75e38fd0de2e9436da084354a9c1e --timeout 60 --json
```

The watcher requires a nonempty required-check set and verifies the head before polling and again before reporting success. Failures and timeouts do not trigger repair or merging. Failure results include bounded excerpts and local log paths; credential detection is heuristic and can withhold excerpts. Logs can contain sensitive output, so inspect them locally and share only relevant redacted excerpts.

## Reproducible checks

`python3 -m unittest discover -s tests -p 'test_dev_delivery.py'` exercises selection, remote ancestry, diagnostics, body construction, CI monitoring and the publication gate. The read-only watcher example above reported `required: SUCCESS` for the stated SHA on 2026-11-16. A live creation/update comparison is not yet established; the example does not establish the transition gate.
