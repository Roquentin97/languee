---
name: remote-log-analysis
description: Investigate Languee service logs in remote Loki through Grafana using bounded read-only LogQL queries.
---

# Remote log analysis

Use `scripts/query_loki.py` relative to this skill to query Grafana's Loki datasource proxy. Read [setup and usage](references/setup.md) for service-account setup and examples. Credentials must come from the environment; never print, commit, or include them in reports. Log entries themselves may contain sensitive data; disclose only relevant excerpts.

Start with the affected `service` and `environment` labels and the smallest useful time window. The Docker collector also supplies `compose_service`, `level`, and `context` where available. Filter severity and correlation or trace IDs in LogQL where useful, then broaden only when needed. Labels and formats can differ across sources, so an empty result does not prove an event did not occur. The helper limits each request to 24 hours and 1,000 entries; follow the pagination strategy in the setup guide and account for potentially truncated results.

Report the time range (including timezone), service and filters, relevant timestamps and excerpts, and any gaps, truncation, or access errors. Distinguish observed facts from inference. This skill is for reading logs, not changing dashboards, alerts, access, or production configuration.
