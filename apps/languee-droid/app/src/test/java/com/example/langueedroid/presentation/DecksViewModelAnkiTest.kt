package com.example.langueedroid.presentation

import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.core.data.DeckRepository
import com.example.langueedroid.core.domain.Deck
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

/**
 * Tests for DecksViewModel's AnkiDroid deck listing surface
 * (availableAnkiDecks / isLoadingAnkiDecks / loadAnkiDecks) used by the deck
 * "use existing AnkiDroid deck" picker.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DecksViewModelAnkiTest {

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var deckRepository: DeckRepository
    private lateinit var ankiDroidApi: AnkiDroidApi

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        deckRepository = mock()
        ankiDroidApi = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun buildViewModel() = DecksViewModel(
        deckRepository = deckRepository,
        ankiDroidApi = ankiDroidApi,
    )

    // -------------------------------------------------------------------------
    // loadAnkiDecks — populates availableAnkiDecks from the AnkiDroid API
    // -------------------------------------------------------------------------

    @Test
    fun `loadAnkiDecks populates availableAnkiDecks when api returns deck list`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidApi.getDeckList()).thenReturn(mapOf(1L to "General", 2L to "Languee"))

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.loadAnkiDecks()
        advanceUntilIdle()

        val available = vm.availableAnkiDecks.value
        assertTrue(available != null)
        assertEquals(2, available!!.size)
        assertTrue(available.any { it.first == 1L && it.second == "General" })
        assertTrue(available.any { it.first == 2L && it.second == "Languee" })
    }

    // -------------------------------------------------------------------------
    // loadAnkiDecks — empty deck list from AnkiDroid
    // -------------------------------------------------------------------------

    @Test
    fun `loadAnkiDecks with empty api result stores empty list`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidApi.getDeckList()).thenReturn(emptyMap())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.loadAnkiDecks()
        advanceUntilIdle()

        assertEquals(emptyList<Pair<Long, String>>(), vm.availableAnkiDecks.value)
    }

    // -------------------------------------------------------------------------
    // loadAnkiDecks — AnkiDroid unavailable (null result) → empty list
    // -------------------------------------------------------------------------

    @Test
    fun `loadAnkiDecks with null api result stores empty list`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidApi.getDeckList()).thenReturn(null)

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.loadAnkiDecks()
        advanceUntilIdle()

        assertEquals(emptyList<Pair<Long, String>>(), vm.availableAnkiDecks.value)
    }

    // -------------------------------------------------------------------------
    // availableAnkiDecks — defaults to null before loadAnkiDecks is called
    // -------------------------------------------------------------------------

    @Test
    fun `availableAnkiDecks is null before loadAnkiDecks is called`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))

        val vm = buildViewModel()
        advanceUntilIdle()

        assertNull(vm.availableAnkiDecks.value)
    }

    // -------------------------------------------------------------------------
    // isLoadingAnkiDecks — true while loading, false after completion
    // -------------------------------------------------------------------------

    @Test
    fun `isLoadingAnkiDecks becomes false after loadAnkiDecks completes`() = runTest {
        whenever(deckRepository.getDecks()).thenReturn(Result.success(emptyList<Deck>()))
        whenever(ankiDroidApi.getDeckList()).thenReturn(emptyMap())

        val vm = buildViewModel()
        advanceUntilIdle()

        vm.loadAnkiDecks()
        // Before advancing: isLoading should be true
        assertTrue(vm.isLoadingAnkiDecks.value)

        advanceUntilIdle()
        assertFalse(vm.isLoadingAnkiDecks.value)
    }
}
