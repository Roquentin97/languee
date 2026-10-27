package com.example.langueedroid.data

import com.example.langueedroid.core.data.CardRepository
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.dto.CardDeckDto
import com.example.langueedroid.core.network.dto.CardDefinitionDto
import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.CardWordDto
import com.example.langueedroid.core.network.dto.CreateCardsResponseDto
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
    fun `createCard success returns cloze card id from generated cards`() =
        runTest {
            whenever(cardsApi.createCard(any())).thenReturn(
                Response.success(
                    CreateCardsResponseDto(
                        cards = listOf(aCardResponseDto(type = "definition"), aCardResponseDto(id = "cloze-id", type = "cloze")),
                    ),
                ),
            )

            val result = repository.createCard(deckId = "d1", definitionId = "def1")

            assertTrue(result.isSuccess)
            org.junit.Assert.assertEquals("cloze-id", result.getOrThrow())
        }

    // -------------------------------------------------------------------------
    // createCard — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 401 throws UnauthorizedException`() =
        runTest {
            whenever(cardsApi.createCard(any())).thenReturn(Response.error(401, "{}".toResponseBody()))

            val result = repository.createCard(deckId = "d1", definitionId = "def1")

            assertTrue(result.isFailure)
            assertTrue(result.exceptionOrNull() is UnauthorizedException)
        }

    // -------------------------------------------------------------------------
    // createCard — 404 → StaleReferenceException
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 404 throws StaleReferenceException`() =
        runTest {
            whenever(cardsApi.createCard(any())).thenReturn(Response.error(404, "{}".toResponseBody()))

            val result = repository.createCard(deckId = "d1", definitionId = "def1")

            assertTrue(result.isFailure)
            assertTrue(result.exceptionOrNull() is StaleReferenceException)
        }

    // -------------------------------------------------------------------------
    // createCard — 409 → CardAlreadyExistsException
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 409 throws CardAlreadyExistsException`() =
        runTest {
            whenever(cardsApi.createCard(any())).thenReturn(Response.error(409, "{}".toResponseBody()))

            val result = repository.createCard(deckId = "d1", definitionId = "def1")

            assertTrue(result.isFailure)
            assertTrue(result.exceptionOrNull() is CardAlreadyExistsException)
        }

    // -------------------------------------------------------------------------
    // createCard — 500 → generic failure
    // -------------------------------------------------------------------------

    @Test
    fun `createCard 500 returns generic failure`() =
        runTest {
            whenever(cardsApi.createCard(any())).thenReturn(Response.error(500, "{}".toResponseBody()))

            val result = repository.createCard(deckId = "d1", definitionId = "def1")

            assertTrue(result.isFailure)
            assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
        }

    // -------------------------------------------------------------------------
    // createCard — network exception → failure
    // -------------------------------------------------------------------------

    @Test
    fun `createCard network exception returns failure`() =
        runTest {
            whenever(cardsApi.createCard(any())).thenThrow(RuntimeException("no network"))

            val result = repository.createCard(deckId = "d1", definitionId = "def1")

            assertTrue(result.isFailure)
        }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // listCards
    // -------------------------------------------------------------------------

    @Test
    fun `listCards success returns mapped domain cards`() =
        runTest {
            whenever(cardsApi.listCards("d1")).thenReturn(
                Response.success(listOf(aCardResponseDto())),
            )

            val result = repository.listCards("d1")

            assertTrue(result.isSuccess)
            val cards = result.getOrThrow()
            assertTrue(cards.size == 1)
            assertTrue(cards[0].lemma == "cat")
            assertTrue(cards[0].deckId == "d1")
        }

    @Test
    fun `listCards maps inflection cards without a definition payload`() =
        runTest {
            whenever(cardsApi.listCards("d1")).thenReturn(
                Response.success(listOf(aCardResponseDto(id = "inflection-id", type = "inflection"))),
            )

            val card = repository.listCards("d1").getOrThrow().single()

            org.junit.Assert.assertEquals(com.example.langueedroid.core.domain.CardType.INFLECTION, card.type)
            org.junit.Assert.assertEquals("verb", card.partOfSpeech)
            org.junit.Assert.assertEquals("ran", card.inflectionForms?.get("past"))
        }

    @Test
    fun `listCards 401 throws UnauthorizedException`() =
        runTest {
            whenever(cardsApi.listCards("d1")).thenReturn(Response.error(401, "{}".toResponseBody()))

            val result = repository.listCards("d1")

            assertTrue(result.isFailure)
            assertTrue(result.exceptionOrNull() is UnauthorizedException)
        }

    @Test
    fun `listCards server error returns failure`() =
        runTest {
            whenever(cardsApi.listCards("d1")).thenReturn(Response.error(500, "{}".toResponseBody()))

            val result = repository.listCards("d1")

            assertTrue(result.isFailure)
        }

    private fun aCardResponseDto(
        id: String = "c1",
        type: String = "cloze",
    ) = CardResponseDto(
        id = id,
        type = type,
        userId = "u1",
        decks = listOf(CardDeckDto(id = "d1", name = "English")),
        definitionId = if (type == "inflection") null else "def1",
        wordId = if (type == "inflection") "w1" else null,
        partOfSpeech = if (type == "inflection") "verb" else null,
        context = null,
        createdAt = "2024-01-01T00:00:00Z",
        updatedAt = "2024-01-01T00:00:00Z",
        definition =
            if (type != "inflection") {
                CardDefinitionDto(
                    id = "def1",
                    partOfSpeech = "noun",
                    definition = "A small animal",
                    example = null,
                    provider = "dict",
                    inflectionForms = null,
                )
            } else {
                null
            },
        inflectionForms = if (type == "inflection") mapOf("type" to "verb", "base" to "run", "past" to "ran") else null,
        word = CardWordDto(id = "w1", lemma = "cat", language = "en"),
    )
}
