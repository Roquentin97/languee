package com.example.langueedroid

import android.app.Application
import com.example.langueedroid.telemetry.initOpenTelemetry
import dagger.hilt.android.HiltAndroidApp
import io.opentelemetry.api.OpenTelemetry

@HiltAndroidApp
class LangueeDroidApp : Application() {

    var openTelemetry: OpenTelemetry = OpenTelemetry.noop()
        private set

    override fun onCreate() {
        super.onCreate()
        if (!BuildConfig.TRACING_ENABLED) return
        openTelemetry = runCatching {
            initOpenTelemetry(
                endpoint = BuildConfig.OTEL_EXPORTER_ENDPOINT,
                environment = if (BuildConfig.DEBUG) "development" else "production",
            )
        }.getOrElse { OpenTelemetry.noop() }
    }
}
