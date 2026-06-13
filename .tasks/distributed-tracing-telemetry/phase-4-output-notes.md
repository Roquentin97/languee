# Phase 4 — Metrics & RED dashboards (+ Phase 0 infra)

## What was implemented

Phase 0 infra (Tempo, Alloy OTLP pipeline, Grafana correlations) had not been committed
alongside Phases 1–3. Both Phase 0 and Phase 4 were implemented together in this commit.

---

## Phase 0 — Infra additions

### New services in `docker-compose.yml`

| Service | Image | Purpose |
|---------|-------|---------|
| `tempo` | `grafana/tempo:2.7.1` | Trace store — receives OTLP from Alloy, stores on filesystem, serves Grafana queries |
| `prometheus` | `prom/prometheus:v3.4.0` | Metrics store — accepts remote writes from Alloy, stores RED metrics, exposes to Grafana |

### New provision files

| File | Purpose |
|------|---------|
| `provision/tempo/tempo.yaml` | Tempo config: OTLP gRPC 4317 + HTTP 4318, filesystem storage at `/var/tempo`, 48h block retention |
| `provision/prometheus/prometheus.yml` | Minimal Prometheus config with `--web.enable-remote-write-receiver` and `--enable-feature=exemplar-storage` |
| `provision/grafana/provisioning/datasources/tempo.yaml` | Tempo datasource (uid: `tempo`) with trace-to-logs correlation pointing to Loki, service map via Prometheus |
| `provision/grafana/provisioning/datasources/prometheus.yaml` | Prometheus datasource (uid: `prometheus`) with exemplar trace links to Tempo |
| `provision/grafana/provisioning/dashboards/dashboards.yaml` | Grafana dashboard provider pointing at `/etc/grafana/provisioning/dashboards` |

### Modified files

| File | Changes |
|------|---------|
| `provision/alloy/config.alloy` | Added OTel pipeline: `otelcol.receiver.otlp` (gRPC 4317 + HTTP 4318) → `otelcol.processor.batch` → traces to `otelcol.exporter.otlp` (Tempo), metrics to `otelcol.exporter.prometheus` → `prometheus.remote_write` (Prometheus) |
| `provision/grafana/provisioning/datasources/loki.yaml` | Added `uid: loki` and `derivedFields` — extracts `trace_id` from JSON log body and adds a "View Trace" link to Tempo |
| `docker-compose.yml` | Added `tempo` + `prometheus` services; added `ports: 4317:4317 / 4318:4318` to Alloy (OTLP host-mapping for Android emulator); added `depends_on: tempo, prometheus` to Alloy + Grafana; added dashboards volume to Grafana; added `tempo-data` + `prometheus-data` volumes |

---

## Phase 4 — Metrics & RED dashboards

### New files

| File | Purpose |
|------|---------|
| `provision/grafana/provisioning/dashboards/languee-red.json` | Grafana dashboard with 5 panels: Request Rate, Error Rate, Latency P50/P95/P99, Requests by Route, Active Connections |

### Modified files

| File | Changes |
|------|---------|
| `docker-compose.yml` | Added `OTEL_METRICS_EXPORTER: otlp` to `api` service — triggers NodeSDK auto-configuration of OTLP metric reader |
| `apps/languee-nlp/src/languee_nlp/tracing.py` | Added `MeterProvider` + `OTLPMetricExporter` + `PeriodicExportingMetricReader` (30s interval) to `configure_tracing()`. No new dependencies needed — `opentelemetry-sdk>=1.27.0` and `opentelemetry-exporter-otlp-proto-http>=1.27.0` already include metrics API/SDK |
| `apps/languee-nlp/tests/test_tracing.py` | Updated 3 existing `configure_tracing` enabled tests to patch `OTLPMetricExporter` + `otel_metrics`; added 3 new tests for metrics (`disabled_does_not_set_meter_provider`, `enabled_sets_meter_provider`, `enabled_sets_metric_otlp_endpoint`) |
| `.env.example` | Added `OTEL_METRICS_EXPORTER=otlp` comment |

---

## Architecture decisions

### Why Phase 0 was included here
Phases 1–3 committed service-level OTel instrumentation, but Phase 0 infra (Tempo,
Alloy OTLP pipeline, Grafana datasources) was never committed. Phase 4 depends entirely
on Phase 0 infra, so both were implemented together in this commit.

### Metrics pipeline: OTLP → Alloy → Prometheus remote write
Services export OTel metrics (and traces) via OTLP to Alloy on port 4318 (same endpoint,
same connection). Alloy's `otelcol.processor.batch` fans out:
- Traces → `otelcol.exporter.otlp` → Tempo (gRPC 4317)
- Metrics → `otelcol.exporter.prometheus` (with `resource_to_telemetry_conversion`) → `prometheus.remote_write` → Prometheus

This avoids a separate collector container and reuses the Alloy instance that already
handles logs.

### Prometheus over Mimir
Mimir would add operational complexity (object storage, distributor, compactor, etc.)
not justified for dev-scale. Prometheus v3 with remote write receiver is sufficient.
`--enable-feature=exemplar-storage` enables trace exemplar storage so histogram panels
in Grafana can show clickable dots linking to Tempo traces.

