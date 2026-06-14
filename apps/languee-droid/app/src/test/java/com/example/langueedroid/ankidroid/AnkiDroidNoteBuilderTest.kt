package com.example.langueedroid.ankidroid

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class AnkiDroidNoteBuilderTest {

    // -------------------------------------------------------------------------
    // Field ordering
    // -------------------------------------------------------------------------

    @Test
    fun `buildFields returns array in correct shared-fields order`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-1",
            word = "run",
            lemma = "run",
            partOfSpeech = "verb",
            definition = "To move fast",
            context = "She runs every day.",
            example = "I run in the morning.",
            inflectionForms = null,
        )

        // Word, Lemma, Pronunciation(empty), PartOfSpeech, Definition,
        // Context, Example, Hint(empty), Inflections(empty), LangueeCardId
        assertEquals(10, fields.size)
        assertEquals("run", fields[0])           // Word
        assertEquals("run", fields[1])           // Lemma
        assertEquals("", fields[2])              // Pronunciation — intentionally empty
        assertEquals("verb", fields[3])          // PartOfSpeech
        assertEquals("To move fast", fields[4])  // Definition
        assertEquals("She runs every day.", fields[5]) // Context
        assertEquals("I run in the morning.", fields[6]) // Example
        assertEquals("", fields[7])              // Hint
        assertEquals("", fields[8])              // Inflections — null maps to empty
        assertEquals("card-1", fields[9])        // LangueeCardId
    }

    // -------------------------------------------------------------------------
    // Pronunciation is always empty
    // -------------------------------------------------------------------------

    @Test
    fun `buildFields always sets Pronunciation field to empty string`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "x",
            word = "dog",
            lemma = "dog",
            partOfSpeech = "noun",
            definition = "A pet",
            context = null,
            example = null,
            inflectionForms = null,
        )

        assertEquals("", fields[2])
    }

    // -------------------------------------------------------------------------
    // Null optional fields default to empty string
    // -------------------------------------------------------------------------

    @Test
    fun `null context and example produce empty strings in output array`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "cat",
            lemma = "cat",
            partOfSpeech = "noun",
            definition = "A small pet",
            context = null,
            example = null,
            inflectionForms = null,
        )

        assertEquals("", fields[5]) // Context
        assertEquals("", fields[6]) // Example
    }

    // -------------------------------------------------------------------------
    // Hint parameter
    // -------------------------------------------------------------------------

    @Test
    fun `explicit hint value is placed in Hint field`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "cat",
            lemma = "cat",
            partOfSpeech = "noun",
            definition = "A small pet",
            context = null,
            example = null,
            inflectionForms = null,
            hint = "Think of a furry friend",
        )

        assertEquals("Think of a furry friend", fields[7])
    }

    @Test
    fun `null hint produces empty Hint field`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "w",
            lemma = "w",
            partOfSpeech = "noun",
            definition = "d",
            context = null,
            example = null,
            inflectionForms = null,
            hint = null,
        )

        assertEquals("", fields[7])
    }

    // -------------------------------------------------------------------------
    // Inflections — null → empty string
    // -------------------------------------------------------------------------

    @Test
    fun `null inflectionForms produces empty Inflections field`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "go",
            lemma = "go",
            partOfSpeech = "verb",
            definition = "To move",
            context = null,
            example = null,
            inflectionForms = null,
        )

        assertEquals("", fields[8])
    }

    // -------------------------------------------------------------------------
    // Inflections — empty map → empty string
    // -------------------------------------------------------------------------

    @Test
    fun `empty inflectionForms map produces empty Inflections field`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "go",
            lemma = "go",
            partOfSpeech = "verb",
            definition = "To move",
            context = null,
            example = null,
            inflectionForms = emptyMap(),
        )

        assertEquals("", fields[8])
    }

    // -------------------------------------------------------------------------
    // Inflections — single entry → "key: value"
    // -------------------------------------------------------------------------

    @Test
    fun `single inflection entry is formatted as 'key colon value'`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "run",
            lemma = "run",
            partOfSpeech = "verb",
            definition = "To move fast",
            context = null,
            example = null,
            inflectionForms = mapOf("past" to "ran"),
        )

        assertEquals("past: ran", fields[8])
    }

    // -------------------------------------------------------------------------
    // Inflections — multiple entries → newline-separated
    // -------------------------------------------------------------------------

    @Test
    fun `multiple inflection entries are joined with newlines`() {
        val forms = linkedMapOf("past" to "ran", "past_participle" to "run", "3sg" to "runs")
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "c1",
            word = "run",
            lemma = "run",
            partOfSpeech = "verb",
            definition = "To move",
            context = null,
            example = null,
            inflectionForms = forms,
        )

        val inflections = fields[8]
        val lines = inflections.split("\n")
        assertEquals(3, lines.size)
        assertEquals("past: ran", lines[0])
        assertEquals("past_participle: run", lines[1])
        assertEquals("3sg: runs", lines[2])
    }

    // -------------------------------------------------------------------------
    // LangueeCardId is always placed in last position
    // -------------------------------------------------------------------------

    @Test
    fun `LangueeCardId is placed in position 9`() {
        val fields = AnkiDroidNoteBuilder.buildFields(
            cardId = "the-real-id",
            word = "w",
            lemma = "w",
            partOfSpeech = "noun",
            definition = "d",
            context = null,
            example = null,
            inflectionForms = null,
        )

        assertEquals("the-real-id", fields[9])
    }

    // -------------------------------------------------------------------------
    // Full round-trip: all non-null fields
    // -------------------------------------------------------------------------

    @Test
    fun `buildFields with all non-null values returns expected array`() {
        val expected = arrayOf(
            "walk",              // Word
            "walk",              // Lemma
            "",                  // Pronunciation (always empty)
            "verb",              // PartOfSpeech
            "Move on foot",      // Definition
            "He walks to work.", // Context
            "She walked away.",  // Example
            "Think of legs",     // Hint
            "past: walked\npast_participle: walked", // Inflections
            "card-abc",          // LangueeCardId
        )

        val actual = AnkiDroidNoteBuilder.buildFields(
            cardId = "card-abc",
            word = "walk",
            lemma = "walk",
            partOfSpeech = "verb",
            definition = "Move on foot",
            context = "He walks to work.",
            example = "She walked away.",
            inflectionForms = linkedMapOf("past" to "walked", "past_participle" to "walked"),
            hint = "Think of legs",
        )

        assertArrayEquals(expected, actual)
    }
}
