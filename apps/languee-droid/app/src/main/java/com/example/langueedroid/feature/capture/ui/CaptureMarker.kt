package com.example.langueedroid.feature.capture.ui

internal enum class CaptureMarker { NONE, SAVED, COMPLETED }

internal fun captureMarker(
    index: Int,
    word: String,
    completedIndices: Set<Int>,
    savedSurfaces: Set<String>,
): CaptureMarker =
    when {
        index in completedIndices -> CaptureMarker.COMPLETED
        word.lowercase() in savedSurfaces -> CaptureMarker.SAVED
        else -> CaptureMarker.NONE
    }
