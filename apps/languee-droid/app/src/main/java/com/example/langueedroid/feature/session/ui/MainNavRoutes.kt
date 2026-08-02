package com.example.langueedroid.feature.session.ui

internal object MainNavRoutes {
    const val DECKS = "decks"
    const val DECK_DETAIL = "deck_detail/{deckId}/{deckName}"
    const val CAPTURE = "capture"
    const val CARD_CREATION = "card_creation/{word}/{context}/{offlineEntryId}/{language}"
    const val ANKI_SETUP = "anki_setup"
    const val ANKI_SYNC = "anki_sync"
    const val REVIEW_BASE = "review"
    const val REVIEW = "$REVIEW_BASE?deckId={deckId}"
    const val OFFLINE_QUEUE = "offline_queue"

    fun deckDetail(
        deckId: String,
        deckName: String,
    ) = "deck_detail/${encode(deckId)}/${encode(deckName)}"

    fun review(deckId: String? = null): String = if (deckId != null) "$REVIEW_BASE?deckId=${encode(deckId)}" else REVIEW_BASE

    fun cardCreation(
        word: String,
        context: String?,
        offlineEntryId: String? = null,
        language: String = "en",
    ) = "card_creation/${encode(word)}/${encode(context ?: "")}/${encode(offlineEntryId ?: "")}/${encode(language)}"

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
