package com.example.langueedroid.feature.decks.presentation

import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.RemoteFailureKind

sealed class DeckDetailState {
    object Loading : DeckDetailState()

    object Empty : DeckDetailState()

    data class Loaded(
        val cards: List<Card>,
    ) : DeckDetailState()

    data class Error(
        val failureKind: RemoteFailureKind,
    ) : DeckDetailState()
}
