package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.local.OfflineEntryDao
import com.example.langueedroid.core.data.local.OfflineEntryEntity
import com.example.langueedroid.core.data.local.toDomain
import com.example.langueedroid.core.domain.OfflineEntry
import com.google.gson.Gson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

class OfflineQueueRepository(
    private val dao: OfflineEntryDao,
) {
    fun getAll(): Flow<List<OfflineEntry>> = dao.getAll().map { list -> list.map { it.toDomain() } }

    fun count(): Flow<Int> = dao.count()

    suspend fun add(
        word: String,
        context: String?,
        lookupContext: String? = null,
        selectionStart: Int? = null,
        selectionEnd: Int? = null,
        language: String? = null,
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
    ) {
        dao.insert(
            OfflineEntryEntity(
                id = entryId ?: UUID.randomUUID().toString(),
                word = word,
                context = context,
                capturedAt = System.currentTimeMillis(),
                language = language,
                pendingDefinitionId = definitionId,
                pendingLookupId = lookupId,
                pendingDeckId = deckId,
                pendingInflectionForms = inflectionForms?.let { Gson().toJson(it) },
            ),
        )
    }
}
