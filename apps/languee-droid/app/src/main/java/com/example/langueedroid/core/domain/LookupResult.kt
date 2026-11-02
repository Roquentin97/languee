package com.example.langueedroid.core.domain

data class LookupResult(
    val input: String,
    val lemma: String,
    val definitions: List<DefinitionResult>,
    val context: String? = null,
    val kind: LexicalKind = LexicalKind.WORD,
    val isExpression: Boolean = false,
    val providerMiss: Boolean = false,
    val expressionContextFound: Boolean? = null,
)
