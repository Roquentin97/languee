package com.example.langueedroid.domain

import com.example.langueedroid.data.remote.dto.CardResponseDto
import com.example.langueedroid.data.remote.dto.DeckResponseDto
import com.example.langueedroid.data.remote.dto.EnrichedDefinitionDto
import com.example.langueedroid.data.remote.dto.LookupVocabularyResponseDto

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
