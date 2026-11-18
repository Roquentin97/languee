package com.example.langueedroid

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.data.local.AppDatabase
import com.example.langueedroid.core.data.local.MIGRATION_1_2
import com.example.langueedroid.core.data.local.MIGRATION_2_3
import com.example.langueedroid.core.data.local.MIGRATION_3_4
import com.example.langueedroid.core.data.local.OfflineEntryEntity
import com.example.langueedroid.core.data.local.toDomain
import com.example.langueedroid.core.domain.SelectionRange
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OfflineMigrationTest {
    @Test
    fun migrationPreservesExistingQueuedEntries() =
        runBlocking {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val name = "offline-migration-test.db"
            context.deleteDatabase(name)
            context.openOrCreateDatabase(name, Context.MODE_PRIVATE, null).use { db ->
                db.execSQL(
                    "CREATE TABLE offline_entries (id TEXT NOT NULL PRIMARY KEY, word TEXT NOT NULL, context TEXT, capturedAt INTEGER NOT NULL)",
                )
                db.execSQL("INSERT INTO offline_entries (id, word, context, capturedAt) VALUES ('old', 'saw', 'I saw.', 1)")
                db.version = 1
            }
            val database =
                Room
                    .databaseBuilder(context, AppDatabase::class.java, name)
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
                    .build()
            try {
                val row =
                    database
                        .offlineEntryDao()
                        .getAll()
                        .first()
                        .single()
                val entry = row.toDomain()
                assertEquals("old", entry.id)
                assertEquals("I saw.", entry.context)
                assertNull(row.selectionStart)
                assertNull(row.selectionEnd)
                assertNull(row.lookupContext)
                assertNull(row.language)
                assertEquals(emptyList<SelectionRange>(), entry.selectionRanges)
                assertEquals(emptyList<SelectionRange>(), entry.targetRanges)
                assertEquals(true, entry.includeSuggestions)
            } finally {
                database.close()
                context.deleteDatabase(name)
            }
        }

    @Test
    fun migrationAddsRangeColumnsAndPreservesAQueuedSelection() =
        runBlocking {
            val context = ApplicationProvider.getApplicationContext<Context>()
            val name = "offline-ranges-migration-test.db"
            context.deleteDatabase(name)
            context.openOrCreateDatabase(name, Context.MODE_PRIVATE, null).use { db ->
                db.execSQL(
                    "CREATE TABLE offline_entries (" +
                        "id TEXT NOT NULL PRIMARY KEY, word TEXT NOT NULL, context TEXT, capturedAt INTEGER NOT NULL, " +
                        "language TEXT, lookupContext TEXT, selectionStart INTEGER, selectionEnd INTEGER, " +
                        "pendingDefinitionId TEXT, pendingLookupId TEXT, pendingDeckId TEXT, pendingInflectionForms TEXT)",
                )
                db.execSQL(
                    "INSERT INTO offline_entries (id, word, context, capturedAt, language, lookupContext, selectionStart, selectionEnd) " +
                        "VALUES ('range', 'turn off', 'Please turn it off.', 2, 'en', 'Please turn it off.', 7, 11)",
                )
                db.version = 3
            }
            val database = Room.databaseBuilder(context, AppDatabase::class.java, name).addMigrations(MIGRATION_3_4).build()
            try {
                val dao = database.offlineEntryDao()
                val entry =
                    dao
                        .getAll()
                        .first()
                        .single()
                        .toDomain()
                assertEquals(listOf(SelectionRange(7, 11)), entry.selectionRanges)
                assertEquals(listOf(SelectionRange(7, 11)), entry.targetRanges)
                assertEquals("Please turn it off.", entry.lookupContext)
                assertEquals(null, entry.pendingDefinitionId)
                assertEquals(true, entry.includeSuggestions)

                val expressionRanges = listOf(SelectionRange(5, 9), SelectionRange(13, 15))
                dao.insert(
                    OfflineEntryEntity(
                        id = "expression",
                        word = "gave up",
                        context = "They gave it up.",
                        capturedAt = 3,
                        lookupContext = "They gave it up.",
                        selectionRanges = "5:9,13:15",
                        targetRanges = "5:9,13:15",
                        pendingDefinitionId = "selected-definition",
                        pendingLookupId = "chosen-lookup",
                        pendingDeckId = "chosen-deck",
                        pendingInflectionForms = "{\"base\":\"give up\"}",
                        includeSuggestions = false,
                    ),
                )
                val queued =
                    dao
                        .getAll()
                        .first()
                        .single { it.id == "expression" }
                        .toDomain()
                assertEquals(expressionRanges, queued.selectionRanges)
                assertEquals(expressionRanges, queued.targetRanges)
                assertEquals("selected-definition", queued.pendingDefinitionId)
                assertEquals("chosen-lookup", queued.pendingLookupId)
                assertEquals("chosen-deck", queued.pendingDeckId)
                assertEquals("{\"base\":\"give up\"}", queued.pendingInflectionForms)
                assertEquals(false, queued.includeSuggestions)
            } finally {
                database.close()
                context.deleteDatabase(name)
            }
        }
}
