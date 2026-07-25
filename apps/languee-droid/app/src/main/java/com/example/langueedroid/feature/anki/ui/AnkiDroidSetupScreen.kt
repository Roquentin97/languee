package com.example.langueedroid.feature.anki.ui

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.languee.droid.R
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.core.domain.AnkiDroidSetupIssue
import com.example.langueedroid.core.domain.ExportPreference
import com.example.langueedroid.core.ui.theme.AmberBorder
import com.example.langueedroid.core.ui.theme.AmberContainer
import com.example.langueedroid.core.ui.theme.AmberWarning
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.anki.presentation.AnkiDroidSetupUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnkiDroidSetupScreen(
    uiState: AnkiDroidSetupUiState,
    onRequestPermission: () -> Unit,
    onNoteTypeSelected: (String) -> Unit,
    onExportPreferenceSelected: (ExportPreference) -> Unit,
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
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.ankidroid_setup_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                    )
                },
                navigationIcon = {
                    if (showBackButton) {
                        IconButton(onClick = onNavigateBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.btn_cancel),
                                tint = TextPrimary,
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    scrolledContainerColor = Color.White,
                ),
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            for (issue in uiState.checkResult.issues) {
                IssueCard(
                    issue = issue,
                    selectedNoteType = uiState.noteTypeName,
                    onRequestPermission = onRequestPermission,
                    onNoteTypeSelected = onNoteTypeSelected,
                )
            }

            if (uiState.checkResult.isReady || uiState.checkResult.issues.isEmpty()) {
                SetupCompleteSection(
                    isSaving = uiState.isSaving,
                    onSave = onSave,
                    onSkip = onSkip,
                )
            } else {
                TextButton(
                    onClick = onSkip,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                ) {
                    Text(
                        text = stringResource(R.string.ankidroid_setup_skip),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                    )
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
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = AmberContainer),
        border = androidx.compose.foundation.BorderStroke(1.dp, AmberBorder),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(AmberWarning.copy(alpha = 0.15f))
                        .border(1.dp, AmberWarning.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Settings,
                        contentDescription = null,
                        tint = AmberWarning,
                        modifier = Modifier.size(20.dp),
                    )
                }
                when (issue) {
                    is AnkiDroidSetupIssue.NotInstalled -> {
                        Column {
                            Text(
                                text = "AnkiDroid not installed",
                                style = MaterialTheme.typography.titleSmall,
                                color = TextPrimary,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.ankidroid_setup_not_installed),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                        }
                    }
                    is AnkiDroidSetupIssue.ApiUnavailable -> {
                        Column {
                            Text(
                                text = "API unavailable",
                                style = MaterialTheme.typography.titleSmall,
                                color = TextPrimary,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.ankidroid_setup_api_unavailable),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                        }
                    }
                    is AnkiDroidSetupIssue.PermissionDenied -> {
                        Column {
                            Text(
                                text = "Permission required",
                                style = MaterialTheme.typography.titleSmall,
                                color = TextPrimary,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.ankidroid_setup_permission_denied),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = onRequestPermission,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = AmberWarning),
                            ) {
                                Text(
                                    text = stringResource(R.string.ankidroid_setup_grant_permission),
                                    color = Color.White,
                                )
                            }
                        }
                    }
                    is AnkiDroidSetupIssue.NoNoteTypeSelected -> {
                        Column {
                            Text(
                                text = "Choose card format",
                                style = MaterialTheme.typography.titleSmall,
                                color = TextPrimary,
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.ankidroid_setup_no_note_type),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            NoteTypeRadioGroup(
                                selectedNoteType = selectedNoteType,
                                onNoteTypeSelected = onNoteTypeSelected,
                            )
                        }
                    }
                    is AnkiDroidSetupIssue.NoExportPreference -> Unit
                }
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
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        listOf(
            NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY to stringResource(R.string.ankidroid_note_type_type_in),
            NoteTypeTemplates.LANGUEE_BASIC_REVERSED to stringResource(R.string.ankidroid_note_type_basic_reversed),
        ).forEach { (typeName, label) ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (selectedNoteType == typeName) GreenPrimary.copy(alpha = 0.07f)
                        else Color.Transparent,
                    )
                    .padding(end = 12.dp),
            ) {
                RadioButton(
                    selected = selectedNoteType == typeName,
                    onClick = { onNoteTypeSelected(typeName) },
                    colors = RadioButtonDefaults.colors(selectedColor = GreenPrimary),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextPrimary,
                )
            }
        }
    }
}

@Composable
private fun SetupCompleteSection(
    isSaving: Boolean,
    onSave: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = androidx.compose.foundation.BorderStroke(1.dp, CardBorder),
        elevation = CardDefaults.cardElevation(0.dp),
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = "Ready to export cards",
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
            )
            if (isSaving) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = GreenPrimary, modifier = Modifier.size(24.dp))
                }
            } else {
                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                ) {
                    Text(
                        text = stringResource(R.string.ankidroid_setup_save),
                        color = Color.White,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
                TextButton(
                    onClick = onSkip,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                ) {
                    Text(
                        text = stringResource(R.string.ankidroid_setup_skip),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                    )
                }
            }
        }
    }
}
