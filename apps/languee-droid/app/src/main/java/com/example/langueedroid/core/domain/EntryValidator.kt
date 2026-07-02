package com.example.langueedroid.core.domain

sealed class Token {
    data class Word(val text: String) : Token()
    data class Separator(val text: String) : Token()
}

object EntryValidator {

    /**
     * Returns true when [word] appears at least once in [context] as a standalone token.
     * Standalone means the characters immediately before and after the match are non-letters
     * (start/end of string also count as non-letter boundaries).
     * Comparison is case-insensitive.
     */
    fun isStandaloneMatch(word: String, context: String): Boolean =
        findStandaloneMatches(word, context).isNotEmpty()

    /**
     * Returns all [IntRange] positions in [context] where [word] appears as a standalone token.
     * Ranges point into the original [context] string (not the lowercased copy).
     * Comparison is case-insensitive.
     */
    fun findStandaloneMatches(word: String, context: String): List<IntRange> {
        if (word.isBlank()) return emptyList()
        // Unicode letter boundaries (not just a-zA-Z) so accented/non-Latin words such as
        // "añadir", "läuft" or "año" are matched (or excluded from "años") correctly.
        val pattern = Regex("(?<!\\p{L})${Regex.escape(word.lowercase())}(?!\\p{L})")
        return pattern.findAll(context.lowercase()).map { it.range }.toList()
    }

    /**
     * Returns true when [context] contains [word] as a standalone token.
     */
    fun isContextValid(word: String, context: String): Boolean =
        isStandaloneMatch(word, context)

    /**
     * Counts the number of sentences in [text] by splitting on '.', '!', and '?'.
     * Empty segments (e.g. trailing punctuation) are not counted.
     */
    fun countSentences(text: String): Int =
        text.split('.', '!', '?').count { it.isNotBlank() }

    /**
     * Returns the sentence from [context] that contains any standalone occurrence of [word],
     * or null if no such sentence exists.
     * Sentences are delimited by '.', '!', '?'.
     */
    fun extractSentenceContaining(word: String, context: String): String? {
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
        var inWord = text.first().isLetter()

        for (ch in text) {
            val isLetter = ch.isLetter()
            if (isLetter == inWord) {
                buffer.append(ch)
            } else {
                val segment = buffer.toString()
                result.add(if (inWord) Token.Word(segment) else Token.Separator(segment))
                buffer.clear()
                buffer.append(ch)
                inWord = isLetter
            }
        }
        if (buffer.isNotEmpty()) {
            result.add(if (inWord) Token.Word(buffer.toString()) else Token.Separator(buffer.toString()))
        }
        return result
    }
}
