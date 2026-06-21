package com.example.langueedroid.core.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AuthSessionStore(context: Context) {

    private val prefs: SharedPreferences? = runCatching {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }.getOrNull()

    fun read(): AuthSession? {
        val p = prefs ?: return null
        val accessToken = p.getString(KEY_ACCESS_TOKEN, null) ?: return null
        val refreshToken = p.getString(KEY_REFRESH_TOKEN, null) ?: return null
        val sessionId = p.getString(KEY_SESSION_ID, null) ?: return null
        val userId = p.getString(KEY_USER_ID, null) ?: return null
        val userEmail = p.getString(KEY_USER_EMAIL, null) ?: return null
        return AuthSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            sessionId = sessionId,
            userId = userId,
            userEmail = userEmail,
        )
    }

    fun save(session: AuthSession) {
        prefs?.edit()
            ?.putString(KEY_ACCESS_TOKEN, session.accessToken)
            ?.putString(KEY_REFRESH_TOKEN, session.refreshToken)
            ?.putString(KEY_SESSION_ID, session.sessionId)
            ?.putString(KEY_USER_ID, session.userId)
            ?.putString(KEY_USER_EMAIL, session.userEmail)
            ?.apply()
    }

    fun updateTokens(accessToken: String, refreshToken: String, sessionId: String) {
        prefs?.edit()
            ?.putString(KEY_ACCESS_TOKEN, accessToken)
            ?.putString(KEY_REFRESH_TOKEN, refreshToken)
            ?.putString(KEY_SESSION_ID, sessionId)
            ?.apply()
    }

    fun clear() {
        prefs?.edit()
            ?.remove(KEY_ACCESS_TOKEN)
            ?.remove(KEY_REFRESH_TOKEN)
            ?.remove(KEY_SESSION_ID)
            ?.remove(KEY_USER_ID)
            ?.remove(KEY_USER_EMAIL)
            ?.apply()
    }

    private companion object {
        const val PREFS_FILE_NAME = "auth_session_encrypted"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
        const val KEY_SESSION_ID = "session_id"
        const val KEY_USER_ID = "user_id"
        const val KEY_USER_EMAIL = "user_email"
    }
}
