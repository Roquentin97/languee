# Local observability

Run `make start` to start the API, NLP service, Loki, Tempo, Prometheus, Alloy, and
Grafana. Grafana is available at <http://localhost:3001> (default credentials:
`admin` / `admin`). Android Studio emulators use `10.0.2.2` to reach host-published
ports; physical devices need a LAN-reachable development collector instead.

For the Android debug build, `local.properties` may override these defaults:

```properties
LANGUEE_BACKEND_BASE_URL=http://10.0.2.2:3000/
OTEL_EXPORTER_ENDPOINT=http://10.0.2.2:4318
TRACING_ENABLED=true
```

The endpoint is a base URL. The app sends traces to `/v1/traces` and structured logs
to `/v1/logs`. It continues to write safe application events to Logcat. An unavailable
collector only drops batched telemetry; it does not block requests or report its own
failure recursively.

In Grafana Explore (Loki), useful queries are:

```logql
{service="languee-droid"}
{service=~"languee-droid|languee-back|languee-nlp",level=~"error|ERROR|critical"}
{service=~"languee-droid|languee-back|languee-nlp"} |~ "\\\"trace_id\\\":\\\"<trace-id>\\\""
{service=~"languee-droid|languee-back|languee-nlp"} |~ "\\\"requestId\\\":\\\"<request-id>\\\""
```

Select the derived `TraceID` field on a JSON backend/NLP record to open Tempo. In
Tempo, **Trace to logs** uses the span service name and trace ID to return correlated
Loki events. Android request IDs are retained across retries; a trace ID is the
preferred identifier for an Android → backend → NLP operation.

If mobile records do not arrive, confirm the emulator can open `http://10.0.2.2:4318`,
then inspect `docker compose logs alloy`. Do not use `alloy:4318` from the emulator:
that Docker hostname only works inside Compose. Confirm `TRACING_ENABLED=true` and
avoid placing credentials or query values in logger attributes; telemetry deliberately
redacts those fields.
