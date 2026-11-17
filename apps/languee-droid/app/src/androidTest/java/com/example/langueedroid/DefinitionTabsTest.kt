package com.example.langueedroid

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.domain.Deck
import com.example.langueedroid.core.domain.DeckRef
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationState
import com.example.langueedroid.feature.cardcreation.presentation.DeckSelectionState
import com.example.langueedroid.feature.cardcreation.ui.CardCreationScreen
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DefinitionTabsTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun preferredPartOfSpeechOpensFirstAndTabsSwitchDefinitions() {
        val definitions =
            listOf(
                DefinitionResult("1", "noun", "A financial institution", null, "dictionary", emptyList()),
                DefinitionResult("2", "verb", "To tilt sideways", null, "dictionary", emptyList(), preferred = true),
            )
        composeRule.setContent {
            MaterialTheme {
                CardCreationScreen(
                    state =
                        CardCreationState(
                            targetWord = "bank",
                            context = null,
                            flowState = CardCreationFlowState.DefinitionsLoaded(definitions, null, null, "bank"),
                        ),
                    speaker =
                        object : Speaker {
                            override fun speak(
                                text: String,
                                languageCode: String,
                            ) = Unit

                            override fun shutdown() = Unit
                        },
                    onDeckSelected = {},
                    onDefinitionSelected = {},
                    onExampleConfirmed = {},
                    onBackFromExampleSelection = {},
                    onCreateCard = {},
                    onRetryLookup = {},
                    onNavigateBack = {},
                )
            }
        }
        composeRule.onNodeWithText("To tilt sideways").assertIsDisplayed()
        composeRule.onNodeWithText("A financial institution").assertDoesNotExist()
        composeRule.onNodeWithText("noun").performClick()
        composeRule.onNodeWithText("A financial institution").assertIsDisplayed()
        composeRule.onNodeWithText("To tilt sideways").assertDoesNotExist()
    }

    @Test
    fun savedDefinitionsAppearAboveNewDefinitionsWithDivider() {
        val deck = Deck("target", "Target")
        val definitions =
            listOf(
                DefinitionResult("new", "noun", "A new meaning", null, "dictionary", emptyList()),
                DefinitionResult("saved", "noun", "A saved meaning", null, "dictionary", listOf(DeckRef("target", "Target"))),
            )
        composeRule.setContent {
            MaterialTheme {
                CardCreationScreen(
                    state =
                        CardCreationState(
                            targetWord = "bank",
                            context = null,
                            deckSelectionState = DeckSelectionState.Loaded(listOf(deck), deck),
                            flowState = CardCreationFlowState.DefinitionsLoaded(definitions, null, null, "bank"),
                        ),
                    speaker =
                        object : Speaker {
                            override fun speak(
                                text: String,
                                languageCode: String,
                            ) = Unit

                            override fun shutdown() = Unit
                        },
                    onDeckSelected = {},
                    onDefinitionSelected = {},
                    onExampleConfirmed = {},
                    onBackFromExampleSelection = {},
                    onCreateCard = {},
                    onRetryLookup = {},
                    onNavigateBack = {},
                )
            }
        }
        val savedTop =
            composeRule
                .onNodeWithText("A saved meaning")
                .fetchSemanticsNode()
                .boundsInRoot.top
        val dividerTop =
            composeRule
                .onNodeWithTag("definition-group-divider")
                .fetchSemanticsNode()
                .boundsInRoot.top
        val newTop =
            composeRule
                .onNodeWithText("A new meaning")
                .fetchSemanticsNode()
                .boundsInRoot.top
        assertTrue(savedTop < dividerTop && dividerTop < newTop)
    }
}
