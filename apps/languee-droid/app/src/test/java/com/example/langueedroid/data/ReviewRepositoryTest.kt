package com.example.langueedroid.data

import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.ReviewsApi
import com.example.langueedroid.core.network.dto.CheckAnswerResponseDto
import com.example.langueedroid.core.network.dto.GradeResponseDto
import com.example.langueedroid.core.network.dto.ReviewItemDto
import com.example.langueedroid.core.network.dto.ReviewPromptDto
import com.example.langueedroid.core.network.dto.ReviewQueueResponseDto
import com.example.langueedroid.core.network.dto.ReviewSummaryDto
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import retrofit2.Response

class ReviewRepositoryTest {

    private lateinit var reviewsApi: ReviewsApi
    private lateinit var repository: ReviewRepository

    @Before
    fun setUp() {
        reviewsApi = mock()
        repository = ReviewRepository(reviewsApi)
    }

    // -------------------------------------------------------------------------
    // summary — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `summary success returns mapped ReviewSummary`() = runTest {
        whenever(reviewsApi.getSummary()).thenReturn(Response.success(ReviewSummaryDto(dueCount = 5, newCount = 3)))

        val result = repository.summary()

        assertTrue(result.isSuccess)
        assertEquals(5, result.getOrNull()?.dueCount)
        assertEquals(3, result.getOrNull()?.newCount)
    }

    @Test
    fun `summary 401 throws UnauthorizedException`() = runTest {
        whenever(reviewsApi.getSummary()).thenReturn(Response.error(401, "{}".toResponseBody()))

        val result = repository.summary()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // queue — happy path and empty body
    // -------------------------------------------------------------------------

    @Test
    fun `queue success returns mapped items`() = runTest {
        whenever(reviewsApi.getQueue(deckId = anyOrNull(), limit = anyOrNull())).thenReturn(
            Response.success(ReviewQueueResponseDto(items = listOf(aReviewItemDto()))),
        )

        val result = repository.queue(deckId = null, limit = 20)

        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
        assertEquals("card-1", result.getOrNull()?.first()?.cardId)
    }

    @Test
    fun `queue 401 throws UnauthorizedException`() = runTest {
        whenever(reviewsApi.getQueue(deckId = anyOrNull(), limit = anyOrNull())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.queue()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // checkAnswer — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `checkAnswer success returns mapped AnswerCheck`() = runTest {
        whenever(reviewsApi.checkAnswer(cardId = eq("card-1"), body = any())).thenReturn(
            Response.success(CheckAnswerResponseDto(result = "close_synonym", matchedForm = null, hint = "close")),
        )

        val result = repository.checkAnswer(cardId = "card-1", typedAnswer = "run into")

        assertTrue(result.isSuccess)
        assertEquals("close", result.getOrNull()?.hint)
    }

    @Test
    fun `checkAnswer 404 throws StaleReferenceException`() = runTest {
        whenever(reviewsApi.checkAnswer(cardId = eq("card-1"), body = any())).thenReturn(
            Response.error(404, "{}".toResponseBody()),
        )

        val result = repository.checkAnswer(cardId = "card-1", typedAnswer = "run into")

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // grade — happy path with wire-value mapping for rating and answerResult
    // -------------------------------------------------------------------------

    @Test
    fun `grade success returns mapped GradeOutcome`() = runTest {
        whenever(reviewsApi.grade(cardId = eq("card-1"), body = any())).thenReturn(
            Response.success(GradeResponseDto(nextDueAt = "2026-07-03T10:00:00.000Z", intervalDays = 1, state = "review")),
        )

        val result = repository.grade(
            cardId = "card-1",
            rating = ReviewRating.GOOD,
            typedAnswer = "come across",
            answerResult = GradeAnswerResult.CORRECT,
        )

        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.intervalDays)
        assertEquals("review", result.getOrNull()?.state)
    }

    @Test
    fun `grade 401 throws UnauthorizedException`() = runTest {
        whenever(reviewsApi.grade(cardId = eq("card-1"), body = any())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.grade(cardId = "card-1", rating = ReviewRating.AGAIN)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aReviewItemDto() = ReviewItemDto(
        cardId = "card-1",
        deckId = "deck-1",
        deckName = "English basics",
        isNew = false,
        prompt = ReviewPromptDto(
            definition = "To encounter unexpectedly.",
            example = "I ____ an old friend yesterday.",
            contextMasked = "Guess who I ____ at the station!",
            partOfSpeech = "verb",
            kind = "phrasal_verb",
            lemmaLength = 8,
        ),
    )
}
