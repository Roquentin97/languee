package com.example.langueedroid.presentation

import com.example.langueedroid.domain.Deck

sealed class DecksScreenState {
    object Loading : DecksScreenState()
    data class Success(val decks: List<Deck>) : DecksScreenState()
    object Empty : DecksScreenState()
    data class Error(val message: String) : DecksScreenState()
}
