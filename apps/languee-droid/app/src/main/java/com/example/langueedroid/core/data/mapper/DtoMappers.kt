package com.example.langueedroid.core.data.mapper

import com.example.langueedroid.core.network.dto.CardResponseDto
import com.example.langueedroid.core.network.dto.DeckResponseDto
import com.example.langueedroid.core.network.dto.EnrichedDefinitionDto
import com.example.langueedroid.core.network.dto.LookupVocabularyResponseDto
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.LookupResult

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
)
