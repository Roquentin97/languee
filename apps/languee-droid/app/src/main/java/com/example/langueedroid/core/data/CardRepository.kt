package com.example.langueedroid.core.data

import android.util.Log
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.dto.CreateCardRequest
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.data.mapper.toDomain

private const val TAG = "CardRepository"

class CardRepository(
    private val cardsApi: CardsApi,
) {

    suspend fun createCard(
        deckId: String,
        definitionId: String,
        context: String? = null,
        inflectionForms: Map<String, String>? = null,
    ): Result<String> = runCatching {
        val response = cardsApi.createCard(
            CreateCardRequest(
                deckId = deckId,
                definitionId = definitionId,
                context = context,
                inflectionForms = inflectionForms,
            ),
        )
        when {
            response.isSuccessful -> {
                val body = response.body()
                    ?: throw Exception("Empty response body from createCard")
                Log.i(TAG, "[event=card.created method=createCard] card created | cardId=${body.id}")
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
            response.code() == 404 -> {
                Log.w(TAG, "[event=card.not_found method=getCard] card not found | cardId=$cardId")
                throw StaleReferenceException()
            }
            else -> throw Exception("Failed to get card: HTTP ${response.code()}")
        }
    }
}
