package com.example.langueedroid.telemetry

import io.opentelemetry.api.common.AttributeKey
import io.opentelemetry.context.Context
import io.opentelemetry.sdk.OpenTelemetrySdk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OtelConfigTest {

    @Test
    fun `initOpenTelemetry returns an OpenTelemetrySdk instance`() {
        val otel = initOpenTelemetry("http://localhost:4318", "test")
        assertNotNull(otel)
        assertTrue(otel is OpenTelemetrySdk)
    }

    @Test
    fun `initOpenTelemetry sets service_name to languee-droid`() {
        val sdk = initOpenTelemetry("http://localhost:4318", "test") as OpenTelemetrySdk
        val attrs = sdk.sdkTracerProvider.resource.attributes
        assertEquals("languee-droid", attrs[AttributeKey.stringKey("service.name")])
    }

    @Test
    fun `initOpenTelemetry sets deployment_environment from parameter`() {
        val sdk = initOpenTelemetry("http://localhost:4318", "staging") as OpenTelemetrySdk
        val attrs = sdk.sdkTracerProvider.resource.attributes
        assertEquals("staging", attrs[AttributeKey.stringKey("deployment.environment")])
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
            ) { map, key, value -> map[key] = value }
        }
        span.end()
        assertNotNull("propagator must inject traceparent", carrier["traceparent"])
    }
}
