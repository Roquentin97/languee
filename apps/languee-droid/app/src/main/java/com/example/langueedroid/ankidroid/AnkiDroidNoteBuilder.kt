package com.example.langueedroid.ankidroid

object AnkiDroidNoteBuilder {

    fun buildFields(
        cardId: String,
        word: String,
        lemma: String,
        partOfSpeech: String,
        definition: String,
        context: String?,
        example: String?,
        inflectionForms: Map<String, String>?,
        hint: String? = null,
    ): Array<String> = arrayOf(
        word,
        lemma,
        "",
        partOfSpeech,
        definition,
        context.orEmpty(),
        example.orEmpty(),
        hint.orEmpty(),
        formatInflections(inflectionForms),
        cardId,
    )

    private fun formatInflections(forms: Map<String, String>?): String =
        forms?.entries?.joinToString("\n") { e -> "${e.key}: ${e.value}" } ?: ""
}
