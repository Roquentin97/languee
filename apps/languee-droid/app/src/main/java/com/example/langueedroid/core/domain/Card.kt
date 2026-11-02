package com.example.langueedroid.core.domain

enum class CardType { CLOZE, INFLECTION, DEFINITION }

data class Card(
    val id: String,
    val deckId: String,
    val lemma: String,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val context: String? = null,
    val inflectionForms: Map<String, String>? = null,
    val type: CardType = CardType.CLOZE,
)
