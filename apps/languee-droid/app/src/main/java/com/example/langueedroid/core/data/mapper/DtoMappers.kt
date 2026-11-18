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
import com.example.langueedroid.core.domain.LexicalEntryKind
import com.example.langueedroid.core.domain.LookupAlternative
import com.example.langueedroid.core.domain.LookupResult
import com.example.langueedroid.core.domain.RevealedEntry
import com.example.langueedroid.core.domain.ReviewCardType
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewPrompt
import com.example.langueedroid.core.domain.ReviewSummary
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.CheckAnswerResponseDto
import com.example.langueedroid.core.network.dto.CreateUserDefinitionResponseDto
import com.example.langueedroid.core.network.dto.DeckResponseDto
import com.example.langueedroid.core.network.dto.EnrichedDefinitionDto
import com.example.langueedroid.core.network.dto.GradeResponseDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import com.example.langueedroid.core.network.dto.PreferredInterpretationDto
import com.example.langueedroid.core.network.dto.RevealedEntryDto
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
        lemma = entry.lemma,
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

fun LookupVocabularyResponseDto.toLookupResult(): LookupResult {
    val headword = headwords.firstOrNull { it.entryId == preferred?.entryId }
    val groups =
        if (meta.isExpression == true) {
            headword
                ?.partsOfSpeech
                .orEmpty()
                .filter {
                    preferred?.partOfSpeech == null || it.partOfSpeech == preferred.partOfSpeech
                }.map { PreferredInterpretationDto(headword?.entryId.orEmpty(), it.partOfSpeech) }
        } else {
            orderedGroups ?: headwords.flatMap { word ->
                word.partsOfSpeech.map { PreferredInterpretationDto(word.entryId, it.partOfSpeech) }
            }
        }
    val definitions =
        groups.flatMap { group ->
            val word = headwords.firstOrNull { it.entryId == group.entryId }
            val pos = word?.partsOfSpeech?.firstOrNull { it.partOfSpeech == group.partOfSpeech }
            pos?.definitions.orEmpty().map {
                it.toDomain().copy(lemma = word?.lemma, lookupId = lookupId, preferred = group == preferred)
            }
        }
    return LookupResult(
        input = input,
        lemma = headword?.lemma ?: input,
        definitions = definitions,
        context = context,
        kind = kind.toLexicalEntryKind(),
        isExpression = meta.isExpression ?: false,
        providerMiss = meta.providerMiss ?: false,
        expressionContextFound = meta.expressionContextFound,
        alternatives =
            alternatives.orEmpty().map { alternative ->
                LookupAlternative(
                    type = alternative.type,
                    text = alternative.text,
                    lemma = alternative.lemma,
                    entryId = alternative.entryId,
                    selectionRanges = alternative.selectionRanges.map { SelectionRange(it.start, it.end) },
                    reason = alternative.reason,
                    prominence = alternative.prominence,
                )
            },
    )
}

fun CreateUserDefinitionResponseDto.toDomain(): CreatedUserDefinition =
    CreatedUserDefinition(
        id = id,
        entryId = entryId,
        lemma = lemma,
        kind = kind.toLexicalEntryKind(),
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

private fun String?.toLexicalEntryKind(): LexicalEntryKind =
    when (this) {
        "word" -> LexicalEntryKind.WORD
        "phrasal_verb" -> LexicalEntryKind.PHRASAL_VERB
        "expression" -> LexicalEntryKind.EXPRESSION
        "idiom" -> LexicalEntryKind.IDIOM
        else -> LexicalEntryKind.WORD
    }

fun ReviewPromptDto.toDomain(): ReviewPrompt =
    ReviewPrompt(
        definition = definition,
        maskedSentence = maskedSentence,
        partOfSpeech = partOfSpeech,
        kind = kind.toLexicalEntryKind(),
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
                    kind = data.kind.toLexicalEntryKind(),
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
                    kind = data.kind.toLexicalEntryKind(),
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

fun RevealedEntryDto.toDomain(): RevealedEntry =
    RevealedEntry(
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
                RevealedEntry(
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
