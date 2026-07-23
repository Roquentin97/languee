package com.example.langueedroid.core.network.dto

data class DeckRefDto(
    val id: String,
    val name: String,
)

data class EnrichedDefinitionDto(
    val id: String,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val provider: String,
    val hasIrregularForms: Boolean,
    val inflectionForms: Map<String, String>?,
    val decks: List<DeckRefDto>,
)

data class LookupMetaDto(
    val filteredByPos: Boolean,
    val unmatchedPos: Boolean,
    val availablePartsOfSpeech: List<String>,
    val isExpression: Boolean? = null,
    val providerMiss: Boolean? = null,
    val expressionContextFound: Boolean? = null,
)

data class LookupVocabularyResponseDto(
    val input: String,
    val context: String?,
    val lemma: String,
    val partOfSpeech: String?,
    val definitions: List<EnrichedDefinitionDto>,
    val meta: LookupMetaDto,
    val kind: String? = null,
)

data class CreateUserDefinitionRequestDto(
    val text: String,
    val definition: String,
    val language: String? = null,
    val example: String? = null,
    val partOfSpeech: String? = null,
)

data class CreateUserDefinitionResponseDto(
    val id: String,
    val wordId: String,
    val lemma: String,
    val kind: String,
    val partOfSpeech: String,
    val definition: String,
    val example: String?,
    val provider: String,
)
