package com.example.langueedroid.feature.progress.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.core.data.ChatRepository
import com.example.langueedroid.core.domain.UnauthorizedException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProgressViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<ProgressState>(ProgressState.Loading)
    val state: StateFlow<ProgressState> = _state.asStateFlow()

    private val _unauthorizedEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val unauthorizedEvent: SharedFlow<Unit> = _unauthorizedEvent.asSharedFlow()

    init {
        loadProgress()
    }

    fun refresh() {
        loadProgress()
    }

    private fun loadProgress() {
        _state.value = ProgressState.Loading
        viewModelScope.launch {
            chatRepository.progress().fold(
                onSuccess = { progress ->
                    _state.value = if (progress.totals.suggestionsRaised == 0 && progress.weeks.isEmpty()) {
                        ProgressState.Empty
                    } else {
                        ProgressState.Loaded(progress)
                    }
                },
                onFailure = { error -> handleFailure(error) },
            )
        }
    }

    private fun handleFailure(error: Throwable) {
        if (error is UnauthorizedException) {
            _unauthorizedEvent.tryEmit(Unit)
        } else {
            _state.value = ProgressState.Error
        }
    }
}
