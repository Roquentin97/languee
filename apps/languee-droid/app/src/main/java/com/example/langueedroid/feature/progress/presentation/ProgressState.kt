package com.example.langueedroid.feature.progress.presentation

import com.example.langueedroid.core.domain.ChatProgress

sealed class ProgressState {
    object Loading : ProgressState()
    data class Loaded(val progress: ChatProgress) : ProgressState()
    object Empty : ProgressState()
    object Error : ProgressState()
}
