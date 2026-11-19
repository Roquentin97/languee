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

## Request and failure logs

Backend and NLP request records include the method, route or path, status, duration,
request ID, and service build identity. Failures also include a stage and safe error
code when one is available. Route-level 404s are recorded even when NestJS has no
route interceptor to handle them. The backend forwards the request ID to NLP; valid
W3C `traceparent` headers continue the same trace across both services. Caddy records
the safe path and correlation headers while removing request headers, query strings,
and client IP fields.

Lookup text and context are excluded from logs by default. Set
`LOG_LOOKUP_DETAILS=true` only for a temporary incident investigation, then restart
the backend. On failed vocabulary lookups the backend can record the explicitly
allowlisted text, language, context, selection ranges, and lookup options. Text and
context are capped at 1,024 UTF-8 bytes each and a truncation marker is included.
Dictionary lookup words are captured only on failed requests and are capped at the
same size. Successful requests record metadata and lengths only. Authentication
bodies, credentials, arbitrary query values, and upstream response bodies are never
captured. Anyone with Loki access can read captured lookup content; it remains there
until the configured Loki retention expires (five days by default in Compose).

For a local failure record, temporarily set `LOG_LOOKUP_DETAILS=true` in `.env`,
restart the backend, and send an unsupported language to NLP:

```sh
curl -i http://localhost:3000/api/v1/vocabulary/lookup \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: actionable-logs-demo' \
  -H 'traceparent: 00-aabbccddeeff00112233445566778899-0011223344556677-01' \
  -d '{"text":"running","language":"xx","context":"She is running.","selectionRanges":[{"start":7,"end":14}]}'
```

The backend should return the NLP validation failure and emit a bounded failure
record. The malformed/unsupported language is useful here because NLP accepts only
English. A missing route also produces a failure record without a request body:

```sh
curl -i 'http://localhost:3000/api/v1/does-not-exist?token=must-not-be-logged'
```

Find the records in Grafana Explore with the request ID or trace ID:

```logql
{service="languee-back"} |~ "actionable-logs-demo"
{service=~"languee-back|languee-nlp"} |~ "aabbccddeeff00112233445566778899"
```

Return `LOG_LOOKUP_DETAILS` to `false` after the investigation. Existing records
expire according to `LOKI_RETENTION_DAYS`; disabling capture does not remove earlier
records.
