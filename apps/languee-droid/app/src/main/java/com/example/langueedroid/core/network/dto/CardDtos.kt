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
)

data class CardWordDto(
    val id: String,
    val lemma: String,
    val language: String,
)

data class CardResponseDto(
    val id: String,
    val deckId: String,
    val userId: String,
    val definitionId: String,
    val context: String? = null,
    val inflectionForms: Map<String, String>? = null,
    val createdAt: String,
    val updatedAt: String,
    val definition: CardDefinitionDto,
    val word: CardWordDto,
)
