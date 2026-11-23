package com.example.langueedroid

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
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.langueedroid.core.data.local.AuthSession
import com.example.langueedroid.core.data.local.AuthSessionStore
import com.example.langueedroid.feature.auth.presentation.AuthUiError
import com.example.langueedroid.feature.auth.presentation.AuthUiState
import com.example.langueedroid.feature.auth.ui.LoginScreen
import com.languee.droid.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AuthRecoveryScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun differentAccountRecoveryMessageWrapsAtLargeFontScaleAndIsAnnounced() {
        val message =
            ApplicationProvider
                .getApplicationContext<android.content.Context>()
                .getString(R.string.auth_error_account_mismatch)

        composeRule.setContent {
            CompositionLocalProvider(LocalDensity provides Density(density = 1f, fontScale = 2f)) {
                MaterialTheme {
                    androidx.compose.foundation.layout.Box(Modifier.width(280.dp)) {
                        LoginScreen(
                            uiState = AuthUiState.Error(AuthUiError.ACCOUNT_MISMATCH),
                            email = "other@example.com",
                            password = "password",
                            onEmailChange = {},
                            onPasswordChange = {},
                            onLoginClick = {},
                            onNavigateBack = {},
                            onNavigateToRegister = {},
                            showBackButton = false,
                            showRegisterPrompt = false,
                        )
                    }
                }
            }
        }

        val errorNode = composeRule.onNodeWithText(message)
        errorNode.assertIsDisplayed()
        assertEquals(LiveRegionMode.Polite, errorNode.fetchSemanticsNode().config[SemanticsProperties.LiveRegion])
    }

    @Test
    fun recoveryIdentitySurvivesCredentialClearingAndClearsAfterSameAccountSignIn() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val store = AuthSessionStore(context)
        store.clear()

        try {
            assertTrue(store.requireReauthentication("uid-recovery"))
            store.clearCredentials()

            assertEquals("uid-recovery", AuthSessionStore(context).requiredRecoveryUserId())

            store.save(
                AuthSession(
                    accessToken = "access",
                    refreshToken = "refresh",
                    sessionId = "session",
                    userId = "uid-recovery",
                    userEmail = "user@example.com",
                ),
            )
            assertNull(AuthSessionStore(context).requiredRecoveryUserId())

            store.requireReauthentication("uid-recovery")
            store.clear()
            assertNull(AuthSessionStore(context).requiredRecoveryUserId())
        } finally {
            store.clear()
        }
    }
}
