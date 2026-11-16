---
name: open-pr
description: Open, create, publish, or prepare a Languee pull request, or publish an approved task.
---
# Open a pull request

Use a real, verified Trello card URL supplied by the user or already in task context. Verify it is a card URL, not a board or malformed URL. If absent or invalid, ask for it and stop at the PR boundary. Do not search, create, or update a Trello card as part of this workflow.

1. Confirm the allowed branch, current `origin/develop` ancestry for a new implementation branch, scope, and Conventional Commit title. Preserve local history.
2. Check changed endpoint contracts have matching Swagger/OpenAPI metadata and Bruno requests. Determine affected services from paths and behavior; if indeterminate, treat all three as affected.
3. After the final code commit, run `make cc <service>` for each affected service and fix failures. Do not open a PR if required checks fail.
4. Publish commits with native `git push` to an allowed branch. Use GitHub MCP for PR metadata; if unavailable, stop. Never push an environment branch or force-push another task's branch without approval.
5. Target `develop`. The first line of the PR body must contain only the actual Trello card URL, with no preceding blank line or label. Validate it before creating or updating the body. Include scope, services and components, release impact, and QA results below it. Do not change versions or changelogs just to identify a development build.
6. Monitor all required CI checks on the final pushed SHA to terminal success. Investigate failures, fix, revalidate, commit, push, and recheck the new head. Do not claim completion while checks are pending or failing. Never merge without explicit authorization.
7. Report the PR URL, branch, final SHA, affected services, validation and final CI outcome.
