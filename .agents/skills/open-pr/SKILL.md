---
name: open-pr
description: Open, create, publish, or prepare a Languee pull request, or publish an approved task.
---
# Open a pull request

Use the Trello card URL supplied by the user or already in task context. If absent, ask for it and stop at the PR boundary. Do not search, create, or update a Trello card as part of this workflow.

1. Confirm the allowed branch, current `origin/develop` ancestry for a new implementation branch, scope, and Conventional Commit title. Preserve local history.
2. Check changed endpoint contracts have matching Swagger/OpenAPI metadata and Bruno requests. Determine affected services from changed behavior and the dependencies consuming changed files. Investigate uncertain impact; do not assume a root-level change affects all services. Agent instructions, definitions, skills and their tests alone affect no application service. Shared runtime/build dependencies and cross-service contracts require checks for each actually affected service.
3. After the final code commit, run the committed-head `check` and `pr preflight` commands described in `docs/agent-infrastructure/delivery.md`. Resolve unknown impact and fix failed required checks. Do not open a PR if required checks fail.
4. Publish commits with native `git push` to an allowed branch. Use GitHub MCP for PR metadata; if unavailable, stop. Never push an environment branch or force-push another task's branch without approval.
5. Target `develop`. Use `pr body` with the supplied Trello URL, a meaningful summary file, and actual check results. The first line must contain only the supplied URL. Include scope, components, release impact and limitations in the summary. Never describe skipped checks as passed. Do not change versions or changelogs just to identify a development build.
6. Monitor all required CI checks on the final pushed SHA to terminal success. Investigate failures, fix, revalidate, commit, push, and recheck the new head. Do not claim completion while checks are pending or failing. Never merge without explicit authorization.
7. Report the PR URL, branch, final SHA, affected services, validation and final CI outcome.
