package com.example.langueedroid.data

import com.example.langueedroid.core.network.AnkiDroidExportApi
import com.example.langueedroid.core.network.dto.AnkiDroidExportResponseDto
import com.example.langueedroid.core.network.dto.CardSummaryDto
import com.example.langueedroid.core.domain.AnkiExportStatus
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import retrofit2.Response

class AnkiDroidExportRepositoryTest {

    private lateinit var api: AnkiDroidExportApi
    private lateinit var repository: AnkiDroidExportRepository

    @Before
    fun setUp() {
        api = mock()
        repository = AnkiDroidExportRepository(api)
    }

    // -------------------------------------------------------------------------
    // createOrGetExportRecord — 201 success (new record)
    // -------------------------------------------------------------------------

    @Test
    fun `createOrGetExportRecord 200 returns domain AnkiDroidExport with pending status`() = runTest {
        whenever(api.createOrGetExport(any())).thenReturn(
            Response.success(aPendingExportDto()),
        )

        val result = repository.createOrGetExportRecord("card-1")

        assertTrue(result.isSuccess)
        val export = result.getOrThrow()
        assertEquals("export-1", export.id)
        assertEquals("card-1", export.cardId)
        assertTrue(export.status is AnkiExportStatus.Pending)
    }

    @Test
    fun `createOrGetExportRecord maps completed status correctly`() = runTest {
        val dto = anExportDto(
            status = "completed",
            ankiNoteId = "555",
            ankiDeckId = "100",
            ankiModelId = "200",
        )
        whenever(api.createOrGetExport(any())).thenReturn(Response.success(dto))

        val result = repository.createOrGetExportRecord("card-2")

        assertTrue(result.isSuccess)
        val export = result.getOrThrow()
        assertTrue(export.status is AnkiExportStatus.Completed)
        assertEquals(555L, export.ankiNoteId)
        assertEquals(100L, export.ankiDeckId)
        assertEquals(200L, export.ankiModelId)
    }

    @Test
    fun `createOrGetExportRecord maps failed status with reason and message`() = runTest {
        val dto = anExportDto(
            status = "failed",
            failureReason = "permission_not_granted",
            failureMessage = "AnkiDroid permission denied",
        )
        whenever(api.createOrGetExport(any())).thenReturn(Response.success(dto))

        val result = repository.createOrGetExportRecord("card-3")

        assertTrue(result.isSuccess)
        val export = result.getOrThrow()
        val status = export.status
        assertTrue(status is AnkiExportStatus.Failed)
        assertEquals("permission_not_granted", (status as AnkiExportStatus.Failed).reason)
        assertEquals("AnkiDroid permission denied", status.message)
    }

