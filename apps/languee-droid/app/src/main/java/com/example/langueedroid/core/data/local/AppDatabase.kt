package com.example.langueedroid.core.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [OfflineEntryEntity::class], version = 4, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun offlineEntryDao(): OfflineEntryDao
}

val MIGRATION_1_2 =
    object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN language TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN lookupContext TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN selectionStart INTEGER")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN selectionEnd INTEGER")
        }
    }

val MIGRATION_2_3 =
    object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN pendingDefinitionId TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN pendingLookupId TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN pendingDeckId TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN pendingInflectionForms TEXT")
        }
    }

val MIGRATION_3_4 =
    object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN selectionRanges TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN targetRanges TEXT")
            db.execSQL("ALTER TABLE offline_entries ADD COLUMN includeSuggestions INTEGER NOT NULL DEFAULT 1")
            db.execSQL(
                "UPDATE offline_entries SET selectionRanges = CAST(selectionStart AS TEXT) || ':' || CAST(selectionEnd AS TEXT) " +
                    "WHERE selectionStart IS NOT NULL AND selectionEnd IS NOT NULL AND selectionEnd > selectionStart",
            )
            db.execSQL(
                "UPDATE offline_entries SET targetRanges = selectionRanges WHERE selectionRanges IS NOT NULL",
            )
        }
    }
