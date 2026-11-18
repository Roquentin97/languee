package com.example.langueedroid.core.domain

data class LookupResult(
    val input: String,
    val lemma: String,
    val definitions: List<DefinitionResult>,
    val context: String? = null,
    val kind: LexicalEntryKind = LexicalEntryKind.WORD,
    val isExpression: Boolean = false,
    val providerMiss: Boolean = false,
    val expressionContextFound: Boolean? = null,
    val alternatives: List<LookupAlternative> = emptyList(),
)

data class LookupAlternative(
    val type: String,
    val text: String,
    val lemma: String,
    val entryId: String?,
    val selectionRanges: List<SelectionRange>,
    val reason: String,
    val prominence: String,
)
