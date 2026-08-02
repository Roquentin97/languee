package com.example.langueedroid.feature.decks.presentation

import com.example.langueedroid.core.domain.Deck

enum class DecksError { LOAD_FAILED, CREATE_FAILED }

sealed class DecksScreenState {
    object Loading : DecksScreenState()

    data class Success(
        val decks: List<Deck>,
    ) : DecksScreenState()

    object Empty : DecksScreenState()

    data class Error(
        val type: DecksError,
    ) : DecksScreenState()
}
