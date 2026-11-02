package com.example.langueedroid.core.data.mapper

import com.example.langueedroid.core.domain.AnswerCheck
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.CardType
import com.example.langueedroid.core.domain.CreatedUserDefinition
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionReview
import com.example.langueedroid.core.domain.GradeOutcome
import com.example.langueedroid.core.domain.InflectionReview
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.RevealedWord
import com.example.langueedroid.core.domain.ReviewCardType
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
import com.example.langueedroid.core.network.dto.RevealedWordDto
import com.example.langueedroid.core.network.dto.ReviewItemDto
import com.example.langueedroid.core.network.dto.ReviewPromptDto
import com.example.langueedroid.core.network.dto.ReviewSummaryDto

fun DeckResponseDto.toDomain(): Deck =
    Deck(
        id = id,
        name = name,
    )

fun CardResponseDto.toDomain(requestedDeckId: String? = null): Card {
    val deck = decks.firstOrNull { it.id == requestedDeckId } ?: decks.firstOrNull()
    val cardType =
        when (type) {
            "cloze" -> CardType.CLOZE
            "inflection" -> CardType.INFLECTION
            "definition" -> CardType.DEFINITION
            else -> error("Unknown card type '$type' for card $id")
        }
    return Card(
        id = id,
        deckId = deck?.id.orEmpty(),
        lemma = word.lemma,
        partOfSpeech = definition?.partOfSpeech ?: partOfSpeech.orEmpty(),
        definition = definition?.definition.orEmpty(),
        example = definition?.example,
        context = context,
        inflectionForms = inflectionForms,
        type = cardType,
    )
}

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
        language = language,
    )

fun ReviewItemDto.toDomain(): ReviewItem {
    val cardType =
        when (type) {
            "inflection" -> ReviewCardType.INFLECTION
            "definition" -> ReviewCardType.DEFINITION
            "cloze" -> ReviewCardType.CLOZE
            else -> error("Unknown review card type '$type' for card $cardId")
        }
    val deck = decks.firstOrNull()
    val inflectionData = inflection
    val definitionData = definition
    val prompt =
        when (cardType) {
            ReviewCardType.CLOZE ->
                requireNotNull(cloze) { "Review item $cardId has no cloze payload" }.toDomain()
            ReviewCardType.INFLECTION -> {
                val data = requireNotNull(inflectionData) { "Review item $cardId has no inflection payload" }
                ReviewPrompt(
                    definition = "Enter the forms of ${data.lemma}",
                    maskedSentence = null,
                    partOfSpeech = data.partOfSpeech,
                    kind = data.kind.toLexicalKind(),
                    lemmaLength = data.lemma.length,
                    language = data.language,
                )
            }
            ReviewCardType.DEFINITION -> {
                val data = requireNotNull(definitionData) { "Review item $cardId has no definition payload" }
                ReviewPrompt(
                    definition = "What does ${data.lemma} mean?",
                    maskedSentence = null,
                    partOfSpeech = data.partOfSpeech,
                    kind = data.kind.toLexicalKind(),
                    lemmaLength = data.lemma.length,
                    language = data.language,
                )
            }
        }
    return ReviewItem(
        cardId = cardId,
        deckId = deck?.id.orEmpty(),
        deckName = deck?.name.orEmpty(),
        isNew = isNew,
        prompt = prompt,
        type = cardType,
        inflection = inflectionData?.let { InflectionReview(it.lemma, it.formKeys) },
        definition = definitionData?.let { DefinitionReview(it.lemma, it.hint1, it.hint2) },
    )
}

fun RevealedWordDto.toDomain(): RevealedWord =
    RevealedWord(
        lemma = lemma,
        ipa = ipa,
        inflectionForms = inflectionForms,
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
