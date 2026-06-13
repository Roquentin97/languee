package com.example.langueedroid.data

import com.example.langueedroid.data.remote.CardsApi
import com.example.langueedroid.data.remote.dto.CreateCardRequest
import com.example.langueedroid.domain.CardAlreadyExistsException
import com.example.langueedroid.domain.StaleReferenceException
import com.example.langueedroid.domain.UnauthorizedException

class CardRepository(
    private val cardsApi: CardsApi,
) {

    suspend fun createCard(deckId: String, definitionId: String): Result<Unit> = runCatching {
        val response = cardsApi.createCard(
            CreateCardRequest(deckId = deckId, definitionId = definitionId),
        )
        when {
            response.isSuccessful -> Unit
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 404 -> throw StaleReferenceException()
            response.code() == 409 -> throw CardAlreadyExistsException()
            else -> throw Exception("Failed to create card: HTTP ${response.code()}")
        }
    }
}
