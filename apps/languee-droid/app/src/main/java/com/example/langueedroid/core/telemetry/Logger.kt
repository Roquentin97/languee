package com.example.langueedroid.core.telemetry

/** Structured application logging that does not expose platform or telemetry APIs to callers. */
interface Logger {
    fun debug(
        event: String,
        attributes: Map<String, String> = emptyMap(),
    )

    fun info(
        event: String,
        attributes: Map<String, String> = emptyMap(),
    )

    fun warn(
        event: String,
        attributes: Map<String, String> = emptyMap(),
        error: Throwable? = null,
    )

    fun error(
        event: String,
        attributes: Map<String, String> = emptyMap(),
        error: Throwable? = null,
    )
}
