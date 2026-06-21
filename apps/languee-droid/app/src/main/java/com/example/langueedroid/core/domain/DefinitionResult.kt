package com.example.langueedroid.core.domain

data class DeckRef(
    val id: String,
    val name: String,
)

data class DefinitionResult(
    val id: String,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val provider: String,
    val decks: List<DeckRef>,
    val inflectionForms: Map<String, String>? = null,
)
