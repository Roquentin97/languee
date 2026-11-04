package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.RevealedWord
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.ReviewSummary
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.ReviewsApi
import com.example.langueedroid.core.network.dto.CheckAnswerRequest
import com.example.langueedroid.core.network.dto.CheckFormsRequest
import com.example.langueedroid.core.network.dto.CheckFormsResponseDto
import com.example.langueedroid.core.network.dto.GradeRequest
import com.example.langueedroid.core.telemetry.Logger

private const val DEFAULT_QUEUE_LIMIT = 20

class ReviewRepository(
    private val reviewsApi: ReviewsApi,
    private val logger: Logger,
) {
    suspend fun summary(): Result<ReviewSummary> =
        runCatching {
            val response = reviewsApi.getSummary()
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toDomain()
                            ?: throw Exception("Empty response body from review summary")
                    logger.info(
                        "review.summary_loaded",
                        mapOf(
                            "due_count" to body.dueCount.toString(),
                            "new_count" to body.newCount.toString(),
                        ),
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
                    logger.info("review.queue_loaded", mapOf("count" to items.size.toString()))
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
                    logger.info("review.answer_checked", mapOf("result" to body.result.toString()))
                    body
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                else -> throw Exception("Failed to check review answer: HTTP ${response.code()}")
            }
        }

    suspend fun checkForms(
        cardId: String,
        typedForms: Map<String, String>,
    ): Result<CheckFormsResponseDto> =
        runCatching {
            val response = reviewsApi.checkForms(cardId, CheckFormsRequest(typedForms))
            when {
                response.isSuccessful -> response.body() ?: throw Exception("Empty response body from review forms check")
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                else -> throw Exception("Failed to check review forms: HTTP ${response.code()}")
            }
        }

    suspend fun revealDefinition(cardId: String): Result<RevealedWord> =
        runCatching {
            val response = reviewsApi.revealDefinition(cardId)
            when {
                response.isSuccessful -> {
                    val body = response.body() ?: throw Exception("Empty response body from definition reveal")
                    RevealedWord(
                        lemma = body.lemma,
                        ipa = null,
                        inflectionForms = null,
                        definition = body.definition,
                    )
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                else -> throw Exception("Failed to reveal definition: HTTP ${response.code()}")
            }
        }

    suspend fun grade(
        cardId: String,
        rating: ReviewRating,
        typedAnswer: String? = null,
        typedForms: Map<String, String>? = null,
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
                            typedForms = typedForms,
                            answerResult = answerResult?.toWireValue(),
                        ),
                )
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toDomain()
                            ?: throw Exception("Empty response body from review grade")
                    logger.info(
                        "review.card_graded",
                        mapOf("rating" to rating.name, "state" to body.state, "interval_days" to body.intervalDays.toString()),
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
