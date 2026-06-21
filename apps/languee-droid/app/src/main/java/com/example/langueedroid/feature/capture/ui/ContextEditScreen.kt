package com.example.langueedroid.feature.capture.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.R
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult

@Composable
fun ContextEditScreen(
    state: AppState.Screen.ContextEdit,
    onSave: (String) -> ContextEditSaveResult,
    onConfirmSaveWithoutContext: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var editedContext by remember { mutableStateOf(state.context) }
    var showConfirmDialog by remember { mutableStateOf(false) }

    val isBlank = editedContext.isBlank()
    val containsWord = EntryValidator.isContextValid(state.targetWord, editedContext)
    val saveEnabled = isBlank || containsWord

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.context_edit_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        OutlinedTextField(
            value = state.targetWord,
            onValueChange = {},
            label = { Text(text = stringResource(R.string.label_target_word)) },
            modifier = Modifier.fillMaxWidth(),
            readOnly = true,
        )
        OutlinedTextField(
            value = editedContext,
            onValueChange = { editedContext = it },
            label = { Text(text = stringResource(R.string.label_context_optional)) },
            modifier = Modifier.fillMaxWidth(),
        )
        if (!isBlank && !containsWord) {
            Text(
                text = stringResource(R.string.context_edit_word_missing, state.targetWord),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Button(
            onClick = {
                when (val result = onSave(editedContext)) {
                    is ContextEditSaveResult.Valid -> Unit
                    is ContextEditSaveResult.EmptyContextPendingConfirmation -> {
                        showConfirmDialog = true
                    }
                    is ContextEditSaveResult.InvalidContextBlockedSave -> Unit
                }
            },
            enabled = saveEnabled,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_save))
        }
        TextButton(
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_cancel))
        }
    }

    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text(text = stringResource(R.string.context_edit_title)) },
            text = { Text(text = stringResource(R.string.context_edit_empty_warning)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showConfirmDialog = false
                        onConfirmSaveWithoutContext()
                    },
                ) {
                    Text(text = stringResource(R.string.context_edit_save_without_context))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showConfirmDialog = false },
                ) {
                    Text(text = stringResource(R.string.btn_cancel))
                }
            },
        )
    }
}
