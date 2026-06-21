package com.example.langueedroid.data

import com.example.langueedroid.data.remote.DecksApi
import com.example.langueedroid.data.remote.dto.DeckResponseDto
import com.example.langueedroid.domain.DeckConflictException
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import retrofit2.Response

class DeckRepositoryTest {

    private lateinit var decksApi: DecksApi
    private lateinit var repository: DeckRepository

    @Before
    fun setUp() {
        decksApi = mock()
        repository = DeckRepository(decksApi)
    }

    // -------------------------------------------------------------------------
    // getDecks — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks success returns mapped deck list`() = runTest {
        val dto = deckDto(id = "d1", name = "French")
        whenever(decksApi.getDecks()).thenReturn(Response.success(listOf(dto)))

        val result = repository.getDecks()

        assertTrue(result.isSuccess)
        val decks = result.getOrThrow()
        assertEquals(1, decks.size)
        assertEquals("d1", decks[0].id)
        assertEquals("French", decks[0].name)
    }

    // -------------------------------------------------------------------------
    // getDecks — empty list
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks success with null body returns empty list`() = runTest {
        whenever(decksApi.getDecks()).thenReturn(Response.success(null))

        val result = repository.getDecks()

        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().isEmpty())
    }

    // -------------------------------------------------------------------------
    // getDecks — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks 401 throws UnauthorizedException`() = runTest {
        whenever(decksApi.getDecks()).thenReturn(Response.error(401, "{}".toResponseBody()))

        val result = repository.getDecks()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // getDecks — other HTTP error → generic exception
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks 500 throws exception with status code in message`() = runTest {
        whenever(decksApi.getDecks()).thenReturn(Response.error(500, "{}".toResponseBody()))

        val result = repository.getDecks()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
    }

    // -------------------------------------------------------------------------
    // getDecks — network exception → failure
    // -------------------------------------------------------------------------

    @Test
    fun `getDecks network exception returns failure`() = runTest {
        whenever(decksApi.getDecks()).thenThrow(RuntimeException("no network"))

        val result = repository.getDecks()

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // createDeck — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck success returns mapped deck`() = runTest {
        val dto = deckDto(id = "d1", name = "German")
        whenever(decksApi.createDeck(any())).thenReturn(Response.success(dto))

        val result = repository.createDeck(name = "German")

        assertTrue(result.isSuccess)
        val deck = result.getOrThrow()
        assertEquals("d1", deck.id)
        assertEquals("German", deck.name)
    }

    // -------------------------------------------------------------------------
    // createDeck — 409 → DeckConflictException
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck 409 throws DeckConflictException`() = runTest {
        whenever(decksApi.createDeck(any())).thenReturn(Response.error(409, "{}".toResponseBody()))

        val result = repository.createDeck(name = "French")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is DeckConflictException)
    }

    // -------------------------------------------------------------------------
    // createDeck — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck 401 throws UnauthorizedException`() = runTest {
        whenever(decksApi.createDeck(any())).thenReturn(Response.error(401, "{}".toResponseBody()))

        val result = repository.createDeck(name = "French")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // createDeck — null body → failure
    // -------------------------------------------------------------------------

    @Test
    fun `createDeck null body returns failure`() = runTest {
        whenever(decksApi.createDeck(any())).thenReturn(Response.success(null))

        val result = repository.createDeck(name = "French")

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun deckDto(id: String, name: String) = DeckResponseDto(
        id = id,
        userId = "u1",
        name = name,
        createdAt = "2024-01-01T00:00:00Z",
        updatedAt = "2024-01-01T00:00:00Z",
    )
}
