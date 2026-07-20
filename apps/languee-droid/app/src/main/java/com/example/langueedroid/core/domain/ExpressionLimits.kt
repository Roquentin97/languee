package com.example.langueedroid.core.domain

/**
 * Client-side bound on how many words a lookup target may contain.
 *
 * The authoritative limit lives in the NLP service, which counts spaCy tokens rather than
 * whitespace-separated words — the two can disagree ("don't give up" is three words but four
 * tokens). This mirror exists only so the app can fail fast with a specific message instead of
 * spending a round trip to learn the input was too long; NLP still has the final say, and an
 * input that passes here may still be rejected as invalid by the server.
 */
object ExpressionLimits {

    const val MAX_WORDS = 10

    /** True when [text] holds more whitespace-separated words than the server will accept. */
    fun exceedsMaxWords(text: String): Boolean =
        text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.size > MAX_WORDS
}
