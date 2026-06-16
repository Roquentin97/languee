package com.example.langueedroid.data

import com.example.langueedroid.data.remote.CardsApi
import com.example.langueedroid.data.remote.dto.CreateCardRequest
import com.example.langueedroid.domain.Card
import com.example.langueedroid.domain.CardAlreadyExistsException
import com.example.langueedroid.domain.StaleReferenceException
import com.example.langueedroid.domain.UnauthorizedException
import com.example.langueedroid.domain.toDomain

class CardRepository(
    private val cardsApi: CardsApi,
) {

    suspend fun createCard(deckId: String, definitionId: String): Result<String> = runCatching {
        val response = cardsApi.createCard(
            CreateCardRequest(deckId = deckId, definitionId = definitionId),
        )
        when {
            response.isSuccessful -> {
                val body = response.body()
                    ?: throw Exception("Empty response body from createCard")
                body.id
            }
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 404 -> throw StaleReferenceException()
            response.code() == 409 -> throw CardAlreadyExistsException()
            else -> throw Exception("Failed to create card: HTTP ${response.code()}")
        }
    }

    suspend fun getCard(cardId: String): Result<Card> = runCatching {
        val response = cardsApi.getCard(cardId)
        when {
            response.isSuccessful -> {
                val body = response.body()
                    ?: throw Exception("Empty response body from getCard")
                body.toDomain()
            }
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 404 -> throw StaleReferenceException()
            else -> throw Exception("Failed to get card: HTTP ${response.code()}")
        }
    }
}
