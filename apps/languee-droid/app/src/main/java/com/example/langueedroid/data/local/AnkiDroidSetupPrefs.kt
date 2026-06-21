package com.example.langueedroid.data.local

import com.example.langueedroid.domain.ExportPreference

data class AnkiDroidSetupPrefs(
    val noteTypeName: String,
    val exportPreference: ExportPreference,
    val setupCompleted: Boolean,
)
