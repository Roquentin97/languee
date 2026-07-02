package com.example.langueedroid.feature.session.ui

internal object MainNavRoutes {
    const val DECKS = "decks"
    const val CAPTURE = "capture"
    const val CARD_CREATION = "card_creation/{word}/{context}/{offlineEntryId}"
    const val ANKI_SETUP = "anki_setup"
    const val ANKI_SYNC = "anki_sync"
    const val REVIEW = "review"
    const val OFFLINE_QUEUE = "offline_queue"

    fun cardCreation(word: String, context: String?, offlineEntryId: String? = null) =
        "card_creation/${encode(word)}/${encode(context ?: "")}/${encode(offlineEntryId ?: "")}"

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8")
}
