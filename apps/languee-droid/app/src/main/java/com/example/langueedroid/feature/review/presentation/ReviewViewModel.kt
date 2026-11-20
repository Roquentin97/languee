package com.example.langueedroid.feature.review.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.GradeAnswerResult
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RevealedEntry
import com.example.langueedroid.core.domain.ReviewCardType
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.remoteFailureKind
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
        private var operationGeneration: Long = 0

        init {
            loadQueue(deckId = deckId)
        }

        fun loadQueue(
            deckId: String? = lastDeckId,
            limit: Int = DEFAULT_LIMIT,
        ) {
            // A later load supersedes pending actions. Its generation prevents an old response
            // from replacing the newly loaded queue if the request completes after the reload.
            val operation = beginOperation()
            lastDeckId = deckId
            lastLimit = limit
            _state.value = ReviewSessionState.Loading
            viewModelScope.launch {
                val result = reviewRepository.queue(deckId = deckId, limit = limit)
                if (!isCurrentOperation(operation)) return@launch
                result.fold(
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
                    onFailure = { error ->
                        handleFailure(error, ReviewError.LOAD_FAILED, ReviewRetryAction.LOAD_QUEUE, operation = operation)
                    },
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
            val operation = beginOperation()
            actionJob =
                viewModelScope.launch {
                    if (current.item.type == ReviewCardType.INFLECTION) {
                        submitInflectionAnswer(current, operation)
                    } else {
                        submitTextAnswer(current, operation)
                    }
                }
        }

        private suspend fun submitInflectionAnswer(
            current: ReviewSessionState.Question,
            operation: Long,
        ) {
            reviewRepository
                .checkForms(
                    cardId = current.item.cardId,
                    typedForms =
                        current.item.inflection!!
                            .formKeys
                            .associateWith { current.typedForms[it].orEmpty() },
                ).fold(
                    onSuccess = { response ->
                        if (!isCurrentOperation(operation)) return@fold
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
                    onFailure = { error ->
                        handleFailure(error, ReviewError.SUBMIT_FAILED, ReviewRetryAction.SUBMIT_FORMS, current, operation)
                    },
                )
        }

        private suspend fun submitTextAnswer(
            current: ReviewSessionState.Question,
            operation: Long,
        ) {
            reviewRepository
                .checkAnswer(
                    cardId = current.item.cardId,
                    typedAnswer = current.typedAnswer,
                ).fold(
                    onSuccess = { check ->
                        if (!isCurrentOperation(operation)) return@fold
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
                    onFailure = { error ->
                        handleFailure(error, ReviewError.SUBMIT_FAILED, ReviewRetryAction.SUBMIT_TEXT, current, operation)
                    },
                )
        }

        private fun showSelfRatedAnswer(current: ReviewSessionState.Question) {
            val lemma = current.item.definition?.lemma ?: current.item.inflection?.lemma ?: current.item.prompt.definition
            _state.value =
                ReviewSessionState.Correct(
                    item = current.item,
                    index = current.index,
                    total = current.total,
                    matchedForm = current.typedAnswer.ifBlank { null },
                    revealed = RevealedEntry(lemma = lemma, ipa = null, inflectionForms = null),
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
                val operation = beginOperation()
                actionJob =
                    viewModelScope.launch {
                        revealDefinition(current, operation)
                    }
                return
            }
            val operation = beginOperation()
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
                                if (!isCurrentOperation(operation)) return@fold
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
                            onFailure = { error -> handleFailure(error, ReviewError.GRADE_FAILED, operation = operation) },
                        )
                }
        }

        fun grade(rating: ReviewRating) {
            val current = _state.value as? ReviewSessionState.Correct ?: return
            if (actionJob?.isActive == true) return
            val operation = beginOperation()
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
                                if (!isCurrentOperation(operation)) return@fold
                                reviewedCount += 1
                                advance()
                            },
                            onFailure = { error -> handleFailure(error, ReviewError.GRADE_FAILED, operation = operation) },
                        )
                }
        }

        fun next() {
            if (_state.value !is ReviewSessionState.Revealed) return
            advance()
        }

        fun retry() {
            val error = _state.value as? ReviewSessionState.Error ?: return
            if (error.retryInProgress || actionJob?.isActive == true) return
            when (error.retryAction) {
                ReviewRetryAction.LOAD_QUEUE -> loadQueue(deckId = lastDeckId, limit = lastLimit)
                ReviewRetryAction.SUBMIT_TEXT,
                ReviewRetryAction.SUBMIT_FORMS,
                ReviewRetryAction.REVEAL_DEFINITION,
                -> {
                    val question = error.previousQuestion ?: return
                    val operation = beginOperation()
                    _state.value = error.copy(retryInProgress = true)
                    actionJob =
                        viewModelScope.launch {
                            when (error.retryAction) {
                                ReviewRetryAction.SUBMIT_TEXT -> submitTextAnswer(question, operation)
                                ReviewRetryAction.SUBMIT_FORMS -> submitInflectionAnswer(question, operation)
                                ReviewRetryAction.REVEAL_DEFINITION -> revealDefinition(question, operation)
                            }
                        }
                }
                null -> loadQueue(deckId = lastDeckId, limit = lastLimit)
            }
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
            retryAction: ReviewRetryAction? = null,
            previousQuestion: ReviewSessionState.Question? = null,
            operation: Long,
        ) {
            if (!isCurrentOperation(operation)) return
            if (error is UnauthorizedException) {
                (_state.value as? ReviewSessionState.Error)
                    ?.takeIf { it.retryInProgress }
                    ?.let { _state.value = it.copy(retryInProgress = false) }
                _unauthorizedEvent.tryEmit(Unit)
            } else {
                val failureKind = error.remoteFailureKind()
                val canRetry =
                    failureKind !in
                        setOf(
                            RemoteFailureKind.BAD_REQUEST,
                            RemoteFailureKind.FORBIDDEN,
                            RemoteFailureKind.NOT_FOUND,
                            RemoteFailureKind.CONFLICT,
                        ) &&
                        error !is StaleReferenceException
                _state.value =
                    ReviewSessionState.Error(
                        type = type,
                        failureKind = failureKind,
                        retryAction = retryAction.takeIf { canRetry },
                        previousQuestion = previousQuestion,
                    )
            }
        }

        private suspend fun revealDefinition(
            current: ReviewSessionState.Question,
            operation: Long,
        ) {
            reviewRepository.revealDefinition(current.item.cardId).fold(
                onSuccess = { revealed ->
                    if (!isCurrentOperation(operation)) return@fold
                    _state.value =
                        ReviewSessionState.Correct(
                            item = current.item,
                            index = current.index,
                            total = current.total,
                            matchedForm = null,
                            revealed = revealed,
                        )
                },
                onFailure = { error ->
                    handleFailure(error, ReviewError.SUBMIT_FAILED, ReviewRetryAction.REVEAL_DEFINITION, current, operation)
                },
            )
        }

        private fun beginOperation(): Long {
            operationGeneration++
            actionJob = null
            return operationGeneration
        }

        private fun isCurrentOperation(operation: Long): Boolean = operation == operationGeneration
    }
