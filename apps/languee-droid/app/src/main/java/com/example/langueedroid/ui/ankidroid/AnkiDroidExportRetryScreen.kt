package com.example.langueedroid.ui.ankidroid

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.R
import com.example.langueedroid.domain.AnkiExportStatus
import com.example.langueedroid.presentation.AnkiDroidExportItem
import com.example.langueedroid.presentation.AnkiDroidExportRetryUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnkiDroidExportRetryScreen(
    uiState: AnkiDroidExportRetryUiState,
    onRetryExport: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ankidroid_export_retry_title)) },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                uiState.error != null -> {
                    Text(
                        text = uiState.error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(16.dp),
                    )
                }
                uiState.items.isEmpty() -> {
                    Text(
                        text = stringResource(R.string.decks_empty_state),
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(16.dp),
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(uiState.items) { item ->
                            ExportItemCard(
                                item = item,
                                onRetry = { onRetryExport(item.cardId) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ExportItemCard(
    item: AnkiDroidExportItem,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.cardId,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = when (val status = item.status) {
                        is AnkiExportStatus.Pending -> stringResource(R.string.ankidroid_export_status_pending)
                        is AnkiExportStatus.Failed -> stringResource(R.string.ankidroid_export_status_failed)
                        is AnkiExportStatus.Completed -> stringResource(R.string.ankidroid_export_status_completed)
                        is AnkiExportStatus.NoRecord -> ""
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Button(onClick = onRetry) {
                Text(stringResource(R.string.ankidroid_export_retry_button))
            }
        }
    }
}
