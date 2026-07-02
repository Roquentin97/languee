package com.example.langueedroid.core.data.mapper

import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.ChatMessageDto
import com.example.langueedroid.core.network.dto.ChatSuggestionDto
import com.example.langueedroid.core.network.dto.CheckAnswerResponseDto
import com.example.langueedroid.core.network.dto.ConversationDetailResponseDto
import com.example.langueedroid.core.network.dto.ConversationResponseDto
import com.example.langueedroid.core.network.dto.ConversationSummaryDto
import com.example.langueedroid.core.network.dto.CreateUserDefinitionResponseDto
import com.example.langueedroid.core.network.dto.DeckResponseDto
import com.example.langueedroid.core.network.dto.EnrichedDefinitionDto
import com.example.langueedroid.core.network.dto.GradeResponseDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import com.example.langueedroid.core.network.dto.ReviewItemDto
import com.example.langueedroid.core.network.dto.ReviewPromptDto
import com.example.langueedroid.core.network.dto.ReviewSummaryDto
import com.example.langueedroid.core.network.dto.SuggestionsResponseDto
import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.ChatMessage
import com.example.langueedroid.core.domain.Conversation
import com.example.langueedroid.core.domain.ConversationSummary
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.OverusedWordPayload
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewPrompt
import com.example.langueedroid.core.domain.ReviewSummary
import com.example.langueedroid.core.domain.Role
import com.example.langueedroid.core.domain.ChatSuggestion
import com.example.langueedroid.core.domain.SuggestionType
import com.example.langueedroid.core.domain.SuggestionsResult

fun DeckResponseDto.toDomain(): Deck = Deck(
    id = id,
    name = name,
)

fun CardResponseDto.toDomain(): Card = Card(
    id = id,
    deckId = deckId,
    lemma = word.lemma,
    partOfSpeech = definition.partOfSpeech,
    definition = definition.definition,
    example = definition.example,
    context = context,
    inflectionForms = inflectionForms,
)

fun EnrichedDefinitionDto.toDomain(): DefinitionResult = DefinitionResult(
    id = id,
    partOfSpeech = partOfSpeech,
    definition = definition,
    example = example,
    provider = provider,
    decks = decks.map { DeckRef(id = it.id, name = it.name) },
    inflectionForms = inflectionForms,
)

fun LookupVocabularyResponseDto.toLookupResult(): LookupResult = LookupResult(
    input = input,
    lemma = lemma,
    definitions = definitions.map { it.toDomain() },
    context = context,
    kind = kind.toLexicalKind(),
    isExpression = meta.isExpression ?: false,
    providerMiss = meta.providerMiss ?: false,
    expressionContextFound = meta.expressionContextFound,
)

fun CreateUserDefinitionResponseDto.toDomain(): CreatedUserDefinition = CreatedUserDefinition(
    id = id,
    wordId = wordId,
    lemma = lemma,
    kind = kind.toLexicalKind(),
    partOfSpeech = partOfSpeech,
    definition = definition,
    example = example,
    provider = provider,
)

fun ReviewSummaryDto.toDomain(): ReviewSummary = ReviewSummary(
    dueCount = dueCount,
    newCount = newCount,
)

private fun String?.toLexicalKind(): LexicalKind = when (this) {
    "word" -> LexicalKind.WORD
    "phrasal_verb" -> LexicalKind.PHRASAL_VERB
    "expression" -> LexicalKind.EXPRESSION
    else -> LexicalKind.WORD
}

fun ReviewPromptDto.toDomain(): ReviewPrompt = ReviewPrompt(
    definition = definition,
    example = example,
    contextMasked = contextMasked,
    partOfSpeech = partOfSpeech,
    kind = kind.toLexicalKind(),
    lemmaLength = lemmaLength,
    language = language ?: "en",
)

fun ReviewItemDto.toDomain(): ReviewItem = ReviewItem(
    cardId = cardId,
    deckId = deckId,
    deckName = deckName,
    isNew = isNew,
    prompt = prompt.toDomain(),
)

private fun String.toAnswerResult(): AnswerResult = when (this) {
    "correct" -> AnswerResult.CORRECT
    "close_synonym" -> AnswerResult.CLOSE_SYNONYM
    "incorrect" -> AnswerResult.INCORRECT
    else -> AnswerResult.INCORRECT
}

fun CheckAnswerResponseDto.toDomain(): AnswerCheck = AnswerCheck(
    result = result.toAnswerResult(),
    matchedForm = matchedForm,
    hint = hint,
)

fun GradeResponseDto.toDomain(): GradeOutcome = GradeOutcome(
    nextDueAt = nextDueAt,
    intervalDays = intervalDays,
    state = state,
)

fun ConversationResponseDto.toDomain(): ConversationSummary = ConversationSummary(
    id = id,
    title = title,
    createdAt = createdAt,
    updatedAt = updatedAt,
    messageCount = messageCount,
    lastMessagePreview = null,
)

fun ConversationSummaryDto.toDomain(): ConversationSummary = ConversationSummary(
    id = id,
    title = title,
    createdAt = createdAt,
    updatedAt = updatedAt,
    messageCount = messageCount,
    lastMessagePreview = lastMessagePreview,
)

private fun String.toRole(): Role = when (this) {
    "user" -> Role.USER
    "assistant" -> Role.ASSISTANT
    else -> Role.ASSISTANT
}

fun ChatMessageDto.toDomain(): ChatMessage = ChatMessage(
    id = id,
    role = role.toRole(),
    content = content,
    createdAt = createdAt,
)

fun ConversationDetailResponseDto.toDomain(): Conversation = Conversation(
    id = id,
    title = title,
    createdAt = createdAt,
    messages = messages.map { it.toDomain() },
)

private fun String.toSuggestionType(): SuggestionType? = when (this) {
    "overused_word" -> SuggestionType.OVERUSED_WORD
    "grammar" -> SuggestionType.GRAMMAR
    "style" -> SuggestionType.STYLE
    else -> null
}

/**
 * Unknown suggestion types are mapped to STYLE (a plain white card in the UI) rather than
 * dropped, so an as-yet-unspecified backend suggestion type still surfaces to the learner
 * instead of silently disappearing. The `overused_word`-specific payload is only populated
 * for that exact type; payload fields are individually nullable so a missing field maps to
 * an empty/zero default instead of a parse failure.
 */
fun ChatSuggestionDto.toDomain(): ChatSuggestion {
    val resolvedType = type.toSuggestionType() ?: SuggestionType.STYLE
    val overusedWordPayload = if (resolvedType == SuggestionType.OVERUSED_WORD) {
        payload?.let {
            OverusedWordPayload(
                word = it.word ?: "",
                count = it.count ?: 0,
                synonyms = it.synonyms ?: emptyList(),
            )
        }
    } else {
        null
    }
    return ChatSuggestion(
        id = id,
        type = resolvedType,
        title = title,
        detail = detail,
        overusedWordPayload = overusedWordPayload,
        createdAt = createdAt,
    )
}

fun SuggestionsResponseDto.toDomain(): SuggestionsResult = SuggestionsResult(
    analyzedAt = analyzedAt,
    suggestions = suggestions.map { it.toDomain() },
)
