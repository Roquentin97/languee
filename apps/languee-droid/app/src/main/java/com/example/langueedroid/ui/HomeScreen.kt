package com.example.langueedroid.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.langueedroid.R

@Composable
fun HomeScreen(
    userEmail: String,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.home_greeting, userEmail),
            style = MaterialTheme.typography.headlineSmall,
        )

        Button(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth(),
            enabled = !logoutInProgress,
        ) {
            Text(text = stringResource(R.string.home_logout_button))
        }
    }
}
