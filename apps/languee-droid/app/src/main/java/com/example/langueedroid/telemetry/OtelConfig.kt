package com.example.langueedroid.telemetry

import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.common.Attributes
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.propagation.ContextPropagators
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter
import io.opentelemetry.sdk.OpenTelemetrySdk
import io.opentelemetry.sdk.resources.Resource
import io.opentelemetry.sdk.trace.SdkTracerProvider
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor

fun initOpenTelemetry(endpoint: String, environment: String): OpenTelemetry {
    val resource = Resource.getDefault().merge(
        Resource.create(
            Attributes.builder()
                .put("service.name", "languee-droid")
                .put("deployment.environment", environment)
                .build(),
        ),
    )

    val exporter = OtlpHttpSpanExporter.builder()
        .setEndpoint(endpoint)
        .build()

    val tracerProvider = SdkTracerProvider.builder()
        .setResource(resource)
        .addSpanProcessor(BatchSpanProcessor.builder(exporter).build())
        .build()

    return OpenTelemetrySdk.builder()
        .setTracerProvider(tracerProvider)
        .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
        .build()
}
