package com.example.langueedroid.ankidroid

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteTypeTemplatesTest {

    @Test
    fun `shared fields match mobile native type model`() {
        assertArrayEquals(
            arrayOf(
                "Lemma",
                "Pronunciation",
                "PartOfSpeech",
                "Definition",
                "Example",
                "CleanInflections",
                "TypeLabels",
                "TypeAnswer",
                "LangueeCardId",
            ),
            NoteTypeTemplates.SHARED_FIELDS,
        )
    }

    @Test
    fun `type-in vocabulary template generates exactly two cards`() {
        assertEquals(4, NoteTypeTemplates.TYPE_IN_CARDS.size)
    }

    @Test
    fun `definition prompt uses native Anki type field without fake inputs`() {
        val front = NoteTypeTemplates.TYPE_IN_CARDS[0]

        assertTrue(front.contains("{{Definition}}"))
        assertTrue(front.contains("{{TypeLabels}}"))
        assertTrue(front.contains("{{type:TypeAnswer}}"))
        assertTrue(front.contains("Separate answers with spaces."))
        assertFalse(front.contains("TypePromptRows"))
        assertFalse(front.contains("data-languee-input"))
        assertFalse(front.contains("typebox"))
        assertFalse(front.contains("{{CleanInflections}}"))
        assertFalse(front.contains("{{Context}}"))
    }

    @Test
    fun `definition card back includes answer details without custom typed check`() {
        val back = NoteTypeTemplates.TYPE_IN_CARDS[1]

        assertTrue(back.contains("{{FrontSide}}"))
        assertTrue(back.contains("{{Definition}}"))
        assertTrue(back.contains("{{#Example}}"))
        assertTrue(back.contains("{{Lemma}}"))
        assertTrue(back.contains("{{#Pronunciation}}"))
        assertTrue(back.contains("{{CleanInflections}}"))
        assertFalse(back.contains("TypeAnswerRows"))
        assertFalse(back.contains("data-languee-check"))
        assertFalse(back.contains("{{Context}}"))
    }

    @Test
    fun `lemma prompt shows lemma and cleaned inflections`() {
        val front = NoteTypeTemplates.TYPE_IN_CARDS[2]

        assertTrue(front.contains("{{Lemma}}"))
        assertTrue(front.contains("{{#CleanInflections}}"))
        assertTrue(front.contains("{{CleanInflections}}"))
        assertFalse(front.contains("{{Context}}"))
    }

    @Test
    fun `answer details place example under definition and IPA next to lemma`() {
        val back = NoteTypeTemplates.TYPE_IN_CARDS[3]
        val definitionIndex = back.indexOf("{{Definition}}")
        val exampleIndex = back.indexOf("{{#Example}}")
        val lemmaIndex = back.indexOf("{{Lemma}}")
        val ipaIndex = back.indexOf("{{Pronunciation}}")

        assertTrue(definitionIndex >= 0)
        assertTrue(exampleIndex > definitionIndex)
        assertTrue(lemmaIndex > exampleIndex)
        assertTrue(ipaIndex > lemmaIndex)
        assertTrue(back.contains("languee-lemma-row"))
    }

    @Test
    fun `legacy type-in note types normalize to new mobile model name`() {
        assertEquals(
            NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY,
            NoteTypeTemplates.normalizeNoteTypeName(NoteTypeTemplates.LEGACY_LANGUEE_TYPE_IN_VOCABULARY),
        )
        assertEquals(
            NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY,
            NoteTypeTemplates.normalizeNoteTypeName(NoteTypeTemplates.LEGACY_LANGUEE_TYPE_IN_INFLECTIONS),
        )
    }

    @Test
    fun `template version is bumped for the mobile native type shape`() {
        assertEquals("4", NoteTypeTemplates.TEMPLATE_VERSION)
    }
}
