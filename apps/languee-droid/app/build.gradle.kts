import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}
val rawBackendBaseUrl: String = localProperties.getProperty("LANGUEE_BACKEND_BASE_URL", "http://10.0.2.2:3000/")
val backendBaseUrl: String =
    rawBackendBaseUrl.trim().let { url ->
        if (url.endsWith("/")) url else "$url/"
    }
val escapedBackendBaseUrl =
    backendBaseUrl
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
val rawOtelEndpoint: String = localProperties.getProperty("OTEL_EXPORTER_ENDPOINT", "http://10.0.2.2:4318")
val escapedOtelEndpoint = rawOtelEndpoint.trim().replace("\\", "\\\\").replace("\"", "\\\"")
val tracingEnabled: String = localProperties.getProperty("TRACING_ENABLED", "true")
val gitSha: String = System.getenv("GIT_SHA")?.trim()?.ifEmpty { null } ?: "unknown"

android {
    namespace = "com.languee.droid"
    compileSdk {
        version =
            release(36) {
                minorApiLevel = 1
            }
    }

    defaultConfig {
        applicationId = "com.languee.droid"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "2.0.0" // x-release-please-version

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "BACKEND_BASE_URL", "\"$escapedBackendBaseUrl\"")
        buildConfigField("String", "OTEL_EXPORTER_ENDPOINT", "\"$escapedOtelEndpoint\"")
        buildConfigField("boolean", "TRACING_ENABLED", tracingEnabled)
        buildConfigField("String", "GIT_SHA", "\"$gitSha\"")
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

ktlint {
    version.set("1.5.0")
    android.set(true)
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.otel.sdk)
    implementation(libs.otel.exporter.otlp)
    implementation(libs.otel.okhttp.instrumentation)
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    debugImplementation(libs.okhttp.logging.interceptor)
    testImplementation(libs.junit)
    testImplementation(libs.mockito.kotlin)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.otel.sdk.testing)
    testImplementation(libs.okhttp.mockwebserver)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
