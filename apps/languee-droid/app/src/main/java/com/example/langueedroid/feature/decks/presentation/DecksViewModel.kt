package com.example.langueedroid.feature.decks.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.data.ReviewRepository
import com.example.langueedroid.core.domain.DeckConflictException
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.remoteFailureKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DecksViewModel
    @Inject
    constructor(
        private val deckRepository: DeckRepository,
        private val ankiDroidApi: AnkiDroidApi,
        private val reviewRepository: ReviewRepository,
    ) : ViewModel() {
        private val _decksState = MutableStateFlow<DecksScreenState>(DecksScreenState.Loading)
        val decksState: StateFlow<DecksScreenState> = _decksState.asStateFlow()

        private val _createError = MutableStateFlow<DecksError?>(null)
        val createError: StateFlow<DecksError?> = _createError.asStateFlow()

        private val _isCreatingDeck = MutableStateFlow(false)
        val isCreatingDeck: StateFlow<Boolean> = _isCreatingDeck.asStateFlow()

        private val _availableAnkiDecks = MutableStateFlow<List<Pair<Long, String>>?>(null)
        val availableAnkiDecks: StateFlow<List<Pair<Long, String>>?> = _availableAnkiDecks.asStateFlow()

        private val _isLoadingAnkiDecks = MutableStateFlow(false)
        val isLoadingAnkiDecks: StateFlow<Boolean> = _isLoadingAnkiDecks.asStateFlow()

        private val _dueReviewCount = MutableStateFlow<Int?>(null)
        val dueReviewCount: StateFlow<Int?> = _dueReviewCount.asStateFlow()

        private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

        init {
            loadDecks()
            loadDueReviewCount()
        }

        fun loadDueReviewCount() {
            viewModelScope.launch {
                reviewRepository.summary().fold(
                    onSuccess = { summary -> _dueReviewCount.value = summary.dueCount },
                    // Badge is a non-critical affordance: any failure just hides it rather than
                    // disrupting the decks screen.
                    onFailure = { _dueReviewCount.value = null },
                )
            }
        }

        fun loadDecks() {
            _decksState.value = DecksScreenState.Loading
            viewModelScope.launch {
                deckRepository.getDecks().fold(
                    onSuccess = { decks ->
                        _decksState.value =
                            if (decks.isEmpty()) {
                                DecksScreenState.Empty
                            } else {
                                DecksScreenState.Success(decks)
                            }
                    },
                    onFailure = { error ->
                        if (error is UnauthorizedException) {
                            _unauthorizedEvent.tryEmit(Unit)
                        } else {
                            _decksState.value = DecksScreenState.Error(error.toDecksError())
                        }
                    },
                )
            }
        }

        fun createDeck(
            name: String,
            onCreated: () -> Unit,
        ) {
            if (_isCreatingDeck.value) return
            _isCreatingDeck.value = true
            viewModelScope.launch {
                _createError.value = null
                try {
                    deckRepository.createDeck(name = name).fold(
                        onSuccess = {
                            loadDecks()
                            onCreated()
                        },
                        onFailure = { error ->
                            if (error is UnauthorizedException) {
                                _unauthorizedEvent.tryEmit(Unit)
                            } else {
                                _createError.value = error.toDecksError()
                            }
                        },
                    )
                } finally {
                    _isCreatingDeck.value = false
                }
            }
        }

        fun loadAnkiDecks() {
            _isLoadingAnkiDecks.value = true
            viewModelScope.launch {
                val decks = ankiDroidApi.getDeckList()
                _availableAnkiDecks.value = decks?.entries?.map { Pair(it.key, it.value) } ?: emptyList()
                _isLoadingAnkiDecks.value = false
            }
        }

        private fun Throwable.toDecksError(): DecksError =
            when (this) {
                is DeckConflictException -> DecksError.NAME_ALREADY_EXISTS
                else ->
                    when (remoteFailureKind()) {
                        RemoteFailureKind.CONNECTION -> DecksError.CONNECTION
                        RemoteFailureKind.RATE_LIMITED -> DecksError.RATE_LIMITED
                        RemoteFailureKind.SERVICE_UNAVAILABLE -> DecksError.SERVICE_UNAVAILABLE
                        RemoteFailureKind.BAD_REQUEST -> DecksError.REQUEST_REJECTED
                        RemoteFailureKind.FORBIDDEN -> DecksError.FORBIDDEN
                        RemoteFailureKind.NOT_FOUND -> DecksError.NOT_FOUND
                        RemoteFailureKind.CONFLICT -> DecksError.NAME_ALREADY_EXISTS
                        else -> DecksError.UNEXPECTED
                    }
            }
    }
