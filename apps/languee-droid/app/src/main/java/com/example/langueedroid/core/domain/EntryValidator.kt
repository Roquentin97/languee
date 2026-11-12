package com.example.langueedroid.core.domain

import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.util.Locale

sealed class Token {
    data class Word(
        val text: String,
    ) : Token()

    data class Separator(
        val text: String,
    ) : Token()
}

object EntryValidator {
    const val MAX_CAPTURE_TEXT_BYTES = 1024
    const val MAX_MEANINGFUL_CAPTURE_WORDS = 15

    // Keep this explicit list in sync with the backend capture-input module.
    private val englishFunctionWords =
        setOf(
            "a",
            "about",
            "above",
            "after",
            "again",
            "against",
            "all",
            "am",
            "an",
            "and",
            "any",
            "are",
            "aren",
            "as",
            "at",
            "be",
            "because",
            "been",
            "before",
            "being",
            "below",
            "between",
            "both",
            "but",
            "by",
            "can",
            "could",
            "did",
            "do",
            "does",
            "doing",
            "down",
            "during",
            "each",
            "few",
            "for",
            "from",
            "further",
            "had",
            "has",
            "have",
            "having",
            "he",
            "her",
            "here",
            "hers",
            "herself",
            "him",
            "himself",
            "his",
            "how",
            "i",
            "if",
            "in",
            "into",
            "is",
            "it",
            "its",
            "itself",
            "just",
            "me",
            "more",
            "most",
            "my",
            "myself",
            "no",
            "nor",
            "not",
            "now",
            "of",
            "off",
            "on",
            "once",
            "only",
            "or",
            "other",
            "our",
            "ours",
            "ourselves",
            "out",
            "over",
            "own",
            "same",
            "she",
            "should",
            "so",
            "some",
            "such",
            "than",
            "that",
            "the",
            "their",
            "theirs",
            "them",
            "themselves",
            "then",
            "there",
            "these",
            "they",
            "this",
            "those",
            "through",
            "to",
            "too",
            "under",
            "until",
            "up",
            "very",
            "was",
            "we",
            "were",
            "what",
            "when",
            "where",
            "which",
            "while",
            "who",
            "whom",
            "why",
            "will",
            "with",
            "would",
            "you",
            "your",
            "yours",
            "yourself",
            "yourselves",
            "ain",
            "aren",
            "couldn",
            "didn",
            "doesn",
            "don",
            "hadn",
            "hasn",
            "haven",
            "isn",
            "mightn",
            "mustn",
            "needn",
            "shan",
            "shouldn",
            "wasn",
            "weren",
            "won",
            "wouldn",
            "t",
            "s",
            "d",
            "ll",
            "re",
            "ve",
            "m",
        )

    data class CaptureTextValidation(
        val meaningfulWordCount: Int,
        val byteCount: Int,
        val error: CaptureTextError? = null,
    ) {
        val isValid: Boolean get() = error == null
    }

    enum class CaptureTextError { TOO_LONG, TOO_MANY_MEANINGFUL_WORDS }

    fun normalizedSurfaceTokens(text: String): List<String> =
        splitIntoTokens(Normalizer.normalize(text, Normalizer.Form.NFC))
            .filterIsInstance<Token.Word>()
            .map { it.text.lowercase(Locale.US) }

    fun distinctSurfaceTokens(text: String): List<String> = normalizedSurfaceTokens(text).distinct()

    fun validateCaptureText(text: String): CaptureTextValidation {
        val byteCount = text.toByteArray(StandardCharsets.UTF_8).size
        val meaningfulWordCount = normalizedSurfaceTokens(text).filterNot { it in englishFunctionWords }.toSet().size
        val error =
            when {
                byteCount > MAX_CAPTURE_TEXT_BYTES -> CaptureTextError.TOO_LONG
                meaningfulWordCount > MAX_MEANINGFUL_CAPTURE_WORDS -> CaptureTextError.TOO_MANY_MEANINGFUL_WORDS
                else -> null
            }
        return CaptureTextValidation(meaningfulWordCount, byteCount, error)
    }

