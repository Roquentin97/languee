package com.example.langueedroid.di

import android.content.Context
import com.example.langueedroid.BuildConfig
import com.example.langueedroid.telemetry.initOpenTelemetry
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
    fun provideOpenTelemetry(@ApplicationContext context: Context): OpenTelemetry {
        if (!BuildConfig.TRACING_ENABLED) return OpenTelemetry.noop()
        return runCatching {
            initOpenTelemetry(
                endpoint = BuildConfig.OTEL_EXPORTER_ENDPOINT,
                environment = if (BuildConfig.DEBUG) "development" else "production",
            )
        }.getOrElse { OpenTelemetry.noop() }
    }
}
