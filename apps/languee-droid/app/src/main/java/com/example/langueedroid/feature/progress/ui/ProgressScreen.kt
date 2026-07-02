package com.example.langueedroid.feature.progress.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.languee.droid.R
import com.example.langueedroid.core.domain.ChatProgress
import com.example.langueedroid.core.domain.ProgressByType
import com.example.langueedroid.core.domain.ProgressWeek
import com.example.langueedroid.core.domain.SuggestionType
import com.example.langueedroid.core.ui.theme.AmberContainer
import com.example.langueedroid.core.ui.theme.AmberWarning
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.GreenBorder
import com.example.langueedroid.core.ui.theme.GreenContainer
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.SurfaceWarm
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.progress.presentation.ProgressState
import kotlin.math.roundToInt

private const val MAX_BAR_HEIGHT_DP = 80
private const val MIN_VISIBLE_BAR_HEIGHT_DP = 4
private const val COMPUTED_AT_DISPLAY_LENGTH = 16
private const val WEEK_LABEL_LENGTH = 5
private const val PERCENT_MULTIPLIER = 100

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgressScreen(
    state: ProgressState,
    onRetry: () -> Unit,
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
                        text = stringResource(R.string.progress_screen_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.navigate_back_description),
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
                is ProgressState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = GreenPrimary,
                    )
                }

                is ProgressState.Empty -> {
                    EmptyContent(
                        onNavigateBack = onNavigateBack,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }

                is ProgressState.Error -> {
                    ErrorContent(
                        onRetry = onRetry,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }

                is ProgressState.Loaded -> {
                    LoadedContent(progress = state.progress)
                }
            }
        }
    }
}

@Composable
private fun EmptyContent(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = stringResource(R.string.progress_empty_state),
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
        )
        Button(
            onClick = onNavigateBack,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
        ) {
            Text(
                text = stringResource(R.string.progress_empty_button),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun ErrorContent(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = stringResource(R.string.error_progress_load_failed),
            style = MaterialTheme.typography.bodyMedium,
            color = AmberWarning,
        )
        Button(
            onClick = onRetry,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
        ) {
            Text(
                text = stringResource(R.string.progress_retry_button),
                style = MaterialTheme.typography.labelLarge,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun LoadedContent(
    progress: ChatProgress,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        HeadlineCard(progress = progress)
        if (progress.byType.isNotEmpty()) {
            ByTypeCard(byType = progress.byType)
        }
        if (progress.weeks.isNotEmpty()) {
            WeeklyCard(weeks = progress.weeks)
        }
        ComputedAtFooter(computedAt = progress.computedAt)
    }
}

@Composable
private fun HeadlineCard(
    progress: ChatProgress,
    modifier: Modifier = Modifier,
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text = progress.totals.suggestionsResolved.toString(),
                style = MaterialTheme.typography.displayLarge,
                color = TextPrimary,
            )
            Text(
                text = stringResource(R.string.progress_resolved_caption),
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
            Spacer(modifier = Modifier.height(16.dp))
            val resolutionRateText = progress.totals.resolutionRate?.let { rate ->
                stringResource(R.string.progress_resolution_rate_value, (rate * PERCENT_MULTIPLIER).roundToInt())
            } ?: stringResource(R.string.progress_resolution_rate_unknown)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StatPill(
                    value = progress.totals.suggestionsRaised.toString(),
                    label = stringResource(R.string.progress_stat_raised_label),
                    modifier = Modifier.weight(1f),
                )
                StatPill(
                    value = resolutionRateText,
                    label = stringResource(R.string.progress_stat_resolution_rate_label),
                    modifier = Modifier.weight(1f),
                )
                StatPill(
                    value = progress.totals.userMessages.toString(),
                    label = stringResource(R.string.progress_stat_messages_label),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun StatPill(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(GreenContainer)
            .padding(vertical = 10.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            color = GreenPrimary,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = TextSecondary,
        )
    }
}

@Composable
private fun ByTypeCard(
    byType: List<ProgressByType>,
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
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = stringResource(R.string.progress_by_type_title),
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
            )
            byType.forEach { item ->
                ByTypeRow(item = item)
            }
        }
    }
}

@Composable
private fun ByTypeRow(
    item: ProgressByType,
    modifier: Modifier = Modifier,
) {
    val labelRes = when (item.type) {
        SuggestionType.OVERUSED_WORD -> R.string.progress_type_overused_word
        SuggestionType.GRAMMAR -> R.string.progress_type_grammar
        SuggestionType.STYLE -> R.string.progress_type_style
    }
    val typeLabel = stringResource(labelRes)
    val fraction = if (item.raised > 0) {
        (item.resolved.toFloat() / item.raised.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val barDescription = stringResource(R.string.progress_type_bar_description, typeLabel, item.resolved, item.raised)

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TypeChip(type = item.type, label = typeLabel)
            Text(
                text = stringResource(R.string.progress_type_ratio, item.resolved, item.raised),
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(GreenContainer)
                .semantics { contentDescription = barDescription },
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(3.dp))
                    .background(GreenPrimary),
            )
        }
    }
}

