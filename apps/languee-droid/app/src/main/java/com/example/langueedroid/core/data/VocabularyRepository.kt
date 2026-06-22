package com.example.langueedroid.core.data

import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.data.mapper.toLookupResult

class VocabularyRepository(
    private val vocabularyApi: VocabularyApi,
) {

    suspend fun lookup(
        word: String,
        language: String? = null,
        context: String? = null,
    ): Result<LookupResult> = runCatching {
        val response = vocabularyApi.lookup(word = word, language = language, context = context)
        when {
            response.isSuccessful -> response.body()?.toLookupResult()
                ?: throw Exception("Empty response body from vocabulary lookup")
            response.code() == 401 -> throw UnauthorizedException()
            else -> throw Exception("Vocabulary lookup failed: HTTP ${response.code()}")
        }
    }
}
