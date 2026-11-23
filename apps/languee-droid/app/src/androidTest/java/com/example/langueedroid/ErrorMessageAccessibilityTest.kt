package com.example.langueedroid

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.ui.components.ErrorMessage
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ErrorMessageAccessibilityTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun longErrorWrapsAtLargeFontScaleAndIsAnnouncedAsLiveRegion() {
        val message =
            "Couldn’t connect to the service. Check your internet connection and try again when you are back online."

        composeRule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                MaterialTheme {
                    Box(Modifier.width(240.dp)) {
                        ErrorMessage(message)
                    }
                }
            }
        }

        val errorNode = composeRule.onNodeWithText(message)
        errorNode.assertIsDisplayed()
        assertEquals(LiveRegionMode.Polite, errorNode.fetchSemanticsNode().config[SemanticsProperties.LiveRegion])
    }
}
