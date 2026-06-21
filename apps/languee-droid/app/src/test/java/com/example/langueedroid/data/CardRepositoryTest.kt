package com.example.langueedroid.data

import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.dto.CardDefinitionDto
import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.CardWordDto
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import retrofit2.Response

class CardRepositoryTest {

    private lateinit var cardsApi: CardsApi
    private lateinit var repository: CardRepository

    @Before
    fun setUp() {
        cardsApi = mock()
        repository = CardRepository(cardsApi)
    }

    // -------------------------------------------------------------------------
    // createCard — happy path (201)
    // -------------------------------------------------------------------------

    @Test
    fun `createCard success returns Unit`() = runTest {
        whenever(cardsApi.createCard(any())).thenReturn(Response.success(aCardResponseDto()))

        val result = repository.createCard(deckId = "d1", definitionId = "def1")

        assertTrue(result.isSuccess)
    }

    // -------------------------------------------------------------------------
    // createCard — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 401 throws UnauthorizedException`() = runTest {
        whenever(cardsApi.createCard(any())).thenReturn(Response.error(401, "{}".toResponseBody()))

        val result = repository.createCard(deckId = "d1", definitionId = "def1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // createCard — 404 → StaleReferenceException
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 404 throws StaleReferenceException`() = runTest {
        whenever(cardsApi.createCard(any())).thenReturn(Response.error(404, "{}".toResponseBody()))

        val result = repository.createCard(deckId = "d1", definitionId = "def1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is StaleReferenceException)
    }

    // -------------------------------------------------------------------------
    // createCard — 409 → CardAlreadyExistsException
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 409 throws CardAlreadyExistsException`() = runTest {
        whenever(cardsApi.createCard(any())).thenReturn(Response.error(409, "{}".toResponseBody()))

        val result = repository.createCard(deckId = "d1", definitionId = "def1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is CardAlreadyExistsException)
    }

    // -------------------------------------------------------------------------
    // createCard — 500 → generic failure
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 500 returns generic failure`() = runTest {
        whenever(cardsApi.createCard(any())).thenReturn(Response.error(500, "{}".toResponseBody()))

        val result = repository.createCard(deckId = "d1", definitionId = "def1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
    }

    // -------------------------------------------------------------------------
    // createCard — network exception → failure
    // -------------------------------------------------------------------------

    @Test
    fun `createCard network exception returns failure`() = runTest {
        whenever(cardsApi.createCard(any())).thenThrow(RuntimeException("no network"))

        val result = repository.createCard(deckId = "d1", definitionId = "def1")

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aCardResponseDto() = CardResponseDto(
        id = "c1",
        deckId = "d1",
        userId = "u1",
        definitionId = "def1",
        createdAt = "2024-01-01T00:00:00Z",
        updatedAt = "2024-01-01T00:00:00Z",
        definition = CardDefinitionDto(
            id = "def1",
            partOfSpeech = "noun",
            definition = "A small animal",
            example = null,
            provider = "dict",
        ),
        word = CardWordDto(id = "w1", lemma = "cat", language = "en"),
    )
}
