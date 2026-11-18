# Grafana access and queries

An operator should create a Grafana service account with only the permissions needed to query the Loki datasource (a Viewer role where datasource permissions are not restricted), issue a service-account token, and provide the Grafana URL and token through a secure local environment or secret manager. Apply datasource permissions where the Grafana edition supports them. Do not put the token in a repository, shell history, command arguments, logs, or reports. Rotate or revoke it if exposed. Provisioning access and production configuration are outside this skill.

Set `GRAFANA_URL` to the Grafana base URL (including any subpath), `GRAFANA_SERVICE_ACCOUNT_TOKEN` to the token, and optionally `GRAFANA_LOKI_DATASOURCE_UID` to the datasource UID (default `loki`). Prefer HTTPS for remote Grafana. The helper uses the authenticated Grafana proxy; Loki need not be exposed. It does not follow redirects, so configure the final Grafana URL.

From the repository root, for a specific UTC interval expressed as Unix seconds:

```sh
python3 .agents/skills/remote-log-analysis/scripts/query_loki.py '{service="languee-back",environment="production"} |= "request-id"' --start 1700000000 --end 1700003600 --limit 100
```

Check the actual deployment's label values and timestamps before querying. Add a `level` label filter when available, or a line filter for a correlation ID. Output is Loki's JSON response; inspect its streams and values for evidence. A result at the limit may be truncated. HTTP errors are classified without printing server bodies, which can contain credentials or sensitive data.
