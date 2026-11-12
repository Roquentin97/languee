package com.example.langueedroid

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.data.local.AppDatabase
import com.example.langueedroid.core.data.local.MIGRATION_1_2
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
            val database = Room.databaseBuilder(context, AppDatabase::class.java, name).addMigrations(MIGRATION_1_2).build()
            try {
                val entry =
                    database
                        .offlineEntryDao()
                        .getAll()
                        .first()
                        .single()
                assertEquals("old", entry.id)
                assertEquals("I saw.", entry.context)
                assertNull(entry.selectionStart)
                assertNull(entry.selectionEnd)
                assertNull(entry.lookupContext)
                assertNull(entry.language)
            } finally {
                database.close()
                context.deleteDatabase(name)
            }
        }
}
