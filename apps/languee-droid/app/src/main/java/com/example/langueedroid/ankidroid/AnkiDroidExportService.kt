package com.example.langueedroid.ankidroid

import android.content.Context
import android.util.Log
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiDroidSetupIssue

private const val TAG = "AnkiDroidExportService"

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
            Log.w(TAG, "[event=ankidroid.unavailable method=exportNote] AnkiDroid unavailable | cardId=$cardId")
            return Result.failure(AnkiDroidApiUnavailableException())
        }
        if (!AnkiDroidAvailability.isApiAvailable(context)) {
            Log.w(TAG, "[event=ankidroid.unavailable method=exportNote] AnkiDroid unavailable | cardId=$cardId")
            return Result.failure(AnkiDroidApiUnavailableException())
        }
        if (!AnkiDroidAvailability.checkPermission(context)) {
            Log.w(TAG, "[event=ankidroid.permission_denied method=exportNote] permission denied | cardId=$cardId")
            return Result.failure(AnkiDroidPermissionDeniedException())
        }

        val normalizedNoteTypeName = NoteTypeTemplates.normalizeNoteTypeName(noteTypeName)
        val templates =
            when (normalizedNoteTypeName) {
                NoteTypeTemplates.LANGUEE_BASIC_REVERSED -> NoteTypeTemplates.BASIC_REVERSED_CARDS
                else -> NoteTypeTemplates.TYPE_IN_CARDS
            }

        val modelId =
            ankiDroidApi.getOrCreateNoteType(
                normalizedNoteTypeName,
                NoteTypeTemplates.SHARED_FIELDS,
                templates,
                css = NoteTypeTemplates.CSS,
            ) ?: return Result.failure(AnkiDroidNoteCreationFailedException())
        Log.i(
            TAG,
            "[event=ankidroid.note_type_resolved method=exportNote] note type resolved | modelId=$modelId noteTypeName=$normalizedNoteTypeName",
        )

        val deckId =
            ankiDroidApi.getOrCreateDeck(deckName)
                ?: return Result.failure(AnkiDroidDeckCreationFailedException())
        Log.i(TAG, "[event=ankidroid.deck_resolved method=exportNote] deck resolved | deckId=$deckId deckName=$deckName")

        val existingNoteId = ankiDroidApi.findNoteIdByCardId(cardId)
        if (existingNoteId != null) {
            Log.i(
                TAG,
                "[event=ankidroid.note_exists method=exportNote] note already exists | existingNoteId=$existingNoteId cardId=$cardId",
            )
            return Result.success(AnkiDroidExportResult(noteId = existingNoteId, deckId = deckId, modelId = modelId))
        }

        val noteId =
            ankiDroidApi.addNote(modelId, deckId, fields, setOf("languee"))
                ?: return Result.failure(AnkiDroidNoteCreationFailedException())
        Log.i(
            TAG,
            "[event=ankidroid.note_created method=exportNote] note created | noteId=$noteId deckId=$deckId modelId=$modelId cardId=$cardId",
        )

        return Result.success(AnkiDroidExportResult(noteId = noteId, deckId = deckId, modelId = modelId))
    }

    suspend fun checkSetup(prefsStore: AnkiDroidPreferencesStore): AnkiDroidSetupCheckResult {
        val issues = mutableListOf<AnkiDroidSetupIssue>()

        if (!AnkiDroidAvailability.isInstalled(context)) {
            issues.add(AnkiDroidSetupIssue.NotInstalled)
            val result = AnkiDroidSetupCheckResult(isReady = false, issues = issues)
            Log.i(
                TAG,
                "[event=ankidroid.setup_checked method=checkSetup] setup check complete | isReady=${result.isReady} issueCount=${issues.size}",
            )
            return result
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

        val result = AnkiDroidSetupCheckResult(isReady = issues.isEmpty(), issues = issues)
        Log.i(
            TAG,
            "[event=ankidroid.setup_checked method=checkSetup] setup check complete | isReady=${result.isReady} issueCount=${issues.size}",
        )
        return result
    }
}
