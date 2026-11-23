package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckConflictException
import com.example.langueedroid.core.network.DecksApi
import com.example.langueedroid.core.network.dto.CreateDeckRequest

class DeckRepository(
    private val decksApi: DecksApi,
) {
    suspend fun getDecks(): Result<List<Deck>> =
        runCatchingCancellable {
            val response = decksApi.getDecks()
            response.throwIfUnsuccessful()
            response.body()?.map { it.toDomain() } ?: emptyList()
        }

    suspend fun createDeck(name: String): Result<Deck> =
        runCatchingCancellable {
            val response = decksApi.createDeck(CreateDeckRequest(name = name))
            response.throwIfUnsuccessful { status, message ->
                when {
                    status == 409 && message == "DECK_ALREADY_EXISTS" -> DeckConflictException()
                    else -> null
                }
            }
            response.bodyOrThrow().toDomain()
        }
}
