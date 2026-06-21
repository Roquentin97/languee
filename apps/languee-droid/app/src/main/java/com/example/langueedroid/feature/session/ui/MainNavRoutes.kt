package com.example.langueedroid.feature.session.ui

internal object MainNavRoutes {
    const val DECKS = "decks"
    const val CAPTURE = "capture"
    const val CARD_CREATION = "card_creation/{word}/{context}"
    const val ANKI_SETUP = "anki_setup"
    const val ANKI_SYNC = "anki_sync"

    fun cardCreation(word: String, context: String?) =
        "card_creation/${encode(word)}/${encode(context ?: "")}"

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8")
}
