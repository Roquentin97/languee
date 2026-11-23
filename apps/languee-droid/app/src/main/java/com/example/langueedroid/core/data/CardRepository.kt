package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RemoteOperationFailureException
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.dto.CreateCardRequest
import com.example.langueedroid.core.network.dto.SelectionRangeDto
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
        targetRanges: List<SelectionRange>? = null,
    ): Result<String> =
        runCatchingCancellable {
            val response =
                cardsApi.createCard(
                    CreateCardRequest(
                        deckId = deckId,
                        definitionId = definitionId,
                        context = context,
                        inflectionForms = inflectionForms,
                        lookupId = lookupId,
                        targetRanges = targetRanges?.takeIf { it.isNotEmpty() }?.map { SelectionRangeDto(it.start, it.end) },
                    ),
                )
            response.throwIfUnsuccessful { status, message ->
                when {
                    status == 404 && message == "DECK_NOT_FOUND" -> StaleReferenceException()
                    status == 404 && message == "DEFINITION_NOT_FOUND" -> StaleReferenceException()
                    status == 409 && message == "CARD_ALREADY_EXISTS" -> CardAlreadyExistsException()
                    else -> null
                }
            }
            val body = response.bodyOrThrow()
            val cardId =
                body.cards.firstOrNull { it.type == "cloze" }?.id
                    ?: body.cards.firstOrNull()?.id
                    ?: throw RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED)
            logger.info("card.created")
            cardId
        }

    suspend fun listCards(deckId: String): Result<List<Card>> =
        runCatchingCancellable {
            val response = cardsApi.listCards(deckId)
            response.throwIfUnsuccessful()
            response.bodyOrThrow().map { it.toDomain(requestedDeckId = deckId) }
        }

    suspend fun getCard(cardId: String): Result<Card> =
        runCatchingCancellable {
            val response = cardsApi.getCard(cardId)
            response.throwIfUnsuccessful { status, message ->
                when {
                    status == 404 && message == "CARD_NOT_FOUND" -> StaleReferenceException()
                    else -> null
                }
            }
            response.bodyOrThrow().toDomain()
        }
}

data class SavedVocabulary(
    val surface: String,
    val headword: String,
    val entryId: String,
    val definitionId: String,
    val partOfSpeech: String,
    val definition: String,
    val decks: List<Deck>,
)
