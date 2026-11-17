package com.example.langueedroid

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.domain.DefinitionResult
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationFlowState
import com.example.langueedroid.feature.cardcreation.presentation.CardCreationState
import com.example.langueedroid.feature.cardcreation.ui.CardCreationScreen
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
}
