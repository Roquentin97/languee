package com.example.langueedroid.core.network.dto

data class CreateCardRequest(
    val deckId: String,
    val definitionId: String,
    val context: String? = null,
    val inflectionForms: Map<String, String>?,
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
    val type: String,
    val userId: String,
    val decks: List<CardDeckDto>,
    val definitionId: String?,
    val wordId: String?,
    val partOfSpeech: String?,
    val context: String?,
    val inflectionForms: Map<String, String>?,
    val createdAt: String,
    val updatedAt: String,
    val definition: CardDefinitionDto?,
    val word: CardWordDto,
)

data class CreateCardsResponseDto(
    val cards: List<CardResponseDto>,
)
