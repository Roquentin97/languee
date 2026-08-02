package com.example.langueedroid.core.audio

/**
 * Best-effort text-to-speech pronunciation. Implementations must never surface errors to
 * the user — pronunciation is a nice-to-have, not a blocking capability.
 */
interface Speaker {
    fun speak(
        text: String,
        languageCode: String,
    )

    fun shutdown()
}