    fun isContextWithinLimit(context: String?): Boolean =
        context == null || context.toByteArray(StandardCharsets.UTF_8).size <= MAX_CAPTURE_TEXT_BYTES

    /**
     * Returns true when [word] appears at least once in [context] as a standalone token.
     * Standalone means the characters immediately before and after the match are non-letters
     * (start/end of string also count as non-letter boundaries).
     * Comparison is case-insensitive.
     */
    fun isStandaloneMatch(
        word: String,
        context: String,
    ): Boolean = findStandaloneMatches(word, context).isNotEmpty()

    /**
     * Returns all [IntRange] positions in [context] where [word] appears as a standalone token.
     * Ranges point into the original [context] string (not the lowercased copy).
     * Comparison is case-insensitive.
     */
    fun findStandaloneMatches(
        word: String,
        context: String,
    ): List<IntRange> {
        if (word.isBlank()) return emptyList()
        // Unicode letter boundaries (not just a-zA-Z) so accented/non-Latin words such as
        // "añadir", "läuft" or "año" are matched (or excluded from "años") correctly.
        val pattern = Regex("(?<!\\p{L})${Regex.escape(word.lowercase())}(?!\\p{L})")
        return pattern.findAll(context.lowercase()).map { it.range }.toList()
    }

    /**
     * Returns true when [context] contains [word] as a standalone token.
     */
    fun isContextValid(
        word: String,
        context: String,
    ): Boolean = isStandaloneMatch(word, context)

    /**
     * Counts the number of sentences in [text] by splitting on '.', '!', and '?'.
     * Empty segments (e.g. trailing punctuation) are not counted.
     */
    fun countSentences(text: String): Int = text.split('.', '!', '?').count { it.isNotBlank() }

    /**
     * Returns the sentence from [context] that contains any standalone occurrence of [word],
     * or null if no such sentence exists.
     * Sentences are delimited by '.', '!', '?'.
     */
    fun extractSentenceContaining(
        word: String,
        context: String,
    ): String? {
        val sentences = context.split(Regex("(?<=[.!?])"))
        return sentences.firstOrNull { sentence -> isStandaloneMatch(word, sentence) }?.trim()
    }

    /**
     * Returns true when the trimmed [text] contains no whitespace — i.e. is a single
     * contiguous non-whitespace token.
     */
    fun isLikelySingleWord(text: String): Boolean = text.trim().none { it.isWhitespace() }

    /**
     * Splits [text] into a list of [Token]s alternating between [Token.Word] and
     * [Token.Separator]. Letter sequences become [Token.Word]; everything else becomes
     * [Token.Separator].
     */
    fun splitIntoTokens(text: String): List<Token> {
        if (text.isEmpty()) return emptyList()
        val result = mutableListOf<Token>()
        val buffer = StringBuilder()

        fun isWordCodePoint(codePoint: Int): Boolean =
            Character.isLetter(codePoint) ||
                Character.getType(codePoint) in
                listOf(
                    Character.NON_SPACING_MARK.toInt(),
                    Character.COMBINING_SPACING_MARK.toInt(),
                    Character.ENCLOSING_MARK.toInt(),
                )
        var inWord = isWordCodePoint(text.codePointAt(0))
        var offset = 0
        while (offset < text.length) {
            val codePoint = text.codePointAt(offset)
            val isLetter = isWordCodePoint(codePoint)
            if (isLetter == inWord) {
                buffer.appendCodePoint(codePoint)
            } else {
                val segment = buffer.toString()
                result.add(if (inWord) Token.Word(segment) else Token.Separator(segment))
                buffer.clear()
                buffer.appendCodePoint(codePoint)
                inWord = isLetter
            }
            offset += Character.charCount(codePoint)
        }
        if (buffer.isNotEmpty()) {
            result.add(if (inWord) Token.Word(buffer.toString()) else Token.Separator(buffer.toString()))
        }
        return result
    }
}
