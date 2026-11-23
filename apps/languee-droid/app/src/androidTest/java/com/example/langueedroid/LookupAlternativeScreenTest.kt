package com.example.langueedroid

import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.domain.LookupAlternative
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.feature.cardcreation.presentation.AlternativeLookupStatus
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationError
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationState
import com.example.langueedroid.feature.cardcreation.ui.CardCreationScreen
import com.languee.droid.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LookupAlternativeScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun dictionaryMissKeepsAlternativeActionAndOriginalResultDuringLoading() {
        val noDefinitionsText =
            ApplicationProvider
                .getApplicationContext<Context>()
                .getString(R.string.card_creation_no_definitions, "give")
        val alternative =
            LookupAlternative(
                type = "expression",
                text = "gave up",
                lemma = "give up",
                entryId = "known-entry",
                selectionRanges = listOf(SelectionRange(5, 9), SelectionRange(13, 15)),
                reason = "context_match",
                prominence = "normal",
            )
        val state =
            mutableStateOf(
                CardCreationState(
                    targetWord = "give",
                    context = "They gave it up.",
                    flowState = CardCreationFlowState.NoDefinitions("give"),
                    alternatives = listOf(alternative),
                ),
            )
        var requested: LookupAlternative? = null
        var returned = false
        var retryTapped = false
        val speaker =
            object : Speaker {
                override fun speak(
                    text: String,
                    languageCode: String,
                ) = Unit

                override fun shutdown() = Unit
            }

        composeRule.setContent {
            MaterialTheme {
                CardCreationScreen(
                    state = state.value,
                    speaker = speaker,
                    onDeckSelected = {},
                    onDefinitionSelected = {},
                    onExampleConfirmed = {},
                    onBackFromExampleSelection = {},
                    onCreateCard = {},
                    onRetryLookup = { retryTapped = true },
                    onNavigateBack = {},
                    onLookupAlternative = { requested = it },
                    onReturnToOriginalLookup = { returned = true },
                )
            }
        }

        composeRule.onNodeWithText(noDefinitionsText).assertIsDisplayed()
        composeRule.onNodeWithText("Also look up give up").assertIsDisplayed()
        composeRule.onNodeWithTag("lookup-alternative").performClick()
        assertEquals(alternative, requested)

        state.value = state.value.copy(alternativeLookupStatus = AlternativeLookupStatus.Loading)
        composeRule.onNodeWithText(noDefinitionsText).assertIsDisplayed()
        composeRule.onNodeWithText("Also look up give up").assertIsDisplayed()
        composeRule.onNodeWithText("Loading alternative definition…").assertIsDisplayed()

        state.value =
            state.value.copy(
                targetWord = alternative.text,
                alternatives = emptyList(),
                displayedAlternative = alternative,
                alternativeLookupStatus = AlternativeLookupStatus.Idle,
            )
        composeRule.onNodeWithText("Return to original lookup").assertIsDisplayed().performClick()
        assertTrue(returned)

        state.value = state.value.copy(flowState = CardCreationFlowState.CreatingCard)
        composeRule.onNodeWithTag("return-to-original-lookup").assertIsNotEnabled()
        state.value = state.value.copy(displayedAlternative = null, alternatives = listOf(alternative))
        composeRule.onNodeWithTag("lookup-alternative").assertIsNotEnabled()

        val targetWord = "state-of-the-art"
        val context = "She studies state-of-the-art systems."
        val inputErrorText =
            ApplicationProvider
                .getApplicationContext<Context>()
                .getString(R.string.error_lookup_input_invalid)
        state.value =
            state.value.copy(
                targetWord = targetWord,
                context = context,
                flowState = CardCreationFlowState.LookupError(CardCreationError.LOOKUP_INPUT_INVALID),
            )
        composeRule.onNodeWithText(inputErrorText).assertIsDisplayed()
        composeRule.onNodeWithTag("lookup-retry").assertDoesNotExist()
        assertEquals(targetWord, state.value.targetWord)
        assertEquals(context, state.value.context)

        state.value = state.value.copy(flowState = CardCreationFlowState.LookupError(CardCreationError.CONNECTION))
        composeRule.onNodeWithTag("lookup-retry").assertIsDisplayed().performClick()
        assertTrue(retryTapped)
    }
}
