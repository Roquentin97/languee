package com.example.langueedroid.core.audio

import android.content.Context
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

private const val TAG = "AndroidTtsSpeaker"

/**
 * Wraps Android's built-in [TextToSpeech] engine. Initialization is asynchronous; a
 * [speak] call made before the engine reports readiness is held as a single pending
 * utterance and spoken once initialization completes (an utterance requested while
 * another is still pending simply replaces it — this is a "most recent request wins"
 * queue of size one, not a full playback queue).
 *
 * Locale/engine failures are logged and swallowed rather than surfaced, since
 * pronunciation is best-effort and must never disrupt capture, card creation, or review.
 */
class AndroidTtsSpeaker(
    context: Context,
) : Speaker {
    private val localeByLanguageCode =
        mapOf(
            "en" to Locale("en"),
            "es" to Locale("es"),
            "de" to Locale("de"),
        )

    private var textToSpeech: TextToSpeech? = null
    private var isReady = false
    private var pendingUtterance: Pair<String, String>? = null

    init {
        textToSpeech =
            TextToSpeech(context.applicationContext) { status ->
                isReady = status == TextToSpeech.SUCCESS
                if (isReady) {
                    pendingUtterance?.let { (text, languageCode) -> speakNow(text, languageCode) }
                    pendingUtterance = null
                } else {
                    Log.w(TAG, "[event=tts.init_failed method=init] TextToSpeech failed to initialize | status=$status")
                }
            }
    }

    override fun speak(
        text: String,
        languageCode: String,
    ) {
        if (!isReady) {
            pendingUtterance = text to languageCode
            return
        }
        speakNow(text, languageCode)
    }

    private fun speakNow(
        text: String,
        languageCode: String,
    ) {
        val tts = textToSpeech ?: return
        val locale = localeByLanguageCode[languageCode] ?: localeByLanguageCode.getValue("en")
        val result = tts.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(
                TAG,
                "[event=tts.locale_unavailable method=speak] locale unavailable, skipping pronunciation | languageCode=$languageCode",
            )
            return
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, null)
    }

    override fun shutdown() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
    }
}
