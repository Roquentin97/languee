package com.example.langueedroid.ankidroid

import android.content.Context
import com.ichi2.anki.FlashCardsContract
import com.ichi2.anki.api.AddContentApi
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

class AnkiDroidApi(
    private val context: Context,
    private val ioDispatcher: CoroutineDispatcher,
) {
    private val api by lazy { AddContentApi(context.applicationContext) }

    suspend fun getDeckList(): Map<Long, String>? =
        withContext(ioDispatcher) {
            api.deckList
        }

    suspend fun getOrCreateDeck(name: String): Long? =
        withContext(ioDispatcher) {
            api.deckList
                ?.entries
                ?.find { it.value == name }
                ?.key ?: api.addNewDeck(name)
        }

    /**
     * @param cardTemplates interleaved array of [front1, back1, front2, back2, ...] templates
     */
    suspend fun getOrCreateNoteType(
        typeName: String,
        fields: Array<String>,
        cardTemplates: Array<String>,
        css: String = "",
    ): Long? =
        withContext(ioDispatcher) {
            val existingId =
                api.modelList
                    ?.entries
                    ?.find { it.value == typeName }
                    ?.key
            if (existingId != null) return@withContext existingId

            val numCards = cardTemplates.size / 2
            val cardNames = Array(numCards) { i -> "Card ${i + 1}" }
            val qfmt = Array(numCards) { i -> cardTemplates[i * 2] }
            val afmt = Array(numCards) { i -> cardTemplates[i * 2 + 1] }

            api.addNewCustomModel(typeName, fields, cardNames, qfmt, afmt, css.ifEmpty { null }, null, 0)
        }

    suspend fun addNote(
        modelId: Long,
        deckId: Long,
        fields: Array<String>,
        tags: Set<String>,
    ): Long? =
        withContext(ioDispatcher) {
            api.addNote(modelId, deckId, fields, tags)
        }

    suspend fun findDuplicateNotes(
        modelId: Long,
        key: String,
    ): List<Long> =
        withContext(ioDispatcher) {
            api.findDuplicateNotes(modelId, key).mapNotNull { it?.getId() }
        }

    /**
     * Looks up a note by the hidden LangueeCardId meta field using Anki's native browser
     * search syntax, since matching on a visible field like word/lemma would produce false
     * positives when multiple definitions share the same word text.
     */
    suspend fun findNoteIdByCardId(cardId: String): Long? =
        withContext(ioDispatcher) {
            context.applicationContext.contentResolver
                .query(
                    FlashCardsContract.Note.CONTENT_URI,
                    arrayOf(FlashCardsContract.Note._ID),
                    "LangueeCardId:$cardId",
                    null,
                    null,
                )?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        cursor.getLong(cursor.getColumnIndexOrThrow(FlashCardsContract.Note._ID))
                    } else {
                        null
                    }
                }
        }
}
