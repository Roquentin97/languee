package com.example.langueedroid.feature.decks.presentation

import com.example.langueedroid.core.domain.Card

sealed class DeckDetailState {
    object Loading : DeckDetailState()
    object Empty : DeckDetailState()
    data class Loaded(val cards: List<Card>) : DeckDetailState()
    object Error : DeckDetailState()
}
