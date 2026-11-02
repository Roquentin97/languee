package com.example.langueedroid.core.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [OfflineEntryEntity::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun offlineEntryDao(): OfflineEntryDao
}
