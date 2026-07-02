package com.example.langueedroid.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.AnswerResult
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.network.dto.CheckAnswerResponseDto
import com.example.langueedroid.core.network.dto.GradeResponseDto
import com.example.langueedroid.core.network.dto.ReviewItemDto
import com.example.langueedroid.core.network.dto.ReviewPromptDto
import com.example.langueedroid.core.network.dto.ReviewSummaryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReviewMapperTest {

    // -------------------------------------------------------------------------
    // ReviewSummaryDto -> ReviewSummary
    // -------------------------------------------------------------------------

    @Test
    fun `ReviewSummaryDto maps dueCount and newCount`() {
        val dto = ReviewSummaryDto(dueCount = 5, newCount = 3)

        val domain = dto.toDomain()

        assertEquals(5, domain.dueCount)
        assertEquals(3, domain.newCount)
    }

    // -------------------------------------------------------------------------
    // ReviewPromptDto -> ReviewPrompt — nullable example/contextMasked preserved
    // -------------------------------------------------------------------------

    @Test
    fun `ReviewPromptDto with example and contextMasked present — both preserved`() {
        val dto = aPromptDto(example = "I ____ an old friend yesterday.", contextMasked = "Guess who I ____ at the station!")

        val domain = dto.toDomain()

        assertEquals("I ____ an old friend yesterday.", domain.example)
        assertEquals("Guess who I ____ at the station!", domain.contextMasked)
    }

    @Test
    fun `ReviewPromptDto with null example and contextMasked — both null in domain`() {
        val dto = aPromptDto(example = null, contextMasked = null)

        val domain = dto.toDomain()

        assertNull(domain.example)
        assertNull(domain.contextMasked)
    }

    // -------------------------------------------------------------------------
    // ReviewPromptDto.kind -> LexicalKind mapping, including unknown fallback
    // -------------------------------------------------------------------------

    @Test
    fun `kind word maps to WORD`() {
        assertEquals(LexicalKind.WORD, aPromptDto(kind = "word").toDomain().kind)
    }

    @Test
    fun `kind phrasal_verb maps to PHRASAL_VERB`() {
        assertEquals(LexicalKind.PHRASAL_VERB, aPromptDto(kind = "phrasal_verb").toDomain().kind)
    }

    @Test
    fun `kind expression maps to EXPRESSION`() {
        assertEquals(LexicalKind.EXPRESSION, aPromptDto(kind = "expression").toDomain().kind)
    }

    @Test
    fun `unknown kind string falls back safely to WORD`() {
        assertEquals(LexicalKind.WORD, aPromptDto(kind = "some_future_kind").toDomain().kind)
    }

    // -------------------------------------------------------------------------
    // ReviewPromptDto.language -> ReviewPrompt.language — tolerant parsing
    // -------------------------------------------------------------------------

    @Test
    fun `language present on dto is mapped through`() {
        assertEquals("es", aPromptDto(language = "es").toDomain().language)
    }

    @Test
    fun `missing language on dto defaults to en`() {
        assertEquals("en", aPromptDto(language = null).toDomain().language)
    }

    // -------------------------------------------------------------------------
    // ReviewItemDto -> ReviewItem
    // -------------------------------------------------------------------------

    @Test
    fun `ReviewItemDto maps fields and nested prompt`() {
        val dto = ReviewItemDto(
            cardId = "card-1",
            deckId = "deck-1",
            deckName = "English basics",
            isNew = true,
            prompt = aPromptDto(),
        )

        val domain = dto.toDomain()

        assertEquals("card-1", domain.cardId)
        assertEquals("deck-1", domain.deckId)
        assertEquals("English basics", domain.deckName)
        assertEquals(true, domain.isNew)
        assertEquals(LexicalKind.WORD, domain.prompt.kind)
    }

    // -------------------------------------------------------------------------
    // CheckAnswerResponseDto.result -> AnswerResult mapping, including unknown fallback
    // -------------------------------------------------------------------------

    @Test
    fun `result correct maps to CORRECT`() {
        val domain = CheckAnswerResponseDto(result = "correct", matchedForm = "come across", hint = null).toDomain()
        assertEquals(AnswerResult.CORRECT, domain.result)
        assertEquals("come across", domain.matchedForm)
    }

    @Test
    fun `result close_synonym maps to CLOSE_SYNONYM`() {
        val domain = CheckAnswerResponseDto(result = "close_synonym", matchedForm = null, hint = "close").toDomain()
        assertEquals(AnswerResult.CLOSE_SYNONYM, domain.result)
        assertEquals("close", domain.hint)
    }

    @Test
    fun `result incorrect maps to INCORRECT`() {
        val domain = CheckAnswerResponseDto(result = "incorrect", matchedForm = null, hint = null).toDomain()
        assertEquals(AnswerResult.INCORRECT, domain.result)
    }

    @Test
    fun `unknown result string falls back safely to INCORRECT`() {
        val domain = CheckAnswerResponseDto(result = "some_future_result", matchedForm = null, hint = null).toDomain()
        assertEquals(AnswerResult.INCORRECT, domain.result)
    }

    // -------------------------------------------------------------------------
    // GradeResponseDto -> GradeOutcome
    // -------------------------------------------------------------------------

    @Test
    fun `GradeResponseDto maps nextDueAt, intervalDays and state`() {
        val dto = GradeResponseDto(nextDueAt = "2026-07-03T10:00:00.000Z", intervalDays = 1, state = "review")

        val domain = dto.toDomain()

        assertEquals("2026-07-03T10:00:00.000Z", domain.nextDueAt)
        assertEquals(1, domain.intervalDays)
        assertEquals("review", domain.state)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aPromptDto(
        example: String? = "I ____ an old friend yesterday.",
        contextMasked: String? = "Guess who I ____ at the station!",
        kind: String = "word",
        language: String? = null,
    ) = ReviewPromptDto(
        definition = "To encounter unexpectedly.",
        example = example,
        contextMasked = contextMasked,
        partOfSpeech = "verb",
        kind = kind,
        lemmaLength = 8,
        language = language,
    )
}
