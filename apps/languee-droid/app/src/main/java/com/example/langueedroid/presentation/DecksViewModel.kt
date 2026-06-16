package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DecksViewModel(
    private val deckRepository: DeckRepository,
    private val onUnauthorized: () -> Unit,
    private val ankiDroidApi: AnkiDroidApi? = null,
) : ViewModel() {

    private val _decksState = MutableStateFlow<DecksScreenState>(DecksScreenState.Loading)
    val decksState: StateFlow<DecksScreenState> = _decksState.asStateFlow()

    private val _availableAnkiDecks = MutableStateFlow<List<Pair<Long, String>>?>(null)
    val availableAnkiDecks: StateFlow<List<Pair<Long, String>>?> = _availableAnkiDecks.asStateFlow()

    private val _isLoadingAnkiDecks = MutableStateFlow(false)
    val isLoadingAnkiDecks: StateFlow<Boolean> = _isLoadingAnkiDecks.asStateFlow()

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
                        onUnauthorized()
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
                        onUnauthorized()
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
        val api = ankiDroidApi
        if (api == null) {
            _availableAnkiDecks.value = emptyList()
            return
        }
        _isLoadingAnkiDecks.value = true
        viewModelScope.launch {
            val decks = api.getDeckList()
            _availableAnkiDecks.value = decks?.entries?.map { Pair(it.key, it.value) } ?: emptyList()
            _isLoadingAnkiDecks.value = false
        }
    }

    class Factory(
        private val deckRepository: DeckRepository,
        private val onUnauthorized: () -> Unit,
        private val ankiDroidApi: AnkiDroidApi? = null,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            DecksViewModel(
                deckRepository = deckRepository,
                onUnauthorized = onUnauthorized,
                ankiDroidApi = ankiDroidApi,
            ) as T
    }
}
