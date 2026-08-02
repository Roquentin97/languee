package com.example.langueedroid.feature.anki.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.GreenPrimaryDark
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.anki.presentation.SyncUiState
import com.languee.droid.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnkiDroidSyncScreen(
    uiState: SyncUiState,
    onSync: () -> Unit,
    onDismissResult: () -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.ankidroid_sync_title),
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
        modifier = modifier,
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (uiState) {
                is SyncUiState.Syncing -> {
                    CircularProgressIndicator(
                        color = GreenPrimary,
                        modifier = Modifier.size(56.dp),
                        strokeWidth = 3.dp,
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Text(
                        text = stringResource(R.string.ankidroid_sync_in_progress),
                        style = MaterialTheme.typography.titleSmall,
                        color = TextPrimary,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.ankidroid_sync_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        textAlign = TextAlign.Center,
                    )
                }

                is SyncUiState.Result -> {
                    SyncSuccessContent(result = uiState)
                    Spacer(modifier = Modifier.height(28.dp))
                    Button(
                        onClick = onDismissResult,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                    ) {
                        Text(
                            text = stringResource(R.string.ankidroid_status_ok),
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }

                is SyncUiState.Idle -> {
                    AnkiDroidIcon()
                    Spacer(modifier = Modifier.height(24.dp))
                    Text(
                        text = stringResource(R.string.ankidroid_sync_title),
                        style = MaterialTheme.typography.headlineSmall,
                        color = TextPrimary,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.ankidroid_sync_description),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(32.dp))
                    Button(
                        onClick = onSync,
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .height(54.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                            Text(
                                text = stringResource(R.string.ankidroid_sync_button),
                                color = Color.White,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AnkiDroidIcon(modifier: Modifier = Modifier) {
    Box(
        modifier =
            modifier
                .size(72.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(GreenContainer),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.Refresh,
            contentDescription = null,
            tint = GreenPrimary,
            modifier = Modifier.size(36.dp),
        )
    }
}

@Composable
private fun SyncSuccessContent(
    result: SyncUiState.Result,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier =
                Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(GreenContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = GreenPrimaryDark,
                modifier = Modifier.size(36.dp),
            )
        }
        if (result.syncedCount == 0 && result.failedWords.isEmpty()) {
            Text(
                text = stringResource(R.string.ankidroid_sync_up_to_date),
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
                textAlign = TextAlign.Center,
            )
        } else {
            Text(
                text =
                    stringResource(
                        R.string.ankidroid_sync_result_summary,
                        result.syncedCount,
                        result.failedWords.size,
                    ),
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
                textAlign = TextAlign.Center,
            )
            if (result.failedWords.isNotEmpty()) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = stringResource(R.string.ankidroid_sync_failed_words_header),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary,
                    )
                    result.failedWords.forEach { word ->
                        Text(
                            text = word,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
    }
}
