package com.example.langueedroid.presentation

import com.example.langueedroid.data.AnkiDroidExportRepository
import com.example.langueedroid.data.DeckRepository
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.UnauthorizedException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

/**
 * Tests for DecksViewModel's hasIncompleteAnkiExports StateFlow added by the
 * ankidroid-export-integration feature.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DecksViewModelAnkiTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var deckRepository: DeckRepository
    private lateinit var ankiDroidExportRepository: AnkiDroidExportRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        ankiDroidExportRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // hasIncompleteAnkiExports — true when pending/failed exports exist
    // -------------------------------------------------------------------------

    @Test
    fun `hasIncompleteAnkiExports is true when repository returns non-empty list`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidExportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1", "c2")))

        val vm = DecksViewModel(
            deckRepository = deckRepository,
            onUnauthorized = {},
            ankiDroidExportRepository = ankiDroidExportRepository,
        )
        advanceUntilIdle()

        assertTrue(vm.hasIncompleteAnkiExports.value)
    }

    // -------------------------------------------------------------------------
    // hasIncompleteAnkiExports — false when no incomplete exports
    // -------------------------------------------------------------------------

    @Test
    fun `hasIncompleteAnkiExports is false when repository returns empty list`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidExportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(emptyList()))

        val vm = DecksViewModel(
            deckRepository = deckRepository,
            onUnauthorized = {},
            ankiDroidExportRepository = ankiDroidExportRepository,
        )
        advanceUntilIdle()

        assertFalse(vm.hasIncompleteAnkiExports.value)
    }

    // -------------------------------------------------------------------------
    // hasIncompleteAnkiExports — defaults to false when repository is null
    // -------------------------------------------------------------------------

    @Test
    fun `hasIncompleteAnkiExports defaults to false when ankiDroidExportRepository is null`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))

        val vm = DecksViewModel(
            deckRepository = deckRepository,
            onUnauthorized = {},
            ankiDroidExportRepository = null,
        )
        advanceUntilIdle()

        assertFalse(vm.hasIncompleteAnkiExports.value)
    }

    // -------------------------------------------------------------------------
    // hasIncompleteAnkiExports — false when repository call fails (graceful degradation)
    // -------------------------------------------------------------------------

    @Test
    fun `hasIncompleteAnkiExports is false when repository call fails`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidExportRepository.getCardsWithPendingExport())
            .thenReturn(Result.failure(UnauthorizedException()))

        val vm = DecksViewModel(
            deckRepository = deckRepository,
            onUnauthorized = {},
            ankiDroidExportRepository = ankiDroidExportRepository,
        )
        advanceUntilIdle()

        assertFalse(vm.hasIncompleteAnkiExports.value)
    }

    // -------------------------------------------------------------------------
    // hasIncompleteAnkiExports — defaults to false before coroutine completes
    // -------------------------------------------------------------------------

    @Test
    fun `hasIncompleteAnkiExports is false before export check coroutine completes`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidExportRepository.getCardsWithPendingExport())
            .thenReturn(Result.success(listOf("c1")))

        val vm = DecksViewModel(
            deckRepository = deckRepository,
            onUnauthorized = {},
            ankiDroidExportRepository = ankiDroidExportRepository,
        )
        // Do NOT advance — coroutine hasn't run yet
        assertFalse(vm.hasIncompleteAnkiExports.value)
    }
}
