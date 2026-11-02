package com.example.langueedroid.core.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface OfflineEntryDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entry: OfflineEntryEntity)

    @Query("SELECT * FROM offline_entries ORDER BY capturedAt DESC")
    fun getAll(): Flow<List<OfflineEntryEntity>>

    @Query("DELETE FROM offline_entries WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT COUNT(*) FROM offline_entries")
    fun count(): Flow<Int>
}
