package com.example.langueedroid.feature.anki.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.languee.droid.R

@Composable
fun AnkiDroidDeckSelectorContent(
    decks: List<Pair<Long, String>>,
    isLoading: Boolean,
    onDeckSelected: (Long, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var searchQuery by remember { mutableStateOf("") }

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            label = { Text(stringResource(R.string.ankidroid_deck_selector_search_hint)) },
            modifier = Modifier.fillMaxWidth(),
        )

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            val filtered = decks.filter { (_, name) ->
                name.contains(searchQuery, ignoreCase = true)
            }

            if (filtered.isEmpty()) {
                Text(
                    text = stringResource(R.string.decks_empty_state),
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            } else {
                Column(modifier = Modifier.fillMaxWidth()) {
                    for ((deckId, deckName) in filtered) {
                        Text(
                            text = deckName,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onDeckSelected(deckId, deckName) }
                                .padding(vertical = 12.dp, horizontal = 4.dp),
                        )
                    }
                }
            }
        }
    }
}
