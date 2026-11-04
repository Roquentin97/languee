package com.example.langueedroid.core.telemetry

import com.languee.droid.BuildConfig
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.common.Attributes
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.propagation.ContextPropagators
import io.opentelemetry.exporter.otlp.http.logs.OtlpHttpLogRecordExporter
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter
import io.opentelemetry.sdk.OpenTelemetrySdk
import io.opentelemetry.sdk.logs.SdkLoggerProvider
import io.opentelemetry.sdk.logs.export.BatchLogRecordProcessor
import io.opentelemetry.sdk.resources.Resource
import io.opentelemetry.sdk.trace.SdkTracerProvider
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor
import java.util.concurrent.TimeUnit

internal fun signalEndpoint(
    endpoint: String,
    signal: String,
): String = endpoint.trim().trimEnd('/') + "/v1/$signal"

fun initOpenTelemetry(
    endpoint: String,
    environment: String,
): OpenTelemetry {
    val resource =
        Resource.getDefault().merge(
            Resource.create(
                Attributes
                    .builder()
                    .put("service.name", "languee-droid")
                    .put("service.version", BuildConfig.VERSION_NAME)
                    .put("service.build.commit", BuildConfig.GIT_SHA)
                    .put("deployment.environment", environment)
                    .put("service", "languee-droid")
                    .put("environment", environment)
                    // Alloy's Loki exporter reads these only as resource-label hints.
                    // Dynamic request and trace identifiers remain log fields.
                    .put("loki.resource.labels", "service,environment")
                    .build(),
            ),
        )

    val exporter =
        OtlpHttpSpanExporter
            .builder()
            .setEndpoint(signalEndpoint(endpoint, "traces"))
            .build()

    val logExporter =
        OtlpHttpLogRecordExporter
            .builder()
            .setEndpoint(signalEndpoint(endpoint, "logs"))
            .setTimeout(3, TimeUnit.SECONDS)
            .build()

    val tracerProvider =
        SdkTracerProvider
            .builder()
            .setResource(resource)
            .addSpanProcessor(BatchSpanProcessor.builder(exporter).build())
            .build()

    val loggerProvider =
        SdkLoggerProvider
            .builder()
            .setResource(resource)
            .addLogRecordProcessor(
                BatchLogRecordProcessor
                    .builder(logExporter)
                    .setMaxQueueSize(256)
                    .setMaxExportBatchSize(64)
                    .setScheduleDelay(2, TimeUnit.SECONDS)
                    .setExporterTimeout(3, TimeUnit.SECONDS)
                    .build(),
            ).build()

    return OpenTelemetrySdk
        .builder()
        .setTracerProvider(tracerProvider)
        .setLoggerProvider(loggerProvider)
        .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
        .build()
}
