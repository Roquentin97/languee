package com.example.langueedroid.feature.decks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.domain.Card
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.decks.presentation.DeckDetailState
import com.languee.droid.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeckDetailScreen(
    deckName: String,
    state: DeckDetailState,
    onAddWord: () -> Unit,
    onRetry: () -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = deckName,
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
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
        floatingActionButton = {
            FloatingActionButton(
                onClick = onAddWord,
                containerColor = GreenPrimary,
                contentColor = Color.White,
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.deck_detail_add_word),
                )
            }
        },
        modifier = modifier,
    ) { innerPadding ->
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(16.dp),
        ) {
            when (state) {
                is DeckDetailState.Loading -> {
                    CircularProgressIndicator(
                        color = GreenPrimary,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }

                is DeckDetailState.Empty -> {
                    Text(
                        text = stringResource(R.string.deck_detail_empty),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }

                is DeckDetailState.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.deck_detail_error),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Button(
                            onClick = onRetry,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                        ) {
                            Text(stringResource(R.string.card_creation_retry), color = Color.White)
                        }
                    }
                }

                is DeckDetailState.Loaded -> {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(state.cards) { card ->
                            DeckCardItem(card = card)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeckCardItem(
    card: Card,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Color.White)
                .border(1.5.dp, CardBorder, RoundedCornerShape(14.dp))
                .padding(14.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = card.lemma,
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
            )
            Box(
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(5.dp))
                        .background(Color(0xFFF0EDE8))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
            ) {
                Text(
                    text = card.partOfSpeech.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = TextSecondary,
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = card.definition,
            style = MaterialTheme.typography.bodyMedium,
            color = TextPrimary,
        )
        val sentence = card.context ?: card.example
        if (sentence != null) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = sentence,
                style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic),
                color = TextSecondary,
            )
        }
    }
}
