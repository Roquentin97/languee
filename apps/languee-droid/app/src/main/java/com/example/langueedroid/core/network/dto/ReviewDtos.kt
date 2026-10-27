package com.example.langueedroid.core.network.dto

data class ReviewSummaryDto(
    val dueCount: Int,
    val newCount: Int,
)

data class ReviewPromptDto(
    val definition: String = "",
    val maskedSentence: String? = null,
    val partOfSpeech: String = "",
    val kind: String = "word",
    val lemmaLength: Int = 0,
    val language: String? = "en",
)

data class ReviewDeckDto(
    val id: String = "",
    val name: String = "",
)

data class InflectionReviewDto(
    val lemma: String = "",
    val partOfSpeech: String = "",
    val kind: String = "word",
    val language: String? = "en",
    val formKeys: List<String> = emptyList(),
)

data class DefinitionReviewDto(
    val lemma: String = "",
    val partOfSpeech: String = "",
    val kind: String = "word",
    val language: String? = "en",
    val hint1: List<String>? = null,
    val hint2: String? = null,
)

data class ReviewItemDto(
    val cardId: String,
    val type: String? = null,
    val decks: List<ReviewDeckDto>? = null,
    val isNew: Boolean,
    val cloze: ReviewPromptDto? = null,
    val inflection: InflectionReviewDto? = null,
    val definition: DefinitionReviewDto? = null,
    // Compatibility with the original single-prompt queue response.
    val deckId: String? = null,
    val deckName: String? = null,
    val prompt: ReviewPromptDto? = null,
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
    val revealed: RevealedWordDto? = null,
)

data class CheckFormsRequest(
    val typedForms: Map<String, String>,
)

data class CheckFormsResponseDto(
    val results: Map<String, FormCheckResultDto>,
    val allCorrect: Boolean,
    val revealed: RevealedWordDto,
)

data class FormCheckResultDto(
    val typed: String,
    val expected: String,
    val correct: Boolean,
)

data class GradeRequest(
    val rating: String,
    val typedAnswer: String? = null,
    val typedForms: Map<String, String>? = null,
    val answerResult: String? = null,
)

data class GradeResponseDto(
    val nextDueAt: String,
    val intervalDays: Int,
    val state: String,
)

data class RevealedWordDto(
    val lemma: String,
    val ipa: String?,
    val inflectionForms: Map<String, String>?,
)
