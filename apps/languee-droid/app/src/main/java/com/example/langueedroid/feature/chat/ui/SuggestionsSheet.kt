package com.example.langueedroid.feature.chat.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.core.domain.ChatSuggestion
import com.example.langueedroid.core.domain.SuggestionType
import com.example.langueedroid.core.ui.theme.AmberBorder
import com.example.langueedroid.core.ui.theme.AmberContainer
import com.example.langueedroid.core.ui.theme.AmberWarning
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenBorder
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.chat.presentation.SuggestionsUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SuggestionsSheet(
    state: SuggestionsUiState,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.chat_suggestions_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = TextPrimary,
                )
                IconButton(onClick = onRefresh) {
                    Icon(
                        imageVector = Icons.Filled.Refresh,
                        contentDescription = stringResource(R.string.chat_suggestions_refresh_description),
                        tint = GreenPrimary,
                    )
                }
            }

            val analyzedAtText = when (state) {
                is SuggestionsUiState.Loaded ->
                    if (state.analyzedAt != null) {
                        stringResource(R.string.chat_suggestions_analyzed_just_now)
                    } else {
                        stringResource(R.string.chat_suggestions_not_analyzed)
                    }
                else -> null
            }
            if (analyzedAtText != null) {
                Text(
                    text = analyzedAtText,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                    modifier = Modifier.padding(bottom = 12.dp),
                )
            }

            when (state) {
                is SuggestionsUiState.Loading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = GreenPrimary)
                    }
                }

                is SuggestionsUiState.Error -> {
                    Text(
                        text = stringResource(R.string.error_chat_suggestions_load_failed),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                }

                is SuggestionsUiState.Loaded -> {
                    if (state.suggestions.isEmpty()) {
                        Text(
                            text = stringResource(R.string.chat_suggestions_empty),
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextSecondary,
                            modifier = Modifier.padding(vertical = 16.dp),
                        )
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            contentPadding = PaddingValues(bottom = 24.dp),
                        ) {
                            items(state.suggestions) { suggestion ->
                                SuggestionCard(suggestion = suggestion)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestionCard(suggestion: ChatSuggestion, modifier: Modifier = Modifier) {
    val (containerColor, borderColor, textColor) = when (suggestion.type) {
        SuggestionType.OVERUSED_WORD -> Triple(GreenContainer, GreenBorder, TextPrimary)
        SuggestionType.GRAMMAR -> Triple(AmberContainer, AmberBorder, AmberWarning)
        SuggestionType.STYLE -> Triple(Color.White, CardBorder, TextPrimary)
    }

    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = BorderStroke(1.5.dp, borderColor),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = suggestion.title,
                style = MaterialTheme.typography.titleSmall,
                color = textColor,
            )
            Text(
                text = suggestion.detail,
                style = MaterialTheme.typography.bodyMedium,
                color = textColor,
                modifier = Modifier.padding(top = 4.dp),
            )
            val synonyms = suggestion.overusedWordPayload?.synonyms.orEmpty()
            if (synonyms.isNotEmpty()) {
                Row(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    synonyms.forEach { synonym ->
                        SynonymChip(text = synonym)
                    }
                }
            }
        }
    }
}

@Composable
private fun SynonymChip(text: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = GreenPrimary,
        )
    }
}
