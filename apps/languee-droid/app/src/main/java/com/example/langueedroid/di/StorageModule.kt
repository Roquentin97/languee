package com.example.langueedroid.di

import android.content.Context
import com.example.langueedroid.core.data.AnkiDroidPreferencesStore
import com.example.langueedroid.core.data.local.AuthSessionStore
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
}
