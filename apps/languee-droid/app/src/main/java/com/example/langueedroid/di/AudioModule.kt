package com.example.langueedroid.di

import android.content.Context
import com.example.langueedroid.core.audio.AndroidTtsSpeaker
import com.example.langueedroid.core.audio.Speaker
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AudioModule {

    @Provides
    @Singleton
    fun provideSpeaker(@ApplicationContext context: Context): Speaker = AndroidTtsSpeaker(context)
}
