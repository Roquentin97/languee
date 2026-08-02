package com.example.langueedroid.feature.capture.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.ExpressionSpanSelector
import com.example.langueedroid.core.domain.Token
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenBorder
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenHighlight
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.GreenPrimaryDark
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextMuted
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult
import com.languee.droid.R

@Composable
fun CaptureScreen(
    state: AppState.Screen,
    onAddEntry: (word: String, context: String?) -> Unit,
    onStartManualAdd: () -> Unit,
    onWordTokenTapped: (index: Int) -> Unit,
    onConfirmWordSelection: () -> Unit,
    onConfirmTruncation: () -> Unit,
    onKeepFullContext: () -> Unit,
    onEditContext: () -> Unit,
    onDismiss: () -> Unit,
    onContextEditSave: (String) -> ContextEditSaveResult,
    onConfirmSaveWithoutContext: () -> Unit,
    onSelectLanguage: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        when (state) {
            is AppState.Screen.ManualCapture ->
                ManualCaptureContent(
                    prefilledWord = state.prefilledWord,
                    selectedLanguage = state.selectedLanguage,
                    onSelectLanguage = onSelectLanguage,
                    onSave = onAddEntry,
                    onCancel = onDismiss,
                )

            is AppState.Screen.SharedWordCapture ->
                SharedWordCaptureContent(
                    word = state.word,
                    onAddContextManually = onStartManualAdd,
                    onSaveWithoutContext = { onAddEntry(state.word, null) },
                    onCancel = onDismiss,
                )

            is AppState.Screen.SharedContextCapture ->
                SharedContextCaptureContent(
                    tokens = state.tokens,
                    selectedIndices = state.selectedIndices,
                    selectedLanguage = state.selectedLanguage,
                    onSelectLanguage = onSelectLanguage,
                    onWordTapped = onWordTokenTapped,
                    onConfirmSelection = onConfirmWordSelection,
                    onCancel = onDismiss,
                )

            is AppState.Screen.ContextReview ->
                ContextReviewContent(
                    state = state,
                    onSave = { onAddEntry(state.targetWord, state.context) },
                    onSaveWithoutContext = { onAddEntry(state.targetWord, null) },
                    onConfirmTruncation = onConfirmTruncation,
                    onKeepFullContext = onKeepFullContext,
                    onEditContext = onEditContext,
                    onCancel = onDismiss,
                )

            is AppState.Screen.ContextEdit ->
                ContextEditScreen(
                    state = state,
                    onSave = onContextEditSave,
                    onConfirmSaveWithoutContext = onConfirmSaveWithoutContext,
                    onCancel = onDismiss,
                )

            else -> Unit
        }
    }
}

// Only English is supported end to end for now; the selector stays as the seam
// for reintroducing languages behind a proper design.
private val languageChips =
    listOf(
        "en" to R.string.language_en,
    )

/** Compact segmented row of language chips used to pick the capture language. */
@Composable
private fun LanguageSelector(
    selectedLanguage: String,
    onLanguageSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        languageChips.forEach { (code, labelRes) ->
            val isSelected = code == selectedLanguage
            // The chip text itself is the compact code (EN/ES/DE); labelRes ("English" /
            // "Español" / "Deutsch", translatable="false") backs the accessible name so a
            // screen reader announces the full language name regardless of app locale.
            val accessibleName = stringResource(labelRes)
            Box(
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(if (isSelected) GreenPrimary else GreenContainer)
                        .clickable { onLanguageSelected(code) }
                        .semantics { contentDescription = accessibleName }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = code.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (isSelected) Color.White else GreenPrimary,
                )
            }
        }
    }
}

