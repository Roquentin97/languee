package com.example.langueedroid.domain

sealed class AnkiDroidSetupIssue {
    object NotInstalled : AnkiDroidSetupIssue()
    object ApiUnavailable : AnkiDroidSetupIssue()
    object PermissionDenied : AnkiDroidSetupIssue()
    object NoDeckSelected : AnkiDroidSetupIssue()
    object NoNoteTypeSelected : AnkiDroidSetupIssue()
    object NoExportPreference : AnkiDroidSetupIssue()
}

data class AnkiDroidSetupCheckResult(
    val isReady: Boolean,
    val issues: List<AnkiDroidSetupIssue>,
)
