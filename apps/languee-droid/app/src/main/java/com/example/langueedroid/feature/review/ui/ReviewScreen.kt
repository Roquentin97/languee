package com.example.langueedroid.feature.review.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.feature.review.presentation.QuestionFeedback
import com.example.langueedroid.feature.review.presentation.ReviewError
import com.example.langueedroid.feature.review.presentation.ReviewSessionState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    state: ReviewSessionState,
    onInputChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onReveal: () -> Unit,
    onGrade: (ReviewRating) -> Unit,
    onContinue: () -> Unit,
    onRetry: () -> Unit,
    onDone: () -> Unit,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.review_screen_title)) },
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
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (state) {
                is ReviewSessionState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }

                is ReviewSessionState.Empty -> {
                    Text(
                        text = stringResource(R.string.review_empty_state),
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(16.dp),
                    )
                }

                is ReviewSessionState.Error -> {
                    ErrorContent(
                        type = state.type,
                        onRetry = onRetry,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }

                is ReviewSessionState.Question -> {
                    QuestionContent(
                        state = state,
                        onInputChange = onInputChange,
                        onSubmit = onSubmit,
                        onReveal = onReveal,
                    )
                }

                is ReviewSessionState.Correct -> {
                    CorrectContent(
                        matchedForm = state.matchedForm,
                        onGrade = onGrade,
                    )
                }

                is ReviewSessionState.Revealed -> {
                    RevealedContent(
                        nextDueAt = state.nextDueAt,
                        intervalDays = state.intervalDays,
                        onContinue = onContinue,
                    )
                }

                is ReviewSessionState.Finished -> {
                    FinishedContent(
                        reviewedCount = state.reviewedCount,
                        onDone = onDone,
                    )
                }
            }
        }
    }
}

@Composable
private fun ErrorContent(
    type: ReviewError,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val message = stringResource(
        when (type) {
            ReviewError.LOAD_FAILED -> R.string.error_review_load_failed
            ReviewError.SUBMIT_FAILED -> R.string.error_review_submit_failed
            ReviewError.GRADE_FAILED -> R.string.error_review_grade_failed
        },
    )
    Column(
        modifier = modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Button(onClick = onRetry) {
            Text(stringResource(R.string.review_retry_button))
        }
    }
}

@Composable
private fun QuestionContent(
    state: ReviewSessionState.Question,
    onInputChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onReveal: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = state.item.deckName,
                style = MaterialTheme.typography.labelLarge,
            )
            Text(
                text = stringResource(R.string.review_progress, state.index, state.total),
                style = MaterialTheme.typography.labelLarge,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.item.isNew) {
                AssistChip(onClick = {}, enabled = false, label = { Text(stringResource(R.string.review_new_badge)) })
            }
            val kindLabelRes = when (state.item.prompt.kind) {
                LexicalKind.PHRASAL_VERB -> R.string.review_kind_phrasal_verb
                LexicalKind.EXPRESSION -> R.string.review_kind_expression
                LexicalKind.WORD -> null
            }
            if (kindLabelRes != null) {
                AssistChip(onClick = {}, enabled = false, label = { Text(stringResource(kindLabelRes)) })
            }
        }

        Text(
            text = state.item.prompt.definition,
            style = MaterialTheme.typography.headlineSmall,
        )

        val maskedText = state.item.prompt.contextMasked ?: state.item.prompt.example
        if (maskedText != null) {
            Text(
                text = maskedText,
                style = MaterialTheme.typography.bodyLarge,
            )
        }

        when (val feedback = state.feedback) {
            is QuestionFeedback.CloseHint -> {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = stringResource(R.string.review_close_synonym_title),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                        )
                        if (feedback.hint != null) {
                            Text(
                                text = feedback.hint,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                        }
                    }
                }
            }
            is QuestionFeedback.Incorrect -> {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = stringResource(R.string.review_incorrect_feedback),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
            is QuestionFeedback.None -> Unit
        }

        OutlinedTextField(
            value = state.typedAnswer,
            onValueChange = onInputChange,
            label = { Text(stringResource(R.string.review_answer_label)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        )

        Button(
            onClick = onSubmit,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.review_submit_button))
        }

        TextButton(onClick = onReveal) {
            Text(stringResource(R.string.review_reveal_button))
        }
    }
}

@Composable
private fun CorrectContent(
    matchedForm: String?,
    onGrade: (ReviewRating) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.review_correct_title),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        if (matchedForm != null) {
            Text(
                text = stringResource(R.string.review_accepted_answer, matchedForm),
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(onClick = { onGrade(ReviewRating.AGAIN) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.review_rating_again))
            }
            OutlinedButton(onClick = { onGrade(ReviewRating.HARD) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.review_rating_hard))
            }
            OutlinedButton(onClick = { onGrade(ReviewRating.GOOD) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.review_rating_good))
            }
            OutlinedButton(onClick = { onGrade(ReviewRating.EASY) }, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.review_rating_easy))
            }
        }
    }
}

@Composable
private fun RevealedContent(
    nextDueAt: String,
    intervalDays: Int,
    onContinue: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.review_revealed_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = stringResource(R.string.review_revealed_message),
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = stringResource(R.string.review_next_due_info, intervalDays, nextDueAt),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onContinue, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.review_continue_button))
        }
    }
}

@Composable
private fun FinishedContent(
    reviewedCount: Int,
    onDone: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.review_finished_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = stringResource(R.string.review_finished_summary, reviewedCount),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(onClick = onDone) {
            Text(stringResource(R.string.review_done_button))
        }
    }
}
