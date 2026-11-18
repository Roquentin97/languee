package com.example.langueedroid.feature.session.ui

import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.SelectionRanges

internal object MainNavRoutes {
    const val DECKS = "decks"
    const val DECK_DETAIL = "deck_detail/{deckId}/{deckName}"
    const val CAPTURE = "capture"
    const val CARD_CREATION = "card_creation/{word}/{context}/{offlineEntryId}/{language}/{lookupContext}/{selectionRanges}/{targetRanges}"
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
        lookupContext: String? = null,
        selectionRanges: List<SelectionRange> = emptyList(),
        targetRanges: List<SelectionRange> = selectionRanges,
    ) = "card_creation/${encode(word)}/${encode(context ?: "")}/${encode(offlineEntryId ?: "")}/${encode(language)}/${encode(
        lookupContext ?: "",
    )}/${encode(SelectionRanges.encode(selectionRanges))}/${encode(SelectionRanges.encode(targetRanges))}"

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
