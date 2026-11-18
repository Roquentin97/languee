# Grafana access and queries

An operator should create a Grafana service account with only the permissions needed to query the Loki datasource (a Viewer role where datasource permissions are not restricted), issue a service-account token, and provide the Grafana URL and token through a secure local environment or secret manager. Apply datasource permissions where the Grafana edition supports them. Do not put the token in a repository, shell history, command arguments, logs, or reports. Rotate or revoke it if exposed. Provisioning access and production configuration are outside this skill.

Set `GRAFANA_URL` to the Grafana base URL (including any subpath), `GRAFANA_SERVICE_ACCOUNT_TOKEN` to the token, and optionally `GRAFANA_LOKI_DATASOURCE_UID` to the datasource UID (default `loki`). HTTPS is required except for literal loopback IP addresses such as `127.0.0.1` and `[::1]`, which can use HTTP for local testing. The helper uses the authenticated Grafana proxy; Loki need not be exposed. It does not follow redirects, so configure the final Grafana URL.

From the repository root, for a specific UTC interval expressed as Unix seconds:

```sh
python3 .agents/skills/remote-log-analysis/scripts/query_loki.py '{service="languee-back",environment="production"} |= "request-id"' --start 1700000000 --end 1700003600 --limit 100
```

Check the actual deployment's label values and timestamps before querying. Add a `level` label filter when available, or a line filter for a correlation ID. Output is Loki's JSON response; inspect its streams and values for evidence. HTTP errors are classified without printing server bodies, which can contain credentials or sensitive data.

## Paging through logs

Loki uses an inclusive start and exclusive end ([API reference](https://grafana.com/docs/loki/latest/reference/loki-http-api/)). Use `--start-ns` and `--end-ns` for integer Unix nanoseconds; the seconds options remain available and can be mixed with nanosecond options for the other bound. Count entries across all returned streams. If a response reaches the requested limit, treat it as potentially truncated: split its interval at a nanosecond midpoint and query both adjacent intervals, repeating until each response is below the limit. This covers each timestamp once without discarding distinct lines that share a timestamp. For example, split `[100000000001, 100000000005)` into `[100000000001, 100000000003)` and `[100000000003, 100000000005)`.

If a one-nanosecond interval still reaches the limit, time splitting cannot recover all entries at that timestamp. Partition the query into exhaustive, disjoint label or line filters, and repeat the process for each partition. If no suitable partition exists, report the interval as potentially incomplete; advancing past that timestamp or deduplicating by timestamp would silently lose entries. Exactly reaching the limit does not establish whether further entries exist. Results can also change while logs are being ingested, so completeness applies only to the data available during the queries.
