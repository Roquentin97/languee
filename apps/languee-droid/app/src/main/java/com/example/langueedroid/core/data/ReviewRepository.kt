package com.example.langueedroid.core.data

import android.util.Log
import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.ReviewSummary
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.ReviewsApi
import com.example.langueedroid.core.network.dto.CheckAnswerRequest
import com.example.langueedroid.core.network.dto.GradeRequest

private const val TAG = "ReviewRepository"
private const val DEFAULT_QUEUE_LIMIT = 20

class ReviewRepository(
    private val reviewsApi: ReviewsApi,
) {
    suspend fun summary(): Result<ReviewSummary> =
        runCatching {
            val response = reviewsApi.getSummary()
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toDomain()
                            ?: throw Exception("Empty response body from review summary")
                    Log.i(
                        TAG,
                        "[event=review.summary_loaded method=summary] summary loaded | dueCount=${body.dueCount} newCount=${body.newCount}",
                    )
                    body
                }
                response.code() == 401 -> throw UnauthorizedException()
                else -> throw Exception("Failed to fetch review summary: HTTP ${response.code()}")
            }
        }

    suspend fun queue(
        deckId: String? = null,
        limit: Int = DEFAULT_QUEUE_LIMIT,
    ): Result<List<ReviewItem>> =
        runCatching {
            val response = reviewsApi.getQueue(deckId = deckId, limit = limit)
            when {
                response.isSuccessful -> {
                    val items = response.body()?.items?.map { it.toDomain() } ?: emptyList()
                    Log.i(TAG, "[event=review.queue_loaded method=queue] queue loaded | count=${items.size}")
                    items
                }
                response.code() == 401 -> throw UnauthorizedException()
                else -> throw Exception("Failed to fetch review queue: HTTP ${response.code()}")
            }
        }

    suspend fun checkAnswer(
        cardId: String,
        typedAnswer: String,
    ): Result<AnswerCheck> =
        runCatching {
            val response =
                reviewsApi.checkAnswer(
                    cardId = cardId,
                    body = CheckAnswerRequest(typedAnswer = typedAnswer),
                )
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toDomain()
                            ?: throw Exception("Empty response body from review answer check")
                    Log.i(TAG, "[event=review.answer_checked method=checkAnswer] answer checked | cardId=$cardId result=${body.result}")
                    body
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                else -> throw Exception("Failed to check review answer: HTTP ${response.code()}")
            }
        }

    suspend fun grade(
        cardId: String,
        rating: ReviewRating,
        typedAnswer: String? = null,
        answerResult: GradeAnswerResult? = null,
    ): Result<GradeOutcome> =
        runCatching {
            val response =
                reviewsApi.grade(
                    cardId = cardId,
                    body =
                        GradeRequest(
                            rating = rating.toWireValue(),
                            typedAnswer = typedAnswer,
                            answerResult = answerResult?.toWireValue(),
                        ),
                )
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toDomain()
                            ?: throw Exception("Empty response body from review grade")
                    Log.i(
                        TAG,
                        "[event=review.card_graded method=grade] card graded | cardId=$cardId rating=$rating state=${body.state} intervalDays=${body.intervalDays}",
                    )
                    body
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                else -> throw Exception("Failed to grade review: HTTP ${response.code()}")
            }
        }

    private fun ReviewRating.toWireValue(): String =
        when (this) {
            ReviewRating.AGAIN -> "again"
            ReviewRating.HARD -> "hard"
            ReviewRating.GOOD -> "good"
            ReviewRating.EASY -> "easy"
        }

    private fun GradeAnswerResult.toWireValue(): String =
        when (this) {
            GradeAnswerResult.CORRECT -> "correct"
            GradeAnswerResult.INCORRECT -> "incorrect"
            GradeAnswerResult.REVEALED -> "revealed"
        }
}
