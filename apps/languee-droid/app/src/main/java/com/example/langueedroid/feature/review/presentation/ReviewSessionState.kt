package com.example.langueedroid.feature.review.presentation

import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RevealedEntry
import com.example.langueedroid.core.domain.ReviewItem

enum class ReviewError { LOAD_FAILED, SUBMIT_FAILED, GRADE_FAILED }

enum class ReviewRetryAction { LOAD_QUEUE, SUBMIT_TEXT, SUBMIT_FORMS, REVEAL_DEFINITION }

sealed class QuestionFeedback {
    object None : QuestionFeedback()

    object Incorrect : QuestionFeedback()
}

sealed class ReviewSessionState {
    object Loading : ReviewSessionState()

    object Empty : ReviewSessionState()

    data class Question(
        val item: ReviewItem,
        val index: Int,
        val total: Int,
        val typedAnswer: String,
        val feedback: QuestionFeedback,
        val typedForms: Map<String, String> = emptyMap(),
    ) : ReviewSessionState()

    data class Correct(
        val item: ReviewItem,
        val index: Int,
        val total: Int,
        val matchedForm: String?,
        val revealed: RevealedEntry? = null,
        val typedForms: Map<String, String>? = null,
    ) : ReviewSessionState()

    data class Revealed(
        val item: ReviewItem,
        val index: Int,
        val total: Int,
        val nextDueAt: String,
        val intervalDays: Int,
    ) : ReviewSessionState()

    data class Finished(
        val reviewedCount: Int,
    ) : ReviewSessionState()

    data class Error(
        val type: ReviewError,
        val failureKind: RemoteFailureKind? = null,
        val retryAction: ReviewRetryAction? = null,
        val previousQuestion: Question? = null,
        val retryInProgress: Boolean = false,
    ) : ReviewSessionState()
}
