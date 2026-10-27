package com.example.langueedroid.core.network.dto

data class ReviewSummaryDto(
    val dueCount: Int,
    val newCount: Int,
)

data class ReviewPromptDto(
    val definition: String,
    val maskedSentence: String?,
    val partOfSpeech: String,
    val kind: String,
    val lemmaLength: Int,
    val language: String,
)

data class ReviewDeckDto(
    val id: String = "",
    val name: String = "",
)

data class InflectionReviewDto(
    val lemma: String,
    val partOfSpeech: String,
    val kind: String,
    val language: String,
    val formKeys: List<String>,
)

data class DefinitionReviewDto(
    val lemma: String,
    val partOfSpeech: String,
    val kind: String,
    val language: String,
    val hint1: List<String>?,
    val hint2: String?,
)

data class ReviewItemDto(
    val cardId: String,
    val type: String,
    val decks: List<ReviewDeckDto>,
    val isNew: Boolean,
    val cloze: ReviewPromptDto?,
    val inflection: InflectionReviewDto?,
    val definition: DefinitionReviewDto?,
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
