package com.example.langueedroid.di

import android.content.Context
import androidx.room.Room
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.ConnectivityObserver
import com.example.langueedroid.core.data.OfflineQueueRepository
import com.example.langueedroid.core.data.local.AppDatabase
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.data.local.OfflineEntryDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object StorageModule {

    @Provides
    @Singleton
    fun provideAuthSessionStore(@ApplicationContext context: Context): AuthSessionStore = AuthSessionStore(context)

    @Provides
    @Singleton
    fun provideAnkiDroidPreferencesStore(@ApplicationContext context: Context): AnkiDroidPreferencesStore =
        AnkiDroidPreferencesStore(context)

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "languee_droid.db").build()

    @Provides
    @Singleton
    fun provideOfflineEntryDao(db: AppDatabase): OfflineEntryDao = db.offlineEntryDao()

    @Provides
    @Singleton
    fun provideOfflineQueueRepository(dao: OfflineEntryDao): OfflineQueueRepository =
        OfflineQueueRepository(dao)

    @Provides
    @Singleton
    fun provideConnectivityObserver(@ApplicationContext context: Context): ConnectivityObserver =
        ConnectivityObserver(context)
}
