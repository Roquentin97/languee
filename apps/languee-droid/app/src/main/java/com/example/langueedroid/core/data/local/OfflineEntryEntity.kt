package com.example.langueedroid.core.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.example.langueedroid.core.domain.OfflineEntry

@Entity(tableName = "offline_entries")
data class OfflineEntryEntity(
    @PrimaryKey val id: String,
    val word: String,
    val context: String?,
    val capturedAt: Long,
)

fun OfflineEntryEntity.toDomain() =
    OfflineEntry(
        id = id,
        word = word,
        context = context,
        capturedAt = capturedAt,
    )
