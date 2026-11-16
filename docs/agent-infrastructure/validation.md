# Agent infrastructure validation

Shared instructions are in `AGENTS.md`; Claude imports them from `CLAUDE.md`. The scoped rule index directs agents to the canonical rules; the Claude adapters contain path selectors and references to those rules. The skill directories are canonical under `.agents/skills/`, with relative Claude links.

Policy inventory: Git and PR safeguards are in `AGENTS.md` and the open-pr skill; API documentation and contract verification are in that skill and `boundary.md`; service conventions and persistence constraints are in the scoped rules; compatibility decisions, validation and CI are in `AGENTS.md`. The optional Dependabot skill retains dated compatibility observations as references. `forge/services.toml` and `forge/command_summary.py` remain standalone references and utilities. Independent Claude GitHub workflows were retained after checking for Forge and archived-workspace dependencies.

Codex 0.169.0 successfully loaded the shared policy in a fresh read-only session and identified all three service paths without tool use. Static tests check skill links, agent references, rule adapters and retirement of old entry points. Claude 2.1.317 runtime discovery was not verified: its stored OAuth token expired. Run a fresh Claude session after authentication to verify the import, scoped rule activation, skill links, and agent role loading.

Codex custom agents inherit their parent permissions; `sandbox_mode` in an agent file does not enforce read-only isolation. Read-only adapters disable app and plugin features, but these settings must not be treated as a complete security boundary. Run the parent session in a read-only sandbox when a hard read-only boundary is required. Verify native agent discovery and permissions in the target harness before relying on them.

A representative delegated run and historical, single-agent and delegated Codexray comparison are still required before claiming the delegation rollout or any cost savings. Compare all parent and child sessions, including input/cache/output, steps, context growth, elapsed time and verification outcomes; distinguish estimates from billed usage.
