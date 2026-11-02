package com.example.langueedroid.core.domain

/** Result of submitting a user-provided definition for a word or expression the dictionary provider does not know. */
data class CreatedUserDefinition(
    val id: String,
    val wordId: String,
    val lemma: String,
    val kind: LexicalKind,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val provider: String,
)
