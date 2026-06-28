package com.example.langueedroid.core.data

import android.util.Log
import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.data.mapper.toLookupResult

private const val TAG = "VocabularyRepository"

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
            response.isSuccessful -> {
                val body = response.body()?.toLookupResult()
                    ?: throw Exception("Empty response body from vocabulary lookup")
                val definitionCount = body.definitions.size
                Log.i(TAG, "[event=vocabulary.lookup_succeeded method=lookup] lookup succeeded | lemma=${body.lemma} definitionCount=$definitionCount")
                body
            }
            response.code() == 401 -> {
                Log.w(TAG, "[event=vocabulary.unauthorized method=lookup] unauthorized")
                throw UnauthorizedException()
            }
            else -> throw Exception("Vocabulary lookup failed: HTTP ${response.code()}")
        }
    }
}
