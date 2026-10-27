package com.example.langueedroid.feature.review.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.RevealedWord
import com.example.langueedroid.core.domain.ReviewCardType
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val DEFAULT_LIMIT = 20

/**
 * [deckId] scopes the review queue to a single deck (started from a deck tap on the
 * decks screen). When null, the queue spans all decks (started from the global review
 * entry point on the decks screen top bar).
 */
@HiltViewModel(assistedFactory = ReviewViewModel.Factory::class)
class ReviewViewModel
    @AssistedInject
    constructor(
        @Assisted private val deckId: String?,
        private val reviewRepository: ReviewRepository,
        val speaker: Speaker,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(deckId: String?): ReviewViewModel
        }

        private val _state = MutableStateFlow<ReviewSessionState>(ReviewSessionState.Loading)
        val state: StateFlow<ReviewSessionState> = _state.asStateFlow()

        private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

        private var queue: List<ReviewItem> = emptyList()
        private var currentIndex: Int = 0
        private var reviewedCount: Int = 0
        private var lastDeckId: String? = deckId
        private var lastLimit: Int = DEFAULT_LIMIT

        private var actionJob: Job? = null

        init {
            loadQueue(deckId = deckId)
        }

        fun loadQueue(
            deckId: String? = lastDeckId,
            limit: Int = DEFAULT_LIMIT,
        ) {
            lastDeckId = deckId
            lastLimit = limit
            _state.value = ReviewSessionState.Loading
            viewModelScope.launch {
                reviewRepository.queue(deckId = deckId, limit = limit).fold(
                    onSuccess = { items ->
                        queue = items
                        currentIndex = 0
                        reviewedCount = 0
                        _state.value =
                            if (items.isEmpty()) {
                                ReviewSessionState.Empty
                            } else {
                                questionStateFor(items[0])
                            }
                    },
                    onFailure = { error -> handleFailure(error, ReviewError.LOAD_FAILED) },
                )
            }
        }

        fun updateInput(text: String) {
            val current = _state.value as? ReviewSessionState.Question ?: return
            _state.value = current.copy(typedAnswer = text)
        }

        fun updateFormInput(
            key: String,
            text: String,
        ) {
            val current = _state.value as? ReviewSessionState.Question ?: return
            _state.value = current.copy(typedForms = current.typedForms + (key to text))
        }

        fun submitAnswer() {
            val current = _state.value as? ReviewSessionState.Question ?: return
            if (actionJob?.isActive == true) return
            if (current.item.type == ReviewCardType.DEFINITION) {
                return
            }
            if (current.item.type == ReviewCardType.INFLECTION &&
                current.item.inflection
                    ?.formKeys
                    .isNullOrEmpty()
            ) {
                showSelfRatedAnswer(current)
                return
            }
            actionJob =
                viewModelScope.launch {
                    if (current.item.type == ReviewCardType.INFLECTION) {
                        reviewRepository
                            .checkForms(
                                cardId = current.item.cardId,
                                typedForms =
                                    current.item.inflection!!
                                        .formKeys
                                        .associateWith { current.typedForms[it].orEmpty() },
                            ).fold(
                                onSuccess = { response ->
                                    _state.value =
                                        ReviewSessionState.Correct(
                                            item = current.item,
                                            index = current.index,
                                            total = current.total,
                                            matchedForm = null,
                                            revealed = response.revealed.toDomain(),
                                            typedForms = current.typedForms,
                                        )
                                },
                                onFailure = { error -> handleFailure(error, ReviewError.SUBMIT_FAILED) },
                            )
                    } else {
                        reviewRepository
                            .checkAnswer(
                                cardId = current.item.cardId,
                                typedAnswer = current.typedAnswer,
                            ).fold(
                                onSuccess = { check ->
                                    _state.value =
                                        when (check.result) {
                                            AnswerResult.CORRECT ->
                                                ReviewSessionState.Correct(
                                                    item = current.item,
                                                    index = current.index,
                                                    total = current.total,
                                                    matchedForm = check.matchedForm,
                                                    revealed = check.revealed,
                                                )
                                            AnswerResult.INCORRECT ->
                                                current.copy(
                                                    typedAnswer = "",
                                                    feedback = QuestionFeedback.Incorrect,
                                                )
                                        }
                                },
                                onFailure = { error -> handleFailure(error, ReviewError.SUBMIT_FAILED) },
                            )
                    }
                }
        }

        private fun showSelfRatedAnswer(current: ReviewSessionState.Question) {
            val lemma = current.item.definition?.lemma ?: current.item.inflection?.lemma ?: current.item.prompt.definition
            _state.value =
                ReviewSessionState.Correct(
                    item = current.item,
                    index = current.index,
                    total = current.total,
                    matchedForm = current.typedAnswer.ifBlank { null },
                    revealed = RevealedWord(lemma = lemma, ipa = null, inflectionForms = null),
                    typedForms = current.typedForms.takeIf { it.isNotEmpty() },
                )
        }

        fun reveal() {
            val current = _state.value as? ReviewSessionState.Question ?: return
            if (actionJob?.isActive == true) return
            if (current.item.type == ReviewCardType.INFLECTION) {
                submitAnswer()
                return
            }
            if (current.item.type == ReviewCardType.DEFINITION) {
                actionJob =
                    viewModelScope.launch {
                        reviewRepository.revealDefinition(current.item.cardId).fold(
                            onSuccess = { revealed ->
                                _state.value =
                                    ReviewSessionState.Correct(
                                        item = current.item,
                                        index = current.index,
                                        total = current.total,
                                        matchedForm = null,
                                        revealed = revealed,
                                    )
                            },
                            onFailure = { error -> handleFailure(error, ReviewError.SUBMIT_FAILED) },
                        )
                    }
                return
            }
            actionJob =
                viewModelScope.launch {
                    reviewRepository
                        .grade(
                            cardId = current.item.cardId,
                            rating = ReviewRating.AGAIN,
                            typedAnswer = current.typedAnswer.ifBlank { null },
                            answerResult = GradeAnswerResult.REVEALED,
                        ).fold(
                            onSuccess = { outcome ->
                                reviewedCount += 1
                                _state.value =
                                    ReviewSessionState.Revealed(
                                        item = current.item,
                                        index = current.index,
                                        total = current.total,
                                        nextDueAt = outcome.nextDueAt,
                                        intervalDays = outcome.intervalDays,
                                    )
                            },
                            onFailure = { error -> handleFailure(error, ReviewError.GRADE_FAILED) },
                        )
                }
        }

        fun grade(rating: ReviewRating) {
            val current = _state.value as? ReviewSessionState.Correct ?: return
            if (actionJob?.isActive == true) return
            actionJob =
                viewModelScope.launch {
                    reviewRepository
                        .grade(
                            cardId = current.item.cardId,
                            rating = rating,
                            answerResult =
                                if (current.item.type == ReviewCardType.DEFINITION) {
                                    null
                                } else {
                                    GradeAnswerResult.CORRECT
                                },
                            typedForms = current.typedForms?.takeIf { it.isNotEmpty() },
                        ).fold(
                            onSuccess = {
                                reviewedCount += 1
                                advance()
                            },
                            onFailure = { error -> handleFailure(error, ReviewError.GRADE_FAILED) },
                        )
                }
        }

        fun next() {
            if (_state.value !is ReviewSessionState.Revealed) return
            advance()
        }

        fun retry() {
            loadQueue(deckId = lastDeckId, limit = lastLimit)
        }

        private fun advance() {
            val newIndex = currentIndex + 1
            _state.value =
                if (newIndex >= queue.size) {
                    ReviewSessionState.Finished(reviewedCount)
                } else {
                    currentIndex = newIndex
                    questionStateFor(queue[newIndex])
                }
        }

        private fun questionStateFor(item: ReviewItem): ReviewSessionState.Question =
            ReviewSessionState.Question(
                item = item,
                index = currentIndex + 1,
                total = queue.size,
                typedAnswer = "",
                feedback = QuestionFeedback.None,
            )

        private fun handleFailure(
            error: Throwable,
            type: ReviewError,
        ) {
            if (error is UnauthorizedException) {
                _unauthorizedEvent.tryEmit(Unit)
            } else {
                _state.value = ReviewSessionState.Error(type)
            }
        }
    }
