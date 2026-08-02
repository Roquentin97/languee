package com.example.langueedroid.feature.decks.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.ui.theme.AmberContainer
import com.example.langueedroid.core.ui.theme.AmberWarning
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextMuted
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.auth.ui.LangueeLeafIcon
import com.example.langueedroid.feature.decks.presentation.DecksError
import com.example.langueedroid.feature.decks.presentation.DecksScreenState
import com.languee.droid.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DecksScreen(
    state: DecksScreenState,
    onDeckClick: (Deck) -> Unit,
    onDeckBrowseClick: (Deck) -> Unit,
    onCreateDeck: (name: String) -> Unit,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    modifier: Modifier = Modifier,
    onIntegrationsClick: (() -> Unit)? = null,
    onSyncClick: (() -> Unit)? = null,
    availableAnkiDecks: List<Pair<Long, String>>? = null,
    isLoadingAnkiDecks: Boolean = false,
    onLoadAnkiDecks: () -> Unit = {},
    onReviewClick: (() -> Unit)? = null,
    dueReviewCount: Int? = null,
    isOffline: Boolean = false,
    offlineQueueCount: Int = 0,
    onOfflineStripClick: (() -> Unit)? = null,
) {
    var showCreateDialog by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier =
                                Modifier
                                    .size(28.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(GreenContainer),
                            contentAlignment = Alignment.Center,
                        ) {
                            LangueeLeafIcon(
                                modifier = Modifier.size(16.dp),
                                leafColor = GreenPrimary,
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.decks_screen_title),
                            style = MaterialTheme.typography.titleLarge,
                            color = TextPrimary,
                        )
                    }
                },
                actions = {
                    if (onReviewClick != null) {
                        IconButton(onClick = onReviewClick) {
                            if (dueReviewCount != null && dueReviewCount > 0) {
                                BadgedBox(
                                    badge = {
                                        Badge(containerColor = GreenPrimary, contentColor = Color.White) {
                                            Text(dueReviewCount.toString())
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.PlayArrow,
                                        contentDescription = stringResource(R.string.decks_review_button),
                                        tint = GreenPrimary,
                                    )
                                }
                            } else {
                                Icon(
                                    imageVector = Icons.Filled.PlayArrow,
                                    contentDescription = stringResource(R.string.decks_review_button),
                                    tint = GreenPrimary,
                                )
                            }
                        }
                    }
                    if (onIntegrationsClick != null) {
                        IconButton(onClick = onIntegrationsClick) {
                            Icon(
                                imageVector = Icons.Filled.Settings,
                                contentDescription = stringResource(R.string.ankidroid_integrations_description),
                                tint = TextSecondary,
                            )
                        }
                    }
                    if (onSyncClick != null) {
                        IconButton(onClick = onSyncClick) {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = stringResource(R.string.ankidroid_sync_description),
                                tint = TextSecondary,
                            )
                        }
                    }
                    IconButton(
                        onClick = onLogout,
                        enabled = !logoutInProgress,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = stringResource(R.string.logout_description),
                            tint = TextSecondary,
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
                onClick = { showCreateDialog = true },
                shape = RoundedCornerShape(18.dp),
                containerColor = GreenPrimary,
                elevation = FloatingActionButtonDefaults.elevation(6.dp, 8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.decks_create_deck_button),
                    tint = Color.White,
                )
            }
        },
        modifier = modifier,
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
        ) {
            if (onOfflineStripClick != null && (isOffline || offlineQueueCount > 0)) {
                OfflineStrip(
                    isOffline = isOffline,
                    queueCount = offlineQueueCount,
                    onClick = onOfflineStripClick,
                )
            }
            DecksScreenBody(state = state, onDeckClick = onDeckClick, onDeckBrowseClick = onDeckBrowseClick)
        }
    }

    if (showCreateDialog) {
        DeckCreateDialog(
            onConfirm = { name ->
                onCreateDeck(name)
                showCreateDialog = false
            },
            onDismiss = { showCreateDialog = false },
            availableAnkiDecks = availableAnkiDecks,
            isLoadingAnkiDecks = isLoadingAnkiDecks,
            onLoadAnkiDecks = onLoadAnkiDecks,
        )
    }
}

@Composable
private fun OfflineStrip(
    isOffline: Boolean,
    queueCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val background = if (isOffline) AmberContainer else GreenContainer
    val contentColor = if (isOffline) AmberWarning else GreenPrimary
    val text =
        when {
            isOffline && queueCount > 0 ->
                stringResource(R.string.decks_offline_strip_queued, queueCount)
            isOffline -> stringResource(R.string.decks_offline_strip_offline)
            else -> stringResource(R.string.decks_offline_strip_back_online, queueCount)
        }
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(background)
                .clickable(onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            color = contentColor,
        )
    }
}

@Composable
private fun DecksScreenBody(
    state: DecksScreenState,
    onDeckClick: (Deck) -> Unit,
    onDeckBrowseClick: (Deck) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        when (state) {
            is DecksScreenState.Loading -> {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = GreenPrimary,
                )
            }

            is DecksScreenState.Empty -> {
                Column(
                    modifier =
                        Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.decks_empty_state),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                    )
                }
            }

            is DecksScreenState.Error -> {
                val errorMessage =
                    stringResource(
                        when (state.type) {
                            DecksError.LOAD_FAILED -> R.string.error_load_decks_failed
                            DecksError.CREATE_FAILED -> R.string.error_create_deck_failed
                        },
                    )
                Column(
                    modifier =
                        Modifier
                            .align(Alignment.Center)
                            .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            is DecksScreenState.Success -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding =
                        PaddingValues(
                            start = 16.dp,
                            end = 16.dp,
                            top = 16.dp,
                            bottom = 80.dp,
                        ),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.decks) { deck ->
                        DeckCard(
                            deck = deck,
                            onClick = { onDeckClick(deck) },
                            onBrowseClick = { onDeckBrowseClick(deck) },
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DeckCard(
    deck: Deck,
    onClick: () -> Unit,
    onBrowseClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showContextMenu by rememberSaveable { mutableStateOf(false) }

    Box(modifier = modifier) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White)
                    .border(1.dp, Color.Transparent, RoundedCornerShape(16.dp))
                    .combinedClickable(
                        onClick = onClick,
                        onLongClick = { showContextMenu = true },
                    ).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier =
                    Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(GreenContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.List,
                    contentDescription = null,
                    tint = GreenPrimary,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = deck.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = TextPrimary,
                )
            }
            Icon(
                imageVector = Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                tint = TextMuted,
                modifier =
                    Modifier
                        .size(18.dp)
                        .rotate(-90f),
            )
        }

        DropdownMenu(
            expanded = showContextMenu,
            onDismissRequest = { showContextMenu = false },
        ) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.decks_deck_context_menu_browse)) },
                onClick = {
                    showContextMenu = false
                    onBrowseClick()
                },
            )
        }
    }
}
