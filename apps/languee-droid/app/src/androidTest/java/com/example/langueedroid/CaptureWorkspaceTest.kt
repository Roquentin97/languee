package com.example.langueedroid

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
        composeRule.onNodeWithText("0 added").assertIsDisplayed()
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
        composeRule.onNodeWithText("1 added").assertIsDisplayed()
        composeRule.onNodeWithText("Added: A river edge · Nature").assertIsDisplayed()
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
