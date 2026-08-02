package com.example.langueedroid.feature.decks.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel(assistedFactory = DeckDetailViewModel.Factory::class)
class DeckDetailViewModel
    @AssistedInject
    constructor(
        @Assisted private val deckId: String,
        private val cardRepository: CardRepository,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(deckId: String): DeckDetailViewModel
        }

        private val _state = MutableStateFlow<DeckDetailState>(DeckDetailState.Loading)
        val state: StateFlow<DeckDetailState> = _state.asStateFlow()

        private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

        init {
            loadCards()
        }

        fun loadCards() {
            _state.value = DeckDetailState.Loading
            viewModelScope.launch {
                cardRepository.listCards(deckId).fold(
                    onSuccess = { cards ->
                        _state.value =
                            if (cards.isEmpty()) {
                                DeckDetailState.Empty
                            } else {
                                DeckDetailState.Loaded(cards)
                            }
                    },
                    onFailure = { error ->
                        if (error is UnauthorizedException) {
                            _unauthorizedEvent.tryEmit(Unit)
                        } else {
                            _state.value = DeckDetailState.Error
                        }
                    },
                )
            }
        }
    }
