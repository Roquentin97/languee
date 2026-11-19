package com.example.langueedroid.presentation

import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.DefinitionReview
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.LexicalEntryKind
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RevealedEntry
import com.example.langueedroid.core.domain.ReviewCardType
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewPrompt
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.feature.review.presentation.QuestionFeedback
import com.example.langueedroid.feature.review.presentation.ReviewError
import com.example.langueedroid.feature.review.presentation.ReviewRetryAction
import com.example.langueedroid.feature.review.presentation.ReviewSessionState
import com.example.langueedroid.feature.review.presentation.ReviewViewModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.doSuspendableAnswer
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class ReviewViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    private lateinit var reviewRepository: ReviewRepository
    private lateinit var speaker: Speaker

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        reviewRepository = mock()
        speaker = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel(deckId: String? = null) =
        ReviewViewModel(
            deckId = deckId,
            reviewRepository = reviewRepository,
            speaker = speaker,
        )

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aPrompt(kind: LexicalEntryKind = LexicalEntryKind.WORD) =
        ReviewPrompt(
            definition = "To encounter unexpectedly.",
            maskedSentence = "Guess who I ____ at the station!",
            partOfSpeech = "verb",
            kind = kind,
            lemmaLength = 8,
        )

    private fun anItem(
        cardId: String = "card-1",
        isNew: Boolean = false,
    ) = ReviewItem(
        cardId = cardId,
        deckId = "deck-1",
        deckName = "English basics",
        isNew = isNew,
        prompt = aPrompt(),
    )

    private fun aGradeOutcome() =
        GradeOutcome(
            nextDueAt = "2026-07-03T10:00:00.000Z",
            intervalDays = 1,
            state = "review",
        )

    // -------------------------------------------------------------------------
    // loadQueue — items returned → Question for first item
    // -------------------------------------------------------------------------

    @Test
    fun `queue load with items — state transitions to Question`() =
        runTest {
            val item = anItem()
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))

            val vm = buildViewModel()
            advanceUntilIdle()

            val state = vm.state.value
            assertTrue(state is ReviewSessionState.Question)
            assertEquals(item, (state as ReviewSessionState.Question).item)
            assertEquals(1, state.index)
            assertEquals(1, state.total)
            assertEquals(QuestionFeedback.None, state.feedback)
        }

    // -------------------------------------------------------------------------
    // deckId-scoped review — loads the queue filtered to that deck, and retry
    // preserves the scope
    // -------------------------------------------------------------------------

    @Test
    fun `deck-scoped view model — loads queue filtered to that deck`() =
        runTest {
            val item = anItem()
            whenever(reviewRepository.queue(deckId = eq("deck-1"), limit = any())).thenReturn(Result.success(listOf(item)))

            val vm = buildViewModel(deckId = "deck-1")
            advanceUntilIdle()

            assertTrue(vm.state.value is ReviewSessionState.Question)

            whenever(reviewRepository.queue(deckId = eq("deck-1"), limit = any())).thenReturn(
                Result.failure(RuntimeException("network failure")),
            )
            vm.loadQueue()
            advanceUntilIdle()

            assertTrue(vm.state.value is ReviewSessionState.Error)

            whenever(reviewRepository.queue(deckId = eq("deck-1"), limit = any())).thenReturn(Result.success(listOf(item)))
            vm.retry()
            advanceUntilIdle()

            assertTrue(vm.state.value is ReviewSessionState.Question)
        }

    // -------------------------------------------------------------------------
    // loadQueue — empty list → Empty
    // -------------------------------------------------------------------------

    @Test
    fun `queue load with no items — state transitions to Empty`() =
        runTest {
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(emptyList()))

            val vm = buildViewModel()
            advanceUntilIdle()

            assertEquals(ReviewSessionState.Empty, vm.state.value)
        }

    @Test
    fun `definition reveal returns saved meaning without grading and keeps self-rating`() =
        runTest {
            val item =
                anItem().copy(
                    type = ReviewCardType.DEFINITION,
                    definition = DefinitionReview(lemma = "run into", hint1 = null, hint2 = null),
                    prompt = aPrompt().copy(definition = "What does run into mean?", maskedSentence = null),
                )
            val revealed =
                RevealedEntry(
                    lemma = "run into",
                    ipa = null,
                    inflectionForms = null,
                    definition = "To encounter unexpectedly.",
                )
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.revealDefinition("card-1")).thenReturn(Result.success(revealed))
            whenever(
                reviewRepository.grade(
                    cardId = eq("card-1"),
                    rating = eq(ReviewRating.GOOD),
                    typedAnswer = anyOrNull(),
                    typedForms = anyOrNull(),
                    answerResult = anyOrNull(),
                ),
            ).thenReturn(Result.success(aGradeOutcome()))

            val vm = buildViewModel()
            advanceUntilIdle()
            vm.submitAnswer()
            advanceUntilIdle()
            assertTrue(vm.state.value is ReviewSessionState.Question)
            vm.reveal()
            advanceUntilIdle()

            val revealedState = vm.state.value as ReviewSessionState.Correct
            assertEquals("To encounter unexpectedly.", revealedState.revealed?.definition)
            verify(reviewRepository, never()).grade(
                cardId = any(),
                rating = any(),
                typedAnswer = anyOrNull(),
                typedForms = anyOrNull(),
                answerResult = anyOrNull(),
            )

            vm.grade(ReviewRating.GOOD)
            advanceUntilIdle()
            assertTrue(vm.state.value is ReviewSessionState.Finished)
            verify(reviewRepository).grade("card-1", ReviewRating.GOOD, null, null, null)
        }

    // -------------------------------------------------------------------------
    // submitAnswer — correct → Correct state, then grade advances to next item
    // -------------------------------------------------------------------------

    @Test
    fun `correct answer then grade — moves to Correct then advances to next item`() =
        runTest {
            val item1 = anItem(cardId = "card-1")
            val item2 = anItem(cardId = "card-2")
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item1, item2)))
            whenever(reviewRepository.checkAnswer(cardId = "card-1", typedAnswer = "come across")).thenReturn(
                Result.success(AnswerCheck(result = AnswerResult.CORRECT, matchedForm = "come across")),
            )
            whenever(
                reviewRepository.grade(
                    cardId = eq("card-1"),
                    rating = eq(ReviewRating.GOOD),
                    typedAnswer = anyOrNull(),
                    typedForms = anyOrNull(),
                    answerResult = eq(GradeAnswerResult.CORRECT),
                ),
            ).thenReturn(Result.success(aGradeOutcome()))

            val vm = buildViewModel()
            advanceUntilIdle()

            vm.updateInput("come across")
            vm.submitAnswer()
            advanceUntilIdle()

            val correctState = vm.state.value
            assertTrue(correctState is ReviewSessionState.Correct)
            assertEquals("come across", (correctState as ReviewSessionState.Correct).matchedForm)

            vm.grade(ReviewRating.GOOD)
            advanceUntilIdle()

            val nextState = vm.state.value
            assertTrue(nextState is ReviewSessionState.Question)
            assertEquals(item2, (nextState as ReviewSessionState.Question).item)
            assertEquals(2, nextState.index)
        }

    @Test
    fun `correct answer carries the revealed word details into the Correct state`() =
        runTest {
            val item = anItem(cardId = "card-1")
            val revealed =
                RevealedEntry(
                    lemma = "come across",
                    ipa = "/kʌm əˈkɹɒs/",
                    inflectionForms = mapOf("type" to "verb", "past" to "came across"),
                )
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.checkAnswer(cardId = "card-1", typedAnswer = "come across")).thenReturn(
                Result.success(
                    AnswerCheck(result = AnswerResult.CORRECT, matchedForm = "come across", revealed = revealed),
                ),
            )

            val vm = buildViewModel()
            advanceUntilIdle()

            vm.updateInput("come across")
            vm.submitAnswer()
            advanceUntilIdle()

            val correctState = vm.state.value
            assertTrue(correctState is ReviewSessionState.Correct)
            assertEquals(revealed, (correctState as ReviewSessionState.Correct).revealed)
        }

    // -------------------------------------------------------------------------
    // submitAnswer — incorrect → feedback shown, input cleared, then reveal grades
    // again+revealed and moves to Revealed
    // -------------------------------------------------------------------------

    @Test
    fun `incorrect answer then reveal — grades again and revealed, moves to Revealed`() =
        runTest {
            val item = anItem(cardId = "card-1")
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.checkAnswer(cardId = "card-1", typedAnswer = "wrong")).thenReturn(
                Result.success(AnswerCheck(result = AnswerResult.INCORRECT, matchedForm = null)),
            )

            val vm = buildViewModel()
            advanceUntilIdle()

            vm.updateInput("wrong")
            vm.submitAnswer()
            advanceUntilIdle()

            val incorrectState = vm.state.value
            assertTrue(incorrectState is ReviewSessionState.Question)
            val question = incorrectState as ReviewSessionState.Question
            assertEquals(QuestionFeedback.Incorrect, question.feedback)
            assertEquals("", question.typedAnswer)

            whenever(
                reviewRepository.grade(
                    cardId = eq("card-1"),
                    rating = eq(ReviewRating.AGAIN),
                    typedAnswer = anyOrNull(),
                    typedForms = anyOrNull(),
                    answerResult = eq(GradeAnswerResult.REVEALED),
                ),
            ).thenReturn(Result.success(aGradeOutcome()))

            vm.reveal()
            advanceUntilIdle()

            val revealedState = vm.state.value
            assertTrue(revealedState is ReviewSessionState.Revealed)
            assertEquals("2026-07-03T10:00:00.000Z", (revealedState as ReviewSessionState.Revealed).nextDueAt)
            assertEquals(1, revealedState.intervalDays)
        }

    // -------------------------------------------------------------------------
    // grade on last item — Finished with reviewedCount
    // -------------------------------------------------------------------------

    @Test
    fun `grading the last item — moves to Finished with reviewed count`() =
        runTest {
            val item = anItem(cardId = "card-1")
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.checkAnswer(cardId = "card-1", typedAnswer = "come across")).thenReturn(
                Result.success(AnswerCheck(result = AnswerResult.CORRECT, matchedForm = "come across")),
            )
            whenever(
                reviewRepository.grade(
                    cardId = eq("card-1"),
                    rating = eq(ReviewRating.GOOD),
                    typedAnswer = anyOrNull(),
                    typedForms = anyOrNull(),
                    answerResult = eq(GradeAnswerResult.CORRECT),
                ),
            ).thenReturn(Result.success(aGradeOutcome()))

            val vm = buildViewModel()
            advanceUntilIdle()

            vm.updateInput("come across")
            vm.submitAnswer()
            advanceUntilIdle()
            vm.grade(ReviewRating.GOOD)
            advanceUntilIdle()

            val state = vm.state.value
            assertTrue(state is ReviewSessionState.Finished)
            assertEquals(1, (state as ReviewSessionState.Finished).reviewedCount)
        }

    // -------------------------------------------------------------------------
    // Revealed — next() advances past the last item to Finished, counting the reveal
    // -------------------------------------------------------------------------

    @Test
    fun `next after reveal on last item — moves to Finished counting the revealed card`() =
        runTest {
            val item = anItem(cardId = "card-1")
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.checkAnswer(cardId = "card-1", typedAnswer = "wrong")).thenReturn(
                Result.success(AnswerCheck(result = AnswerResult.INCORRECT, matchedForm = null)),
            )
            whenever(
                reviewRepository.grade(
                    cardId = eq("card-1"),
                    rating = eq(ReviewRating.AGAIN),
                    typedAnswer = anyOrNull(),
                    typedForms = anyOrNull(),
                    answerResult = eq(GradeAnswerResult.REVEALED),
                ),
            ).thenReturn(Result.success(aGradeOutcome()))

            val vm = buildViewModel()
            advanceUntilIdle()

            vm.updateInput("wrong")
            vm.submitAnswer()
            advanceUntilIdle()
            vm.reveal()
            advanceUntilIdle()
            vm.next()
            advanceUntilIdle()

            val state = vm.state.value
            assertTrue(state is ReviewSessionState.Finished)
            assertEquals(1, (state as ReviewSessionState.Finished).reviewedCount)
        }

    // -------------------------------------------------------------------------
    // loadQueue — repository failure → Error, retry recovers
    // -------------------------------------------------------------------------

    @Test
    fun `queue load failure — Error state shown, retry recovers`() =
        runTest {
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(
                Result.failure(RuntimeException("network failure")),
            )

            val vm = buildViewModel()
            advanceUntilIdle()

            val errorState = vm.state.value
            assertTrue(errorState is ReviewSessionState.Error)
            assertEquals(ReviewError.LOAD_FAILED, (errorState as ReviewSessionState.Error).type)

            val item = anItem()
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            vm.retry()
            advanceUntilIdle()

            assertTrue(vm.state.value is ReviewSessionState.Question)
        }

    @Test
    fun `answer check failure preserves typed answer and safely retries same request`() =
        runTest {
            val item = anItem()
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.checkAnswer(cardId = any(), typedAnswer = any())).thenReturn(
                Result.failure(IOException("timeout")),
                Result.success(AnswerCheck(result = AnswerResult.CORRECT, matchedForm = "come across")),
            )

            val vm = buildViewModel()
            advanceUntilIdle()
            vm.updateInput("come across")
            vm.submitAnswer()
            advanceUntilIdle()

            val error = vm.state.value as ReviewSessionState.Error
            assertEquals(ReviewError.SUBMIT_FAILED, error.type)
            assertEquals(RemoteFailureKind.CONNECTION, error.failureKind)
            assertEquals(ReviewRetryAction.SUBMIT_TEXT, error.retryAction)
            assertEquals("come across", error.previousQuestion?.typedAnswer)

            vm.retry()
            advanceUntilIdle()

            val state = vm.state.value
            assertTrue(state is ReviewSessionState.Correct)
            verify(reviewRepository, org.mockito.kotlin.times(2)).checkAnswer("card-1", "come across")
        }

    @Test
    fun `delayed answer retry ignores duplicate taps and stale completion after queue reload`() =
        runTest {
            val original = anItem(cardId = "card-1")
            val reloaded = anItem(cardId = "card-2")
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(
                Result.success(listOf(original)),
                Result.success(listOf(reloaded)),
            )
            whenever(reviewRepository.checkAnswer(cardId = any(), typedAnswer = any())).thenReturn(
                Result.failure(IOException("timeout")),
            )

            val vm = buildViewModel()
            advanceUntilIdle()
            vm.updateInput("come across")
            vm.submitAnswer()
            advanceUntilIdle()
            assertTrue(vm.state.value is ReviewSessionState.Error)

            val delayedResult = CompletableDeferred<Result<AnswerCheck>>()
            whenever(reviewRepository.checkAnswer(cardId = any(), typedAnswer = any()))
                .doSuspendableAnswer { delayedResult.await() }
            vm.retry()
            runCurrent()

            val retrying = vm.state.value as ReviewSessionState.Error
            assertTrue(retrying.retryInProgress)
            vm.retry()
            runCurrent()
            verify(reviewRepository, times(2)).checkAnswer("card-1", "come across")

            vm.loadQueue()
            advanceUntilIdle()
            val newQuestion = vm.state.value as ReviewSessionState.Question
            assertEquals("card-2", newQuestion.item.cardId)

            delayedResult.complete(
                Result.success(AnswerCheck(result = AnswerResult.CORRECT, matchedForm = "come across")),
            )
            advanceUntilIdle()

            val finalQuestion = vm.state.value as ReviewSessionState.Question
            assertEquals("card-2", finalQuestion.item.cardId)
            verify(reviewRepository, times(2)).checkAnswer("card-1", "come across")
        }

    @Test
    fun `grade failure is not automatically retryable`() =
        runTest {
            val item = anItem()
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(item)))
            whenever(reviewRepository.checkAnswer(cardId = any(), typedAnswer = any())).thenReturn(
                Result.success(AnswerCheck(result = AnswerResult.CORRECT, matchedForm = "come across")),
            )
            whenever(
                reviewRepository.grade(
                    cardId = any(),
                    rating = any(),
                    typedAnswer = anyOrNull(),
                    typedForms = anyOrNull(),
                    answerResult = anyOrNull(),
                ),
            ).thenReturn(Result.failure(IOException("timeout")))

            val vm = buildViewModel()
            advanceUntilIdle()
            vm.updateInput("come across")
            vm.submitAnswer()
            advanceUntilIdle()
            vm.grade(ReviewRating.GOOD)
            advanceUntilIdle()

            val error = vm.state.value as ReviewSessionState.Error
            assertEquals(ReviewError.GRADE_FAILED, error.type)
            assertEquals(null, error.retryAction)
        }

    // -------------------------------------------------------------------------
    // loadQueue — 401 → unauthorizedEvent emitted
    // -------------------------------------------------------------------------

    @Test
    fun `queue load 401 — unauthorizedEvent is emitted`() =
        runTest {
            // Init the VM with a successful response so init's coroutine completes without
            // emitting before a subscriber is attached (unauthorizedEvent has replay = 0).
            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(Result.success(listOf(anItem())))
            val vm = buildViewModel()
            advanceUntilIdle()

            whenever(reviewRepository.queue(deckId = anyOrNull(), limit = any())).thenReturn(
                Result.failure(UnauthorizedException()),
            )
            var unauthorizedCalled = false
            val job =
                launch {
                    vm.unauthorizedEvent.first()
                    unauthorizedCalled = true
                }
            vm.loadQueue()
            advanceUntilIdle()
            job.cancel()

            assertTrue(unauthorizedCalled)
        }
}
