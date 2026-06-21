package com.example.langueedroid.data

import com.example.langueedroid.core.data.VocabularyRepository
import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.network.dto.DeckRefDto
import com.example.langueedroid.core.network.dto.EnrichedDefinitionDto
import com.example.langueedroid.core.network.dto.LookupMetaDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import com.example.langueedroid.core.domain.UnauthorizedException
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import retrofit2.Response

class VocabularyRepositoryTest {

    private lateinit var vocabularyApi: VocabularyApi
    private lateinit var repository: VocabularyRepository

    @Before
    fun setUp() {
        vocabularyApi = mock()
        repository = VocabularyRepository(vocabularyApi)
    }

    // -------------------------------------------------------------------------
    // lookup — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `lookup success returns mapped LookupResult`() = runTest {
        val dto = aLookupResponseDto()
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull())).thenReturn(Response.success(dto))

        val result = repository.lookup(word = "cat", language = "en", context = "I have a cat")

        assertTrue(result.isSuccess)
        val lookupResult = result.getOrThrow()
        assertEquals("cat", lookupResult.input)
        assertEquals("cat", lookupResult.lemma)
        assertEquals(1, lookupResult.definitions.size)
        assertEquals("def1", lookupResult.definitions[0].id)
    }

    // -------------------------------------------------------------------------
    // lookup — definitions list mapped correctly including deck refs
    // -------------------------------------------------------------------------

    @Test
    fun `lookup maps deck refs in definitions`() = runTest {
        val deckRefDto = DeckRefDto(id = "d1", name = "French")
        val definition = aDefinitionDto(deckRefs = listOf(deckRefDto))
        val dto = aLookupResponseDto(definitions = listOf(definition))
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull())).thenReturn(Response.success(dto))

        val result = repository.lookup(word = "cat", language = "en", context = null)

        assertTrue(result.isSuccess)
        val def = result.getOrThrow().definitions[0]
        assertEquals(1, def.decks.size)
        assertEquals("d1", def.decks[0].id)
        assertEquals("French", def.decks[0].name)
    }

    // -------------------------------------------------------------------------
    // lookup — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `lookup 401 throws UnauthorizedException`() = runTest {
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull()))
            .thenReturn(Response.error(401, "{}".toResponseBody()))

        val result = repository.lookup(word = "cat")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // lookup — 404 → failure with message
    // -------------------------------------------------------------------------

    @Test
    fun `lookup 404 returns failure with message containing 404`() = runTest {
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull()))
            .thenReturn(Response.error(404, "{}".toResponseBody()))

        val result = repository.lookup(word = "cat")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("404") == true)
    }

    // -------------------------------------------------------------------------
    // lookup — 422 → failure
    // -------------------------------------------------------------------------

    @Test
    fun `lookup 422 returns failure`() = runTest {
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull()))
            .thenReturn(Response.error(422, "{}".toResponseBody()))

        val result = repository.lookup(word = "some words")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("422") == true)
    }

    // -------------------------------------------------------------------------
    // lookup — 502 → failure
    // -------------------------------------------------------------------------

    @Test
    fun `lookup 502 returns failure`() = runTest {
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull()))
            .thenReturn(Response.error(502, "{}".toResponseBody()))

        val result = repository.lookup(word = "cat")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("502") == true)
    }

    // -------------------------------------------------------------------------
    // lookup — null body → failure
    // -------------------------------------------------------------------------

    @Test
    fun `lookup null body returns failure`() = runTest {
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull()))
            .thenReturn(Response.success(null))

        val result = repository.lookup(word = "cat")

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // lookup — network exception → failure
    // -------------------------------------------------------------------------

    @Test
    fun `lookup network exception returns failure`() = runTest {
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull()))
            .thenThrow(RuntimeException("timeout"))

        val result = repository.lookup(word = "cat")

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // lookup — empty definitions list (200 OK, no defs)
    // -------------------------------------------------------------------------

    @Test
    fun `lookup returns 200 with empty definitions list`() = runTest {
        val dto = aLookupResponseDto(definitions = emptyList())
        whenever(vocabularyApi.lookup(any(), anyOrNull(), anyOrNull(), anyOrNull())).thenReturn(Response.success(dto))

        val result = repository.lookup(word = "cat")

        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().definitions.isEmpty())
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aDefinitionDto(deckRefs: List<DeckRefDto> = emptyList()) = EnrichedDefinitionDto(
        id = "def1",
        partOfSpeech = "noun",
        definition = "A small animal",
        example = "I have a cat",
        provider = "dict",
        hasIrregularForms = false,
        inflectionForms = null,
        decks = deckRefs,
    )

    private fun aLookupResponseDto(
        definitions: List<EnrichedDefinitionDto> = listOf(aDefinitionDto()),
    ) = LookupVocabularyResponseDto(
        input = "cat",
        context = null,
        lemma = "cat",
        partOfSpeech = "noun",
        definitions = definitions,
        meta = LookupMetaDto(
            filteredByPos = false,
            unmatchedPos = false,
            availablePartsOfSpeech = listOf("noun"),
        ),
    )
}
