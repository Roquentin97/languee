package com.example.langueedroid.feature.cardcreation.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.core.domain.DefinitionState
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.ui.theme.AmberBorder
import com.example.langueedroid.core.ui.theme.AmberContainer
import com.example.langueedroid.core.ui.theme.AmberWarning
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenBorder
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenHighlight
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.cardcreation.presentation.AnkiExportTriggerStatus
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationError
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationState
import com.example.langueedroid.feature.cardcreation.presentation.DeckSelectionState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardCreationScreen(
    state: CardCreationState,
    onDeckSelected: (Deck) -> Unit,
    onDefinitionSelected: (DefinitionResult) -> Unit,
    onExampleConfirmed: (String?) -> Unit,
    onBackFromExampleSelection: () -> Unit,
    onCreateCard: () -> Unit,
    onRetryLookup: () -> Unit,
    onNavigateBack: () -> Unit,
    onManualDefinitionTextChanged: (String) -> Unit = {},
    onManualExampleTextChanged: (String) -> Unit = {},
    onSubmitManualDefinition: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val inExampleSelection = state.flowState is CardCreationFlowState.SelectingExample
    BackHandler(enabled = inExampleSelection) { onBackFromExampleSelection() }

    Scaffold(
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (inExampleSelection) "Choose example" else "New card",
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = if (inExampleSelection) onBackFromExampleSelection else onNavigateBack,
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.btn_cancel),
                            tint = TextPrimary,
                        )
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(11.dp))
                        .background(GreenContainer)
                        .border(1.5.dp, GreenBorder, RoundedCornerShape(11.dp))
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                ) {
                    Text(
                        text = state.targetWord,
                        style = MaterialTheme.typography.headlineSmall,
                        color = GreenPrimary,
                    )
                }
            }

            DeckSelector(
                deckSelectionState = state.deckSelectionState,
                onDeckSelected = onDeckSelected,
            )

            ExpressionKindIndicator(
                kind = state.kind,
                expressionContextFound = state.expressionContextFound,
            )

            when (val flowState = state.flowState) {
                is CardCreationFlowState.SelectingDeck -> {
                    when (state.deckSelectionState) {
                        is DeckSelectionState.Empty -> {
                            Text(
                                text = stringResource(R.string.card_creation_no_decks_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextSecondary,
                            )
                        }
                        else -> {
                            Text(
                                text = stringResource(R.string.card_creation_select_deck_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextSecondary,
                            )
                        }
                    }
                }

                is CardCreationFlowState.LookingUp -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = GreenPrimary)
                    }
                }

                is CardCreationFlowState.DefinitionsLoaded -> {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (flowState.notice != null) {
                            Text(
                                text = stringResource(flowState.notice.toStringRes()),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        DefinitionsList(
                            definitions = flowState.definitions,
                            lemma = flowState.lemma,
                            selectedDefinition = flowState.selectedDefinition,
                            definitionState = flowState.definitionState,
                            onDefinitionSelected = onDefinitionSelected,
                            onCreateCard = onCreateCard,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                is CardCreationFlowState.SelectingExample -> {
                    ExampleSelectionSection(
                        userContext = state.context,
                        dictionaryExample = flowState.selectedDefinition.example,
                        onExampleConfirmed = onExampleConfirmed,
                        modifier = Modifier.weight(1f),
                    )
                }

                is CardCreationFlowState.NoDefinitions -> {
                    Text(
                        text = stringResource(R.string.card_creation_no_definitions, flowState.lemma),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                    )
                }

                is CardCreationFlowState.ManualDefinition -> {
                    ManualDefinitionForm(
                        flowState = flowState,
                        onDefinitionTextChanged = onManualDefinitionTextChanged,
                        onExampleTextChanged = onManualExampleTextChanged,
                        onSubmit = onSubmitManualDefinition,
                        modifier = Modifier.weight(1f),
                    )
                }

                is CardCreationFlowState.LookupError -> {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = stringResource(flowState.type.toStringRes()),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Button(
                            onClick = onRetryLookup,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                        ) {
                            Text(stringResource(R.string.card_creation_retry), color = Color.White)
                        }
                    }
                }

                is CardCreationFlowState.CreatingCard -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = GreenPrimary)
                    }
                }

                is CardCreationFlowState.CardCreated -> {
                    when (flowState.ankiExportStatus) {
                        AnkiExportTriggerStatus.NotTriggered -> {
                            Text(
                                text = stringResource(R.string.card_creation_success),
                                style = MaterialTheme.typography.bodyLarge,
                                color = GreenPrimary,
                            )
                        }
                        AnkiExportTriggerStatus.InProgress -> {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                CircularProgressIndicator(color = GreenPrimary)
                                Text(
                                    text = stringResource(R.string.card_creation_syncing),
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                        }
                        AnkiExportTriggerStatus.Success -> {
                            Text(
                                text = stringResource(R.string.card_creation_sync_success),
                                style = MaterialTheme.typography.bodyLarge,
                                color = GreenPrimary,
                            )
                        }
                        is AnkiExportTriggerStatus.Failed -> {
                            Text(
                                text = stringResource(R.string.card_creation_sync_failed),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }

                is CardCreationFlowState.CreateCardError -> {
                    Text(
                        text = stringResource(flowState.type.toStringRes()),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeckSelector(
    deckSelectionState: DeckSelectionState,
    onDeckSelected: (Deck) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (deckSelectionState) {
        is DeckSelectionState.Loading -> CircularProgressIndicator(modifier = modifier, color = GreenPrimary)

        is DeckSelectionState.Empty -> {
            Text(
                text = stringResource(R.string.card_creation_no_decks_hint),
                style = MaterialTheme.typography.bodyMedium,
                modifier = modifier,
                color = TextSecondary,
            )
        }

        is DeckSelectionState.Error -> {
            Text(
                text = stringResource(deckSelectionState.type.toStringRes()),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = modifier,
            )
        }

        is DeckSelectionState.Loaded -> {
            var expanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = !expanded },
                modifier = modifier.fillMaxWidth(),
            ) {
                OutlinedTextField(
                    value = deckSelectionState.selectedDeck?.name
                        ?: stringResource(R.string.card_creation_select_deck_placeholder),
                    onValueChange = {},
                    readOnly = true,
                    label = {
                        Text(
                            text = stringResource(R.string.card_creation_deck_label).uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    trailingIcon = {
                        Icon(
                            imageVector = Icons.Filled.KeyboardArrowDown,
                            contentDescription = null,
                            tint = TextSecondary,
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    shape = RoundedCornerShape(13.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GreenPrimary,
                        unfocusedBorderColor = GreenPrimary,
                        focusedLabelColor = GreenPrimary,
                        unfocusedLabelColor = GreenPrimary,
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                    ),
                )
                ExposedDropdownMenu(
                    expanded = expanded,
                    onDismissRequest = { expanded = false },
                ) {
                    deckSelectionState.decks.forEach { deck ->
                        DropdownMenuItem(
                            text = { Text(deck.name) },
                            onClick = {
                                onDeckSelected(deck)
                                expanded = false
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DefinitionsList(
    definitions: List<DefinitionResult>,
    lemma: String,
    selectedDefinition: DefinitionResult?,
    definitionState: DefinitionState?,
    onDefinitionSelected: (DefinitionResult) -> Unit,
    onCreateCard: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "DEFINITIONS",
            style = MaterialTheme.typography.labelSmall,
            color = TextSecondary,
        )

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.weight(1f),
        ) {
            items(definitions) { definition ->
                DefinitionCard(
                    definition = definition,
                    isSelected = definition == selectedDefinition,
                    onClick = { onDefinitionSelected(definition) },
                )
            }
        }

        if (selectedDefinition != null) {
            when (definitionState) {
                is DefinitionState.AlreadyInSelectedDeck -> {
                    Text(
                        text = stringResource(R.string.card_creation_already_in_deck),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                is DefinitionState.ExistsInAnotherDeck -> {
                    Text(
                        text = stringResource(R.string.card_creation_exists_in_another_deck),
                        color = MaterialTheme.colorScheme.secondary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Button(
                        onClick = onCreateCard,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                    ) {
                        Text(
                            text = "${stringResource(R.string.card_creation_add_button)} →",
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
                is DefinitionState.Available, null -> {
                    Button(
                        onClick = onCreateCard,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                        enabled = definitionState != null,
                    ) {
                        Text(
                            text = "${stringResource(R.string.card_creation_add_button)} →",
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
        }
    }
}

private enum class ExampleSource { USER_CONTEXT, DICTIONARY }

@Composable
private fun ExampleSelectionSection(
    userContext: String?,
    dictionaryExample: String?,
    onExampleConfirmed: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val initialSource = when {
        userContext != null -> ExampleSource.USER_CONTEXT
        dictionaryExample != null -> ExampleSource.DICTIONARY
        else -> null
    }
    var selectedSource by remember { mutableStateOf(initialSource) }
    val hasOptions = userContext != null || dictionaryExample != null

    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Pick which sentence appears on the back of your flashcard.",
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
        )

        if (userContext == null) {
            Text(
                text = stringResource(R.string.card_creation_example_no_context_warning),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        } else {
            ExampleOption(
                label = stringResource(R.string.card_creation_example_user_context_label).uppercase(),
                text = userContext,
                selected = selectedSource == ExampleSource.USER_CONTEXT,
                italic = false,
                onClick = { selectedSource = ExampleSource.USER_CONTEXT },
            )
        }

        if (dictionaryExample != null) {
            ExampleOption(
                label = stringResource(R.string.card_creation_example_dictionary_label).uppercase(),
                text = dictionaryExample,
                selected = selectedSource == ExampleSource.DICTIONARY,
                italic = true,
                onClick = { selectedSource = ExampleSource.DICTIONARY },
            )
        }

        if (!hasOptions) {
            Text(
                text = stringResource(R.string.card_creation_example_no_example),
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        if (hasOptions) {
            Button(
                onClick = {
                    val example = when (selectedSource) {
                        ExampleSource.USER_CONTEXT -> userContext
                        ExampleSource.DICTIONARY -> dictionaryExample
                        null -> null
                    }
                    onExampleConfirmed(example)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
            ) {
                Text(
                    text = stringResource(R.string.card_creation_example_confirm),
                    color = Color.White,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }

        TextButton(
            onClick = { onExampleConfirmed(null) },
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp),
        ) {
            Text(
                text = stringResource(R.string.card_creation_example_skip),
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
        }
    }
}

@Composable
private fun ExampleOption(
    label: String,
    text: String,
    selected: Boolean,
    italic: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val borderColor = if (selected) GreenPrimary else CardBorder
    val bgColor = if (selected) GreenContainer else Color.White

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(15.dp))
            .background(bgColor)
            .border(1.5.dp, borderColor, RoundedCornerShape(15.dp))
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .border(1.5.dp, borderColor, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(GreenPrimary),
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
                ),
                color = TextPrimary,
            )
        }
    }
}

@Composable
private fun DefinitionCard(
    definition: DefinitionResult,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val borderColor = if (isSelected) GreenPrimary else CardBorder
    val bgColor = if (isSelected) GreenContainer else Color.White

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(bgColor)
            .border(1.5.dp, borderColor, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        if (isSelected) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(GreenPrimary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(11.dp),
                )
            }
        }
        Column(modifier = Modifier.padding(end = if (isSelected) 28.dp else 0.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(5.dp))
                        .background(if (isSelected) GreenHighlight else Color(0xFFF0EDE8))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = definition.partOfSpeech.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isSelected) GreenPrimary else TextSecondary,
                    )
                }
                Text(
                    text = definition.provider,
                    style = MaterialTheme.typography.labelSmall,
                    color = TextSecondary,
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = definition.definition,
                style = MaterialTheme.typography.bodyMedium,
                color = TextPrimary,
            )
            if (definition.example != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = definition.example,
                    style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic),
                    color = TextSecondary,
                )
            }
            if (!definition.inflectionForms.isNullOrEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                definition.inflectionForms.forEach { (key, value) ->
                    Text(
                        text = "$key: $value",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                    )
                }
            }
        }
    }
}

private fun CardCreationError.toStringRes(): Int = when (this) {
    CardCreationError.LOAD_DECKS_FAILED -> R.string.error_load_decks_for_card_failed
    CardCreationError.LOOKUP_FAILED -> R.string.error_lookup_failed
    CardCreationError.CREATE_CARD_FAILED -> R.string.error_create_card_failed
    CardCreationError.STALE_REFERENCE -> R.string.error_stale_reference
    CardCreationError.EXPORT_RECORD_FAILED -> R.string.error_export_record_failed
    CardCreationError.EXPRESSION_TOO_LONG -> R.string.error_expression_too_long
    CardCreationError.MANUAL_DEFINITION_FAILED -> R.string.error_manual_definition_failed
    CardCreationError.DEFINITION_ALREADY_EXISTS -> R.string.error_definition_already_exists
}

/** Shows a kind chip ("phrasal verb" / "expression") and, when relevant, a context-not-found warning. */
@Composable
private fun ExpressionKindIndicator(
    kind: LexicalKind,
    expressionContextFound: Boolean?,
    modifier: Modifier = Modifier,
) {
    val kindLabelRes = when (kind) {
        LexicalKind.PHRASAL_VERB -> R.string.review_kind_phrasal_verb
        LexicalKind.EXPRESSION -> R.string.review_kind_expression
        LexicalKind.WORD -> null
    }
    if (kindLabelRes == null) return

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AssistChip(
            onClick = {},
            enabled = false,
            label = {
                Text(
                    text = stringResource(kindLabelRes),
                    style = MaterialTheme.typography.labelMedium,
                    color = GreenPrimary,
                )
            },
            colors = AssistChipDefaults.assistChipColors(
                disabledContainerColor = GreenContainer,
                disabledLabelColor = GreenPrimary,
            ),
            border = AssistChipDefaults.assistChipBorder(
                enabled = false,
                disabledBorderColor = GreenBorder,
            ),
        )
        if (expressionContextFound == false) {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = AmberContainer),
                border = BorderStroke(1.5.dp, AmberBorder),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(R.string.card_creation_expression_context_not_found),
                    style = MaterialTheme.typography.bodySmall,
                    color = AmberWarning,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }
}

/** Form shown when the dictionary provider has no entry for the looked-up expression. */
@Composable
private fun ManualDefinitionForm(
    flowState: CardCreationFlowState.ManualDefinition,
    onDefinitionTextChanged: (String) -> Unit,
    onExampleTextChanged: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.card_creation_manual_definition_title),
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
            )
            OutlinedTextField(
                value = flowState.definitionText,
                onValueChange = onDefinitionTextChanged,
                label = { Text(stringResource(R.string.label_definition)) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !flowState.isSubmitting,
                shape = RoundedCornerShape(11.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = GreenPrimary,
                    unfocusedBorderColor = GreenBorder,
                    focusedLabelColor = GreenPrimary,
                    unfocusedLabelColor = TextSecondary,
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                ),
            )
            OutlinedTextField(
                value = flowState.exampleText,
                onValueChange = onExampleTextChanged,
                label = { Text(stringResource(R.string.label_example_optional)) },
                modifier = Modifier.fillMaxWidth(),
                enabled = !flowState.isSubmitting,
                shape = RoundedCornerShape(11.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = GreenPrimary,
                    unfocusedBorderColor = GreenBorder,
                    focusedLabelColor = GreenPrimary,
                    unfocusedLabelColor = TextSecondary,
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                ),
            )
            if (flowState.error != null) {
                Text(
                    text = stringResource(flowState.error.toStringRes()),
                    color = AmberWarning,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (flowState.isSubmitting) {
                Box(modifier = Modifier.fillMaxWidth()) {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = GreenPrimary,
                    )
                }
            } else {
                Button(
                    onClick = onSubmit,
                    enabled = flowState.definitionText.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                ) {
                    Text(
                        text = stringResource(R.string.btn_submit_definition),
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                    )
                }
            }
        }
    }
}
