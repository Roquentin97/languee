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
    val analyzedLemma: String? = null,
    val analyzedPos: String? = null,
    val filteredByPos: Boolean,
    val unmatchedPos: Boolean,
    val availablePartsOfSpeech: List<String>,
    val isExpression: Boolean? = null,
    val providerMiss: Boolean? = null,
    val expressionContextFound: Boolean? = null,
)

data class SurfaceRelationDto(
    val partOfSpeech: String,
    val relationType: String,
)

data class PreferredInterpretationDto(
    val wordId: String,
    val partOfSpeech: String?,
)

data class VocabularyPosGroupDto(
    val partOfSpeech: String,
    val definitions: List<EnrichedDefinitionDto>,
)

data class VocabularyHeadwordDto(
    val wordId: String,
    val lemma: String,
    val language: String,
    val relations: List<SurfaceRelationDto>,
    val partsOfSpeech: List<VocabularyPosGroupDto>,
)

data class LookupVocabularyResponseDto(
    val input: String,
    val context: String?,
    val language: String,
    val kind: String,
    val source: String,
    val preferred: PreferredInterpretationDto?,
    val headwords: List<VocabularyHeadwordDto>,
    val meta: LookupMetaDto,
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

data class SavedMatchesRequestDto(
    val language: String,
    val text: String,
    val tokens: List<String>,
)

data class SavedMatchDeckDto(
    val id: String,
    val name: String,
)

data class SavedMatchDefinitionDto(
    val definitionId: String,
    val partOfSpeech: String,
    val definition: String,
    val decks: List<SavedMatchDeckDto>,
)

data class SavedMatchHeadwordDto(
    val wordId: String,
    val lemma: String,
    val definitions: List<SavedMatchDefinitionDto>,
)

data class SavedMatchDto(
    val surface: String,
    val headwords: List<SavedMatchHeadwordDto>,
)

data class SavedMatchesResponseDto(
    val matches: List<SavedMatchDto>,
)
