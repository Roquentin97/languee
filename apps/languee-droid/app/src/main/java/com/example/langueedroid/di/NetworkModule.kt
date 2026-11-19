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
import com.google.gson.JsonParser
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
    ): OkHttpClient =
        OkHttpClient
            .Builder()
            .addInterceptor(requestIdInterceptor())
            .addInterceptor(authInterceptor(sessionStore))
            .addNetworkInterceptor(failureLoggingInterceptor(logger))
            .authenticator(authAuthenticator)
            .build()

    internal fun failureLoggingInterceptor(logger: Logger): Interceptor =
        Interceptor { chain ->
            val request = chain.request()
            val started = System.nanoTime()
            val requestAttributes =
                mapOf(
                    "service.name" to "languee-droid",
                    "service.version" to BuildConfig.VERSION_NAME,
                    "deployment.environment" to BuildConfig.BUILD_TYPE,
                    "vcs.revision" to BuildConfig.GIT_SHA,
                    "build.id" to BuildConfig.GIT_SHA,
                    "http.method" to request.method,
                    "url.path" to request.url.encodedPath,
                    "requestId" to request.header("X-Request-ID").orEmpty(),
                ) + traceAttributes(request)

            try {
                val response = chain.proceed(request)
                if (response.code >= 400) {
                    logger.warn(
                        "http.request.failed",
                        requestAttributes +
                            mapOf(
                                "http.status_code" to response.code.toString(),
                                "duration_ms" to ((System.nanoTime() - started) / 1_000_000).toString(),
                                "failure.kind" to "http",
                                "failure.stage" to "response",
                            ) + responseErrorAttributes(response),
                    )
                }
                response
            } catch (error: java.io.IOException) {
                logger.error(
                    "http.request.failed",
                    requestAttributes +
                        mapOf(
                            "duration_ms" to ((System.nanoTime() - started) / 1_000_000).toString(),
                            "failure.kind" to "network",
                            "failure.stage" to "transport",
                            "error.type" to error::class.java.simpleName,
                        ),
                    error,
                )
                throw error
            }
        }

    internal fun requestIdInterceptor(): Interceptor =
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

    private fun authInterceptor(sessionStore: AuthSessionStore): Interceptor =
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

    internal fun traceAttributes(request: okhttp3.Request): Map<String, String> {
        val match =
            TRACEPARENT_PATTERN.matchEntire(request.header("traceparent") ?: return emptyMap())
                ?: return emptyMap()
        val version = match.groupValues[1].lowercase()
        val traceId = match.groupValues[2].lowercase()
        val spanId = match.groupValues[3].lowercase()
        if (version == "ff" || traceId.all { it == '0' } || spanId.all { it == '0' }) return emptyMap()
        if (version == "00" && match.groupValues[5].isNotEmpty()) return emptyMap()
        return mapOf("trace_id" to traceId, "span_id" to spanId)
    }

    internal fun responseErrorAttributes(response: okhttp3.Response): Map<String, String> {
        val body = response.body
        if (body.contentType()?.subtype?.endsWith("json", ignoreCase = true) != true) return emptyMap()

        val preview =
            runCatching { response.peekBody(MAX_ERROR_BODY_BYTES).string() }.getOrNull()
                ?: return emptyMap()
        val truncated =
            body.contentLength() > MAX_ERROR_BODY_BYTES ||
                preview.toByteArray(Charsets.UTF_8).size.toLong() >= MAX_ERROR_BODY_BYTES
        val attributes =
            if (truncated) mapOf("http.response.body_truncated" to "true") else emptyMap()
        val code =
            runCatching {
                val json = JsonParser.parseString(preview).asJsonObject
                listOf("code", "errorCode", "error", "message")
                    .asSequence()
                    .mapNotNull { key ->
                        val value = json.get(key)
                        val candidate =
                            if (value?.isJsonArray == true) {
                                value.asJsonArray.firstOrNull()
                            } else {
                                value
                            }
                        candidate
                            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }
                            ?.asString
                    }.firstOrNull { candidate -> SAFE_ERROR_CODE.matches(candidate) }
            }.getOrNull()
        return attributes + if (code == null) emptyMap() else mapOf("http.response.error_code" to code)
    }

    private const val MAX_ERROR_BODY_BYTES = 4096L
    private val TRACEPARENT_PATTERN =
        Regex("^([0-9a-fA-F]{2})-([0-9a-fA-F]{32})-([0-9a-fA-F]{16})-([0-9a-fA-F]{2})(?:-([0-9a-fA-F-]+))?$")
    private val SAFE_ERROR_CODE = Regex("^[A-Z][A-Z0-9_]{0,95}$")
}
