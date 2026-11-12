package com.example.langueedroid

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.data.SavedVocabulary
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.feature.capture.presentation.AppState
import com.example.langueedroid.feature.capture.presentation.CompletedTarget
import com.example.langueedroid.feature.capture.presentation.ContextEditSaveResult
import com.example.langueedroid.feature.capture.ui.CaptureScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CaptureWorkspaceTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun savedVocabularyDetailsCanBeOpenedWithoutInterruptingSelection() {
        showWorkspace(
            AppState.Screen.SharedContextCapture(
                tokens = EntryValidator.splitIntoTokens("Bank here."),
                rawContext = "Bank here.",
                selectedIndices = listOf(0),
                inspectedIndex = 0,
                savedVocabulary = listOf(SavedVocabulary("bank", "noun", "A financial institution", listOf("English"))),
            ),
        )
        composeRule.onNodeWithText("1 saved definition · Details").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("noun: A financial institution\nEnglish").assertIsDisplayed()
        composeRule.onNodeWithText("Close").performClick()
        composeRule.onNodeWithText("Added this session (0)").assertIsDisplayed()
        composeRule.onNodeWithText("Done").assertIsEnabled()
    }

    @Test
    fun completedOccurrenceShowsSavedDefinitionAndDeck() {
        showWorkspace(
            AppState.Screen.SharedContextCapture(
                tokens = EntryValidator.splitIntoTokens("Bank here."),
                rawContext = "Bank here.",
                completed = listOf(CompletedTarget(listOf(0), "A river edge", "Nature")),
                inspectedIndex = 0,
            ),
        )
        composeRule.onNodeWithText("Added this session (1)").assertIsDisplayed()
        composeRule.onAllNodesWithText("A river edge").assertCountEquals(2)
        composeRule.onAllNodesWithText("Nature").assertCountEquals(2)
        composeRule.onNodeWithText("Done").assertIsDisplayed()
    }

    @Test
    fun completedHistoryShowsEveryAdditionNewestFirstAndScrollsIndependently() {
        val sourceText = "First second third fourth text. " + "source text ".repeat(100)
        val tokens = EntryValidator.splitIntoTokens(sourceText)
        showWorkspace(
            AppState.Screen.SharedContextCapture(
                tokens = tokens,
                rawContext = sourceText,
                completed =
                    listOf(
                        CompletedTarget(listOf(0), "Definition one", "Deck one"),
                        CompletedTarget(listOf(2), "Definition two", "Deck two"),
                        CompletedTarget(listOf(4), "Definition three", "Deck three"),
                    ),
                inspectedIndex = 6,
            ),
        )

        composeRule.onNodeWithText("Added this session (3)").assertIsDisplayed()
        composeRule.onNodeWithText("Definition three").assertIsDisplayed()
        composeRule.onNodeWithText("Deck three").assertIsDisplayed()
        composeRule.onNodeWithTag("capture-history-item-2").assertDoesNotExist()
        composeRule.onNodeWithTag("capture-session-history").performScrollToIndex(2)
        composeRule.onNodeWithText("Definition one").assertIsDisplayed()
        composeRule.onNodeWithTag("capture-source-text").performTouchInput { swipeUp() }
        composeRule.onNodeWithText("Definition one").assertIsDisplayed()
        composeRule.onNodeWithText("Done").assertIsDisplayed()
    }

    @Test
    fun longHistoryDefinitionCanBeReadInFull() {
        val definition = "A very long definition that explains a word in detail. ".repeat(8)
        showWorkspace(
            AppState.Screen.SharedContextCapture(
                tokens = EntryValidator.splitIntoTokens("A long definition."),
                rawContext = "A long definition.",
                completed = listOf(CompletedTarget(listOf(2), definition, "English")),
            ),
        )

        composeRule.onNodeWithText("Read full definition").assertIsDisplayed().performClick()
        composeRule.onAllNodesWithText(definition).assertCountEquals(2)
        composeRule.onNodeWithText("Done").assertIsDisplayed()
    }

    @Test
    fun savedExpressionDetailsFollowTheWholeSelection() {
        showWorkspace(
            AppState.Screen.SharedContextCapture(
                tokens = EntryValidator.splitIntoTokens("They looked it up."),
                rawContext = "They looked it up.",
                selectedIndices = listOf(2, 6),
                inspectedIndex = 6,
                savedVocabulary = listOf(SavedVocabulary("looked up", "phrase", "Searched for information", listOf("English"))),
            ),
        )
        composeRule.onNodeWithText("1 saved definition · Details").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("phrase: Searched for information\nEnglish").assertIsDisplayed()
    }

    private fun showWorkspace(state: AppState.Screen.SharedContextCapture) {
        composeRule.setContent {
            MaterialTheme {
                CaptureScreen(
                    state = state,
                    onAddEntry = { _, _ -> },
                    onStartManualAdd = {},
                    onWordTokenTapped = {},
                    onConfirmWordSelection = {},
                    onConfirmTruncation = {},
                    onKeepFullContext = {},
                    onEditContext = {},
                    onDismiss = {},
                    onContextEditSave = { ContextEditSaveResult.Valid },
                    onConfirmSaveWithoutContext = {},
                    onSelectLanguage = {},
                )
            }
        }
    }
}
