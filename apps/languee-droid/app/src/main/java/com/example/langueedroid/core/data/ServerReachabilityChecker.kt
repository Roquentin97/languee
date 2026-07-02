package com.example.langueedroid.core.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

class ServerReachabilityChecker(
    private val okHttpClient: OkHttpClient,
    private val baseUrl: String,
) {
    suspend fun isReachable(): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = "${baseUrl.trimEnd('/')}$HEALTH_PATH"
            val request = Request.Builder().url(url).get().build()
            okHttpClient.newCall(request).execute().use { true }
        } catch (_: IOException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    companion object {
        private const val HEALTH_PATH = "/api/v1/health"
    }
}
