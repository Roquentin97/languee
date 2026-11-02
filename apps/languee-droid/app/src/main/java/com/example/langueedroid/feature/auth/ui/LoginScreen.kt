package com.example.langueedroid.feature.auth.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.ui.theme.CardBorder
import com.example.langueedroid.core.ui.theme.DividerLight
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.TextMuted
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary
import com.example.langueedroid.feature.auth.presentation.AuthUiState
import com.languee.droid.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    uiState: AuthUiState,
    email: String,
    password: String,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLoginClick: () -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToRegister: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isLoading = uiState is AuthUiState.Loading

    Scaffold(
        modifier = modifier,
        containerColor = Color.White,
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.btn_cancel),
                            tint = TextPrimary,
                        )
                    }
                },
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.White,
                        scrolledContainerColor = Color.White,
                    ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(start = 24.dp, end = 24.dp, top = 4.dp, bottom = 32.dp),
        ) {
            Text(
                text = "Welcome\nback",
                style = MaterialTheme.typography.headlineMedium,
                color = TextPrimary,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Enter your details to continue",
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
            Spacer(modifier = Modifier.height(30.dp))

            OutlinedTextField(
                value = email,
                onValueChange = onEmailChange,
                label = {
                    Text(
                        text = stringResource(R.string.auth_email_label).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                shape = RoundedCornerShape(13.dp),
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GreenPrimary,
                        unfocusedBorderColor = CardBorder,
                        focusedLabelColor = GreenPrimary,
                        unfocusedLabelColor = TextMuted,
                        cursorColor = GreenPrimary,
                    ),
            )
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = onPasswordChange,
                label = {
                    Text(
                        text = stringResource(R.string.auth_password_label).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading,
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                shape = RoundedCornerShape(13.dp),
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GreenPrimary,
                        unfocusedBorderColor = CardBorder,
                        focusedLabelColor = GreenPrimary,
                        unfocusedLabelColor = TextMuted,
                        cursorColor = GreenPrimary,
                    ),
            )

            if (uiState is AuthUiState.Error) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = uiState.message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Spacer(modifier = Modifier.height(26.dp))

            if (isLoading) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        color = GreenPrimary,
                        modifier = Modifier.size(24.dp),
                    )
                }
            } else {
                Button(
                    onClick = onLoginClick,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
                ) {
                    Text(
                        text = stringResource(R.string.auth_login_button),
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White,
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                HorizontalDivider(modifier = Modifier.weight(1f), color = DividerLight)
                Text(
                    text = "  or  ",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted,
                )
                HorizontalDivider(modifier = Modifier.weight(1f), color = DividerLight)
            }
            Spacer(modifier = Modifier.height(20.dp))

            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text =
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = TextSecondary)) { append("No account? ") }
                            withStyle(SpanStyle(color = GreenPrimary, fontWeight = FontWeight.SemiBold)) {
                                append("Register")
                            }
                        },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier =
                        Modifier.clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onNavigateToRegister,
                        ),
                )
            }
        }
    }
}
