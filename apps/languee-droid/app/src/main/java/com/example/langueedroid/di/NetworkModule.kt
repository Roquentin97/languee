package com.example.langueedroid.di

import com.languee.droid.BuildConfig
import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.ServerReachabilityChecker
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.core.network.AnkiDroidExportApi
import com.example.langueedroid.core.network.AuthApi
import com.example.langueedroid.core.network.AuthAuthenticator
import com.example.langueedroid.core.network.CardsApi
import com.example.langueedroid.core.network.ChatApi
import com.example.langueedroid.core.network.DecksApi
import com.example.langueedroid.core.network.ReviewsApi
import com.example.langueedroid.core.network.VocabularyApi
import dagger.Lazy
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.instrumentation.okhttp.v3_0.OkHttpTelemetry
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
    ): AuthAuthenticator = AuthAuthenticator(
        sessionStore = sessionStore,
        repositoryProvider = { authRepository.get() },
    )

    @Provides
    @Singleton
    fun provideOkHttpClient(
        sessionStore: AuthSessionStore,
        authAuthenticator: AuthAuthenticator,
        openTelemetry: OpenTelemetry,
    ): OkHttpClient {
        val otelInterceptor = OkHttpTelemetry.builder(openTelemetry).build().newInterceptor()
        val requestIdInterceptor = Interceptor { chain ->
            chain.proceed(
                chain.request().newBuilder()
                    .header("X-Request-ID", UUID.randomUUID().toString())
                    .build(),
            )
        }
        val authInterceptor = Interceptor { chain ->
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
        return OkHttpClient.Builder()
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
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.BACKEND_BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    @Provides
    @Singleton
    fun provideServerReachabilityChecker(okHttpClient: OkHttpClient): ServerReachabilityChecker =
        ServerReachabilityChecker(okHttpClient, BuildConfig.BACKEND_BASE_URL)

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

    @Provides
    @Singleton
    fun provideChatApi(retrofit: Retrofit): ChatApi = retrofit.create(ChatApi::class.java)
}
