package com.example.langueedroid.ankidroid

object NoteTypeTemplates {

    const val LANGUEE_TYPE_IN_VOCABULARY = "Languee Type-in Vocabulary"
    const val LANGUEE_BASIC_REVERSED = "Languee Basic + Reversed Vocabulary"
    const val TEMPLATE_VERSION = "1"

    val SHARED_FIELDS = arrayOf(
        "Word",
        "Lemma",
        "Pronunciation",
        "PartOfSpeech",
        "Definition",
        "Context",
        "Example",
        "Hint",
        "Inflections",
        "LangueeCardId",
    )

    // Interleaved [front1, back1, front2, back2, front3, back3] format
    val TYPE_IN_CARDS = arrayOf(
        "{{Definition}}<br>{{Context}}<br>{{type:Word}}",
        "{{Word}}<br>{{Lemma}} {{Pronunciation}}<br>{{PartOfSpeech}}<br>{{Inflections}}<br>{{Example}}",
        "{{Word}}<br>{{Lemma}} {{Pronunciation}}",
        "{{Definition}}<br>{{Context}}<br>{{Example}}<br>{{Inflections}}",
        "{{#Inflections}}{{Lemma}} {{Pronunciation}}<br>{{PartOfSpeech}}<br>{{Definition}}{{/Inflections}}",
        "{{#Inflections}}{{Inflections}}{{/Inflections}}",
    )

    // Interleaved [front1, back1, front2, back2] format
    val BASIC_REVERSED_CARDS = arrayOf(
        "{{Word}}<br>{{Lemma}} {{Pronunciation}}",
        "{{Definition}}<br>{{Context}}<br>{{Example}}<br>{{Inflections}}",
        "{{Definition}}<br>{{Context}}",
        "{{Word}}<br>{{Lemma}} {{Pronunciation}}<br>{{Inflections}}<br>{{Example}}",
    )
}
