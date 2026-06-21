package com.example.langueedroid.ankidroid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AnkiDroidNoteBuilderTest {

    @Test
    fun `buildFields returns array in mobile native type field order`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "run",
            lemma = "run",
            pronunciation = "/rʌn/",
            partOfSpeech = "verb",
            definition = "To move fast",
            context = "She runs every day.",
            example = "I run in the morning.",
            inflectionForms = linkedMapOf("past" to "ran", "pastParticiple" to "run"),
        )

        assertEquals(9, fields.size)
        assertEquals("run", fields[0]) // Lemma
        assertEquals("/rʌn/", fields[1]) // Pronunciation
        assertEquals("verb", fields[2]) // PartOfSpeech
        assertEquals("To move fast", fields[3]) // Definition
        assertEquals("I run in the morning.", fields[4]) // Example
        assertEquals("past: ran\npast participle: run", fields[5]) // CleanInflections
        assertEquals("lemma, past, past participle", fields[6]) // TypeLabels
        assertEquals("run ran run", fields[7]) // TypeAnswer
        assertEquals("card-1", fields[8]) // LangueeCardId
    }

    @Test
    fun `blank lemma falls back to word in lemma and type answer`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "saw",
            lemma = "",
            partOfSpeech = "noun",
            definition = "A tool",
            context = null,
            example = null,
            inflectionForms = null,
        )

        assertEquals("saw", fields[0])
        assertEquals("lemma", fields[6])
        assertEquals("saw", fields[7])
    }

    @Test
    fun `verb inflections keep only past and past participle`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "see",
            lemma = "see",
            partOfSpeech = "verb",
            definition = "Perceive with eyes",
            context = null,
            example = null,
            inflectionForms = linkedMapOf(
                "base" to "see",
                "past" to "saw",
                "present3sg" to "sees",
                "pastParticiple" to "seen",
                "gerundParticiple" to "seeing",
            ),
        )

        assertEquals("past: saw\npast participle: seen", fields[5])
        assertEquals("lemma, past, past participle", fields[6])
        assertEquals("see saw seen", fields[7])
        assertFalse(fields[5].contains("base"))
        assertFalse(fields[5].contains("present3sg"))
        assertFalse(fields[5].contains("gerundParticiple"))
    }

    @Test
    fun `noun inflections keep only plural`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "saw",
            lemma = "saw",
            partOfSpeech = "noun",
            definition = "A tool",
            context = null,
            example = null,
            inflectionForms = linkedMapOf("type" to "noun", "plural" to "saws", "singular" to "saw"),
        )

        assertEquals("plural: saws", fields[5])
        assertEquals("lemma, plural", fields[6])
        assertEquals("saw saws", fields[7])
        assertFalse(fields[5].contains("type"))
        assertFalse(fields[5].contains("singular"))
    }

    @Test
    fun `adjective inflections keep comparative and superlative`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "good",
            lemma = "good",
            partOfSpeech = "adjective",
            definition = "Having value",
            context = null,
            example = null,
            inflectionForms = linkedMapOf("positive" to "good", "comparative" to "better", "superlative" to "best"),
        )

        assertEquals("comparative: better\nsuperlative: best", fields[5])
        assertEquals("lemma, comparative, superlative", fields[6])
        assertEquals("good better best", fields[7])
        assertFalse(fields[5].contains("positive"))
    }

    @Test
    fun `type answer trims blank inflection values`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "go",
            lemma = "go",
            partOfSpeech = "verb",
            definition = "Move",
            context = null,
            example = null,
            inflectionForms = linkedMapOf("past" to " went ", "pastParticiple" to ""),
        )

        assertEquals("past: went", fields[5])
        assertEquals("lemma, past", fields[6])
        assertEquals("go went", fields[7])
    }

    @Test
    fun `unknown part of speech omits metadata-like forms`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "word",
            lemma = "word",
            partOfSpeech = "other",
            definition = "A word",
            context = null,
            example = null,
            inflectionForms = linkedMapOf("type" to "other", "customForm" to "customed"),
        )

        assertEquals("custom form: customed", fields[5])
        assertEquals("lemma, custom form", fields[6])
        assertEquals("word customed", fields[7])
        assertFalse(fields[5].contains("type"))
    }
}
