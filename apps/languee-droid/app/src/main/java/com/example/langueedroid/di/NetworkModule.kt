package com.example.langueedroid.di

import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.ServerReachabilityChecker
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.network.AnkiDroidExportApi
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.AuthAuthenticator
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.DecksApi
import com.example.langueedroid.core.network.ReviewsApi
import com.example.langueedroid.core.network.VocabularyApi
import com.example.langueedroid.core.telemetry.Logger
import com.languee.droid.BuildConfig
import dagger.Lazy
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.instrumentation.okhttp.v3_0.OkHttpTelemetry
import okhttp3.Call
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.UUID
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideAuthAuthenticator(
        sessionStore: AuthSessionStore,
        authRepository: Lazy<AuthRepository>,
    ): AuthAuthenticator =
        AuthAuthenticator(
            sessionStore = sessionStore,
            repositoryProvider = { authRepository.get() },
        )

    @Provides
    @Singleton
    fun provideOkHttpClient(
        sessionStore: AuthSessionStore,
        authAuthenticator: AuthAuthenticator,
        logger: Logger,
    ): OkHttpClient {
        val requestIdInterceptor =
            Interceptor { chain ->
                val request = chain.request()
                if (request.header("X-Request-ID") != null) {
                    return@Interceptor chain.proceed(request)
                }
                chain.proceed(
                    request
                        .newBuilder()
                        .header("X-Request-ID", UUID.randomUUID().toString())
                        .build(),
                )
            }
        val authInterceptor =
            Interceptor { chain ->
                val accessToken = sessionStore.read()?.accessToken
                val request =
                    if (accessToken != null) {
                        chain
                            .request()
                            .newBuilder()
                            .header("Authorization", "Bearer $accessToken")
                            .build()
                    } else {
                        chain.request()
                    }
                chain.proceed(request)
            }
        return OkHttpClient
            .Builder()
            .addInterceptor(requestIdInterceptor)
            .addInterceptor(authInterceptor)
            .addNetworkInterceptor { chain ->
                val request = chain.request()
                val started = System.nanoTime()
                try {
                    val response = chain.proceed(request)
                    if (response.code >= 400) {
                        logger.warn(
                            "http.request.failed",
                            mapOf(
                                "http.method" to request.method,
                                "url.path" to request.url.encodedPath,
                                "http.status_code" to response.code.toString(),
                                "duration_ms" to ((System.nanoTime() - started) / 1_000_000).toString(),
                                "requestId" to request.header("X-Request-ID").orEmpty(),
                            ) + traceAttributes(response.request),
                        )
                    }
                    response
                } catch (error: java.io.IOException) {
                    logger.error(
                        "http.request.failed",
                        mapOf(
                            "http.method" to request.method,
                            "url.path" to request.url.encodedPath,
                            "duration_ms" to ((System.nanoTime() - started) / 1_000_000).toString(),
                            "requestId" to request.header("X-Request-ID").orEmpty(),
                        ) + traceAttributes(request),
                        error,
                    )
                    throw error
                }
            }.apply {
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
            }.authenticator(authAuthenticator)
            .build()
    }

    @Provides
    @Singleton
    fun provideInstrumentedCallFactory(
        okHttpClient: OkHttpClient,
        openTelemetry: OpenTelemetry,
    ): Call.Factory = OkHttpTelemetry.builder(openTelemetry).build().createCallFactory(okHttpClient)

    @Provides
    @Singleton
    fun provideRetrofit(callFactory: Call.Factory): Retrofit =
        Retrofit
            .Builder()
            .baseUrl(BuildConfig.BACKEND_BASE_URL)
            .callFactory(callFactory)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

    @Provides
    @Singleton
    fun provideServerReachabilityChecker(callFactory: Call.Factory): ServerReachabilityChecker =
        ServerReachabilityChecker(callFactory, BuildConfig.BACKEND_BASE_URL)

    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideDecksApi(retrofit: Retrofit): DecksApi = retrofit.create(DecksApi::class.java)

    @Provides
    @Singleton
    fun provideVocabularyApi(retrofit: Retrofit): VocabularyApi = retrofit.create(VocabularyApi::class.java)

    @Provides
    @Singleton
    fun provideCardsApi(retrofit: Retrofit): CardsApi = retrofit.create(CardsApi::class.java)

    @Provides
    @Singleton
    fun provideAnkiDroidExportApi(retrofit: Retrofit): AnkiDroidExportApi = retrofit.create(AnkiDroidExportApi::class.java)

    @Provides
    @Singleton
    fun provideReviewsApi(retrofit: Retrofit): ReviewsApi = retrofit.create(ReviewsApi::class.java)

    private fun traceAttributes(request: okhttp3.Request): Map<String, String> {
        val parts = request.header("traceparent")?.split('-') ?: return emptyMap()
        if (parts.size != 4 || parts[1].length != 32 || parts[2].length != 16) return emptyMap()
        return mapOf("trace_id" to parts[1], "span_id" to parts[2])
    }
}
