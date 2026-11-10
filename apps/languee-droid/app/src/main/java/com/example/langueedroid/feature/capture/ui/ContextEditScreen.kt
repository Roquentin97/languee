package com.example.langueedroid.feature.capture.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult
import com.languee.droid.R

@OptIn(ExperimentalMaterial3Api::class)
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

    Scaffold(
        modifier = modifier,
        containerColor = SurfaceWarm,
        topBar = {
            ContextEditTopBar(onCancel)
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TargetWordField(state.targetWord)

            EditableContextField(editedContext) { editedContext = it }

            if (!isBlank && !containsWord) {
                Text(
                    text = stringResource(R.string.context_edit_word_missing, state.targetWord),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            SaveContextButton(saveEnabled) {
                when (onSave(editedContext)) {
                    is ContextEditSaveResult.Valid -> Unit
                    is ContextEditSaveResult.EmptyContextPendingConfirmation -> showConfirmDialog = true
                    is ContextEditSaveResult.InvalidContextBlockedSave -> Unit
                }
            }

            TextButton(
                onClick = onCancel,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(44.dp),
            ) {
                Text(
                    text = stringResource(R.string.btn_cancel),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                )
            }
        }
    }

    if (showConfirmDialog) {
        EmptyContextDialog(onDismiss = { showConfirmDialog = false }, onConfirm = {
            showConfirmDialog = false
            onConfirmSaveWithoutContext()
        })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ContextEditTopBar(onCancel: () -> Unit) {
    TopAppBar(
        title = {
            Text(
                text = stringResource(R.string.context_edit_title),
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
            )
        },
        navigationIcon = {
            IconButton(onClick = onCancel) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.btn_cancel),
                    tint = TextPrimary,
                )
            }
        },
        colors =
            TopAppBarDefaults.topAppBarColors(
                containerColor = Color.White,
                scrolledContainerColor = Color.White,
            ),
    )
}

@Composable
private fun TargetWordField(word: String) {
    OutlinedTextField(
        value = word,
        onValueChange = {},
        label = {
            Text(
                text = stringResource(R.string.label_target_word).uppercase(),
                style = MaterialTheme.typography.labelSmall,
            )
        },
        modifier = Modifier.fillMaxWidth(),
        readOnly = true,
        shape = RoundedCornerShape(13.dp),
        colors =
            OutlinedTextFieldDefaults.colors(
                focusedBorderColor = CardBorder,
                unfocusedBorderColor = CardBorder,
                disabledBorderColor = CardBorder,
                focusedLabelColor = TextSecondary,
                unfocusedLabelColor = TextSecondary,
            ),
    )
}

@Composable
private fun EditableContextField(
    editedContext: String,
    onChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = editedContext,
        onValueChange = onChange,
        label = {
            Text(
                text = stringResource(R.string.label_context_optional).uppercase(),
                style = MaterialTheme.typography.labelSmall,
            )
        },
        modifier =
            Modifier
                .fillMaxWidth()
                .height(120.dp),
        shape = RoundedCornerShape(13.dp),
        colors =
            OutlinedTextFieldDefaults.colors(
                focusedBorderColor = GreenPrimary,
                unfocusedBorderColor = CardBorder,
                focusedLabelColor = GreenPrimary,
                unfocusedLabelColor = TextSecondary,
                cursorColor = GreenPrimary,
            ),
    )
}

@Composable
private fun EmptyContextDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(text = stringResource(R.string.context_edit_title)) },
        text = { Text(text = stringResource(R.string.context_edit_empty_warning)) },
        confirmButton = {
            TextButton(
                onClick = {
                    onConfirm()
                },
            ) {
                Text(
                    text = stringResource(R.string.context_edit_save_without_context),
                    color = GreenPrimary,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = stringResource(R.string.btn_cancel))
            }
        },
    )
}

@Composable
private fun SaveContextButton(
    saveEnabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = saveEnabled,
        modifier =
            Modifier
                .fillMaxWidth()
                .height(54.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
    ) {
        Text(
            text = stringResource(R.string.btn_save),
            style = MaterialTheme.typography.labelLarge,
            color = Color.White,
        )
    }
}
