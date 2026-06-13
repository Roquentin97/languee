package com.example.langueedroid.data

import com.example.langueedroid.data.remote.VocabularyApi
import com.example.langueedroid.domain.LookupResult
import com.example.langueedroid.domain.UnauthorizedException
import com.example.langueedroid.domain.toLookupResult

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
