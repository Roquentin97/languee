package com.example.langueedroid.feature.anki.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.feature.anki.presentation.SyncUiState

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
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ankidroid_sync_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.btn_cancel),
                        )
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.ankidroid_sync_description),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(16.dp))
            if (uiState is SyncUiState.Syncing) {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(8.dp))
                Text(stringResource(R.string.ankidroid_sync_in_progress))
            } else {
                Button(onClick = onSync, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.ankidroid_sync_button))
                }
            }
        }
    }

    if (uiState is SyncUiState.Result) {
        SyncResultDialog(result = uiState, onDismiss = onDismissResult)
    }
}

@Composable
private fun SyncResultDialog(
    result: SyncUiState.Result,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.ankidroid_sync_title)) },
        text = {
            Column {
                if (result.syncedCount == 0 && result.failedWords.isEmpty()) {
                    Text(stringResource(R.string.ankidroid_sync_up_to_date))
                } else {
                    Text(
                        stringResource(
                            R.string.ankidroid_sync_result_summary,
                            result.syncedCount,
                            result.failedWords.size,
                        ),
                    )
                    if (result.failedWords.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.ankidroid_sync_failed_words_header),
                            style = MaterialTheme.typography.labelMedium,
                        )
                        result.failedWords.forEach { word ->
                            Text(text = word, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.ankidroid_status_ok))
            }
        },
        modifier = modifier,
    )
}
