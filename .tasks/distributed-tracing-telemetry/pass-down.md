# Pass-down notes for Phase 4 implementer (Metrics & RED dashboards)

## What Phases 0–3 built (you depend on this)

### Infra stack (Phase 0 — root)
- **Tempo** — trace store, filesystem, OTLP receivers on gRPC `4317` + HTTP `4318` inside Compose.
- **Alloy** — single collector: Docker log pipeline (existing) + `otelcol.receiver.otlp` → `otelcol.processor.batch` → `otelcol.exporter.otlp` → Tempo. Ports `4317:4317` and `4318:4318` are host-mapped so Android emulator can reach them.
- **Grafana** — Tempo datasource with trace-to-logs correlation; Loki datasource with derived field for trace_id → Tempo links.
- All existing Loki log pipelines are unchanged.

### languee-back (Phase 1)
- `src/tracing.ts` bootstraps `NodeSDK` with `OtlpHttpSpanExporter` → `http://alloy:4318`. Imported as first line of `src/main.ts`.
- Auto-instruments HTTP, Express, pg, ioredis, undici/fetch. Every outbound call carries `traceparent`.
- `RequestContextMiddleware` reads/generates `X-Request-ID` + echoes on response.
- `AppLogger.emit()` injects `requestId`, `trace_id`, `span_id` on every log line.
- `TRACING_ENABLED` env var (default `true`) and `OTEL_EXPORTER_OTLP_ENDPOINT` in Compose env.

### languee-nlp (Phase 2)
- `src/languee_nlp/tracing.py` → `configure_tracing(settings)` bootstraps `FastAPIInstrumentor` → `OtlpHttpSpanExporter` → `http://alloy:4318`.
- Extracts incoming `traceparent` → nlp server spans are children of back client spans → single connected trace.
- `JsonFormatter.format()` injects `trace_id`/`span_id` into every log line.
- `LANGUEE_NLP_TRACING_ENABLED` and `LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT` in Compose env.

### languee-droid (Phase 3)
- `LangueeDroidApp` (`Application` subclass) — initializes OTel once at startup, falls back to `noop()` on any error. Registered in `AndroidManifest.xml`.
- `telemetry/OtelConfig.kt` → `initOpenTelemetry(endpoint, environment)` — builds `OpenTelemetrySdk` + `OtlpHttpSpanExporter` + W3C propagator. Export target: `BuildConfig.OTEL_EXPORTER_ENDPOINT` (default `http://10.0.2.2:4318`).
- `ApiClient` has `OkHttpTelemetry` interceptor as first interceptor → injects `traceparent` into every backend call, creating client HTTP spans.
- `X-Request-ID` header (UUID per HTTP call) added before `Authorization`.
- `HttpLoggingInterceptor` level changed from `BODY` → `HEADERS` with `redactHeader("Authorization"/"Cookie"/"Set-Cookie")`.
- `BuildConfig.TRACING_ENABLED` (default `true`) toggles init in `LangueeDroidApp`.

## Full end-to-end trace chain (what already works when infra is up)

```
languee-droid (client HTTP span, root)
  └─ traceparent → languee-back (server span)
       ├─ Prisma DB spans (pg instrumentation)
       ├─ Redis spans (ioredis instrumentation)
       ├─ traceparent → languee-nlp (server span)
       └─ traceparent → dictionary API (outbound HTTP span)
```

All spans share the same `trace_id`. Log lines in back and nlp carry `trace_id`/`span_id`/`requestId`. Grafana Tempo shows the full tree; clicking a span links to Loki logs; a Loki log line with `trace_id` links back to Tempo.

## Phase 4 scope

Phase 4 is **optional** and adds Prometheus/Mimir-style RED metrics on top of the existing traces. It is **infra + light per-service**, not a new application feature. The spec explicitly says "Skip entirely if traces are deemed sufficient — note the decision."

### What to implement if proceeding

1. **Metrics store**: Add **Prometheus** (or Grafana Mimir) to `docker-compose.yml`. Have Alloy expose/forward OTel metrics via `otelcol.receiver.otlp` → `prometheus.remote_write`. Provision it as a Grafana datasource.

2. **OTel metrics from services**: The auto-instrumentation in back (`@opentelemetry/auto-instrumentations-node`) and nlp (`opentelemetry-instrumentation-fastapi`) already emits OTel metrics (request rate, duration histograms, error counts). These flow through the existing OTLP pipeline to Alloy automatically — no app code changes may be needed.

3. **Grafana dashboards** under `provision/grafana/provisioning/dashboards/`:
   - Per-service latency percentiles (p50/p95/p99).
   - Error rate (5xx / total).
   - Throughput (req/s).
   - **Trace exemplars**: link from latency histogram panels to representative Tempo traces.

4. **droid metrics** (optional): The OTel Android SDK can emit network request duration metrics via the `OkHttpTelemetry` instrumentation. These appear automatically if the OTLP pipeline is wired.

### Files to modify for Phase 4

- `docker-compose.yml` — add Prometheus service, configure Alloy to scrape/forward metrics.
- `provision/alloy/config.alloy` — add `otelcol.exporter.prometheus` or `prometheus.remote_write` block.
- `provision/grafana/provisioning/datasources/` — add Prometheus datasource.
- `provision/grafana/provisioning/dashboards/` — add RED dashboard JSON.
- **No app code in `languee-back`, `languee-nlp`, or `languee-droid` should need to change** — metrics flow from existing auto-instrumentation.

### Key files to read before implementing Phase 4

- `docker-compose.yml` — understand existing services, volumes, network, and port allocations.
- `provision/alloy/config.alloy` — understand existing log + trace pipeline blocks; add metrics pipeline blocks without touching existing ones.
- `provision/grafana/provisioning/datasources/loki.yaml` and the Tempo datasource added in Phase 0 — follow the same provisioning pattern for Prometheus.
- `apps/languee-back/src/tracing.ts` — `NodeSDK` is already set up; if metric instrumentation needs an explicit `MeterProvider`, it would go here.
- `apps/languee-nlp/src/languee_nlp/tracing.py` — same: add `MeterProvider` here if needed.

### Dependency note

Phase 4 has **no dependencies on Phases 1–3 code**. It only depends on Phase 0 infra (Alloy + Tempo already running). The per-service auto-instrumentation already emits metrics; Phase 4 is entirely about collecting and displaying them.

### Decision gate

If after reviewing the trace data in Grafana the team decides traces alone are sufficient for RED monitoring (per-span durations effectively give request latency and error visibility), Phase 4 can be skipped. Document this decision in the PR body.
