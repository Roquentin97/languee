package com.example.langueedroid.ankidroid

import android.content.Context
import com.ichi2.anki.api.AddContentApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AnkiDroidApi(private val context: Context) {

    private val api by lazy { AddContentApi(context.applicationContext) }

    suspend fun getDeckList(): Map<Long, String>? = withContext(Dispatchers.IO) {
        api.deckList
    }

    suspend fun getOrCreateDeck(name: String): Long? = withContext(Dispatchers.IO) {
        api.deckList?.entries?.find { it.value == name }?.key ?: api.addNewDeck(name)
    }

    /**
     * @param cardTemplates interleaved array of [front1, back1, front2, back2, ...] templates
     */
    suspend fun getOrCreateNoteType(
        typeName: String,
        fields: Array<String>,
        cardTemplates: Array<String>,
        css: String = "",
    ): Long? = withContext(Dispatchers.IO) {
        val existingId = api.modelList?.entries?.find { it.value == typeName }?.key
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
    ): Long? = withContext(Dispatchers.IO) {
        api.addNote(modelId, deckId, fields, tags)
    }

    suspend fun findDuplicateNotes(modelId: Long, key: String): List<Long> =
        withContext(Dispatchers.IO) {
            api.findDuplicateNotes(modelId, key).mapNotNull { it?.getId() }
        }
}
