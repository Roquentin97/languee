package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.local.OfflineEntryDao
import com.example.langueedroid.core.data.local.OfflineEntryEntity
import com.example.langueedroid.core.data.local.toDomain
import com.example.langueedroid.core.domain.OfflineEntry
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.SelectionRanges
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class OfflineQueueRepository(
    private val dao: OfflineEntryDao,
) {
    fun getAll(): Flow<List<OfflineEntry>> = dao.getAll().map { list -> list.map { it.toDomain() } }

    fun count(): Flow<Int> = dao.count()

    suspend fun find(id: String): OfflineEntry? = dao.find(id)?.toDomain()

    suspend fun add(
        word: String,
        context: String?,
        lookupContext: String? = null,
        selectionStart: Int? = null,
        selectionEnd: Int? = null,
        language: String? = null,
        selectionRanges: List<SelectionRange>? = null,
        targetRanges: List<SelectionRange>? = null,
        includeSuggestions: Boolean = true,
    ) {
        dao.insert(
            OfflineEntryEntity(
                id = UUID.randomUUID().toString(),
                word = word,
                context = context,
                capturedAt = System.currentTimeMillis(),
                language = language,
                lookupContext = lookupContext,
                selectionStart = selectionStart,
                selectionEnd = selectionEnd,
                selectionRanges = selectionRanges?.takeIf { it.isNotEmpty() }?.let(SelectionRanges::encode),
                targetRanges = targetRanges?.takeIf { it.isNotEmpty() }?.let(SelectionRanges::encode),
                includeSuggestions = includeSuggestions,
            ),
        )
    }

    suspend fun remove(id: String) {
        dao.delete(id)
    }

    suspend fun addPendingSave(
        word: String,
        context: String?,
        language: String,
        definitionId: String,
        lookupId: String?,
        deckId: String,
        inflectionForms: Map<String, String>?,
        entryId: String? = null,
        lookupContext: String? = null,
        selectionStart: Int? = null,
        selectionEnd: Int? = null,
        selectionRanges: List<SelectionRange>? = null,
        targetRanges: List<SelectionRange>? = null,
        includeSuggestions: Boolean = true,
    ) {
        dao.insert(
            OfflineEntryEntity(
                id = entryId ?: UUID.randomUUID().toString(),
                word = word,
                context = context,
                capturedAt = System.currentTimeMillis(),
                language = language,
                lookupContext = lookupContext,
                selectionStart = selectionStart,
                selectionEnd = selectionEnd,
                selectionRanges = selectionRanges?.takeIf { it.isNotEmpty() }?.let(SelectionRanges::encode),
                targetRanges = targetRanges?.takeIf { it.isNotEmpty() }?.let(SelectionRanges::encode),
                includeSuggestions = includeSuggestions,
                pendingDefinitionId = definitionId,
                pendingLookupId = lookupId,
                pendingDeckId = deckId,
                pendingInflectionForms = inflectionForms?.let { Gson().toJson(it) },
            ),
        )
    }
}
