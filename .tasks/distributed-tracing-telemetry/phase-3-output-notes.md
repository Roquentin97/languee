# Phase 3 — languee-droid: OTel client telemetry, traceparent propagation, redacted logs

## What was implemented

### New dependencies (added to `apps/languee-droid/gradle/libs.versions.toml` and `app/build.gradle.kts`)

| Artifact | Version | Scope | Reason |
|----------|---------|-------|--------|
| `io.opentelemetry:opentelemetry-sdk` | `1.44.0` | `implementation` | Core SDK — `TracerProvider`, `Resource`, `BatchSpanProcessor` |
| `io.opentelemetry:opentelemetry-exporter-otlp` | `1.44.0` | `implementation` | `OtlpHttpSpanExporter` → Alloy at `BuildConfig.OTEL_EXPORTER_ENDPOINT` |
| `io.opentelemetry.instrumentation:opentelemetry-okhttp-3.0` | `2.11.0` | `implementation` | `OkHttpTelemetry` — creates client spans, injects `traceparent` automatically |
| `io.opentelemetry:opentelemetry-sdk-testing` | `1.44.0` | `testImplementation` | `InMemorySpanExporter` for unit tests |
| `com.squareup.okhttp3:mockwebserver` | `4.12.0` | `testImplementation` | Fake HTTP server for interceptor tests |

### New files

| File | Purpose |
|------|---------|
| `app/src/main/java/.../telemetry/OtelConfig.kt` | `initOpenTelemetry(endpoint, environment)` — builds `OpenTelemetrySdk` with `OtlpHttpSpanExporter`, `BatchSpanProcessor`, W3C propagator, `service.name=languee-droid` resource |
| `app/src/main/java/.../LangueeDroidApp.kt` | `Application` subclass — initializes OTel once at startup, wrapped in `runCatching` so any init failure falls back to `OpenTelemetry.noop()` |
| `app/src/test/java/.../telemetry/OtelConfigTest.kt` | 5 tests: SDK type, service.name attr, deployment.environment attr, unreachable endpoint doesn't throw, W3C traceparent injected |
| `app/src/test/java/.../data/remote/ApiClientTelemetryTest.kt` | 6 tests: OTel interceptor injects `traceparent`, creates span, doesn't capture auth attr; X-Request-ID UUID valid and unique per request; logging interceptor masks `Authorization` value |

### Modified files

| File | Changes |
|------|---------|
| `gradle/libs.versions.toml` | Added `otel = "1.44.0"`, `otel-instrumentation = "2.11.0"`, and 5 library entries |
| `app/build.gradle.kts` | Added 3 `implementation` and 2 `testImplementation` deps; added `BuildConfig.OTEL_EXPORTER_ENDPOINT` and `BuildConfig.TRACING_ENABLED` fields read from `local.properties` |
| `app/src/main/AndroidManifest.xml` | Added `android:name=".LangueeDroidApp"` to `<application>` |
| `data/remote/ApiClient.kt` | Added `openTelemetry: OpenTelemetry = OpenTelemetry.noop()` param; added `otelInterceptor` (first), `requestIdInterceptor` (second); changed `HttpLoggingInterceptor` level from `BODY` → `HEADERS` with `redactHeader("Authorization")`, `redactHeader("Cookie")`, `redactHeader("Set-Cookie")` |
| `MainActivity.kt` | Passes `(applicationContext as LangueeDroidApp).openTelemetry` to `ApiClient` |

## Architecture decisions

### `LangueeDroidApp` as the OTel init point
Manual DI lives in `MainActivity.onCreate()`. The `Application` class is the only lifecycle point guaranteed to run before `Activity.onCreate()`. OTel init happens there so the `OpenTelemetry` instance is ready before the `ApiClient` is built.

### `OpenTelemetry.noop()` as default parameter
`ApiClient(openTelemetry = OpenTelemetry.noop())` means existing unit tests that construct `ApiClient` (or mock it) continue to work without change. All OTel calls on the noop instance are safe no-ops.

### Interceptor ordering in `OkHttpClient`
1. `otelInterceptor` — creates the client span and injects `traceparent` *before* auth adds `Authorization`
2. `requestIdInterceptor` — adds `X-Request-ID` UUID per-call
3. `authInterceptor` — adds `Authorization: Bearer ...`
4. `loggingInterceptor` (debug only) — logs at `HEADERS` level with auth redacted

The OkHttp instrumentation library doesn't capture headers as span attributes by default, so the `Authorization` header added by the auth interceptor never appears in spans.

### `TRACING_ENABLED` BuildConfig toggle
Defaults to `true`. Set `TRACING_ENABLED=false` in `local.properties` to disable all OTel for a local build. In CI/release builds without `local.properties` this defaults to `true`.

For JVM unit tests, `LangueeDroidApp.onCreate()` is never called (no Android runtime), so tracing is never initialized and all `ApiClient` instances get `OpenTelemetry.noop()` by default.

### No `GlobalOpenTelemetry` usage
`initOpenTelemetry()` returns an `OpenTelemetrySdk` instance; it never calls `buildAndRegisterGlobal()`. This avoids "already registered" errors if called multiple times in tests.

## BuildConfig additions

| Field | Type | Default | Source |
|-------|------|---------|--------|
| `OTEL_EXPORTER_ENDPOINT` | `String` | `http://10.0.2.2:4318` | `local.properties` `OTEL_EXPORTER_ENDPOINT` |
| `TRACING_ENABLED` | `boolean` | `true` | `local.properties` `TRACING_ENABLED` |

`10.0.2.2` is the standard Android emulator alias for the host machine. For a physical device on the same LAN, override via `local.properties`.

## What end-to-end requires (not verified in unit tests)

1. **Phase 0 infra must be running**: Alloy must have OTLP receiver on port `4318` (mapped `4318:4318` in `docker-compose.yml`). Tempo must be running and receiving from Alloy.
2. **Device connectivity**: Android emulator reaches `10.0.2.2:4318`; physical device needs host LAN IP in `local.properties`.
3. **Trace continuity**: droid's client span (created by `OkHttpTelemetry`) becomes the root; `traceparent` is injected into the `languee-back` request; back's `RequestContextMiddleware` reads it and continues the trace. This chain produces a single `trace_id` spanning droid → back → nlp / Postgres / Redis.
4. **`internet` permission**: already present in `AndroidManifest.xml` — covers OTLP export to Alloy.

## Known items to verify at runtime

- **`opentelemetry-exporter-otlp` on API 24**: The HTTP/protobuf exporter (no gRPC) should DEX cleanly on minSdk 24. If there are desugaring issues with `java.time` or `java.util.function`, enable `coreLibraryDesugaringEnabled = true` in `compileOptions` and add `com.android.tools:desugar_jdk_libs` as `coreLibraryDesugaring` dep.
- **`kotlin-android` plugin**: The project uses `kotlin-compose` but not `kotlin-android` explicitly. With Kotlin 2.2.10 + AGP 9.x this should compile, but if the OTel Kotlin classes aren't resolved add `alias(libs.plugins.kotlin.android)` to `app/build.gradle.kts` plugins.
- **`X-Request-ID` granularity**: Currently one UUID per OkHttp call. For multi-call user actions (e.g. refresh + API call), each call gets its own `requestId`. This is a reasonable approximation; if true action-level grouping is needed, `requestId` must be threaded through the repository layer as a parameter.
