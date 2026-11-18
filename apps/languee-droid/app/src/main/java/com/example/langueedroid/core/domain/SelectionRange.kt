package com.example.langueedroid.core.domain

import java.text.Normalizer

/** A half-open range in Unicode code points, matching the vocabulary API contract. */
data class SelectionRange(
    val start: Int,
    val end: Int,
) {
    init {
        require(start >= 0) { "Range start must not be negative" }
        require(end > start) { "Range end must be greater than start" }
    }
}

object SelectionRanges {
    fun fromTokenIndices(
        tokens: List<Token>,
        selectedIndices: List<Int>,
    ): List<SelectionRange> {
        if (selectedIndices.isEmpty()) return emptyList()
        val selected = selectedIndices.toSet()
        var codePointOffset = 0
        val ranges = mutableListOf<SelectionRange>()
        tokens.forEachIndexed { index, token ->
            val value =
                when (token) {
                    is Token.Word -> token.text
                    is Token.Separator -> token.text
                }
            if (index in selected && token is Token.Word) {
                val end = codePointOffset + value.codePointCount(0, value.length)
                ranges.add(SelectionRange(codePointOffset, end))
            }
            codePointOffset += value.codePointCount(0, value.length)
        }
        return ranges
    }

    fun toUtf16Range(
        text: String,
        range: SelectionRange,
    ): IntRange? {
        val count = text.codePointCount(0, text.length)
        if (range.start >= count || range.end > count) return null
        val start = text.offsetByCodePoints(0, range.start)
        val end = text.offsetByCodePoints(0, range.end)
        return start until end
    }

    fun matchesTarget(
        text: String?,
        ranges: List<SelectionRange>,
        target: String,
    ): Boolean {
        if (text == null || ranges.isEmpty() || target.isBlank()) return false
        if (ranges.zipWithNext().any { (left, right) -> left.end > right.start }) return false
        val parts =
            ranges.map { range ->
                val utf16 = toUtf16Range(text, range) ?: return false
                text.substring(utf16.first, utf16.last + 1)
            }
        return normalize(parts.joinToString(" ")) == normalize(target)
    }

    fun fromLegacySpan(
        start: Int?,
        end: Int?,
    ): List<SelectionRange> =
        if (start != null && end != null && start >= 0 && end > start) listOf(SelectionRange(start, end)) else emptyList()

    fun encode(ranges: List<SelectionRange>): String = ranges.joinToString(",") { "${it.start}:${it.end}" }

    fun decode(encoded: String?): List<SelectionRange> {
        if (encoded.isNullOrBlank()) return emptyList()
        return encoded.split(',').mapNotNull { item ->
            val bounds = item.split(':', limit = 2)
            val start = bounds.getOrNull(0)?.toIntOrNull()
            val end = bounds.getOrNull(1)?.toIntOrNull()
            if (start != null && end != null && start >= 0 && end > start) SelectionRange(start, end) else null
        }
    }

    private fun normalize(value: String): String = Normalizer.normalize(value.trim(), Normalizer.Form.NFC).lowercase()
}
