package com.example.langueedroid.core.network

import com.example.langueedroid.core.data.AuthRepository
import com.example.langueedroid.core.data.local.AuthSessionStore
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

class AuthAuthenticator(
    private val sessionStore: AuthSessionStore,
    private val repositoryProvider: () -> AuthRepository,
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        // Break infinite retry loops: if the prior response was also 401, stop.
        if (response.priorResponse?.code == 401) return null

        val storedSession = sessionStore.read() ?: return null

        // Extract the access token that was used in the failed request.
        val failedRequestToken = response.request.header("Authorization")
            ?.removePrefix("Bearer ")

        // Concurrent 401 guard: if the stored token has already changed, a concurrent
        // request already completed a refresh. Skip the refresh call and retry directly
        // with the current (already-rotated) token.
        if (storedSession.accessToken != failedRequestToken) {
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${storedSession.accessToken}")
                .build()
        }

        val refreshResult = runBlocking { repositoryProvider().refreshSession() }
        val newSession = refreshResult.getOrNull() ?: run {
            sessionStore.clear()
            return null
        }

        return response.request.newBuilder()
            .header("Authorization", "Bearer ${newSession.accessToken}")
            .build()
    }
}
