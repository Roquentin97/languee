package com.example.langueedroid.domain

enum class ExportPreference {
    AUTO,
    MANUAL,
}

sealed class AnkiExportStatus {
    object NoRecord : AnkiExportStatus()
    object Pending : AnkiExportStatus()
    object Completed : AnkiExportStatus()
    data class Failed(val reason: String, val message: String) : AnkiExportStatus()
}
