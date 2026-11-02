package com.example.langueedroid.core.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.core.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.core.domain.ExportPreference
import kotlinx.coroutines.flow.first

private val Context.ankiDroidPrefsDataStore by preferencesDataStore(name = "ankidroid_setup_prefs")

class AnkiDroidPreferencesStore(
    private val context: Context,
) {
    private val noteTypeName = stringPreferencesKey("NOTE_TYPE_NAME")
    private val exportPreference = stringPreferencesKey("EXPORT_PREFERENCE")
    private val setupCompleted = booleanPreferencesKey("SETUP_COMPLETED")

    suspend fun read(): AnkiDroidSetupPrefs {
        val prefs = context.ankiDroidPrefsDataStore.data.first()
        return AnkiDroidSetupPrefs(
            noteTypeName =
                NoteTypeTemplates.normalizeNoteTypeName(
                    prefs[noteTypeName] ?: NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY,
                ),
            exportPreference =
                prefs[exportPreference]?.let { raw ->
                    runCatching { ExportPreference.valueOf(raw) }.getOrDefault(ExportPreference.MANUAL)
                } ?: ExportPreference.MANUAL,
            setupCompleted = prefs[setupCompleted] ?: false,
        )
    }

    suspend fun save(ankiDroidSetupPrefs: AnkiDroidSetupPrefs) {
        context.ankiDroidPrefsDataStore.edit { prefs ->
            prefs[noteTypeName] = ankiDroidSetupPrefs.noteTypeName
            prefs[exportPreference] = ankiDroidSetupPrefs.exportPreference.name
            prefs[setupCompleted] = ankiDroidSetupPrefs.setupCompleted
        }
    }
}
