package com.example.langueedroid.core.network

import com.example.langueedroid.core.network.dto.CreateUserDefinitionRequestDto
import com.example.langueedroid.core.network.dto.CreateUserDefinitionResponseDto
import com.example.langueedroid.core.network.dto.LookupVocabularyRequestDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import com.example.langueedroid.core.network.dto.SavedMatchesRequestDto
import com.example.langueedroid.core.network.dto.SavedMatchesResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface VocabularyApi {
    @POST("/api/v1/vocabulary/saved-matches")
    suspend fun savedMatches(
        @Body body: SavedMatchesRequestDto,
    ): Response<SavedMatchesResponseDto>

    @POST("/api/v1/vocabulary/lookup")
    suspend fun lookup(
        @Body body: LookupVocabularyRequestDto,
    ): Response<LookupVocabularyResponseDto>

    @POST("/api/v1/vocabulary/definitions")
    suspend fun createUserDefinition(
        @Body body: CreateUserDefinitionRequestDto,
    ): Response<CreateUserDefinitionResponseDto>
}
