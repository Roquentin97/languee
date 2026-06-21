package com.example.langueedroid.core.data

import com.example.langueedroid.core.network.DecksApi
import com.example.langueedroid.core.network.dto.CreateDeckRequest
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckConflictException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.data.mapper.toDomain

class DeckRepository(
    private val decksApi: DecksApi,
) {

    suspend fun getDecks(): Result<List<Deck>> = runCatching {
        val response = decksApi.getDecks()
        when {
            response.isSuccessful -> response.body()?.map { it.toDomain() } ?: emptyList()
            response.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Failed to fetch decks: HTTP ${response.code()}")
        }
    }

    suspend fun createDeck(name: String): Result<Deck> = runCatching {
        val response = decksApi.createDeck(CreateDeckRequest(name = name))
        when {
            response.isSuccessful -> response.body()?.toDomain()
                ?: throw Exception("Empty response body when creating deck")
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 409 -> throw DeckConflictException()
            else -> throw Exception("Failed to create deck: HTTP ${response.code()}")
        }
    }
}
