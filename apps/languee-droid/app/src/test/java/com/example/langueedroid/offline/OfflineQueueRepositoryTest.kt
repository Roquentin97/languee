package com.example.langueedroid.offline

import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.local.OfflineEntryDao
import com.example.langueedroid.core.data.local.OfflineEntryEntity
import com.example.langueedroid.core.data.local.toDomain
import com.example.langueedroid.core.domain.SelectionRange
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify

class OfflineQueueRepositoryTest {
    @Test
    fun `queued save stores the selected definition and lookup in one entry`() =
        runTest {
            val dao: OfflineEntryDao = mock()
            val repository = OfflineQueueRepository(dao)
            repository.addPendingSave(
                "saw",
                "They saw wood",
                "en",
                "definition",
                "lookup",
                "deck",
                mapOf("base" to "saw"),
                "existing-entry",
                "I saw the saw",
                2,
                5,
                selectionRanges = listOf(SelectionRange(2, 5), SelectionRange(10, 13)),
                targetRanges = listOf(SelectionRange(2, 5), SelectionRange(10, 13)),
                includeSuggestions = false,
            )
            val entry = argumentCaptor<OfflineEntryEntity>()
            verify(dao).insert(entry.capture())
            assertEquals("existing-entry", entry.firstValue.id)
            assertEquals("definition", entry.firstValue.pendingDefinitionId)
            assertEquals("lookup", entry.firstValue.pendingLookupId)
            assertEquals("deck", entry.firstValue.pendingDeckId)
            assertEquals("I saw the saw", entry.firstValue.lookupContext)
            assertEquals(2, entry.firstValue.selectionStart)
            assertEquals(5, entry.firstValue.selectionEnd)
            assertEquals("2:5,10:13", entry.firstValue.selectionRanges)
            assertEquals("2:5,10:13", entry.firstValue.targetRanges)
            assertEquals(false, entry.firstValue.includeSuggestions)
            assertEquals(listOf(SelectionRange(2, 5), SelectionRange(10, 13)), entry.firstValue.toDomain().selectionRanges)
            assertEquals(false, entry.firstValue.toDomain().includeSuggestions)
            assertEquals("{\"base\":\"saw\"}", entry.firstValue.pendingInflectionForms)
        }
}