@Composable
private fun TypeChip(
    type: SuggestionType,
    label: String,
    modifier: Modifier = Modifier,
) {
    val (background, textColor, border) = when (type) {
        SuggestionType.OVERUSED_WORD -> Triple(GreenContainer, GreenPrimary, null)
        SuggestionType.GRAMMAR -> Triple(AmberContainer, AmberWarning, null)
        SuggestionType.STYLE -> Triple(Color.White, TextPrimary, CardBorder)
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(background)
            .then(if (border != null) Modifier.border(1.dp, border, RoundedCornerShape(8.dp)) else Modifier)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = textColor,
        )
    }
}

@Composable
private fun WeeklyCard(
    weeks: List<ProgressWeek>,
    modifier: Modifier = Modifier,
) {
    val maxRaised = weeks.maxOf { it.raised }
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                text = stringResource(R.string.progress_weekly_title),
                style = MaterialTheme.typography.titleSmall,
                color = TextPrimary,
            )
            Spacer(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                weeks.forEach { week ->
                    WeekColumn(week = week, maxRaised = maxRaised)
                }
            }
        }
    }
}

@Composable
private fun WeekColumn(
    week: ProgressWeek,
    maxRaised: Int,
    modifier: Modifier = Modifier,
) {
    val raisedHeight = barHeight(week.raised, maxRaised)
    val resolvedHeight = barHeight(week.resolved, maxRaised)
    val description = stringResource(
        R.string.progress_week_bar_description,
        week.weekStart,
        week.raised,
        week.resolved,
    )
    Column(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = description },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            modifier = Modifier.height(MAX_BAR_HEIGHT_DP.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(8.dp)
                    .height(raisedHeight)
                    .clip(RoundedCornerShape(2.dp))
                    .background(GreenBorder),
            )
            Box(
                modifier = Modifier
                    .width(8.dp)
                    .height(resolvedHeight)
                    .clip(RoundedCornerShape(2.dp))
                    .background(GreenPrimary),
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = week.weekStart.takeLast(WEEK_LABEL_LENGTH),
            style = MaterialTheme.typography.labelSmall,
            color = TextSecondary,
        )
    }
}

private fun barHeight(value: Int, maxValue: Int): Dp {
    if (maxValue <= 0 || value <= 0) return 0.dp
    val scaled = (value.toFloat() / maxValue.toFloat()) * MAX_BAR_HEIGHT_DP
    return maxOf(scaled, MIN_VISIBLE_BAR_HEIGHT_DP.toFloat()).dp
}

@Composable
private fun ComputedAtFooter(
    computedAt: String?,
    modifier: Modifier = Modifier,
) {
    val text = computedAt?.let {
        stringResource(R.string.progress_updated_footer, it.take(COMPUTED_AT_DISPLAY_LENGTH))
    } ?: stringResource(R.string.progress_not_computed_footer)
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = TextSecondary,
        modifier = modifier,
    )
}
