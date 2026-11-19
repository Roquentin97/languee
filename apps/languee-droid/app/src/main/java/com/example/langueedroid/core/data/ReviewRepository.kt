package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.RevealedEntry
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.ReviewSummary
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
        runCatchingCancellable {
            val response = reviewsApi.getSummary()
            response.throwIfUnsuccessful(ApiOperation.REVIEW_SUMMARY)
            val body = response.bodyOrThrow(ApiOperation.REVIEW_SUMMARY).toDomain()
            logger.info(
                "review.summary_loaded",
                mapOf(
                    "due_count" to body.dueCount.toString(),
                    "new_count" to body.newCount.toString(),
                ),
            )
            body
        }

    suspend fun queue(
        deckId: String? = null,
        limit: Int = DEFAULT_QUEUE_LIMIT,
    ): Result<List<ReviewItem>> =
        runCatchingCancellable {
            val response = reviewsApi.getQueue(deckId = deckId, limit = limit)
            response.throwIfUnsuccessful(ApiOperation.REVIEW_QUEUE)
            val items =
                response
                    .body()
                    ?.items
                    ?.map { it.toDomain() }
                    .orEmpty()
            logger.info("review.queue_loaded", mapOf("count" to items.size.toString()))
            items
        }

    suspend fun checkAnswer(
        cardId: String,
        typedAnswer: String,
    ): Result<AnswerCheck> =
        runCatchingCancellable {
            val response =
                reviewsApi.checkAnswer(
                    cardId = cardId,
                    body = CheckAnswerRequest(typedAnswer = typedAnswer),
                )
            response.throwIfUnsuccessful(ApiOperation.REVIEW_CHECK_ANSWER)
            val body = response.bodyOrThrow(ApiOperation.REVIEW_CHECK_ANSWER).toDomain()
            logger.info("review.answer_checked", mapOf("result" to body.result.toString()))
            body
        }

    suspend fun checkForms(
        cardId: String,
        typedForms: Map<String, String>,
    ): Result<CheckFormsResponseDto> =
        runCatchingCancellable {
            val response = reviewsApi.checkForms(cardId, CheckFormsRequest(typedForms))
            response.throwIfUnsuccessful(ApiOperation.REVIEW_CHECK_FORMS)
            response.bodyOrThrow(ApiOperation.REVIEW_CHECK_FORMS)
        }

    suspend fun revealDefinition(cardId: String): Result<RevealedEntry> =
        runCatchingCancellable {
            val response = reviewsApi.revealDefinition(cardId)
            response.throwIfUnsuccessful(ApiOperation.REVIEW_REVEAL)
            val body = response.bodyOrThrow(ApiOperation.REVIEW_REVEAL)
            RevealedEntry(
                lemma = body.lemma,
                ipa = null,
                inflectionForms = null,
                definition = body.definition,
            )
        }

    suspend fun grade(
        cardId: String,
        rating: ReviewRating,
        typedAnswer: String? = null,
        typedForms: Map<String, String>? = null,
        answerResult: GradeAnswerResult? = null,
    ): Result<GradeOutcome> =
        runCatchingCancellable {
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
            response.throwIfUnsuccessful(ApiOperation.REVIEW_GRADE)
            val body = response.bodyOrThrow(ApiOperation.REVIEW_GRADE).toDomain()
            logger.info(
                "review.card_graded",
                mapOf("rating" to rating.name, "state" to body.state, "interval_days" to body.intervalDays.toString()),
            )
            body
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
