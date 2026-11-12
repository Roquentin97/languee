package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.CreateCardRequest
import com.example.langueedroid.core.telemetry.Logger

class CardRepository(
    private val cardsApi: CardsApi,
    private val logger: Logger,
) {
    suspend fun savedVocabulary(): Result<List<SavedVocabulary>> =
        runCatching {
            val response = cardsApi.listCards(null)
            when {
                response.code() == 401 -> throw UnauthorizedException()
                !response.isSuccessful -> throw Exception("Failed to list saved vocabulary: HTTP ${response.code()}")
                else -> savedSenses(response.body() ?: throw Exception("Empty response body from listCards"))
            }
        }

    suspend fun createCard(
        deckId: String,
        definitionId: String,
        context: String? = null,
        inflectionForms: Map<String, String>? = null,
    ): Result<String> =
        runCatching {
            val response =
                cardsApi.createCard(
                    CreateCardRequest(
                        deckId = deckId,
                        definitionId = definitionId,
                        context = context,
                        inflectionForms = inflectionForms,
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

private fun savedSenses(cards: List<CardResponseDto>): List<SavedVocabulary> =
    cards
        .filter { it.definition != null && it.decks.isNotEmpty() }
        .groupBy { it.definition?.id }
        .values
        .map { group ->
            val card = group.first()
            val definition = requireNotNull(card.definition)
            SavedVocabulary(
                card.word.lemma,
                definition.partOfSpeech,
                definition.definition,
                group.flatMap { it.decks }.distinctBy { it.id }.map { it.name },
            )
        }

data class SavedVocabulary(
    val headword: String,
    val partOfSpeech: String,
    val definition: String,
    val decks: List<String>,
)
