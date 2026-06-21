package com.example.langueedroid.feature.decks.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.feature.anki.ui.AnkiDroidDeckSelectorContent

private enum class DeckCreateMode { CreateNew, UseExisting }

private const val DECK_PARENT_NAME = "Languee"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckCreateDialog(
    onConfirm: (name: String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    availableAnkiDecks: List<Pair<Long, String>>? = null,
    isLoadingAnkiDecks: Boolean = false,
    onLoadAnkiDecks: () -> Unit = {},
) {
    var mode by rememberSaveable { mutableStateOf(DeckCreateMode.CreateNew) }
    var subDeckName by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(mode) {
        if (mode == DeckCreateMode.UseExisting) {
            onLoadAnkiDecks()
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.deck_create_dialog_title)) },
        text = {
            Column(
                modifier = Modifier.padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = mode == DeckCreateMode.CreateNew,
                        onClick = { mode = DeckCreateMode.CreateNew },
                        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                    ) {
                        Text(stringResource(R.string.deck_create_mode_new))
                    }
                    SegmentedButton(
                        selected = mode == DeckCreateMode.UseExisting,
                        onClick = { mode = DeckCreateMode.UseExisting },
                        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                    ) {
                        Text(stringResource(R.string.deck_create_mode_existing))
                    }
                }

                when (mode) {
                    DeckCreateMode.CreateNew -> {
                        OutlinedTextField(
                            value = subDeckName,
                            onValueChange = { subDeckName = it },
                            label = { Text(stringResource(R.string.ankidroid_setup_dedicated_deck_name_label)) },
                            prefix = { Text(stringResource(R.string.ankidroid_setup_dedicated_deck_prefix)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    DeckCreateMode.UseExisting -> {
                        AnkiDroidDeckSelectorContent(
                            decks = availableAnkiDecks ?: emptyList(),
                            isLoading = isLoadingAnkiDecks,
                            onDeckSelected = { _, name -> onConfirm(name) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (mode == DeckCreateMode.CreateNew) {
                TextButton(onClick = { onConfirm(buildDeckName(subDeckName)) }) {
                    Text(stringResource(R.string.deck_create_confirm_button))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.btn_cancel))
            }
        },
        modifier = modifier,
    )
}

private fun buildDeckName(subDeckName: String): String {
    val trimmed = subDeckName.trim()
    return if (trimmed.isEmpty()) DECK_PARENT_NAME else "$DECK_PARENT_NAME::$trimmed"
}