    // -------------------------------------------------------------------------
    // createOrGetExportRecord — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `createOrGetExportRecord 401 throws UnauthorizedException`() = runTest {
        whenever(api.createOrGetExport(any())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.createOrGetExportRecord("card-1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // createOrGetExportRecord — 404 → StaleReferenceException (card deleted)
    // -------------------------------------------------------------------------

    @Test
    fun `createOrGetExportRecord 404 throws StaleReferenceException`() = runTest {
        whenever(api.createOrGetExport(any())).thenReturn(
            Response.error(404, "{}".toResponseBody()),
        )

        val result = repository.createOrGetExportRecord("card-1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is StaleReferenceException)
    }

    // -------------------------------------------------------------------------
    // createOrGetExportRecord — 500 → generic failure
    // -------------------------------------------------------------------------

    @Test
    fun `createOrGetExportRecord 500 returns generic failure`() = runTest {
        whenever(api.createOrGetExport(any())).thenReturn(
            Response.error(500, "{}".toResponseBody()),
        )

        val result = repository.createOrGetExportRecord("card-1")

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
    }

    // -------------------------------------------------------------------------
    // createOrGetExportRecord — empty body → failure
    // -------------------------------------------------------------------------

    @Test
    fun `createOrGetExportRecord null body returns failure`() = runTest {
        val response: Response<AnkiDroidExportResponseDto> = Response.success(null)
        whenever(api.createOrGetExport(any())).thenReturn(response)

        val result = repository.createOrGetExportRecord("card-1")

        assertTrue(result.isFailure)
    }

    // -------------------------------------------------------------------------
    // recordAttemptCompleted — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `recordAttemptCompleted 200 returns success`() = runTest {
        whenever(api.recordAttempt(eq("export-1"), any())).thenReturn(
            Response.success(Unit),
        )

        val result = repository.recordAttemptCompleted(
            exportId = "export-1",
            ankiNoteId = 999L,
            ankiDeckId = 10L,
            ankiDeckNameSnapshot = "Languee",
            ankiModelId = 20L,
            ankiModelNameSnapshot = "Languee Mobile Native Type Vocabulary",
            templateVersion = "4",
        )

        assertTrue(result.isSuccess)
    }

    // -------------------------------------------------------------------------
    // recordAttemptCompleted — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `recordAttemptCompleted 401 throws UnauthorizedException`() = runTest {
        whenever(api.recordAttempt(any(), any())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.recordAttemptCompleted(
            exportId = "export-1",
            ankiNoteId = 999L,
            ankiDeckId = 10L,
            ankiDeckNameSnapshot = "Languee",
            ankiModelId = 20L,
            ankiModelNameSnapshot = "Languee Mobile Native Type Vocabulary",
            templateVersion = "4",
        )

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // recordAttemptFailed — happy path
    // -------------------------------------------------------------------------

    @Test
    fun `recordAttemptFailed 200 returns success`() = runTest {
        whenever(api.recordAttempt(eq("export-1"), any())).thenReturn(
            Response.success(Unit),
        )

        val result = repository.recordAttemptFailed(
            exportId = "export-1",
            failureReason = "permission_not_granted",
            failureMessage = "AnkiDroid permission denied",
        )

        assertTrue(result.isSuccess)
    }

    // -------------------------------------------------------------------------
    // recordAttemptFailed — 401 → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `recordAttemptFailed 401 throws UnauthorizedException`() = runTest {
        whenever(api.recordAttempt(any(), any())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.recordAttemptFailed(
            exportId = "export-1",
            failureReason = "permission_not_granted",
            failureMessage = "denied",
        )

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // recordAttemptFailed — 500 → generic failure
    // -------------------------------------------------------------------------

    @Test
    fun `recordAttemptFailed 500 returns generic failure`() = runTest {
        whenever(api.recordAttempt(any(), any())).thenReturn(
            Response.error(500, "{}".toResponseBody()),
        )

        val result = repository.recordAttemptFailed(
            exportId = "export-1",
            failureReason = "unknown",
            failureMessage = "",
        )

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
    }

    // -------------------------------------------------------------------------
    // getCardsWithPendingExport — pending and failed combined and deduplicated
    // -------------------------------------------------------------------------

    @Test
    fun `getCardsWithPendingExport merges pending and failed card ids`() = runTest {
        whenever(api.getCardsWithExportStatus(eq("pending"), anyOrNull())).thenReturn(
            Response.success(listOf(CardSummaryDto("c1", "pending"), CardSummaryDto("c2", "pending"))),
        )
        whenever(api.getCardsWithExportStatus(eq("failed"), anyOrNull())).thenReturn(
            Response.success(listOf(CardSummaryDto("c3", "failed"))),
        )

        val result = repository.getCardsWithPendingExport()

        assertTrue(result.isSuccess)
        val ids = result.getOrThrow()
        assertEquals(3, ids.size)
        assertTrue(ids.containsAll(listOf("c1", "c2", "c3")))
    }

    @Test
    fun `getCardsWithPendingExport deduplicates ids appearing in both pending and failed`() = runTest {
        whenever(api.getCardsWithExportStatus(eq("pending"), anyOrNull())).thenReturn(
            Response.success(listOf(CardSummaryDto("c1", "pending"))),
        )
        whenever(api.getCardsWithExportStatus(eq("failed"), anyOrNull())).thenReturn(
            Response.success(listOf(CardSummaryDto("c1", "failed"))),
        )

        val result = repository.getCardsWithPendingExport()

        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrThrow().size)
    }

    @Test
    fun `getCardsWithPendingExport returns empty list when both responses are empty`() = runTest {
        whenever(api.getCardsWithExportStatus(eq("pending"), anyOrNull())).thenReturn(
            Response.success(emptyList()),
        )
        whenever(api.getCardsWithExportStatus(eq("failed"), anyOrNull())).thenReturn(
            Response.success(emptyList()),
        )

        val result = repository.getCardsWithPendingExport()

        assertTrue(result.isSuccess)
        assertTrue(result.getOrThrow().isEmpty())
    }

    // -------------------------------------------------------------------------
    // getCardsWithPendingExport — 401 on pending → UnauthorizedException
    // -------------------------------------------------------------------------

    @Test
    fun `getCardsWithPendingExport 401 on pending query throws UnauthorizedException`() = runTest {
        whenever(api.getCardsWithExportStatus(eq("pending"), anyOrNull())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )
        whenever(api.getCardsWithExportStatus(eq("failed"), anyOrNull())).thenReturn(
            Response.success(emptyList()),
        )

        val result = repository.getCardsWithPendingExport()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    @Test
    fun `getCardsWithPendingExport 401 on failed query throws UnauthorizedException`() = runTest {
        whenever(api.getCardsWithExportStatus(eq("pending"), anyOrNull())).thenReturn(
            Response.success(emptyList()),
        )
        whenever(api.getCardsWithExportStatus(eq("failed"), anyOrNull())).thenReturn(
            Response.error(401, "{}".toResponseBody()),
        )

        val result = repository.getCardsWithPendingExport()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is UnauthorizedException)
    }

    // -------------------------------------------------------------------------
    // getCardsWithPendingExport — 500 on failed query → generic failure
    // -------------------------------------------------------------------------

    @Test
    fun `getCardsWithPendingExport 500 on failed query returns generic failure`() = runTest {
        whenever(api.getCardsWithExportStatus(eq("pending"), anyOrNull())).thenReturn(
            Response.success(emptyList()),
        )
        whenever(api.getCardsWithExportStatus(eq("failed"), anyOrNull())).thenReturn(
            Response.error(500, "{}".toResponseBody()),
        )

        val result = repository.getCardsWithPendingExport()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun aPendingExportDto() = AnkiDroidExportResponseDto(
        id = "export-1",
        cardId = "card-1",
        status = "pending",
        ankiNoteId = null,
        ankiDeckId = null,
        ankiDeckNameSnapshot = null,
        ankiModelId = null,
        ankiModelNameSnapshot = null,
        templateVersion = null,
        failureReason = null,
        failureMessage = null,
    )

    private fun anExportDto(
        id: String = "export-1",
        cardId: String = "card-1",
        status: String = "pending",
        ankiNoteId: String? = null,
        ankiDeckId: String? = null,
        ankiModelId: String? = null,
        failureReason: String? = null,
        failureMessage: String? = null,
    ) = AnkiDroidExportResponseDto(
        id = id,
        cardId = cardId,
        status = status,
        ankiNoteId = ankiNoteId,
        ankiDeckId = ankiDeckId,
        ankiDeckNameSnapshot = null,
        ankiModelId = ankiModelId,
        ankiModelNameSnapshot = null,
        templateVersion = "4",
        failureReason = failureReason,
        failureMessage = failureMessage,
    )
}
