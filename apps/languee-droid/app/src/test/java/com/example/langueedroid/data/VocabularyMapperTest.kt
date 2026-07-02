package com.example.langueedroid.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.data.mapper.toLookupResult
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.network.dto.CreateUserDefinitionResponseDto
import com.example.langueedroid.core.network.dto.EnrichedDefinitionDto
import com.example.langueedroid.core.network.dto.LookupMetaDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VocabularyMapperTest {

    private fun aDefinitionDto() = EnrichedDefinitionDto(
        id = "def1",
        partOfSpeech = "noun",
        definition = "A small animal",
        example = "I have a cat",
        provider = "dict",
        hasIrregularForms = false,
        inflectionForms = null,
        decks = emptyList(),
    )

    private fun aMetaDto(
        isExpression: Boolean? = null,
        providerMiss: Boolean? = null,
        expressionContextFound: Boolean? = null,
    ) = LookupMetaDto(
        filteredByPos = false,
        unmatchedPos = false,
        availablePartsOfSpeech = listOf("noun"),
        isExpression = isExpression,
        providerMiss = providerMiss,
        expressionContextFound = expressionContextFound,
    )

    private fun aResponseDto(
        kind: String? = null,
        meta: LookupMetaDto = aMetaDto(),
        definitions: List<EnrichedDefinitionDto> = listOf(aDefinitionDto()),
    ) = LookupVocabularyResponseDto(
        input = "cat",
        context = null,
        lemma = "cat",
        partOfSpeech = "noun",
        definitions = definitions,
        meta = meta,
        kind = kind,
    )

    // -------------------------------------------------------------------------
    // kind mapping, including fallback for unknown/missing values
    // -------------------------------------------------------------------------

    @Test
    fun `kind word maps to WORD`() {
        assertEquals(LexicalKind.WORD, aResponseDto(kind = "word").toLookupResult().kind)
    }

    @Test
    fun `kind phrasal_verb maps to PHRASAL_VERB`() {
        assertEquals(LexicalKind.PHRASAL_VERB, aResponseDto(kind = "phrasal_verb").toLookupResult().kind)
    }

    @Test
    fun `kind expression maps to EXPRESSION`() {
        assertEquals(LexicalKind.EXPRESSION, aResponseDto(kind = "expression").toLookupResult().kind)
    }

    @Test
    fun `missing kind falls back to WORD`() {
        assertEquals(LexicalKind.WORD, aResponseDto(kind = null).toLookupResult().kind)
    }

    @Test
    fun `unknown kind string falls back to WORD`() {
        assertEquals(LexicalKind.WORD, aResponseDto(kind = "some_future_kind").toLookupResult().kind)
    }

    // -------------------------------------------------------------------------
    // meta boolean fields — present values and missing-field fallbacks
    // -------------------------------------------------------------------------

    @Test
    fun `isExpression and providerMiss true are preserved`() {
        val result = aResponseDto(
            kind = "expression",
            meta = aMetaDto(isExpression = true, providerMiss = true),
        ).toLookupResult()
        assertTrue(result.isExpression)
        assertTrue(result.providerMiss)
    }

    @Test
    fun `missing isExpression and providerMiss fall back to false`() {
        val result = aResponseDto(meta = aMetaDto(isExpression = null, providerMiss = null)).toLookupResult()
        assertFalse(result.isExpression)
        assertFalse(result.providerMiss)
    }

    @Test
    fun `expressionContextFound true is preserved`() {
        val result = aResponseDto(meta = aMetaDto(expressionContextFound = true)).toLookupResult()
        assertEquals(true, result.expressionContextFound)
    }

    @Test
    fun `expressionContextFound false is preserved`() {
        val result = aResponseDto(meta = aMetaDto(expressionContextFound = false)).toLookupResult()
        assertEquals(false, result.expressionContextFound)
    }

    @Test
    fun `absent expressionContextFound maps to null`() {
        val result = aResponseDto(meta = aMetaDto(expressionContextFound = null)).toLookupResult()
        assertNull(result.expressionContextFound)
    }

    // -------------------------------------------------------------------------
    // CreateUserDefinitionResponseDto -> CreatedUserDefinition
    // -------------------------------------------------------------------------

    @Test
    fun `CreateUserDefinitionResponseDto maps all fields`() {
        val dto = CreateUserDefinitionResponseDto(
            id = "def_123",
            wordId = "word_123",
            lemma = "run into",
            kind = "phrasal_verb",
            partOfSpeech = "phrase",
            definition = "To encounter unexpectedly.",
            example = "I ran into an old friend.",
            provider = "user",
        )

        val domain = dto.toDomain()

        assertEquals("def_123", domain.id)
        assertEquals("word_123", domain.wordId)
        assertEquals("run into", domain.lemma)
        assertEquals(LexicalKind.PHRASAL_VERB, domain.kind)
        assertEquals("phrase", domain.partOfSpeech)
        assertEquals("To encounter unexpectedly.", domain.definition)
        assertEquals("I ran into an old friend.", domain.example)
        assertEquals("user", domain.provider)
    }

    @Test
    fun `CreateUserDefinitionResponseDto with null example preserves null`() {
        val dto = CreateUserDefinitionResponseDto(
            id = "def_123",
            wordId = "word_123",
            lemma = "cat",
            kind = "word",
            partOfSpeech = "noun",
            definition = "A small animal",
            example = null,
            provider = "user",
        )

        assertNull(dto.toDomain().example)
    }
}
