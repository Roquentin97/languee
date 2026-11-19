package com.example.langueedroid.data.remote

import com.example.langueedroid.core.telemetry.Logger
import com.example.langueedroid.di.NetworkModule
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.propagation.ContextPropagators
import io.opentelemetry.instrumentation.okhttp.v3_0.OkHttpTelemetry
import io.opentelemetry.sdk.OpenTelemetrySdk
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter
import io.opentelemetry.sdk.trace.SdkTracerProvider
import io.opentelemetry.sdk.trace.export.SimpleSpanProcessor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import okio.BufferedSource
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPOutputStream

class ApiClientTelemetryTest {
    private lateinit var server: MockWebServer
    private lateinit var exporter: InMemorySpanExporter
    private lateinit var otel: OpenTelemetry

    private val recordedLogger = RecordingLogger()

    @Before
    fun setUp() {
        recordedLogger.clear()
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
    fun `OTel interceptor exports a failed client span when delivery fails`() {
        val callFactory = OkHttpTelemetry.builder(otel).build().createCallFactory(OkHttpClient())
        val unavailableUrl = server.url("/unavailable")
        server.shutdown()

        val result =
            runCatching {
                callFactory.newCall(Request.Builder().url(unavailableUrl).build()).execute()
            }

        assertTrue(result.isFailure)
        assertTrue("a failed attempt must still produce a span", exporter.finishedSpanItems.isNotEmpty())
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
                .addInterceptor(NetworkModule.requestIdInterceptor())
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
                .addInterceptor(NetworkModule.requestIdInterceptor())
                .build()

        val url = server.url("/test")
        client.newCall(Request.Builder().url(url).build()).execute().close()
        client.newCall(Request.Builder().url(url).build()).execute().close()

        val id1 = server.takeRequest().getHeader("X-Request-ID")
        val id2 = server.takeRequest().getHeader("X-Request-ID")
        assertNotEquals("each request must have a distinct X-Request-ID", id1, id2)
    }

    @Test
    fun `request-id interceptor preserves an existing id for retries`() {
        server.enqueue(MockResponse().setResponseCode(200))
        val client = OkHttpClient.Builder().addInterceptor(NetworkModule.requestIdInterceptor()).build()

        client
            .newCall(
                Request
                    .Builder()
                    .url(server.url("/test"))
                    .header("X-Request-ID", "retry-request-id")
                    .build(),
            ).execute()
            .close()

        assertEquals("retry-request-id", server.takeRequest().getHeader("X-Request-ID"))
    }

    // --- Failure metadata is immediate; safe body details follow caller reads ---

    @Test
    fun `failure log includes safe error code and correlation without request or response content`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """{"statusCode":404,"message":"DEFINITIONS_NOT_FOUND","error":"Not Found","password":"response-secret"}""",
                ),
        )

        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.requestIdInterceptor())
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val response =
            client
                .newCall(
                    Request
                        .Builder()
                        .url(server.url("/api/v1/vocabulary/lookup?token=query-secret"))
                        .header("Authorization", "Bearer ultra-secret-token")
                        .header("Cookie", "session=cookie-secret")
                        .header("traceparent", "00-aabbccddeeff00112233445566778899-0011223344556677-01")
                        .build(),
                ).execute()
        assertEquals("json", response.body.contentType()?.subtype)
        assertEquals(1, recordedLogger.warnings.size)
        assertTrue(recordedLogger.infos.isEmpty())
        val returnedBody = response.body.string()
        response.close()
        assertEquals(
            "DEFINITIONS_NOT_FOUND",
            NetworkModule.responseErrorAttributes(returnedBody, truncated = false)["http.response.error_code"],
        )

        val event = recordedLogger.warnings.single()
        assertEquals("http.request.failed", event.event)
        assertEquals("GET", event.attributes["http.method"])
        assertEquals("/api/v1/vocabulary/lookup", event.attributes["url.path"])
        assertEquals("404", event.attributes["http.status_code"])
        assertFalse(event.attributes.containsKey("http.response.error_code"))
        assertEquals("languee-droid", event.attributes["service.name"])
        assertEquals("aabbccddeeff00112233445566778899", event.attributes["trace_id"])
        assertNotNull(event.attributes["requestId"])
        assertTrue(returnedBody.contains("response-secret"))

        val details = recordedLogger.infos.single()
        assertEquals("http.response.details", details.event)
        assertEquals("DEFINITIONS_NOT_FOUND", details.attributes["http.response.error_code"])
        assertEquals(event.attributes["requestId"], details.attributes["requestId"])

        val serialized = event.attributes.toString() + details.attributes
        assertFalse(serialized.contains("ultra-secret-token"))
        assertFalse(serialized.contains("Bearer"))
        assertFalse(serialized.contains("cookie-secret"))
        assertFalse(serialized.contains("query-secret"))
        assertFalse(serialized.contains("response-secret"))
    }

    @Test
    fun `failure log marks large JSON error previews as truncated`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setHeader("Content-Type", "application/json")
                .setBody("{" + "x".repeat(5000) + "}"),
        )
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val response = client.newCall(Request.Builder().url(server.url("/failure")).build()).execute()

        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("true", recordedLogger.infos.single().attributes["http.response.body_truncated"])
        response.close()
    }

    @Test
    fun `known length delayed JSON body is observed only as the caller reads it`() {
        val errorBody = """{"message":"DEFINITIONS_NOT_FOUND"}"""
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setHeader("Content-Type", "application/json")
                .setBody(errorBody)
                .setBodyDelay(1, TimeUnit.SECONDS),
        )
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val started = System.nanoTime()
        val response = client.newCall(Request.Builder().url(server.url("/delayed-error")).build()).execute()

        assertEquals(404, response.code)
        assertEquals(1, recordedLogger.warnings.size)
        assertTrue("body details must wait for the caller's read", recordedLogger.infos.isEmpty())
        assertTrue(
            "the interceptor must return before the delayed body is delivered",
            System.nanoTime() - started < TimeUnit.MILLISECONDS.toNanos(750),
        )
        assertEquals(errorBody, response.body.string())
        response.close()
        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("DEFINITIONS_NOT_FOUND", recordedLogger.infos.single().attributes["http.response.error_code"])
        assertFalse(
            recordedLogger.infos
                .single()
                .attributes
                .containsKey("http.response.body_truncated"),
        )
    }

    @Test
    fun `response body read failure is preserved and logged as truncated`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"message":"DEFINITIONS_NOT_FOUND"}""")
                .setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY),
        )
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val response = client.newCall(Request.Builder().url(server.url("/interrupted-error")).build()).execute()
        assertEquals(1, recordedLogger.warnings.size)
        val bodyResult = runCatching { response.body.string() }
        response.close()

        assertTrue("the original body read failure must reach the caller", bodyResult.isFailure)
        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("true", recordedLogger.infos.single().attributes["http.response.body_truncated"])
        assertFalse(
            recordedLogger.infos
                .single()
                .attributes
                .containsKey("http.response.error_code"),
        )
    }

    @Test
    fun `failure metadata is visible before an unread response body is closed`() {
        server.enqueue(
            MockResponse()
                .setResponseCode(422)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"message":"DEFINITIONS_NOT_FOUND"}"""),
        )
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val response = client.newCall(Request.Builder().url(server.url("/unread-error")).build()).execute()

        assertEquals(422, response.code)
        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("http.request.failed", recordedLogger.warnings.single().event)
        assertTrue(recordedLogger.infos.isEmpty())
        response.close()
        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("true", recordedLogger.infos.single().attributes["http.response.body_truncated"])
    }

    @Test
    fun `unknown length JSON is observed only when the caller reads the decoded body`() {
        val errorBody = """{"message":"DEFINITIONS_NOT_FOUND"}"""
        server.enqueue(
            MockResponse()
                .setResponseCode(400)
                .setHeader("Content-Type", "application/json")
                .setChunkedBody(errorBody, 8),
        )
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val response = client.newCall(Request.Builder().url(server.url("/chunked-error")).build()).execute()

        assertEquals(1, recordedLogger.warnings.size)
        assertTrue(recordedLogger.infos.isEmpty())
        assertEquals(errorBody, response.body.string())
        response.close()
        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("DEFINITIONS_NOT_FOUND", recordedLogger.infos.single().attributes["http.response.error_code"])
    }

    @Test
    fun `gzip JSON error details are parsed after OkHttp decodes the response`() {
        val errorBody = """{"message":"DEFINITIONS_NOT_FOUND"}"""
        val compressed =
            ByteArrayOutputStream()
                .also { bytes ->
                    GZIPOutputStream(bytes).use { gzip -> gzip.write(errorBody.toByteArray()) }
                }.toByteArray()
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setHeader("Content-Type", "application/json")
                .setHeader("Content-Encoding", "gzip")
                .setBody(Buffer().write(compressed)),
        )
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        val response = client.newCall(Request.Builder().url(server.url("/gzip-error")).build()).execute()

        assertEquals(1, recordedLogger.warnings.size)
        assertTrue(recordedLogger.infos.isEmpty())
        assertEquals(errorBody, response.body.string())
        response.close()
        assertEquals(1, recordedLogger.warnings.size)
        assertEquals("DEFINITIONS_NOT_FOUND", recordedLogger.infos.single().attributes["http.response.error_code"])
    }

    @Test
    fun `unknown length JSON error bodies are not marked truncated without evidence`() {
        assertUnreadBodyAttributes(contentLength = -1L, expected = emptyMap())
    }

    @Test
    fun `large JSON error bodies are marked truncated without reading`() {
        assertUnreadBodyAttributes(
            contentLength = 4097L,
            expected = mapOf("http.response.body_truncated" to "true"),
        )
    }

    @Test
    fun `malformed or missing traceparent is omitted from failure attributes`() {
        val missing = Request.Builder().url(server.url("/missing")).build()
        val malformed =
            Request
                .Builder()
                .url(server.url("/malformed"))
                .header("traceparent", "not-a-traceparent")
                .build()
        val allZero =
            Request
                .Builder()
                .url(server.url("/zero"))
                .header("traceparent", "00-00000000000000000000000000000000-0011223344556677-01")
                .build()
        val valid =
            Request
                .Builder()
                .url(server.url("/valid"))
                .header("traceparent", "00-AABBCCDDEEFF00112233445566778899-0011223344556677-01")
                .build()

        assertTrue(NetworkModule.traceAttributes(missing).isEmpty())
        assertTrue(NetworkModule.traceAttributes(malformed).isEmpty())
        assertTrue(NetworkModule.traceAttributes(allZero).isEmpty())
        assertEquals("aabbccddeeff00112233445566778899", NetworkModule.traceAttributes(valid)["trace_id"])
    }

    @Test
    fun `successful requests do not create failure records`() {
        server.enqueue(MockResponse().setResponseCode(200).setBody("ok"))
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(NetworkModule.failureLoggingInterceptor(recordedLogger))
                .build()

        client.newCall(Request.Builder().url(server.url("/success")).build()).execute().close()

        assertTrue(recordedLogger.warnings.isEmpty())
        assertTrue(recordedLogger.infos.isEmpty())
        assertTrue(recordedLogger.errors.isEmpty())
    }

    private fun assertUnreadBodyAttributes(
        contentLength: Long,
        expected: Map<String, String>,
    ) {
        var sourceRequested = false
        val body =
            object : ResponseBody() {
                override fun contentType() = "application/json".toMediaType()

                override fun contentLength() = contentLength

                override fun source(): BufferedSource {
                    sourceRequested = true
                    return Buffer().writeUtf8("{\"message\":\"should-not-read\"}")
                }
            }
        val response =
            okhttp3.Response
                .Builder()
                .request(Request.Builder().url(server.url("/streaming-error")).build())
                .protocol(Protocol.HTTP_1_1)
                .code(500)
                .message("error")
                .body(body)
                .build()

        assertEquals(
            expected,
            NetworkModule.responseErrorAttributes(response),
        )
        assertFalse("large/unknown bodies must not be read by logging", sourceRequested)
    }
}

private data class LoggedEvent(
    val event: String,
    val attributes: Map<String, String>,
)

private class RecordingLogger : Logger {
    val warnings = mutableListOf<LoggedEvent>()
    val infos = mutableListOf<LoggedEvent>()
    val errors = mutableListOf<LoggedEvent>()

    override fun debug(
        event: String,
        attributes: Map<String, String>,
    ) = Unit

    override fun info(
        event: String,
        attributes: Map<String, String>,
    ) {
        infos += LoggedEvent(event, attributes)
    }

    override fun warn(
        event: String,
        attributes: Map<String, String>,
        error: Throwable?,
    ) {
        warnings += LoggedEvent(event, attributes)
    }

    override fun error(
        event: String,
        attributes: Map<String, String>,
        error: Throwable?,
    ) {
        errors += LoggedEvent(event, attributes)
    }

    fun clear() {
        warnings.clear()
        infos.clear()
        errors.clear()
    }
}
