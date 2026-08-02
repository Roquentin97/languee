package com.example.langueedroid.feature.review.presentation

import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.RevealedWord

enum class ReviewError { LOAD_FAILED, SUBMIT_FAILED, GRADE_FAILED }

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
    ) : ReviewSessionState()

    data class Correct(
        val item: ReviewItem,
        val index: Int,
        val total: Int,
        val matchedForm: String?,
        val revealed: RevealedWord? = null,
    ) : ReviewSessionState()

    data class Revealed(
        val item: ReviewItem,
        val index: Int,
        val total: Int,
        val nextDueAt: String,
        val intervalDays: Int,
    ) : ReviewSessionState()

    data class Finished(val reviewedCount: Int) : ReviewSessionState()

    data class Error(val type: ReviewError) : ReviewSessionState()
}
