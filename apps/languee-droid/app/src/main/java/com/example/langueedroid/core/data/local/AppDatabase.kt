package com.example.langueedroid.core.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [OfflineEntryEntity::class], version = 3, exportSchema = false)
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
