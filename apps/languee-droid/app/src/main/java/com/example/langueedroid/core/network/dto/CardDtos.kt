package com.example.langueedroid.core.network.dto

data class CreateCardRequest(
    val deckId: String,
    val definitionId: String,
    val context: String? = null,
    val inflectionForms: Map<String, String>? = null,
)

data class CardDefinitionDto(
    val id: String,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val provider: String,
    val inflectionForms: Map<String, String>? = null,
)

data class CardDeckDto(
    val id: String,
    val name: String,
)

data class CardWordDto(
    val id: String,
    val lemma: String,
    val language: String,
)

data class CardResponseDto(
    val id: String,
    val type: String? = null,
    val userId: String,
    val decks: List<CardDeckDto>? = null,
    val definitionId: String? = null,
    val wordId: String? = null,
    val partOfSpeech: String? = null,
    val context: String? = null,
    val inflectionForms: Map<String, String>? = null,
    val createdAt: String,
    val updatedAt: String,
    val definition: CardDefinitionDto? = null,
    val word: CardWordDto,
    // Compatibility with the original single-deck card response.
    val deckId: String? = null,
)

data class CreateCardsResponseDto(
    val cards: List<CardResponseDto>,
)
