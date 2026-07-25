package com.example.langueedroid.core.data

import android.util.Log
import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.network.dto.CreateUserDefinitionRequestDto
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.ExpressionLimits
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.data.mapper.toDomain
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
        // Fail fast on obviously-too-long input so the user gets a specific message without a
        // round trip. NLP still owns the real limit — see [ExpressionLimits].
        if (ExpressionLimits.exceedsMaxWords(word)) {
            Log.i(TAG, "[event=vocabulary.expression_too_long method=lookup] input exceeds ${ExpressionLimits.MAX_WORDS} words")
            throw ExpressionTooLongException()
        }
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
            response.code() == 400 -> {
                val errorBody = response.errorBody()?.string().orEmpty()
                Log.w(TAG, "[event=vocabulary.input_invalid method=lookup] lookup input rejected | body=$errorBody")
                throw LookupInputInvalidException()
            }
            else -> throw Exception("Vocabulary lookup failed: HTTP ${response.code()}")
        }
    }

    /**
     * Submits a user-provided definition for a word or expression the dictionary provider
     * does not know. The server classifies the text and returns the resulting kind — read
     * [CreatedUserDefinition.kind] back rather than assuming it.
     */
    suspend fun createUserDefinition(
        text: String,
        definition: String,
        language: String? = null,
        example: String? = null,
    ): Result<CreatedUserDefinition> = runCatching {
        val response = vocabularyApi.createUserDefinition(
            CreateUserDefinitionRequestDto(
                text = text,
                definition = definition,
                language = language,
                example = example,
            ),
        )
        when {
            response.isSuccessful -> {
                val body = response.body()?.toDomain()
                    ?: throw Exception("Empty response body from createUserDefinition")
                Log.i(TAG, "[event=vocabulary.definition_created method=createUserDefinition] definition created | id=${body.id} kind=${body.kind}")
                body
            }
            response.code() == 401 -> throw UnauthorizedException()
            response.code() == 409 -> throw DefinitionAlreadyExistsException()
            else -> throw Exception("Failed to create user definition: HTTP ${response.code()}")
        }
    }
}
