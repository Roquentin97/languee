package com.example.langueedroid.feature.auth.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.example.langueedroid.core.ui.components.ErrorMessage
import com.example.langueedroid.feature.auth.presentation.AuthUiError
import com.languee.droid.R

@Composable
internal fun AuthErrorMessage(type: AuthUiError) {
    ErrorMessage(
        text =
            stringResource(
                when (type) {
                    AuthUiError.REQUIRED_FIELDS -> R.string.auth_error_required_fields
                    AuthUiError.PASSWORDS_DO_NOT_MATCH -> R.string.auth_passwords_do_not_match
                    AuthUiError.INVALID_CREDENTIALS -> R.string.auth_error_invalid_credentials
                    AuthUiError.ACCOUNT_ALREADY_EXISTS -> R.string.auth_error_account_exists
                    AuthUiError.CONNECTION -> R.string.error_connection
                    AuthUiError.RATE_LIMITED -> R.string.error_rate_limited
                    AuthUiError.SERVICE_UNAVAILABLE -> R.string.error_service_unavailable
                    AuthUiError.REQUEST_REJECTED -> R.string.error_request_rejected
                    AuthUiError.FORBIDDEN -> R.string.error_forbidden
                    AuthUiError.UNEXPECTED -> R.string.error_generic
                },
            ),
        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
    )
}
