package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DecksViewModel(
    private val deckRepository: DeckRepository,
    private val onUnauthorized: () -> Unit,
) : ViewModel() {

    private val _decksState = MutableStateFlow<DecksScreenState>(DecksScreenState.Loading)
    val decksState: StateFlow<DecksScreenState> = _decksState.asStateFlow()

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

    fun createDeck(name: String, language: String, onCreated: () -> Unit) {
        viewModelScope.launch {
            deckRepository.createDeck(name = name, language = language).fold(
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

    class Factory(
        private val deckRepository: DeckRepository,
        private val onUnauthorized: () -> Unit,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            DecksViewModel(deckRepository = deckRepository, onUnauthorized = onUnauthorized) as T
    }
}
