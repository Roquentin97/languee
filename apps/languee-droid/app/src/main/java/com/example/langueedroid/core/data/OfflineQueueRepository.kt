package com.example.langueedroid.core.data

import com.example.langueedroid.core.data.local.OfflineEntryDao
import com.example.langueedroid.core.data.local.OfflineEntryEntity
import com.example.langueedroid.core.data.local.toDomain
import com.example.langueedroid.core.domain.OfflineEntry
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
    ) {
        dao.insert(
            OfflineEntryEntity(
                id = UUID.randomUUID().toString(),
                word = word,
                context = context,
                capturedAt = System.currentTimeMillis(),
            ),
        )
    }

    suspend fun remove(id: String) {
        dao.delete(id)
    }
}
