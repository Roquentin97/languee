package com.example.langueedroid.core.telemetry

import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.common.AttributeKey
import io.opentelemetry.api.logs.Severity
import io.opentelemetry.sdk.OpenTelemetrySdk
import io.opentelemetry.sdk.logs.SdkLoggerProvider
import io.opentelemetry.sdk.logs.export.SimpleLogRecordProcessor
import io.opentelemetry.sdk.testing.exporter.InMemoryLogRecordExporter
import io.opentelemetry.sdk.trace.SdkTracerProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLoggerTest {
    @Test
    fun `emits severity event attributes and exception type without exception message`() {
        val exporter = InMemoryLogRecordExporter.create()
        val logger = AppLogger(openTelemetry(exporter))

        logger.error(
            event = "auth.login_failed",
            attributes = mapOf("http.status_code" to "401"),
            error = IllegalStateException("password=super-secret"),
        )

        val record = exporter.finishedLogRecordItems.single()
        assertEquals(Severity.ERROR, record.severity)
        assertEquals("auth.login_failed", record.eventName)
        assertEquals("401", record.attributes.get(AttributeKey.stringKey("http.status_code")))
        assertEquals(IllegalStateException::class.java.name, record.attributes.get(AttributeKey.stringKey("exception.type")))
        assertFalse(
            record.attributes
                .asMap()
                .values
                .any { it.toString().contains("super-secret") },
        )
    }

    @Test
    fun `redacts sensitive values before exporting attributes`() {
        val exporter = InMemoryLogRecordExporter.create()
        val logger = AppLogger(openTelemetry(exporter))

        logger.warn("network.failed", mapOf("detail" to "authorization=Bearer secret-token"))

        val values =
            exporter.finishedLogRecordItems
                .single()
                .attributes
                .asMap()
                .values
                .joinToString()
        assertTrue(values.contains("[REDACTED]"))
        assertFalse(values.contains("secret-token"))
    }

    @Test
    fun `noop telemetry does not affect application logging calls`() {
        AppLogger(OpenTelemetry.noop()).info("app.started", emptyMap())
    }

    @Test
    fun `adds active trace and span identifiers to exported logs`() {
        val exporter = InMemoryLogRecordExporter.create()
        val telemetry = openTelemetry(exporter)
        val span = telemetry.getTracer("test").spanBuilder("operation").startSpan()

        span.makeCurrent().use {
            AppLogger(telemetry).info("app.operation_completed", emptyMap())
        }
        span.end()

        val attributes = exporter.finishedLogRecordItems.single().attributes
        assertEquals(span.spanContext.traceId, attributes.get(AttributeKey.stringKey("trace_id")))
        assertEquals(span.spanContext.spanId, attributes.get(AttributeKey.stringKey("span_id")))
    }

    private fun openTelemetry(exporter: InMemoryLogRecordExporter): OpenTelemetry =
        OpenTelemetrySdk
            .builder()
            .setLoggerProvider(
                SdkLoggerProvider
                    .builder()
                    .addLogRecordProcessor(SimpleLogRecordProcessor.create(exporter))
                    .build(),
            ).setTracerProvider(SdkTracerProvider.builder().build())
            .build()
}
