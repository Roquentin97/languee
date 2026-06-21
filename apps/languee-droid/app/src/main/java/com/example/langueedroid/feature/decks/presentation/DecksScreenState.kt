package com.example.langueedroid.feature.decks.presentation

import com.example.langueedroid.core.domain.Deck

sealed class DecksScreenState {
    object Loading : DecksScreenState()
    data class Success(val decks: List<Deck>) : DecksScreenState()
    object Empty : DecksScreenState()
    data class Error(val message: String) : DecksScreenState()
}
