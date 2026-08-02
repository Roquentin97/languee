package com.example.langueedroid.core.util

import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale

private val ISO_PATTERNS =
    listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
        "yyyy-MM-dd'T'HH:mm:ssZ",
    )

/**
 * Parses a backend ISO-8601 UTC instant such as `2026-07-24T13:54:38.936Z` into epoch
 * milliseconds, or `null` when the value cannot be parsed. The trailing `Z` is normalised
 * to `+0000` so the RFC-822 zone pattern parses it on every supported API level (minSdk 24
 * has no `java.time`).
 */
fun parseIsoInstantToEpochMillis(iso: String): Long? {
    val normalized = iso.trim().replace("Z", "+0000")
    for (pattern in ISO_PATTERNS) {
        try {
            return SimpleDateFormat(pattern, Locale.US).parse(normalized)?.time
        } catch (_: ParseException) {
            // Try the next pattern.
        }
    }
    return null
}
