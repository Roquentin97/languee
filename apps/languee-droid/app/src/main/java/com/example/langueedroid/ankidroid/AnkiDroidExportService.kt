package com.example.langueedroid.ankidroid

import android.content.Context
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.AnkiDroidSetupIssue

class AnkiDroidPermissionDeniedException : Exception("AnkiDroid permission denied")

class AnkiDroidApiUnavailableException : Exception("AnkiDroid API unavailable")

class AnkiDroidNoteCreationFailedException : Exception("Failed to create AnkiDroid note")

class AnkiDroidDeckCreationFailedException : Exception("Failed to create AnkiDroid deck")

data class AnkiDroidExportResult(
    val noteId: Long,
    val deckId: Long,
    val modelId: Long,
)

class AnkiDroidExportService(
    private val context: Context,
    private val ankiDroidApi: AnkiDroidApi,
) {

    suspend fun exportNote(
        noteTypeName: String,
        deckName: String,
        fields: Array<String>,
        cardId: String,
    ): Result<AnkiDroidExportResult> {
        if (!AnkiDroidAvailability.isInstalled(context)) {
            return Result.failure(AnkiDroidApiUnavailableException())
        }
        if (!AnkiDroidAvailability.isApiAvailable(context)) {
            return Result.failure(AnkiDroidApiUnavailableException())
        }
        if (!AnkiDroidAvailability.checkPermission(context)) {
            return Result.failure(AnkiDroidPermissionDeniedException())
        }

        val templates = when (noteTypeName) {
            NoteTypeTemplates.LANGUEE_BASIC_REVERSED -> NoteTypeTemplates.BASIC_REVERSED_CARDS
            else -> NoteTypeTemplates.TYPE_IN_CARDS
        }

        val modelId = ankiDroidApi.getOrCreateNoteType(
            noteTypeName,
            NoteTypeTemplates.SHARED_FIELDS,
            templates,
        ) ?: return Result.failure(AnkiDroidNoteCreationFailedException())

        val deckId = ankiDroidApi.getOrCreateDeck(deckName)
            ?: return Result.failure(AnkiDroidDeckCreationFailedException())

        val existingNoteId = ankiDroidApi.findNoteIdByCardId(cardId)
        if (existingNoteId != null) {
            return Result.success(AnkiDroidExportResult(noteId = existingNoteId, deckId = deckId, modelId = modelId))
        }

        val noteId = ankiDroidApi.addNote(modelId, deckId, fields, setOf("languee"))
            ?: return Result.failure(AnkiDroidNoteCreationFailedException())

        return Result.success(AnkiDroidExportResult(noteId = noteId, deckId = deckId, modelId = modelId))
    }

    suspend fun checkSetup(prefsStore: AnkiDroidPreferencesStore): AnkiDroidSetupCheckResult {
        val issues = mutableListOf<AnkiDroidSetupIssue>()

        if (!AnkiDroidAvailability.isInstalled(context)) {
            issues.add(AnkiDroidSetupIssue.NotInstalled)
            return AnkiDroidSetupCheckResult(isReady = false, issues = issues)
        }
        if (!AnkiDroidAvailability.isApiAvailable(context)) {
            issues.add(AnkiDroidSetupIssue.ApiUnavailable)
        }
        if (!AnkiDroidAvailability.checkPermission(context)) {
            issues.add(AnkiDroidSetupIssue.PermissionDenied)
        }

        val prefs = prefsStore.read()
        if (prefs.noteTypeName.isBlank()) {
            issues.add(AnkiDroidSetupIssue.NoNoteTypeSelected)
        }

        return AnkiDroidSetupCheckResult(isReady = issues.isEmpty(), issues = issues)
    }
}
