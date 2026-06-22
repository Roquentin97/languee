package com.example.langueedroid.core.domain

data class Card(
    val id: String,
    val deckId: String,
    val lemma: String,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val context: String? = null,
    val inflectionForms: Map<String, String>? = null,
)
