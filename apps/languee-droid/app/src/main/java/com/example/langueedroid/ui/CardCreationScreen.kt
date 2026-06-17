package com.example.langueedroid.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.R
import com.example.langueedroid.domain.Deck
import com.example.langueedroid.domain.DefinitionResult
import com.example.langueedroid.domain.DefinitionState
import com.example.langueedroid.presentation.CardCreationFlowState
import com.example.langueedroid.presentation.CardCreationState
import com.example.langueedroid.presentation.DeckSelectionState

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
    modifier: Modifier = Modifier,
) {
    val inExampleSelection = state.flowState is CardCreationFlowState.SelectingExample
    BackHandler(enabled = inExampleSelection) { onBackFromExampleSelection() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(stringResource(R.string.card_creation_title, state.targetWord))
                },
                navigationIcon = {
                    IconButton(
                        onClick = if (inExampleSelection) onBackFromExampleSelection else onNavigateBack,
                    ) {
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DeckSelector(
                deckSelectionState = state.deckSelectionState,
                onDeckSelected = onDeckSelected,
            )

            when (val flowState = state.flowState) {
                is CardCreationFlowState.SelectingDeck -> {
                    when (state.deckSelectionState) {
                        is DeckSelectionState.Empty -> {
                            Text(
                                text = stringResource(R.string.card_creation_no_decks_hint),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                        else -> {
                            Text(
                                text = stringResource(R.string.card_creation_select_deck_hint),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }

                is CardCreationFlowState.LookingUp -> {
                    Box(modifier = Modifier.fillMaxWidth()) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    }
                }

                is CardCreationFlowState.DefinitionsLoaded -> {
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
                    )
                }

                is CardCreationFlowState.LookupError -> {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = flowState.message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Button(onClick = onRetryLookup) {
                            Text(stringResource(R.string.card_creation_retry))
                        }
                    }
                }

                is CardCreationFlowState.CreatingCard -> {
                    Box(modifier = Modifier.fillMaxWidth()) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    }
                }

                is CardCreationFlowState.CardCreated -> {
                    Text(
                        text = stringResource(R.string.card_creation_success),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }

                is CardCreationFlowState.CreateCardError -> {
                    Text(
                        text = flowState.message,
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
        is DeckSelectionState.Loading -> {
            CircularProgressIndicator(modifier = modifier)
        }

        is DeckSelectionState.Empty -> {
            Text(
                text = stringResource(R.string.card_creation_no_decks_hint),
                style = MaterialTheme.typography.bodyMedium,
                modifier = modifier,
            )
        }

        is DeckSelectionState.Error -> {
            Text(
                text = deckSelectionState.message,
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
                    label = { Text(stringResource(R.string.card_creation_deck_label)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
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
            text = stringResource(R.string.card_creation_definitions_header, lemma),
            style = MaterialTheme.typography.titleSmall,
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
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(R.string.card_creation_add_button))
                    }
                }
                is DefinitionState.Available, null -> {
                    Button(
                        onClick = onCreateCard,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = definitionState != null,
                    ) {
                        Text(stringResource(R.string.card_creation_add_button))
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
            text = stringResource(R.string.card_creation_example_selection_title),
            style = MaterialTheme.typography.titleSmall,
        )

        if (userContext == null) {
            Text(
                text = stringResource(R.string.card_creation_example_no_context_warning),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        } else {
            ExampleOption(
                label = stringResource(R.string.card_creation_example_user_context_label),
                text = userContext,
                selected = selectedSource == ExampleSource.USER_CONTEXT,
                onClick = { selectedSource = ExampleSource.USER_CONTEXT },
            )
        }

        if (dictionaryExample != null) {
            ExampleOption(
                label = stringResource(R.string.card_creation_example_dictionary_label),
                text = dictionaryExample,
                selected = selectedSource == ExampleSource.DICTIONARY,
                onClick = { selectedSource = ExampleSource.DICTIONARY },
            )
        }

        if (!hasOptions) {
            Text(
                text = stringResource(R.string.card_creation_example_no_example),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.card_creation_example_confirm))
            }
        }

        TextButton(
            onClick = { onExampleConfirmed(null) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.card_creation_example_skip))
        }
    }
}

@Composable
private fun ExampleOption(
    label: String,
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.Top,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Column(modifier = Modifier.padding(start = 4.dp, top = 12.dp)) {
            Text(text = label, style = MaterialTheme.typography.labelMedium)
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = if (isSelected) {
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer,
            )
        } else {
            CardDefaults.cardColors()
        },
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = definition.partOfSpeech,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = definition.provider,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = definition.definition,
                style = MaterialTheme.typography.bodyMedium,
            )
            if (definition.example != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = definition.example,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
