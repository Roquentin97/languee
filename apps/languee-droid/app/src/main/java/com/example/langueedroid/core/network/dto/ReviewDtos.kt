package com.example.langueedroid.core.network.dto

data class ReviewSummaryDto(
    val dueCount: Int,
    val newCount: Int,
)

data class ReviewPromptDto(
    val definition: String,
    val example: String?,
    val contextMasked: String?,
    val partOfSpeech: String,
    val kind: String,
    val lemmaLength: Int,
    val language: String? = null,
)

data class ReviewItemDto(
    val cardId: String,
    val deckId: String,
    val deckName: String,
    val isNew: Boolean,
    val prompt: ReviewPromptDto,
)

data class ReviewQueueResponseDto(
    val items: List<ReviewItemDto>,
)

data class CheckAnswerRequest(
    val typedAnswer: String,
)

data class CheckAnswerResponseDto(
    val result: String,
    val matchedForm: String?,
    val hint: String?,
)

data class GradeRequest(
    val rating: String,
    val typedAnswer: String? = null,
    val answerResult: String? = null,
)

data class GradeResponseDto(
    val nextDueAt: String,
    val intervalDays: Int,
    val state: String,
)