/** Display-only language badge shown on ContextReview; the language was already chosen upstream. */
@Composable
private fun LanguageBadge(
    selectedLanguage: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .clip(RoundedCornerShape(8.dp))
                .background(GreenContainer)
                .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = selectedLanguage.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = GreenPrimary,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ManualCaptureContent(
    prefilledWord: String,
    selectedLanguage: String,
    onSelectLanguage: (String) -> Unit,
    onSave: (word: String, context: String?) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var word by rememberSaveable { mutableStateOf(prefilledWord) }
    var context by rememberSaveable { mutableStateOf("") }

    val contextIsNonBlank = context.isNotBlank()
    val contextIsValid = !contextIsNonBlank || EntryValidator.isContextValid(word.trim(), context)
    val canSave = word.isNotBlank() && contextIsValid

    Scaffold(
        modifier = modifier,
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Add a word",
                        style = MaterialTheme.typography.headlineSmall,
                        color = TextPrimary,
                    )
                },
                actions = {
                    IconButton(onClick = onCancel) {
                        Box(
                            modifier =
                                Modifier
                                    .size(34.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(CardBorder),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = stringResource(R.string.btn_cancel),
                                tint = TextPrimary,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWarm),
            )
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Manually add a word to your vocabulary",
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary,
            )

            LanguageSelector(
                selectedLanguage = selectedLanguage,
                onLanguageSelected = onSelectLanguage,
            )

            OutlinedTextField(
                value = word,
                onValueChange = { word = it },
                label = {
                    Text(
                        text = stringResource(R.string.label_target_word).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(13.dp),
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GreenPrimary,
                        unfocusedBorderColor = GreenPrimary,
                        focusedLabelColor = GreenPrimary,
                        unfocusedLabelColor = GreenPrimary,
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        cursorColor = GreenPrimary,
                    ),
            )

            OutlinedTextField(
                value = context,
                onValueChange = { context = it },
                label = {
                    Text(
                        text = "CONTEXT (OPTIONAL)",
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(100.dp),
                shape = RoundedCornerShape(13.dp),
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GreenPrimary,
                        unfocusedBorderColor = GreenPrimary,
                        focusedLabelColor = GreenPrimary,
                        unfocusedLabelColor = GreenPrimary,
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        cursorColor = GreenPrimary,
                    ),
            )

            if (contextIsNonBlank && !contextIsValid) {
                Text(
                    text = stringResource(R.string.validation_context_must_contain_word),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { onSave(word, context.trim().ifBlank { null }) },
                    enabled = canSave,
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
                OutlinedButton(
                    onClick = { onSave(word, null) },
                    enabled = word.isNotBlank(),
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, GreenBorder),
                ) {
                    Text(
                        text = stringResource(R.string.btn_save_without_context),
                        style = MaterialTheme.typography.labelLarge,
                        color = GreenPrimary,
                    )
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
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SharedWordCaptureContent(
    word: String,
    onAddContextManually: () -> Unit,
    onSaveWithoutContext: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Add a word",
                        style = MaterialTheme.typography.headlineSmall,
                        color = TextPrimary,
                    )
                },
                actions = {
                    IconButton(onClick = onCancel) {
                        Box(
                            modifier =
                                Modifier
                                    .size(34.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(CardBorder),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = stringResource(R.string.btn_cancel),
                                tint = TextPrimary,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SurfaceWarm),
            )
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
        ) {
            Box(
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(11.dp))
                        .background(GreenContainer)
                        .border(1.5.dp, GreenBorder, RoundedCornerShape(11.dp))
                        .padding(horizontal = 16.dp, vertical = 9.dp),
            ) {
                Text(
                    text = word,
                    style = MaterialTheme.typography.headlineSmall,
                    color = GreenPrimary,
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onAddContextManually,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                ) {
                    Text(
                        text = stringResource(R.string.btn_add_context_manually),
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                    )
                }
                OutlinedButton(
                    onClick = onSaveWithoutContext,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, GreenBorder),
                ) {
                    Text(
                        text = stringResource(R.string.btn_save_without_context),
                        style = MaterialTheme.typography.labelLarge,
                        color = GreenPrimary,
                    )
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
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun SharedContextCaptureContent(
    tokens: List<Token>,
    selectedIndices: List<Int>,
    selectedLanguage: String,
    onSelectLanguage: (String) -> Unit,
    onWordTapped: (Int) -> Unit,
    onConfirmSelection: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        containerColor = Color.White,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Tap a word",
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
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(start = 24.dp, end = 24.dp, top = 28.dp, bottom = 24.dp),
        ) {
            Text(
                text = stringResource(R.string.label_tap_word_to_learn),
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted,
            )
            Spacer(modifier = Modifier.height(16.dp))
            LanguageSelector(
                selectedLanguage = selectedLanguage,
                onLanguageSelected = onSelectLanguage,
            )
            Spacer(modifier = Modifier.height(16.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f),
            ) {
                tokens.forEachIndexed { index, token ->
                    when (token) {
                        is Token.Word -> {
                            val isSelected = index in selectedIndices
                            Text(
                                text = "${token.text} ",
                                style =
                                    MaterialTheme.typography.bodyLarge.copy(
                                        color = if (isSelected) GreenPrimaryDark else TextPrimary,
                                    ),
                                modifier =
                                    Modifier
                                        .clip(RoundedCornerShape(5.dp))
                                        .background(if (isSelected) GreenHighlight else Color.Transparent)
                                        .clickable { onWordTapped(index) }
                                        .padding(horizontal = 3.dp, vertical = 1.dp),
                            )
                        }

                        is Token.Separator -> {
                            Text(
                                text = token.text,
                                style = MaterialTheme.typography.bodyLarge,
                                color = TextPrimary,
                            )
                        }
                    }
                }
            }
            if (selectedIndices.isNotEmpty()) {
                Text(
                    text =
                        stringResource(
                            R.string.label_selection_preview,
                            ExpressionSpanSelector.joinSelection(tokens, selectedIndices),
                        ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = GreenPrimary,
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = onConfirmSelection,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                ) {
                    Text(
                        text = stringResource(R.string.btn_continue_selection),
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                    )
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
                    color = TextMuted,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
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
    val highlightStyle =
        SpanStyle(
            background = GreenHighlight,
            color = GreenPrimaryDark,
        )
    val annotated =
        buildHighlightedAnnotatedString(
            context = state.context,
            word = state.targetWord,
            highlightStyle = highlightStyle,
        )

    Scaffold(
        modifier = modifier,
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Review",
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
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "WORD",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary,
                        )
                        LanguageBadge(selectedLanguage = state.selectedLanguage)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = state.targetWord,
                        style = MaterialTheme.typography.headlineLarge,
                        color = GreenPrimary,
                    )
                }
            }

            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(modifier = Modifier.padding(18.dp, 18.dp, 20.dp, 18.dp)) {
                    Text(
                        text = "CONTEXT",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = annotated,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }

            if (state.isMultiSentence) {
                val canTruncate =
                    EntryValidator.extractSentenceContaining(
                        state.targetWord,
                        state.context,
                    ) != null

                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors =
                        CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = stringResource(R.string.warning_multi_sentence),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        if (canTruncate) {
                            Button(
                                onClick = onConfirmTruncation,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                            ) {
                                Text(stringResource(R.string.btn_truncate_to_sentence))
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                        }
                        OutlinedButton(
                            onClick = onKeepFullContext,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text(stringResource(R.string.btn_keep_full_context))
                        }
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onSave,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                ) {
                    Text(
                        text = "Save and create card",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                    )
                }
                OutlinedButton(
                    onClick = onEditContext,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, GreenBorder),
                ) {
                    Text(
                        text = stringResource(R.string.btn_edit_context),
                        style = MaterialTheme.typography.labelLarge,
                        color = GreenPrimary,
                    )
                }
                OutlinedButton(
                    onClick = onSaveWithoutContext,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, CardBorder),
                ) {
                    Text(
                        text = stringResource(R.string.btn_save_without_context),
                        style = MaterialTheme.typography.labelLarge,
                        color = TextPrimary,
                    )
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
    }
}
