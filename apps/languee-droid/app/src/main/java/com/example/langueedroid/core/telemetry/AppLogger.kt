package com.example.langueedroid.core.telemetry

import android.util.Log
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.logs.Severity
import io.opentelemetry.api.trace.Span

/** Application events mirrored to Logcat and, when enabled, the bounded OTLP log pipeline. */
class AppLogger(
    private val openTelemetry: OpenTelemetry,
) {
    fun debug(
        event: String,
        attributes: Map<String, String> = emptyMap(),
    ) = log(Severity.DEBUG, event, attributes)

    fun info(
        event: String,
        attributes: Map<String, String> = emptyMap(),
    ) = log(Severity.INFO, event, attributes)

    fun warn(
        event: String,
        attributes: Map<String, String> = emptyMap(),
        error: Throwable? = null,
    ) = log(Severity.WARN, event, attributes, error)

    fun error(
        event: String,
        attributes: Map<String, String> = emptyMap(),
        error: Throwable? = null,
    ) = log(Severity.ERROR, event, attributes, error)

    private fun log(
        severity: Severity,
        event: String,
        attributes: Map<String, String>,
        error: Throwable? = null,
    ) {
        val safeAttributes = attributes.mapValues { (_, value) -> redactTelemetryValue(value) }
        val line = "$event $safeAttributes${error?.let {
            " error=${it::class.java.simpleName}: ${redactTelemetryValue(
                it.message.orEmpty(),
            )}"
        }.orEmpty()}"
        when (severity) {
            Severity.ERROR, Severity.FATAL, Severity.FATAL2, Severity.FATAL3, Severity.FATAL4 -> Log.e("Languee", line)
            Severity.WARN, Severity.WARN2, Severity.WARN3, Severity.WARN4 -> Log.w("Languee", line)
            Severity.DEBUG, Severity.DEBUG2, Severity.DEBUG3, Severity.DEBUG4 -> Log.d("Languee", line)
            else -> Log.i("Languee", line)
        }

        // The SDK batches asynchronously. Failures are intentionally not logged here: doing
        // so would create a feedback loop while the collector is unavailable.
        runCatching {
            openTelemetry.logsBridge
                .get("languee-droid")
                .logRecordBuilder()
                .setSeverity(severity)
                .setSeverityText(severity.name)
                .setEventName(event)
                .setBody(event)
                .setAllAttributes(
                    io.opentelemetry.api.common.Attributes
                        .builder()
                        .apply {
                            put("event", event)
                            safeAttributes.forEach { (key, value) -> put(key, value) }
                            Span.current().spanContext.takeIf { it.isValid }?.let { span ->
                                put("trace_id", span.traceId)
                                put("span_id", span.spanId)
                            }
                            error?.let {
                                put("exception.type", it::class.java.name)
                                put("exception.message", redactTelemetryValue(it.message.orEmpty()))
                            }
                        }.build(),
                ).emit()
        }
    }
}

internal fun redactTelemetryValue(value: String): String =
    value
        .replace(Regex("(?i)(token|password|authorization|cookie)=?[^&\\s]*"), "$1=[REDACTED]")
        .substringBefore('?')
        .take(2048)
