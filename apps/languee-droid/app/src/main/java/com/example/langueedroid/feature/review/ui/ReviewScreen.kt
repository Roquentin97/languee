package com.example.langueedroid.feature.review.ui

import android.text.format.DateUtils
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.core.domain.RevealedWord
import com.example.langueedroid.core.ui.components.SpeakerIconButton
import com.example.langueedroid.core.ui.theme.AmberBorder
import com.example.langueedroid.core.ui.theme.AmberContainer
import com.example.langueedroid.core.ui.theme.AmberWarning
import com.example.langueedroid.core.ui.theme.GreenBorder
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextMedium
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.core.util.parseIsoInstantToEpochMillis
import com.example.langueedroid.feature.review.presentation.QuestionFeedback
import com.example.langueedroid.feature.review.presentation.ReviewError
import com.example.langueedroid.feature.review.presentation.ReviewSessionState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    state: ReviewSessionState,
    speaker: Speaker,
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
        containerColor = SurfaceWarm,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.review_screen_title),
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
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    scrolledContainerColor = Color.White,
                ),
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
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = GreenPrimary,
                    )
                }

                is ReviewSessionState.Empty -> {
                    Text(
                        text = stringResource(R.string.review_empty_state),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
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
                        revealed = state.revealed,
                        language = state.item.prompt.language,
                        speaker = speaker,
                        onGrade = onGrade,
                    )
                }

                is ReviewSessionState.Revealed -> {
                    RevealedContent(
                        nextDueAt = state.nextDueAt,
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
private fun ReviewChip(
    text: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(GreenContainer)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = GreenPrimary,
        )
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
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = AmberWarning,
        )
        Button(
            onClick = onRetry,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
        ) {
            Text(
                text = stringResource(R.string.review_retry_button),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
            )
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
            .verticalScroll(rememberScrollState())
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = state.item.deckName,
                style = MaterialTheme.typography.labelLarge,
                color = TextSecondary,
            )
            Text(
                text = stringResource(R.string.review_progress, state.index, state.total),
                style = MaterialTheme.typography.labelLarge,
                color = TextSecondary,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state.item.isNew) {
                ReviewChip(text = stringResource(R.string.review_new_badge))
            }
            val kindLabelRes = when (state.item.prompt.kind) {
                LexicalKind.PHRASAL_VERB -> R.string.review_kind_phrasal_verb
                LexicalKind.EXPRESSION -> R.string.review_kind_expression
                LexicalKind.WORD -> null
            }
            if (kindLabelRes != null) {
                ReviewChip(text = stringResource(kindLabelRes))
            }
        }

        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                // Do NOT add a speaker to the review Question state — pronouncing the
                // masked target would leak the answer.
                Text(
                    text = state.item.prompt.definition,
                    style = MaterialTheme.typography.headlineSmall,
                    color = TextPrimary,
                )
                val maskedText = state.item.prompt.maskedSentence
                if (maskedText != null) {
                    Spacer(modifier = Modifier.height(14.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(GreenContainer)
                            .padding(12.dp),
                    ) {
                        Text(
                            text = maskedText,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextMedium,
                        )
                    }
                }
            }
        }

        when (state.feedback) {
            is QuestionFeedback.Incorrect -> {
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = stringResource(R.string.review_incorrect_feedback),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(14.dp),
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

        Button(
            onClick = onSubmit,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
        ) {
            Text(
                text = stringResource(R.string.review_submit_button),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
            )
        }

        TextButton(onClick = onReveal) {
            Text(
                text = stringResource(R.string.review_reveal_button),
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
        }
    }
}

@Composable
private fun CorrectContent(
    matchedForm: String?,
    revealed: RevealedWord?,
    language: String,
    speaker: Speaker,
    onGrade: (ReviewRating) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = stringResource(R.string.review_correct_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = GreenPrimary,
                )
                if (matchedForm != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = stringResource(R.string.review_accepted_answer, matchedForm),
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextPrimary,
                        )
                        SpeakerIconButton(
                            text = matchedForm,
                            languageCode = language,
                            speaker = speaker,
                        )
                    }
                }
                if (revealed != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = revealed.lemma,
                            style = MaterialTheme.typography.titleMedium,
                            color = TextPrimary,
                        )
                        if (revealed.ipa != null) {
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = revealed.ipa,
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextSecondary,
                            )
                        }
                    }
                    // Same display rule as card creation: the "type" discriminator and
                    // expression context forms are bookkeeping, not learnable forms.
                    val displayForms = revealed.inflectionForms
                        ?.takeUnless { it["type"] == "expression" }
                        ?.filterKeys { it != "type" }
                    if (!displayForms.isNullOrEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(R.string.review_word_forms_title),
                            style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary,
                        )
                        displayForms.forEach { (key, value) ->
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
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GradeButton(
                labelRes = R.string.review_rating_again,
                onClick = { onGrade(ReviewRating.AGAIN) },
                modifier = Modifier.weight(1f),
            )
            GradeButton(
                labelRes = R.string.review_rating_hard,
                onClick = { onGrade(ReviewRating.HARD) },
                modifier = Modifier.weight(1f),
            )
            GradeButton(
                labelRes = R.string.review_rating_good,
                onClick = { onGrade(ReviewRating.GOOD) },
                modifier = Modifier.weight(1f),
                filled = true,
            )
            GradeButton(
                labelRes = R.string.review_rating_easy,
                onClick = { onGrade(ReviewRating.EASY) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun GradeButton(
    labelRes: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    filled: Boolean = false,
) {
    if (filled) {
        Button(
            onClick = onClick,
            modifier = modifier,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
            contentPadding = ButtonDefaults.TextButtonContentPadding,
        ) {
            Text(
                text = stringResource(labelRes),
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
            )
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.5.dp, GreenBorder),
            contentPadding = ButtonDefaults.TextButtonContentPadding,
        ) {
            Text(
                text = stringResource(labelRes),
                style = MaterialTheme.typography.labelMedium,
                color = GreenPrimary,
            )
        }
    }
}

@Composable
private fun RevealedContent(
    nextDueAt: String,
    onContinue: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = stringResource(R.string.review_revealed_title),
                    style = MaterialTheme.typography.headlineSmall,
                    color = TextPrimary,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.review_revealed_message),
                    style = MaterialTheme.typography.bodyLarge,
                    color = TextMedium,
                )
                val nextReview = remember(nextDueAt) {
                    parseIsoInstantToEpochMillis(nextDueAt)?.let { millis ->
                        val now = System.currentTimeMillis()
                        // Under a minute out reads as "in 0 minutes"; the "comes back soon"
                        // message already covers that, so only show a concrete relative time.
                        if (millis - now < DateUtils.MINUTE_IN_MILLIS) {
                            null
                        } else {
                            DateUtils.getRelativeTimeSpanString(
                                millis,
                                now,
                                DateUtils.MINUTE_IN_MILLIS,
                            ).toString().replaceFirstChar { it.lowercase() }
                        }
                    }
                }
                if (nextReview != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.review_next_due_info, nextReview),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                    )
                }
            }
        }
        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
        ) {
            Text(
                text = stringResource(R.string.review_continue_button),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
            )
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
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.review_finished_title),
            style = MaterialTheme.typography.headlineMedium,
            color = TextPrimary,
        )
        Text(
            text = stringResource(R.string.review_finished_summary, reviewedCount),
            style = MaterialTheme.typography.bodyLarge,
            color = TextMedium,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Button(
            onClick = onDone,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
        ) {
            Text(
                text = stringResource(R.string.review_done_button),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
            )
        }
    }
}
