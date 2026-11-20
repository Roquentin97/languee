package com.example.langueedroid.feature.session.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.ui.components.ErrorMessage
import com.languee.droid.R

@Composable
fun SessionCheckFailedScreen(
    failureKind: RemoteFailureKind,
    onRetry: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(modifier = modifier) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(padding)
                    .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.session_check_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            Spacer(Modifier.height(12.dp))
            ErrorMessage(
                text = stringResource(failureMessage(failureKind)),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.session_check_retry))
            }
            TextButton(onClick = onSignIn) {
                Text(stringResource(R.string.session_check_sign_in))
            }
        }
    }
}

private fun failureMessage(kind: RemoteFailureKind): Int =
    when (kind) {
        RemoteFailureKind.CONNECTION -> R.string.error_connection
        RemoteFailureKind.RATE_LIMITED -> R.string.error_rate_limited
        RemoteFailureKind.SERVICE_UNAVAILABLE -> R.string.error_service_unavailable
        else -> R.string.error_generic
    }
