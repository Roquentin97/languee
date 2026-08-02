package com.example.langueedroid.data.remote

import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.propagation.ContextPropagators
import io.opentelemetry.instrumentation.okhttp.v3_0.OkHttpTelemetry
import io.opentelemetry.sdk.OpenTelemetrySdk
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter
import io.opentelemetry.sdk.trace.SdkTracerProvider
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID

class ApiClientTelemetryTest {
    private lateinit var server: MockWebServer
    private lateinit var exporter: InMemorySpanExporter
    private lateinit var otel: OpenTelemetry

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()

        exporter = InMemorySpanExporter.create()
        val provider =
            SdkTracerProvider
                .builder()
                .addSpanProcessor(SimpleSpanProcessor.create(exporter))
                .build()
        otel =
            OpenTelemetrySdk
                .builder()
                .setTracerProvider(provider)
                .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
                .build()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    // --- OTel interceptor ---

    @Test
    fun `OTel interceptor injects traceparent header on outbound request`() {
        server.enqueue(MockResponse().setResponseCode(200))

        val callFactory = OkHttpTelemetry.builder(otel).build().createCallFactory(OkHttpClient())

        callFactory.newCall(Request.Builder().url(server.url("/test")).build()).execute().close()

        val recorded = server.takeRequest()
        assertNotNull("traceparent must be injected by OTel interceptor", recorded.getHeader("traceparent"))
    }

    @Test
    fun `OTel interceptor creates a client span per request`() {
        server.enqueue(MockResponse().setResponseCode(200))

        val callFactory = OkHttpTelemetry.builder(otel).build().createCallFactory(OkHttpClient())

        callFactory.newCall(Request.Builder().url(server.url("/test")).build()).execute().close()

        assertTrue("at least one span must be exported", exporter.finishedSpanItems.isNotEmpty())
    }

    @Test
    fun `OTel interceptor does not capture Authorization header as span attribute`() {
        server.enqueue(MockResponse().setResponseCode(200))

        val callFactory = OkHttpTelemetry.builder(otel).build().createCallFactory(OkHttpClient())

        callFactory
            .newCall(
                Request
                    .Builder()
                    .url(server.url("/test"))
                    .header("Authorization", "Bearer secret-token-xyz")
                    .build(),
            ).execute()
            .close()

        val spans = exporter.finishedSpanItems
        assertTrue(spans.isNotEmpty())
        spans.forEach { span ->
            span.attributes.forEach { key, value ->
                assertFalse(
                    "span attribute key '${key.key}' must not reference authorization",
                    key.key.contains("authorization", ignoreCase = true),
                )
                if (value is String) {
                    assertFalse(
                        "span attribute '${key.key}' must not contain token value",
                        value.contains("secret-token-xyz"),
                    )
                }
            }
        }
    }

    // --- X-Request-ID interceptor ---

    @Test
    fun `request-id interceptor adds a UUID X-Request-ID header`() {
        server.enqueue(MockResponse().setResponseCode(200))

        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(buildRequestIdInterceptor())
                .build()

        client.newCall(Request.Builder().url(server.url("/test")).build()).execute().close()

        val requestId = server.takeRequest().getHeader("X-Request-ID")
        assertNotNull("X-Request-ID header must be present", requestId)
        UUID.fromString(requestId) // throws if not a valid UUID
    }

    @Test
    fun `request-id interceptor generates a unique id per request`() {
        server.enqueue(MockResponse().setResponseCode(200))
        server.enqueue(MockResponse().setResponseCode(200))

        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(buildRequestIdInterceptor())
                .build()

        val url = server.url("/test")
        client.newCall(Request.Builder().url(url).build()).execute().close()
        client.newCall(Request.Builder().url(url).build()).execute().close()

        val id1 = server.takeRequest().getHeader("X-Request-ID")
        val id2 = server.takeRequest().getHeader("X-Request-ID")
        assertNotEquals("each request must have a distinct X-Request-ID", id1, id2)
    }

    // --- Logging interceptor does not leak auth tokens ---

    @Test
    fun `logging interceptor at HEADERS level does not log Authorization value`() {
        server.enqueue(MockResponse().setResponseCode(200))

        val logLines = mutableListOf<String>()
        val loggingInterceptor =
            HttpLoggingInterceptor { message -> logLines.add(message) }.apply {
                level = HttpLoggingInterceptor.Level.HEADERS
                redactHeader("Authorization")
                redactHeader("Cookie")
                redactHeader("Set-Cookie")
            }

        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(loggingInterceptor)
                .build()

        client
            .newCall(
                Request
                    .Builder()
                    .url(server.url("/test"))
                    .header("Authorization", "Bearer ultra-secret-token")
                    .build(),
            ).execute()
            .close()

        assertFalse(
            "Authorization value must not appear in any log line",
            logLines.any { line -> line.contains("ultra-secret-token") || line.contains("Bearer") },
        )
    }

    // --- helpers ---

    private fun buildRequestIdInterceptor(): Interceptor =
        Interceptor { chain ->
            chain.proceed(
                chain
                    .request()
                    .newBuilder()
                    .header("X-Request-ID", UUID.randomUUID().toString())
                    .build(),
            )
        }
}
