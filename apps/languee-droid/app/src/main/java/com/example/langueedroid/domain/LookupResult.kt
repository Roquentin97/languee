package com.example.langueedroid.domain

data class LookupResult(
    val input: String,
    val lemma: String,
    val definitions: List<DefinitionResult>,
    val context: String? = null,
)
