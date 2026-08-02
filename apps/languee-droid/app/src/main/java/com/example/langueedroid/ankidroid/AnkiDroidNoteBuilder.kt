package com.example.langueedroid.ankidroid

object AnkiDroidNoteBuilder {
    fun buildFields(
        cardId: String,
        word: String,
        lemma: String,
        pronunciation: String? = null,
        partOfSpeech: String,
        definition: String,
        context: String?,
        example: String?,
        inflectionForms: Map<String, String>?,
        hint: String? = null,
    ): Array<String> {
        val resolvedLemma = lemma.ifBlank { word }
        val cleanInflections = cleanInflectionForms(partOfSpeech, inflectionForms)
        return arrayOf(
            resolvedLemma,
            pronunciation.orEmpty(),
            partOfSpeech,
            definition,
            example.orEmpty(),
            formatCleanInflections(cleanInflections),
            formatTypeLabels(cleanInflections),
            formatTypeAnswer(resolvedLemma, cleanInflections),
            cardId,
        )
    }

    private fun cleanInflectionForms(
        partOfSpeech: String,
        forms: Map<String, String>?,
    ): List<Pair<String, String>> {
        if (forms.isNullOrEmpty()) return emptyList()

        val byKey = forms.mapKeys { it.key.lowercase() }
        val selected =
            when (partOfSpeech.lowercase()) {
                "verb" ->
                    listOf(
                        "past" to byKey["past"],
                        "past participle" to (byKey["pastparticiple"] ?: byKey["past_participle"]),
                    )
                "noun" -> listOf("plural" to byKey["plural"])
                "adjective" ->
                    listOf(
                        "comparative" to byKey["comparative"],
                        "superlative" to byKey["superlative"],
                    )
                else ->
                    forms.entries
                        .filterNot { it.key.lowercase() in setOf("type", "base", "singular", "positive") }
                        .map { labelFor(it.key) to it.value }
            }

        return selected
            .filter { (_, value) -> !value.isNullOrBlank() }
            .map { (label, value) -> label to value.orEmpty().trim() }
    }

    private fun labelFor(key: String): String =
        key
            .replace(Regex("(?<!^)([A-Z])"), " $1")
            .replace("_", " ")
            .lowercase()

    private fun formatCleanInflections(forms: List<Pair<String, String>>): String =
        forms.joinToString("\n") { (label, value) -> "$label: $value" }

    private fun formatTypeLabels(inflections: List<Pair<String, String>>): String =
        (listOf("lemma") + inflections.map { it.first }).joinToString(", ")

    private fun formatTypeAnswer(
        lemma: String,
        inflections: List<Pair<String, String>>,
    ): String =
        (listOf(lemma.trim()) + inflections.map { it.second })
            .filter { it.isNotBlank() }
            .joinToString(" ")
}
