package com.example.langueedroid.data.remote

import com.example.langueedroid.BuildConfig
import com.example.langueedroid.data.local.AuthSessionStore
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class ApiClient(
    private val sessionStore: AuthSessionStore,
    private val authAuthenticator: AuthAuthenticator,
) {

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
        .addInterceptor(authInterceptor)
        .apply {
            if (BuildConfig.DEBUG) {
                val loggingInterceptor = HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BODY
                }
                addInterceptor(loggingInterceptor)
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
}
