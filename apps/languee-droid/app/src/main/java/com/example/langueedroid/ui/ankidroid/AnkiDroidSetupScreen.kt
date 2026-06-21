package com.example.langueedroid.ui.ankidroid

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.langueedroid.R
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.domain.AnkiDroidSetupIssue
import com.example.langueedroid.presentation.AnkiDroidSetupUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnkiDroidSetupScreen(
    uiState: AnkiDroidSetupUiState,
    onRequestPermission: () -> Unit,
    onNoteTypeSelected: (String) -> Unit,
    onExportPreferenceSelected: (com.example.langueedroid.domain.ExportPreference) -> Unit,
    onSave: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
    showBackButton: Boolean = false,
    onNavigateBack: () -> Unit = {},
    onResumeCheck: () -> Unit = {},
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) onResumeCheck()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ankidroid_setup_title)) },
                navigationIcon = {
                    if (showBackButton) {
                        IconButton(onClick = onNavigateBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.btn_cancel),
                            )
                        }
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (issue in uiState.checkResult.issues) {
                item {
                    IssueCard(
                        issue = issue,
                        selectedNoteType = uiState.noteTypeName,
                        onRequestPermission = onRequestPermission,
                        onNoteTypeSelected = onNoteTypeSelected,
                    )
                }
            }

            if (uiState.checkResult.isReady || uiState.checkResult.issues.isEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    ActionButtons(
                        isSaving = uiState.isSaving,
                        onSave = onSave,
                        onSkip = onSkip,
                    )
                }
            } else {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(
                        onClick = onSkip,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.ankidroid_setup_skip))
                    }
                }
            }
        }
    }
}

@Composable
private fun IssueCard(
    issue: AnkiDroidSetupIssue,
    selectedNoteType: String,
    onRequestPermission: () -> Unit,
    onNoteTypeSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            when (issue) {
                is AnkiDroidSetupIssue.NotInstalled -> {
                    Text(stringResource(R.string.ankidroid_setup_not_installed))
                }
                is AnkiDroidSetupIssue.ApiUnavailable -> {
                    Text(stringResource(R.string.ankidroid_setup_api_unavailable))
                }
                is AnkiDroidSetupIssue.PermissionDenied -> {
                    Text(
                        stringResource(R.string.ankidroid_setup_permission_denied),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = onRequestPermission) {
                        Text(stringResource(R.string.ankidroid_setup_grant_permission))
                    }
                }
                is AnkiDroidSetupIssue.NoNoteTypeSelected -> {
                    Text(
                        stringResource(R.string.ankidroid_setup_no_note_type),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    NoteTypeRadioGroup(
                        selectedNoteType = selectedNoteType,
                        onNoteTypeSelected = onNoteTypeSelected,
                    )
                }
                is AnkiDroidSetupIssue.NoExportPreference -> Unit
            }
        }
    }
}

@Composable
private fun NoteTypeRadioGroup(
    selectedNoteType: String,
    onNoteTypeSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        listOf(
            NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY to stringResource(R.string.ankidroid_note_type_type_in),
            NoteTypeTemplates.LANGUEE_BASIC_REVERSED to stringResource(R.string.ankidroid_note_type_basic_reversed),
        ).forEach { (typeName, label) ->
            androidx.compose.foundation.layout.Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                RadioButton(
                    selected = selectedNoteType == typeName,
                    onClick = { onNoteTypeSelected(typeName) },
                )
                Text(text = label)
            }
        }
    }
}

@Composable
private fun ActionButtons(
    isSaving: Boolean,
    onSave: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (isSaving) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        } else {
            Button(onClick = onSave, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.ankidroid_setup_save))
            }
            Spacer(modifier = Modifier.height(4.dp))
            TextButton(onClick = onSkip, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.ankidroid_setup_skip))
            }
        }
    }
}
