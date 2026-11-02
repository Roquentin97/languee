package com.example.langueedroid.di

import android.content.Context
import com.example.langueedroid.ankidroid.AnkiDroidApi
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AnkiDroidModule {
    @Provides
    @Singleton
    fun provideAnkiDroidApi(
        @ApplicationContext context: Context,
        @IoDispatcher ioDispatcher: CoroutineDispatcher,
    ): AnkiDroidApi = AnkiDroidApi(context, ioDispatcher)

    @Provides
    @Singleton
    fun provideAnkiDroidExportService(
        @ApplicationContext context: Context,
        ankiDroidApi: AnkiDroidApi,
    ): AnkiDroidExportService = AnkiDroidExportService(context, ankiDroidApi)
}
