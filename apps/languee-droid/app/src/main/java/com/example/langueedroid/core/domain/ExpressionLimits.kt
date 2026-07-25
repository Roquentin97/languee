package com.example.langueedroid.core.domain

/**
 * Maximum number of words a lookup target may contain.
 *
 * Enforced here so an over-long selection is refused immediately, with a message naming the
 * limit, instead of costing a round trip. The server validates independently, so input that
 * passes this check can still be rejected.
 */
object ExpressionLimits {

    const val MAX_WORDS = 10

    /** True when [text] holds more whitespace-separated words than the server will accept. */
    fun exceedsMaxWords(text: String): Boolean =
        text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.size > MAX_WORDS
}
