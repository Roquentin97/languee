package com.example.langueedroid.core.data.local

import com.example.langueedroid.core.domain.ExportPreference

data class AnkiDroidSetupPrefs(
    val noteTypeName: String,
    val exportPreference: ExportPreference,
    val setupCompleted: Boolean,
)
