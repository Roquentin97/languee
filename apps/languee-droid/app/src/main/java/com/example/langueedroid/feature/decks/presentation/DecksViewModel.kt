package com.example.langueedroid.feature.decks.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.domain.UnauthorizedException
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
class DecksViewModel @Inject constructor(
    private val deckRepository: DeckRepository,
    private val ankiDroidApi: AnkiDroidApi,
) : ViewModel() {

    private val _decksState = MutableStateFlow<DecksScreenState>(DecksScreenState.Loading)
    val decksState: StateFlow<DecksScreenState> = _decksState.asStateFlow()

    private val _availableAnkiDecks = MutableStateFlow<List<Pair<Long, String>>?>(null)
    val availableAnkiDecks: StateFlow<List<Pair<Long, String>>?> = _availableAnkiDecks.asStateFlow()

    private val _isLoadingAnkiDecks = MutableStateFlow(false)
    val isLoadingAnkiDecks: StateFlow<Boolean> = _isLoadingAnkiDecks.asStateFlow()

    private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

    init {
        loadDecks()
    }

    fun loadDecks() {
        _decksState.value = DecksScreenState.Loading
        viewModelScope.launch {
            deckRepository.getDecks().fold(
                onSuccess = { decks ->
                    _decksState.value = if (decks.isEmpty()) {
                        DecksScreenState.Empty
                    } else {
                        DecksScreenState.Success(decks)
                    }
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _decksState.value = DecksScreenState.Error(
                            error.message ?: "Failed to load decks",
                        )
                    }
                },
            )
        }
    }

    fun createDeck(name: String, onCreated: () -> Unit) {
        viewModelScope.launch {
            deckRepository.createDeck(name = name).fold(
                onSuccess = {
                    loadDecks()
                    onCreated()
                },
                onFailure = { error ->
                    if (error is UnauthorizedException) {
                        _unauthorizedEvent.tryEmit(Unit)
                    } else {
                        _decksState.value = DecksScreenState.Error(
                            error.message ?: "Failed to create deck",
                        )
                    }
                },
            )
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
}