### `OTEL_METRICS_EXPORTER=otlp` for languee-back (no code change)
`@opentelemetry/sdk-node` (`NodeSDK`) checks `OTEL_METRICS_EXPORTER` at startup and
auto-configures a `PeriodicExportingMetricReader` with `OTLPMetricExporter` when the
value is `otlp`. The exporter URL is derived from `OTEL_EXPORTER_OTLP_ENDPOINT` +
`/v1/metrics` (already set to `http://alloy:4318`). No changes to `tracing.ts` needed.

### MeterProvider in languee-nlp (minimal code change)
Python OTel SDK does not auto-configure metrics from `OTEL_METRICS_EXPORTER` env var
when the provider is set up programmatically (as opposed to using the auto-instrument
entrypoint). A `MeterProvider` with `OTLPMetricExporter` was added to
`configure_tracing()`. The required packages (`opentelemetry-sdk>=1.27.0` and
`opentelemetry-exporter-otlp-proto-http>=1.27.0`) were already present from Phase 2 —
no new dependencies added.

### OTel metric names in Prometheus
After conversion by `otelcol.exporter.prometheus` with `add_metric_suffixes = true` and
`resource_to_telemetry_conversion { enabled = true }`:
- `http.server.request.duration` (unit: `s`) → `http_server_request_duration_seconds{_bucket,_count,_sum}`
- `http.server.active_requests` → `http_server_active_requests`
- Resource attribute `service.name` → Prometheus label `service_name`
- OTel attribute `http.response.status_code` → `http_response_status_code`
- OTel attribute `http.route` → `http_route`

The RED dashboard uses these Prometheus metric names. The `$service` template variable
populates from `label_values(http_server_request_duration_seconds_count, service_name)`.

### Exemplars for trace-to-metric correlation
Prometheus is started with `--enable-feature=exemplar-storage`. The Prometheus datasource
in Grafana is configured with `exemplarTraceIdDestinations` pointing to Tempo (uid:
`tempo`) on the `trace_id` field. When OTel SDK observes a metric while a sampled span
is active, it attaches the `trace_id` as an exemplar — clicking an exemplar dot on the
P95 latency panel opens the corresponding trace in Tempo.

### No sanitization processor in Alloy
App-level sanitization is already enforced:
- `SanitizingSpanProcessor` in languee-back strips deny-list keys before export
- `sanitize_server_request_span` hook in languee-nlp does the same
- Both services disable header capture at instrumentation level (`headersToSpanAttributes: []`)

An Alloy-level `otelcol.processor.attributes` redaction stage was intentionally omitted
to keep the Alloy config simple. It can be added as defense-in-depth if required.

### Grafana dashboard panels
| Panel | PromQL concept |
|-------|----------------|
| Request Rate | `rate(http_server_request_duration_seconds_count)` grouped by `service_name` |
| Error Rate | ratio of 5xx rate to total rate, as percent |
| Latency P50/P95/P99 | `histogram_quantile` on `_bucket` metric; P95 panel has exemplar=true for trace links |
| Requests by Route | rate grouped by `service_name` + `http_route` |
| Active Connections | `http_server_active_requests` gauge |

---

## Test results

```
languee-nlp: 129 passed, 98% coverage (tracing.py: 100%)
ruff check + ruff format --check: all passed
```

---

## What to verify at runtime (requires `docker compose up`)

1. **Tempo reachable**: `curl http://localhost:3200/ready` → `ready`
2. **OTLP intake**: send a sample trace: `curl -X POST http://localhost:4318/v1/traces -H 'Content-Type: application/json' -d '{}'` → should not 404 (405 or 400 expected)
3. **Prometheus reachable**: `http://localhost:9090` → Prometheus UI
4. **Grafana Tempo datasource**: Grafana → Configuration → Data Sources → Tempo → "Save & Test" → success
5. **RED dashboard**: Grafana → Dashboards → "Languee — RED Metrics" — panels appear once traffic flows
6. **Trace-to-log link**: open a trace in Grafana → Tempo, click a span → "Logs for this span" → Loki query filters by `trace_id`
7. **Log-to-trace link**: open a Loki log line with `"trace_id":"..."` → click "View Trace" → opens in Tempo
8. **Exemplars**: after some traffic, P95 panel shows scatter dots — clicking one opens the corresponding trace

## Known items

- **`otelcol.exporter.prometheus`** in Alloy v1.16.0: the `resource_to_telemetry_conversion` block
  is supported. If metric labels are missing `service_name`, check that the block is present and
  the services set `service.name` in their OTel Resource (both do via `configure_tracing`).
- **`OTEL_METRICS_EXPORTER` in NodeSDK v0.57**: the env-var auto-configuration of the metric
  reader was introduced in `@opentelemetry/sdk-node` 0.52. It is present in the installed
  version. If metrics don't appear in Prometheus, verify that `NodeSDK.start()` logs no metric
  exporter warning and that `http://alloy:4318/v1/metrics` is reachable from the `api` container.
- **Prometheus `--enable-feature=exemplar-storage`**: required for the Prometheus v3 image to
  accept and store exemplars sent via remote write. Without it, exemplar dots on the P95 panel
  will not appear but all other metrics still work.
- **Android emulator exemplars**: droid's `OkHttpTelemetry` interceptor does not emit metrics
  by default (client spans only). No metrics are expected from `languee-droid` in Prometheus.
  The droid root span appears in Tempo as a trace, not a metric.
