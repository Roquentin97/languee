package com.example.langueedroid.data.remote

import com.example.langueedroid.BuildConfig
import com.example.langueedroid.data.local.AuthSessionStore
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.instrumentation.okhttp.v3_0.OkHttpTelemetry
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.UUID

class ApiClient(
    private val sessionStore: AuthSessionStore,
    private val authAuthenticator: AuthAuthenticator,
    openTelemetry: OpenTelemetry = OpenTelemetry.noop(),
) {

    private val otelInterceptor = OkHttpTelemetry.builder(openTelemetry).build().newInterceptor()

    private val requestIdInterceptor = Interceptor { chain ->
        chain.proceed(
            chain.request().newBuilder()
                .header("X-Request-ID", UUID.randomUUID().toString())
                .build(),
        )
    }

    private val authInterceptor = Interceptor { chain ->
        val accessToken = sessionStore.read()?.accessToken
        val request = if (accessToken != null) {
            chain.request().newBuilder()
                .header("Authorization", "Bearer $accessToken")
                .build()
        } else {
            chain.request()
        }
        chain.proceed(request)
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(otelInterceptor)
        .addInterceptor(requestIdInterceptor)
        .addInterceptor(authInterceptor)
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.HEADERS
                        redactHeader("Authorization")
                        redactHeader("Cookie")
                        redactHeader("Set-Cookie")
                    },
                )
            }
        }
        .authenticator(authAuthenticator)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.BACKEND_BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    fun createAuthApi(): AuthApi = retrofit.create(AuthApi::class.java)

    fun createDecksApi(): DecksApi = retrofit.create(DecksApi::class.java)

    fun createVocabularyApi(): VocabularyApi = retrofit.create(VocabularyApi::class.java)

    fun createCardsApi(): CardsApi = retrofit.create(CardsApi::class.java)
}
