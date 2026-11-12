package com.example.langueedroid.feature.capture.ui

internal enum class CaptureMarker { NONE, SAVED, COMPLETED }

internal fun captureMarker(
    index: Int,
    word: String,
    completedIndices: Set<Int>,
    savedHeadwords: Set<String>,
): CaptureMarker =
    when {
        index in completedIndices -> CaptureMarker.COMPLETED
        word.lowercase() in savedHeadwords -> CaptureMarker.SAVED
        else -> CaptureMarker.NONE
    }
