package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.dto.CreateCardRequest
import com.example.langueedroid.core.telemetry.Logger

class CardRepository(
    private val cardsApi: CardsApi,
    private val logger: Logger,
) {
    suspend fun createCard(
        deckId: String,
        definitionId: String,
        context: String? = null,
        inflectionForms: Map<String, String>? = null,
        lookupId: String? = null,
    ): Result<String> =
        runCatching {
            val response =
                cardsApi.createCard(
                    CreateCardRequest(
                        deckId = deckId,
                        definitionId = definitionId,
                        context = context,
                        inflectionForms = inflectionForms,
                        lookupId = lookupId,
                    ),
                )
            when {
                response.isSuccessful -> {
                    val body = response.body() ?: throw Exception("Empty response body from createCard")
                    val cardId =
                        body.cards.firstOrNull { it.type == "cloze" }?.id
                            ?: body.cards.firstOrNull()?.id
                            ?: throw Exception("Create card response contained no cards")
                    logger.info("card.created")
                    cardId
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> throw StaleReferenceException()
                response.code() == 409 -> throw CardAlreadyExistsException()
                else -> throw Exception("Failed to create card: HTTP ${response.code()}")
            }
        }

    suspend fun listCards(deckId: String): Result<List<Card>> =
        runCatching {
            val response = cardsApi.listCards(deckId)
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()
                            ?: throw Exception("Empty response body from listCards")
                    body.map { it.toDomain(requestedDeckId = deckId) }
                }
                response.code() == 401 -> throw UnauthorizedException()
                else -> throw Exception("Failed to list cards: HTTP ${response.code()}")
            }
        }

    suspend fun getCard(cardId: String): Result<Card> =
        runCatching {
            val response = cardsApi.getCard(cardId)
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()
                            ?: throw Exception("Empty response body from getCard")
                    body.toDomain()
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 404 -> {
                    logger.warn("card.not_found")
                    throw StaleReferenceException()
                }
                else -> throw Exception("Failed to get card: HTTP ${response.code()}")
            }
        }
}

data class SavedVocabulary(
    val surface: String,
    val headword: String,
    val wordId: String,
    val definitionId: String,
    val partOfSpeech: String,
    val definition: String,
    val decks: List<Deck>,
)
