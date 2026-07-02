package com.example.langueedroid.core.domain

enum class LexicalKind { WORD, PHRASAL_VERB, EXPRESSION }

data class ReviewSummary(
    val dueCount: Int,
    val newCount: Int,
)

data class ReviewPrompt(
    val definition: String,
    val example: String?,
    val contextMasked: String?,
    val partOfSpeech: String,
    val kind: LexicalKind,
    val lemmaLength: Int,
)

data class ReviewItem(
    val cardId: String,
    val deckId: String,
    val deckName: String,
    val isNew: Boolean,
    val prompt: ReviewPrompt,
)

enum class AnswerResult { CORRECT, CLOSE_SYNONYM, INCORRECT }

data class AnswerCheck(
    val result: AnswerResult,
    val matchedForm: String?,
    val hint: String?,
)

enum class ReviewRating { AGAIN, HARD, GOOD, EASY }

/**
 * Wire-level result carried on a grade request. Mirrors [AnswerResult] but adds REVEALED,
 * which the answer-check endpoint never returns — it only exists as a grade-time signal
 * for cards the user gave up on via the Reveal action.
 */
enum class GradeAnswerResult { CORRECT, CLOSE_SYNONYM, INCORRECT, REVEALED }

data class GradeOutcome(
    val nextDueAt: String,
    val intervalDays: Int,
    val state: String,
)
