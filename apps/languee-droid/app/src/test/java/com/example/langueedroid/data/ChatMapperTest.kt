package com.example.langueedroid.data

import com.example.langueedroid.core.data.mapper.toDomain
import com.example.langueedroid.core.domain.Role
import com.example.langueedroid.core.domain.SuggestionType
import com.example.langueedroid.core.network.dto.ChatMessageDto
import com.example.langueedroid.core.network.dto.ChatProgressByTypeDto
import com.example.langueedroid.core.network.dto.ChatProgressResponseDto
import com.example.langueedroid.core.network.dto.ChatProgressTotalsDto
import com.example.langueedroid.core.network.dto.ChatProgressWeekDto
import com.example.langueedroid.core.network.dto.ChatSuggestionDto
import com.example.langueedroid.core.network.dto.ConversationDetailResponseDto
import com.example.langueedroid.core.network.dto.ConversationResponseDto
import com.example.langueedroid.core.network.dto.ConversationSummaryDto
import com.example.langueedroid.core.network.dto.SuggestionPayloadDto
import com.example.langueedroid.core.network.dto.SuggestionsResponseDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMapperTest {

    // -------------------------------------------------------------------------
    // ChatMessageDto.role -> Role mapping, including unknown fallback
    // -------------------------------------------------------------------------

    @Test
    fun `role user maps to USER`() {
        val domain = aMessageDto(role = "user").toDomain()
        assertEquals(Role.USER, domain.role)
    }

    @Test
    fun `role assistant maps to ASSISTANT`() {
        val domain = aMessageDto(role = "assistant").toDomain()
        assertEquals(Role.ASSISTANT, domain.role)
    }

    @Test
    fun `unknown role string falls back safely to ASSISTANT`() {
        val domain = aMessageDto(role = "some_future_role").toDomain()
        assertEquals(Role.ASSISTANT, domain.role)
    }

    // -------------------------------------------------------------------------
    // ConversationResponseDto -> ConversationSummary (create response has no preview)
    // -------------------------------------------------------------------------

    @Test
    fun `ConversationResponseDto maps to summary with null lastMessagePreview`() {
        val dto = ConversationResponseDto(
            id = "conv-1",
            title = null,
            createdAt = "2026-07-03T10:00:00.000Z",
            updatedAt = "2026-07-03T10:00:00.000Z",
            messageCount = 0,
        )

        val domain = dto.toDomain()

        assertEquals("conv-1", domain.id)
        assertNull(domain.title)
        assertEquals(0, domain.messageCount)
        assertNull(domain.lastMessagePreview)
    }

    // -------------------------------------------------------------------------
    // ConversationSummaryDto -> ConversationSummary (list response carries a preview)
    // -------------------------------------------------------------------------

    @Test
    fun `ConversationSummaryDto maps all fields including lastMessagePreview`() {
        val dto = ConversationSummaryDto(
            id = "conv-1",
            title = "Restaurant roleplay",
            createdAt = "2026-07-01T10:00:00.000Z",
            updatedAt = "2026-07-03T10:00:00.000Z",
            messageCount = 4,
            lastMessagePreview = "Sure, I'd like a table for two.",
        )

        val domain = dto.toDomain()

        assertEquals("Restaurant roleplay", domain.title)
        assertEquals(4, domain.messageCount)
        assertEquals("Sure, I'd like a table for two.", domain.lastMessagePreview)
    }

    // -------------------------------------------------------------------------
    // ConversationDetailResponseDto -> Conversation, messages ordered as received
    // -------------------------------------------------------------------------

    @Test
    fun `ConversationDetailResponseDto maps nested messages in order`() {
        val dto = ConversationDetailResponseDto(
            id = "conv-1",
            title = "Restaurant roleplay",
            createdAt = "2026-07-01T10:00:00.000Z",
            messages = listOf(
                aMessageDto(id = "msg-1", role = "user", content = "Hi!"),
                aMessageDto(id = "msg-2", role = "assistant", content = "Hello, how can I help?"),
            ),
        )

        val domain = dto.toDomain()

        assertEquals(2, domain.messages.size)
        assertEquals("msg-1", domain.messages[0].id)
        assertEquals(Role.USER, domain.messages[0].role)
        assertEquals("msg-2", domain.messages[1].id)
        assertEquals(Role.ASSISTANT, domain.messages[1].role)
    }

    // -------------------------------------------------------------------------
    // ChatSuggestionDto.type -> SuggestionType mapping, including unknown fallback
    // -------------------------------------------------------------------------

    @Test
    fun `type overused_word maps to OVERUSED_WORD and keeps its payload`() {
        val dto = aSuggestionDto(
            type = "overused_word",
            payload = SuggestionPayloadDto(word = "nice", count = 6, synonyms = listOf("pleasant", "lovely")),
        )

        val domain = dto.toDomain()

        assertEquals(SuggestionType.OVERUSED_WORD, domain.type)
        assertEquals("nice", domain.overusedWordPayload?.word)
        assertEquals(6, domain.overusedWordPayload?.count)
        assertEquals(listOf("pleasant", "lovely"), domain.overusedWordPayload?.synonyms)
    }

    @Test
    fun `type grammar maps to GRAMMAR with no overusedWordPayload`() {
        val domain = aSuggestionDto(type = "grammar", payload = null).toDomain()
        assertEquals(SuggestionType.GRAMMAR, domain.type)
        assertNull(domain.overusedWordPayload)
    }

    @Test
    fun `type style maps to STYLE with no overusedWordPayload`() {
        val domain = aSuggestionDto(type = "style", payload = null).toDomain()
        assertEquals(SuggestionType.STYLE, domain.type)
        assertNull(domain.overusedWordPayload)
    }

    @Test
    fun `unknown suggestion type falls back safely to STYLE`() {
        val domain = aSuggestionDto(type = "some_future_type", payload = null).toDomain()
        assertEquals(SuggestionType.STYLE, domain.type)
        assertNull(domain.overusedWordPayload)
    }

    // -------------------------------------------------------------------------
    // overused_word payload is parsed tolerantly — missing fields default safely
    // -------------------------------------------------------------------------

    @Test
    fun `overused_word payload with missing fields defaults to empty word, zero count, empty synonyms`() {
        val domain = aSuggestionDto(
            type = "overused_word",
            payload = SuggestionPayloadDto(word = null, count = null, synonyms = null),
        ).toDomain()

        assertEquals("", domain.overusedWordPayload?.word)
        assertEquals(0, domain.overusedWordPayload?.count)
        assertTrue(domain.overusedWordPayload?.synonyms.orEmpty().isEmpty())
    }

    @Test
    fun `overused_word suggestion with null payload — overusedWordPayload is null`() {
        val domain = aSuggestionDto(type = "overused_word", payload = null).toDomain()
        assertNull(domain.overusedWordPayload)
    }

    // -------------------------------------------------------------------------
    // SuggestionsResponseDto -> SuggestionsResult
    // -------------------------------------------------------------------------

    @Test
    fun `SuggestionsResponseDto maps analyzedAt and suggestions list`() {
        val dto = SuggestionsResponseDto(
            suggestions = listOf(aSuggestionDto(type = "style", payload = null)),
            analyzedAt = "2026-07-03T10:00:00.000Z",
        )

        val domain = dto.toDomain()

        assertEquals("2026-07-03T10:00:00.000Z", domain.analyzedAt)
        assertEquals(1, domain.suggestions.size)
    }

    @Test
    fun `SuggestionsResponseDto with null analyzedAt and empty list maps cleanly`() {
        val dto = SuggestionsResponseDto(suggestions = emptyList(), analyzedAt = null)

        val domain = dto.toDomain()

        assertNull(domain.analyzedAt)
        assertTrue(domain.suggestions.isEmpty())
    }

    // -------------------------------------------------------------------------
    // ChatProgressResponseDto -> ChatProgress
    // -------------------------------------------------------------------------

    @Test
    fun `full progress payload maps all fields`() {
        val dto = ChatProgressResponseDto(
            totals = ChatProgressTotalsDto(
                suggestionsRaised = 12,
                suggestionsResolved = 7,
                resolutionRate = 0.58,
                userMessages = 140,
                activeConversations = 3,
            ),
            byType = listOf(
                ChatProgressByTypeDto(type = "overused_word", raised = 5, resolved = 3),
                ChatProgressByTypeDto(type = "grammar", raised = 4, resolved = 2),
                ChatProgressByTypeDto(type = "style", raised = 3, resolved = 2),
            ),
            weeks = listOf(
                ChatProgressWeekDto(weekStart = "2026-06-15", raised = 4, resolved = 1, userMessages = 30),
            ),
            computedAt = "2026-07-03T00:00:00.000Z",
        )

        val domain = dto.toDomain()

        assertEquals(12, domain.totals.suggestionsRaised)
        assertEquals(7, domain.totals.suggestionsResolved)
        assertEquals(0.58, domain.totals.resolutionRate)
        assertEquals(140, domain.totals.userMessages)
        assertEquals(3, domain.totals.activeConversations)
        assertEquals(3, domain.byType.size)
        assertEquals(SuggestionType.OVERUSED_WORD, domain.byType[0].type)
        assertEquals(5, domain.byType[0].raised)
        assertEquals(3, domain.byType[0].resolved)
        assertEquals(1, domain.weeks.size)
        assertEquals("2026-06-15", domain.weeks[0].weekStart)
        assertEquals("2026-07-03T00:00:00.000Z", domain.computedAt)
    }

    @Test
    fun `null resolutionRate and null computedAt map to null`() {
        val dto = ChatProgressResponseDto(
            totals = ChatProgressTotalsDto(
                suggestionsRaised = 0,
                suggestionsResolved = 0,
                resolutionRate = null,
                userMessages = 0,
                activeConversations = 0,
            ),
            byType = emptyList(),
            weeks = emptyList(),
            computedAt = null,
        )

        val domain = dto.toDomain()

        assertNull(domain.totals.resolutionRate)
        assertNull(domain.computedAt)
    }

    @Test
    fun `empty weeks and byType map to empty lists`() {
        val dto = ChatProgressResponseDto(
            totals = ChatProgressTotalsDto(
                suggestionsRaised = 0,
                suggestionsResolved = 0,
                resolutionRate = null,
                userMessages = 0,
                activeConversations = 0,
            ),
            byType = emptyList(),
            weeks = emptyList(),
            computedAt = null,
        )

        val domain = dto.toDomain()

        assertTrue(domain.byType.isEmpty())
        assertTrue(domain.weeks.isEmpty())
    }

    @Test
    fun `unknown byType type falls back safely to STYLE`() {
        val dto = ChatProgressByTypeDto(type = "some_future_type", raised = 2, resolved = 1)

        val domain = dto.toDomain()

        assertEquals(SuggestionType.STYLE, domain.type)
        assertEquals(2, domain.raised)
        assertEquals(1, domain.resolved)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aMessageDto(
        id: String = "msg-1",
        role: String = "user",
        content: String = "Hello",
    ) = ChatMessageDto(
        id = id,
        role = role,
        content = content,
        createdAt = "2026-07-03T10:00:00.000Z",
    )

    private fun aSuggestionDto(
        type: String,
        payload: SuggestionPayloadDto?,
    ) = ChatSuggestionDto(
        id = "sugg-1",
        type = type,
        title = "Suggestion title",
        detail = "Suggestion detail",
        payload = payload,
        createdAt = "2026-07-03T10:00:00.000Z",
    )
}
