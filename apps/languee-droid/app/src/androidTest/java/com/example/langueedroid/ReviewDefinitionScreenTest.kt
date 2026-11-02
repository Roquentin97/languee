package com.example.langueedroid

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.domain.DefinitionReview
import com.example.langueedroid.core.domain.LexicalKind
import com.example.langueedroid.core.domain.RevealedWord
import com.example.langueedroid.core.domain.ReviewCardType
import com.example.langueedroid.core.domain.ReviewItem
import com.example.langueedroid.core.domain.ReviewPrompt
import com.example.langueedroid.core.domain.ReviewRating
import com.example.langueedroid.feature.review.presentation.QuestionFeedback
import com.example.langueedroid.feature.review.presentation.ReviewSessionState
import com.example.langueedroid.feature.review.ui.ReviewScreen
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReviewDefinitionScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun showAnswerRevealsMeaningAndSelfRating() {
        val item =
            ReviewItem(
                cardId = "card-1",
                deckId = "deck-1",
                deckName = "Words",
                isNew = true,
                prompt = ReviewPrompt("What does run mean?", null, "verb", LexicalKind.WORD, 3),
                type = ReviewCardType.DEFINITION,
                definition = DefinitionReview("run", null, null),
            )
        val state = mutableStateOf<ReviewSessionState>(ReviewSessionState.Question(item, 1, 1, "", QuestionFeedback.None))
        var rating: ReviewRating? = null
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
                ReviewScreen(
                    state = state.value,
                    speaker = speaker,
                    onInputChange = {},
                    onFormInputChange = { _, _ -> },
                    onSubmit = {},
                    onReveal = {
                        state.value =
                            ReviewSessionState.Correct(
                                item = item,
                                index = 1,
                                total = 1,
                                matchedForm = null,
                                revealed = RevealedWord("run", null, null, "Move quickly on foot"),
                            )
                    },
                    onGrade = { rating = it },
                    onContinue = {},
                    onRetry = {},
                    onDone = {},
                    onNavigateBack = {},
                )
            }
        }

        composeRule.onNodeWithText("Show answer").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Move quickly on foot").assertIsDisplayed()
        composeRule.onNodeWithText("Correct").assertDoesNotExist()
        listOf("Again", "Hard", "Good", "Easy").forEach {
            composeRule.onNodeWithText(it).assertIsDisplayed()
        }
        composeRule.onNodeWithText("Good").performClick()
        assertEquals(ReviewRating.GOOD, rating)
    }
}
