package com.example.langueedroid.core.data.mapper

import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.RevealedWord
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewPrompt
import com.example.langueedroid.core.domain.ReviewSummary
import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.CheckAnswerResponseDto
import com.example.langueedroid.core.network.dto.CreateUserDefinitionResponseDto
import com.example.langueedroid.core.network.dto.DeckResponseDto
import com.example.langueedroid.core.network.dto.EnrichedDefinitionDto
import com.example.langueedroid.core.network.dto.GradeResponseDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import com.example.langueedroid.core.network.dto.ReviewItemDto
import com.example.langueedroid.core.network.dto.ReviewPromptDto
import com.example.langueedroid.core.network.dto.ReviewSummaryDto

fun DeckResponseDto.toDomain(): Deck =
    Deck(
        id = id,
        name = name,
    )

fun CardResponseDto.toDomain(): Card =
    Card(
        id = id,
        deckId = deckId,
        lemma = word.lemma,
        partOfSpeech = definition.partOfSpeech,
        definition = definition.definition,
        example = definition.example,
        context = context,
        inflectionForms = inflectionForms,
    )

fun EnrichedDefinitionDto.toDomain(): DefinitionResult =
    DefinitionResult(
        id = id,
        partOfSpeech = partOfSpeech,
        definition = definition,
        example = example,
        provider = provider,
        decks = decks.map { DeckRef(id = it.id, name = it.name) },
        inflectionForms = inflectionForms,
    )

fun LookupVocabularyResponseDto.toLookupResult(): LookupResult =
    LookupResult(
        input = input,
        lemma = lemma,
        definitions = definitions.map { it.toDomain() },
        context = context,
        kind = kind.toLexicalKind(),
        isExpression = meta.isExpression ?: false,
        providerMiss = meta.providerMiss ?: false,
        expressionContextFound = meta.expressionContextFound,
    )

fun CreateUserDefinitionResponseDto.toDomain(): CreatedUserDefinition =
    CreatedUserDefinition(
        id = id,
        wordId = wordId,
        lemma = lemma,
        kind = kind.toLexicalKind(),
        partOfSpeech = partOfSpeech,
        definition = definition,
        example = example,
        provider = provider,
    )

fun ReviewSummaryDto.toDomain(): ReviewSummary =
    ReviewSummary(
        dueCount = dueCount,
        newCount = newCount,
    )

private fun String?.toLexicalKind(): LexicalKind =
    when (this) {
        "word" -> LexicalKind.WORD
        "phrasal_verb" -> LexicalKind.PHRASAL_VERB
        "expression" -> LexicalKind.EXPRESSION
        else -> LexicalKind.WORD
    }

fun ReviewPromptDto.toDomain(): ReviewPrompt =
    ReviewPrompt(
        definition = definition,
        maskedSentence = maskedSentence,
        partOfSpeech = partOfSpeech,
        kind = kind.toLexicalKind(),
        lemmaLength = lemmaLength,
        language = language ?: "en",
    )

fun ReviewItemDto.toDomain(): ReviewItem =
    ReviewItem(
        cardId = cardId,
        deckId = deckId,
        deckName = deckName,
        isNew = isNew,
        prompt = prompt.toDomain(),
    )

private fun String.toAnswerResult(): AnswerResult =
    when (this) {
        "correct" -> AnswerResult.CORRECT
        "incorrect" -> AnswerResult.INCORRECT
        else -> AnswerResult.INCORRECT
    }

fun CheckAnswerResponseDto.toDomain(): AnswerCheck =
    AnswerCheck(
        result = result.toAnswerResult(),
        matchedForm = matchedForm,
        revealed =
            revealed?.let {
                RevealedWord(
                    lemma = it.lemma,
                    ipa = it.ipa,
                    inflectionForms = it.inflectionForms,
                )
            },
    )

fun GradeResponseDto.toDomain(): GradeOutcome =
    GradeOutcome(
        nextDueAt = nextDueAt,
        intervalDays = intervalDays,
        state = state,
    )
