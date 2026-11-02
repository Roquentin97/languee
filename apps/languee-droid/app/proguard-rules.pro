# Vendored AnkiDroid API
-keep class com.ichi2.** { *; }

# Retrofit — preserve annotations and generic signatures for Gson + Retrofit reflection
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclassmembers,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Gson — preserve type adapters and type tokens
-keep class com.google.gson.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# OkHttp + OkHttp logging
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# OpenTelemetry — keep SDK and exporter classes used via reflection
-keep class io.opentelemetry.** { *; }
-dontwarn io.opentelemetry.**

# gRPC-Lite (OTel OTLP exporter transport)
-keep class io.grpc.** { *; }
-dontwarn io.grpc.**

# Hilt-generated components — keep entry points
-keep class dagger.hilt.** { *; }
-keep @dagger.hilt.android.HiltAndroidApp class * { *; }
-keep @dagger.hilt.android.AndroidEntryPoint class * { *; }
-keep @dagger.hilt.android.lifecycle.HiltViewModel class * { *; }
