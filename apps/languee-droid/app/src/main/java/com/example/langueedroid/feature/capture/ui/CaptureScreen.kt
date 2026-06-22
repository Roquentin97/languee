package com.example.langueedroid.feature.capture.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.Token
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult

@Composable
fun CaptureScreen(
    state: AppState.Screen,
    onAddEntry: (word: String, context: String?) -> Unit,
    onStartManualAdd: () -> Unit,
    onSelectTargetWord: (token: String) -> Unit,
    onConfirmTruncation: () -> Unit,
    onKeepFullContext: () -> Unit,
    onEditContext: () -> Unit,
    onDismiss: () -> Unit,
    onContextEditSave: (String) -> ContextEditSaveResult,
    onConfirmSaveWithoutContext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        when (state) {
            is AppState.Screen.ManualCapture -> ManualCaptureContent(
                prefilledWord = state.prefilledWord,
                onSave = onAddEntry,
                onCancel = onDismiss,
            )

            is AppState.Screen.SharedWordCapture -> SharedWordCaptureContent(
                word = state.word,
                onAddContextManually = onStartManualAdd,
                onSaveWithoutContext = { onAddEntry(state.word, null) },
                onCancel = onDismiss,
            )

            is AppState.Screen.SharedContextCapture -> SharedContextCaptureContent(
                tokens = state.tokens,
                onSelectWord = onSelectTargetWord,
                onCancel = onDismiss,
            )

            is AppState.Screen.ContextReview -> ContextReviewContent(
                state = state,
                onSave = { onAddEntry(state.targetWord, state.context) },
                onSaveWithoutContext = { onAddEntry(state.targetWord, null) },
                onConfirmTruncation = onConfirmTruncation,
                onKeepFullContext = onKeepFullContext,
                onEditContext = onEditContext,
                onCancel = onDismiss,
            )

            is AppState.Screen.ContextEdit -> ContextEditScreen(
                state = state,
                onSave = onContextEditSave,
                onConfirmSaveWithoutContext = onConfirmSaveWithoutContext,
                onCancel = onDismiss,
            )

            else -> Unit // Decks and CardCreation screens are handled outside CaptureScreen.
        }
    }
}

@Composable
private fun ManualCaptureContent(
    prefilledWord: String,
    onSave: (word: String, context: String?) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var word by rememberSaveable { mutableStateOf(prefilledWord) }
    var context by rememberSaveable { mutableStateOf("") }

    val contextIsNonBlank = context.isNotBlank()
    val contextIsValid = !contextIsNonBlank || EntryValidator.isContextValid(word.trim(), context)
    val canSave = word.isNotBlank() && contextIsValid

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineSmall,
        )
        OutlinedTextField(
            value = word,
            onValueChange = { word = it },
            label = { Text(text = stringResource(R.string.label_target_word)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = context,
            onValueChange = { context = it },
            label = { Text(text = stringResource(R.string.label_context_optional)) },
            modifier = Modifier.fillMaxWidth(),
        )
        if (contextIsNonBlank && !contextIsValid) {
            Text(
                text = stringResource(R.string.validation_context_must_contain_word),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        Button(
            onClick = {
                onSave(word, context.trim().ifBlank { null })
            },
            enabled = canSave,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_save))
        }
        OutlinedButton(
            onClick = { onSave(word, null) },
            enabled = word.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_save_without_context))
        }
        TextButton(
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_cancel))
        }
    }
}

@Composable
private fun SharedWordCaptureContent(
    word: String,
    onAddContextManually: () -> Unit,
    onSaveWithoutContext: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = word,
            style = MaterialTheme.typography.headlineMedium,
        )
        Button(
            onClick = onAddContextManually,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_add_context_manually))
        }
        OutlinedButton(
            onClick = onSaveWithoutContext,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_save_without_context))
        }
        TextButton(
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_cancel))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SharedContextCaptureContent(
    tokens: List<Token>,
    onSelectWord: (String) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.label_tap_word_to_learn),
            style = MaterialTheme.typography.bodyLarge,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            tokens.forEach { token ->
                when (token) {
                    is Token.Word -> {
                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = MaterialTheme.colorScheme.secondaryContainer,
                            modifier = Modifier.clickable { onSelectWord(token.text) },
                        ) {
                            Text(
                                text = token.text,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.bodyLarge,
                            )
                        }
                    }

                    is Token.Separator -> {
                        Text(
                            text = token.text,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }
        }
        Spacer(modifier = Modifier.weight(1f))
        TextButton(
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_cancel))
        }
    }
}

@Composable
private fun ContextReviewContent(
    state: AppState.Screen.ContextReview,
    onSave: () -> Unit,
    onSaveWithoutContext: () -> Unit,
    onConfirmTruncation: () -> Unit,
    onKeepFullContext: () -> Unit,
    onEditContext: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val highlightStyle = SpanStyle(background = MaterialTheme.colorScheme.primaryContainer)
    val annotated = buildHighlightedAnnotatedString(
        context = state.context,
        word = state.targetWord,
        highlightStyle = highlightStyle,
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = state.targetWord,
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = annotated,
            style = MaterialTheme.typography.bodyLarge,
        )

        if (state.isMultiSentence) {
            val canTruncate = EntryValidator.extractSentenceContaining(
                state.targetWord,
                state.context,
            ) != null

            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = stringResource(R.string.warning_multi_sentence),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    if (canTruncate) {
                        Button(
                            onClick = onConfirmTruncation,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(text = stringResource(R.string.btn_truncate_to_sentence))
                        }
                    }
                    OutlinedButton(
                        onClick = onKeepFullContext,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = stringResource(R.string.btn_keep_full_context))
                    }
                }
            }
        }

        Button(
            onClick = onSave,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_save))
        }
        OutlinedButton(
            onClick = onEditContext,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_edit_context))
        }
        OutlinedButton(
            onClick = onSaveWithoutContext,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_save_without_context))
        }
        TextButton(
            onClick = onCancel,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(text = stringResource(R.string.btn_cancel))
        }
    }
}
