package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.data.mapper.toLookupResult
import com.example.langueedroid.core.domain.ContextTooLongException
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExpressionLimits
import com.example.langueedroid.core.domain.ExpressionTooLongException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.VocabularyNotFoundException
import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.network.dto.CreateUserDefinitionRequestDto
import com.example.langueedroid.core.network.dto.LookupVocabularyRequestDto
import com.example.langueedroid.core.network.dto.SavedMatchesRequestDto
import com.example.langueedroid.core.network.dto.SelectionRangeDto
import com.example.langueedroid.core.telemetry.Logger

class VocabularyRepository(
    private val vocabularyApi: VocabularyApi,
    private val logger: Logger,
) {
    suspend fun savedMatches(
        text: String,
        language: String,
    ): Result<List<SavedVocabulary>> =
        runCatchingCancellable {
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
            response.throwIfUnsuccessful()
            response.body()?.matches.orEmpty().flatMap { match ->
                match.headwords.flatMap { headword ->
                    headword.definitions.map { definition ->
                        SavedVocabulary(
                            surface = match.surface,
                            headword = headword.lemma,
                            entryId = headword.entryId,
                            definitionId = definition.definitionId,
                            partOfSpeech = definition.partOfSpeech,
                            definition = definition.definition,
                            decks = definition.decks.map { Deck(it.id, it.name) },
                        )
                    }
                }
            }
        }

    suspend fun lookup(
        text: String,
        language: String? = null,
        context: String? = null,
        selectionRanges: List<SelectionRange>? = null,
        includeSuggestions: Boolean = true,
    ): Result<LookupResult> =
        runCatchingCancellable {
            // Fail fast on obviously-too-long input so the user gets a specific message without a
            // round trip. NLP still owns the real limit — see [ExpressionLimits].
            if (ExpressionLimits.exceedsMaxWords(text)) {
                logger.info("vocabulary.expression_too_long", mapOf("max_words" to ExpressionLimits.MAX_WORDS.toString()))
                throw ExpressionTooLongException()
            }
            val response =
                vocabularyApi.lookup(
                    LookupVocabularyRequestDto(
                        text = text,
                        language = language ?: "en",
                        context = context,
                        selectionRanges = selectionRanges?.takeIf { it.isNotEmpty() }?.map { SelectionRangeDto(it.start, it.end) },
                        includeSuggestions = includeSuggestions,
                    ),
                )
            response.throwIfUnsuccessful { status, message ->
                when {
                    status == 400 && message == "INPUT_INVALID" -> LookupInputInvalidException()
                    status == 400 && message == "CONTEXT_TOO_LONG" -> ContextTooLongException()
                    status == 404 && message == "DEFINITIONS_NOT_FOUND" -> VocabularyNotFoundException()
                    else -> null
                }
            }
            val body = response.bodyOrThrow().toLookupResult()
            val definitionCount = body.definitions.size
            logger.info("vocabulary.lookup_succeeded", mapOf("definition_count" to definitionCount.toString()))
            body
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
        runCatchingCancellable {
            val response =
                vocabularyApi.createUserDefinition(
                    CreateUserDefinitionRequestDto(
                        text = text,
                        definition = definition,
                        language = language,
                        example = example,
                    ),
                )
            response.throwIfUnsuccessful { status, message ->
                when {
                    status == 400 && message == "INPUT_INVALID" -> LookupInputInvalidException()
                    status == 409 && message == "DEFINITION_ALREADY_EXISTS" -> DefinitionAlreadyExistsException()
                    else -> null
                }
            }
            val body = response.bodyOrThrow().toDomain()
            logger.info("vocabulary.definition_created", mapOf("definition_kind" to body.kind.name))
            body
        }
}
