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
{service="caddy"} |~ "\\\"requestId\\\":\\\"<request-id>\\\""
{service="caddy"} |~ "\\\"proxyRequestId\\\":\\\"<proxy-request-id>\\\""
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
route interceptor to handle them. The backend forwards the request ID to NLP and
propagates validated W3C context even when tracing instrumentation is disabled.
Caddy records the safe path and response request ID while removing request headers,
query strings, client IP fields, and the untrusted inbound `traceparent` value.
It also records a Caddy-generated `proxyRequestId`, which remains available when
Caddy handles a request itself and no backend `X-Request-ID` is returned. Backend
and NLP records log validated trace IDs; Caddy can be correlated through the request
ID returned by the backend or its proxy-generated ID for proxy-only responses.

Lookup text and context are excluded from logs by default. Set
`LOG_LOOKUP_DETAILS=failed-only` only for a temporary incident investigation, then restart
the backend. On failed vocabulary lookups the backend can record the explicitly
allowlisted text, language, context, selection ranges, and lookup options. Text and
context are capped at 1,024 UTF-8 bytes each and a truncation marker is included.
Dictionary lookup words are captured only on failed requests and are capped at the
same size. Successful requests record metadata and lengths only. Authentication
bodies, credentials, arbitrary query values, and upstream response bodies are never
captured. Anyone with Loki access can read captured lookup content; it remains there
until the configured Loki retention expires (five days by default in Compose).

For a local failure record, temporarily set `LOG_LOOKUP_DETAILS=failed-only` in `.env`
and restart the backend. The vocabulary lookup route requires a bearer token. Use
an access token from a disposable account registered in the local development
API; if needed, register a throwaway user at `/auth/register`, then sign in at
`/auth/login`. Do not use production credentials. Read the local response's
`accessToken` without adding it to shell history, then send an unsupported
language to NLP:

```sh
read -r -s -p 'Local development access token: ' LOCAL_ACCESS_TOKEN
printf '\n'
curl -i http://localhost:3000/api/v1/vocabulary/lookup \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${LOCAL_ACCESS_TOKEN}" \
  -H 'X-Request-ID: actionable-logs-demo' \
  -H 'traceparent: 00-aabbccddeeff00112233445566778899-0011223344556677-01' \
  -d '{"text":"running","language":"xx","context":"She is running.","selectionRanges":[{"start":7,"end":14}]}'
unset LOCAL_ACCESS_TOKEN
```

The backend should return HTTP 400 with `INPUT_INVALID` after NLP rejects `xx`
with `LANGUAGE_NOT_SUPPORTED`, and emit a bounded failure record. A missing route
also produces a failure record without a request body:

```sh
curl -i 'http://localhost:3000/api/v1/does-not-exist?token=must-not-be-logged'
```

Find the records in Grafana Explore with the request ID or trace ID:

```logql
{service="languee-back"} |~ "actionable-logs-demo"
{service=~"languee-back|languee-nlp"} |~ "aabbccddeeff00112233445566778899"
```

Return `LOG_LOOKUP_DETAILS` to `disabled` after the investigation. Existing records
expire according to `LOKI_RETENTION_DAYS`; disabling capture does not remove earlier
records.

`LOG_LOOKUP_DETAILS` accepts `disabled` (default), `failed-only`, or `allowed` (all routed requests). Unknown values disable content capture. Failures before a controller is selected contain only generic request metadata.
