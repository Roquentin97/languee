package com.example.langueedroid.ankidroid

import android.content.Context
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.core.domain.AnkiDroidSetupIssue
import com.example.langueedroid.core.telemetry.Logger

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
    private val logger: Logger,
) {
    suspend fun exportNote(
        noteTypeName: String,
        deckName: String,
        fields: Array<String>,
        cardId: String,
    ): Result<AnkiDroidExportResult> {
        if (!AnkiDroidAvailability.isInstalled(context)) {
            logger.warn("ankidroid.unavailable", mapOf("reason" to "not_installed"))
            return Result.failure(AnkiDroidApiUnavailableException())
        }
        if (!AnkiDroidAvailability.isApiAvailable(context)) {
            logger.warn("ankidroid.unavailable", mapOf("reason" to "api_unavailable"))
            return Result.failure(AnkiDroidApiUnavailableException())
        }
        if (!AnkiDroidAvailability.checkPermission(context)) {
            logger.warn("ankidroid.permission_denied")
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
            ) ?: run {
                val error = AnkiDroidNoteCreationFailedException()
                logger.error("ankidroid.note_type_creation_failed", error = error)
                return Result.failure(error)
            }
        logger.info("ankidroid.note_type_resolved", mapOf("note_type" to normalizedNoteTypeName))

        val deckId =
            ankiDroidApi.getOrCreateDeck(deckName)
                ?: run {
                    val error = AnkiDroidDeckCreationFailedException()
                    logger.error("ankidroid.deck_creation_failed", error = error)
                    return Result.failure(error)
                }
        logger.info("ankidroid.deck_resolved")

        val existingNoteId = ankiDroidApi.findNoteIdByCardId(cardId)
        if (existingNoteId != null) {
            logger.info("ankidroid.note_exists")
            return Result.success(AnkiDroidExportResult(noteId = existingNoteId, deckId = deckId, modelId = modelId))
        }

        val noteId =
            ankiDroidApi.addNote(modelId, deckId, fields, setOf("languee"))
                ?: run {
                    val error = AnkiDroidNoteCreationFailedException()
                    logger.error("ankidroid.note_creation_failed", error = error)
                    return Result.failure(error)
                }
        logger.info("ankidroid.note_created")

        return Result.success(AnkiDroidExportResult(noteId = noteId, deckId = deckId, modelId = modelId))
    }

    suspend fun checkSetup(prefsStore: AnkiDroidPreferencesStore): AnkiDroidSetupCheckResult {
        val issues = mutableListOf<AnkiDroidSetupIssue>()

        if (!AnkiDroidAvailability.isInstalled(context)) {
            issues.add(AnkiDroidSetupIssue.NotInstalled)
            val result = AnkiDroidSetupCheckResult(isReady = false, issues = issues)
            logger.info("ankidroid.setup_checked", mapOf("is_ready" to result.isReady.toString(), "issue_count" to issues.size.toString()))
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
        logger.info("ankidroid.setup_checked", mapOf("is_ready" to result.isReady.toString(), "issue_count" to issues.size.toString()))
        return result
    }
}
