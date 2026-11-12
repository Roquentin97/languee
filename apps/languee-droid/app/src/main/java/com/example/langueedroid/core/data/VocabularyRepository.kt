package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.data.mapper.toLookupResult
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExpressionLimits
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.network.dto.CreateUserDefinitionRequestDto
import com.example.langueedroid.core.network.dto.SavedMatchesRequestDto
import com.example.langueedroid.core.telemetry.Logger

class VocabularyRepository(
    private val vocabularyApi: VocabularyApi,
    private val logger: Logger,
) {
    suspend fun savedMatches(
        text: String,
        language: String,
    ): Result<List<SavedVocabulary>> =
        runCatching {
            val validation = EntryValidator.validateCaptureText(text)
            require(validation.isValid) { "Invalid capture text" }
            val response =
                vocabularyApi.savedMatches(
                    SavedMatchesRequestDto(
                        language = language,
                        text = text,
                        tokens = EntryValidator.distinctSurfaceTokens(text),
                    ),
                )
            when {
                response.isSuccessful ->
                    response.body()?.matches.orEmpty().flatMap { match ->
                        match.headwords.flatMap { headword ->
                            headword.definitions.map { definition ->
                                SavedVocabulary(
                                    surface = match.surface,
                                    headword = headword.lemma,
                                    wordId = headword.wordId,
                                    definitionId = definition.definitionId,
                                    partOfSpeech = definition.partOfSpeech,
                                    definition = definition.definition,
                                    decks = definition.decks.map { Deck(it.id, it.name) },
                                )
                            }
                        }
                    }
                response.code() == 401 -> throw UnauthorizedException()
                else -> throw Exception("Failed to find saved vocabulary: HTTP ${response.code()}")
            }
        }

    suspend fun lookup(
        word: String,
        language: String? = null,
        context: String? = null,
        selectionStart: Int? = null,
        selectionEnd: Int? = null,
    ): Result<LookupResult> =
        runCatching {
            // Fail fast on obviously-too-long input so the user gets a specific message without a
            // round trip. NLP still owns the real limit — see [ExpressionLimits].
            if (ExpressionLimits.exceedsMaxWords(word)) {
                logger.info("vocabulary.expression_too_long", mapOf("max_words" to ExpressionLimits.MAX_WORDS.toString()))
                throw ExpressionTooLongException()
            }
            val response =
                vocabularyApi.lookup(
                    word = word,
                    language = language,
                    context = context,
                    selectionStart = selectionStart,
                    selectionEnd = selectionEnd,
                )
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toLookupResult()
                            ?: throw Exception("Empty response body from vocabulary lookup")
                    val definitionCount = body.definitions.size
                    logger.info("vocabulary.lookup_succeeded", mapOf("definition_count" to definitionCount.toString()))
                    body
                }
                response.code() == 401 -> {
                    logger.warn("vocabulary.unauthorized")
                    throw UnauthorizedException()
                }
                response.code() == 400 -> {
                    logger.warn("vocabulary.input_invalid")
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
    ): Result<CreatedUserDefinition> =
        runCatching {
            val response =
                vocabularyApi.createUserDefinition(
                    CreateUserDefinitionRequestDto(
                        text = text,
                        definition = definition,
                        language = language,
                        example = example,
                    ),
                )
            when {
                response.isSuccessful -> {
                    val body =
                        response.body()?.toDomain()
                            ?: throw Exception("Empty response body from createUserDefinition")
                    logger.info("vocabulary.definition_created", mapOf("definition_kind" to body.kind.name))
                    body
                }
                response.code() == 401 -> throw UnauthorizedException()
                response.code() == 409 -> throw DefinitionAlreadyExistsException()
                else -> throw Exception("Failed to create user definition: HTTP ${response.code()}")
            }
        }
}
