package com.example.langueedroid.telemetry

import com.example.langueedroid.core.telemetry.initOpenTelemetry
import com.example.langueedroid.core.telemetry.redactTelemetryValue
import com.example.langueedroid.core.telemetry.signalEndpoint
import io.opentelemetry.context.Context
import io.opentelemetry.sdk.OpenTelemetrySdk
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OtelConfigTest {
    @Test
    fun `signal endpoints append exactly one OTLP path`() {
        assertTrue(signalEndpoint("http://10.0.2.2:4318", "logs").endsWith("/v1/logs"))
        assertTrue(signalEndpoint("http://10.0.2.2:4318/", "traces").endsWith("/v1/traces"))
    }

    @Test
    fun `telemetry fields remove query strings and credential values`() {
        val value = redactTelemetryValue("https://host/path?token=secret-value")
        assertTrue(value.endsWith("/path"))
        assertTrue(!value.contains("secret-value"))
    }

    @Test
    fun `initOpenTelemetry returns an OpenTelemetrySdk instance`() {
        val otel = initOpenTelemetry("http://localhost:4318", "test")
        assertNotNull(otel)
        assertTrue(otel is OpenTelemetrySdk)
    }

    @Test
    fun `initOpenTelemetry does not throw when endpoint is unreachable`() {
        val result = runCatching { initOpenTelemetry("http://unreachable-host-xyzzy:4318", "test") }
        assertTrue("init must succeed even when endpoint is unreachable", result.isSuccess)
    }

    @Test
    fun `W3C traceparent is injected by the configured propagator`() {
        val sdk = initOpenTelemetry("http://localhost:4318", "test") as OpenTelemetrySdk
        val tracer = sdk.getTracer("test-scope")
        val span = tracer.spanBuilder("test-span").startSpan()
        val carrier = mutableMapOf<String, String>()
        span.makeCurrent().use {
            sdk.propagators.textMapPropagator.inject(
                Context.current(),
                carrier,
            ) { map, key, value -> map?.set(key, value) }
        }
        span.end()
        assertNotNull("propagator must inject traceparent", carrier["traceparent"])
    }
}
