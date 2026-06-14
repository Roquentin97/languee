package com.example.langueedroid.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.domain.ExportPreference
import kotlinx.coroutines.flow.first

private val Context.ankiDroidPrefsDataStore by preferencesDataStore(name = "ankidroid_setup_prefs")

class AnkiDroidPreferencesStore(private val context: Context) {

    private val anKiDeckId = longPreferencesKey("ANKI_DECK_ID")
    private val ankiDeckName = stringPreferencesKey("ANKI_DECK_NAME")
    private val noteTypeName = stringPreferencesKey("NOTE_TYPE_NAME")
    private val exportPreference = stringPreferencesKey("EXPORT_PREFERENCE")
    private val setupCompleted = booleanPreferencesKey("SETUP_COMPLETED")

    suspend fun read(): AnkiDroidSetupPrefs {
        val prefs = context.ankiDroidPrefsDataStore.data.first()
        return AnkiDroidSetupPrefs(
            selectedDeckId = prefs[anKiDeckId],
            selectedDeckName = prefs[ankiDeckName],
            noteTypeName = prefs[noteTypeName] ?: NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY,
            exportPreference = prefs[exportPreference]?.let { raw ->
                runCatching { ExportPreference.valueOf(raw) }.getOrDefault(ExportPreference.MANUAL)
            } ?: ExportPreference.MANUAL,
            setupCompleted = prefs[setupCompleted] ?: false,
        )
    }

    suspend fun save(ankiDroidSetupPrefs: AnkiDroidSetupPrefs) {
        context.ankiDroidPrefsDataStore.edit { prefs ->
            if (ankiDroidSetupPrefs.selectedDeckId != null) {
                prefs[anKiDeckId] = ankiDroidSetupPrefs.selectedDeckId
            } else {
                prefs.remove(anKiDeckId)
            }
            if (ankiDroidSetupPrefs.selectedDeckName != null) {
                prefs[ankiDeckName] = ankiDroidSetupPrefs.selectedDeckName
            } else {
                prefs.remove(ankiDeckName)
            }
            prefs[noteTypeName] = ankiDroidSetupPrefs.noteTypeName
            prefs[exportPreference] = ankiDroidSetupPrefs.exportPreference.name
            prefs[setupCompleted] = ankiDroidSetupPrefs.setupCompleted
        }
    }
}
