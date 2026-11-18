package com.example.langueedroid.core.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.example.langueedroid.core.domain.OfflineEntry
import com.example.langueedroid.core.domain.SelectionRanges

@Entity(tableName = "offline_entries")
data class OfflineEntryEntity(
    @PrimaryKey val id: String,
    val word: String,
    val context: String?,
    val capturedAt: Long,
    val language: String? = null,
    val lookupContext: String? = null,
    val selectionStart: Int? = null,
    val selectionEnd: Int? = null,
    val pendingDefinitionId: String? = null,
    val pendingLookupId: String? = null,
    val pendingDeckId: String? = null,
    val pendingInflectionForms: String? = null,
    val selectionRanges: String? = null,
    val targetRanges: String? = null,
    @ColumnInfo(defaultValue = "1") val includeSuggestions: Boolean = true,
)

fun OfflineEntryEntity.toDomain() =
    OfflineEntry(
        id = id,
        word = word,
        context = context,
        capturedAt = capturedAt,
        language = language,
        lookupContext = lookupContext,
        selectionStart = selectionStart,
        selectionEnd = selectionEnd,
        pendingDefinitionId = pendingDefinitionId,
        pendingLookupId = pendingLookupId,
        pendingDeckId = pendingDeckId,
        pendingInflectionForms = pendingInflectionForms,
        selectionRanges = SelectionRanges.decode(selectionRanges).ifEmpty { SelectionRanges.fromLegacySpan(selectionStart, selectionEnd) },
        targetRanges =
            SelectionRanges.decode(targetRanges).ifEmpty {
                SelectionRanges.decode(selectionRanges).ifEmpty { SelectionRanges.fromLegacySpan(selectionStart, selectionEnd) }
            },
        includeSuggestions = includeSuggestions,
    )
