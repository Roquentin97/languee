package com.example.langueedroid.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.R

private val languageCodeRegex = Regex("^[a-z]{2}$")

@Composable
fun DeckCreateDialog(
    onConfirm: (name: String, language: String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var language by rememberSaveable { mutableStateOf("") }
    var nameError by rememberSaveable { mutableStateOf(false) }
    var languageError by rememberSaveable { mutableStateOf(false) }

    val isValid = name.isNotBlank() && languageCodeRegex.matches(language)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.deck_create_dialog_title)) },
        text = {
            Column(
                modifier = Modifier.padding(top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = {
                        name = it
                        nameError = false
                    },
                    label = { Text(stringResource(R.string.deck_create_name_label)) },
                    isError = nameError,
                    supportingText = if (nameError) {
                        { Text(stringResource(R.string.deck_create_name_error)) }
                    } else {
                        null
                    },
                )
                OutlinedTextField(
                    value = language,
                    onValueChange = {
                        language = it
                        languageError = false
                    },
                    label = { Text(stringResource(R.string.deck_create_language_label)) },
                    isError = languageError,
                    supportingText = if (languageError) {
                        { Text(stringResource(R.string.deck_create_language_error)) }
                    } else {
                        { Text(stringResource(R.string.deck_create_language_hint)) }
                    },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmedName = name.trim()
                    val trimmedLang = language.trim()
                    nameError = trimmedName.isEmpty()
                    languageError = !languageCodeRegex.matches(trimmedLang)
                    if (!nameError && !languageError) {
                        onConfirm(trimmedName, trimmedLang)
                    }
                },
            ) {
                Text(stringResource(R.string.deck_create_confirm_button))
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
