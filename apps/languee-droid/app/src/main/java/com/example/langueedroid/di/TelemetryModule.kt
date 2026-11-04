package com.example.langueedroid.di

import android.content.Context
import com.example.langueedroid.LangueeDroidApp
import com.example.langueedroid.core.telemetry.AppLogger
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.opentelemetry.api.OpenTelemetry
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object TelemetryModule {
    @Provides
    @Singleton
    fun provideOpenTelemetry(
        @ApplicationContext context: Context,
    ): OpenTelemetry = (context.applicationContext as LangueeDroidApp).openTelemetry

    @Provides
    @Singleton
    fun provideAppLogger(openTelemetry: OpenTelemetry): AppLogger = AppLogger(openTelemetry)
}
