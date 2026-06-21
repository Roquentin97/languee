package com.example.langueedroid.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.langueedroid.ankidroid.AnkiDroidExportService
import com.example.langueedroid.ankidroid.NoteTypeTemplates
import com.example.langueedroid.data.AnkiDroidPreferencesStore
import com.example.langueedroid.data.local.AnkiDroidSetupPrefs
import com.example.langueedroid.domain.AnkiDroidSetupCheckResult
import com.example.langueedroid.domain.ExportPreference
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AnkiDroidSetupUiState(
    val checkResult: AnkiDroidSetupCheckResult = AnkiDroidSetupCheckResult(false, emptyList()),
    val noteTypeName: String = NoteTypeTemplates.LANGUEE_TYPE_IN_VOCABULARY,
    val exportPreference: ExportPreference = ExportPreference.MANUAL,
    val isSaving: Boolean = false,
    val permissionPending: Boolean = false,
)

@HiltViewModel
class AnkiDroidSetupViewModel @Inject constructor(
    private val exportService: AnkiDroidExportService,
    private val prefsStore: AnkiDroidPreferencesStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnkiDroidSetupUiState())
    val uiState: StateFlow<AnkiDroidSetupUiState> = _uiState.asStateFlow()

    private val _setupCompleteEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val setupCompleteEvent: SharedFlow<Unit> = _setupCompleteEvent.asSharedFlow()

    private val _skipEvent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val skipEvent: SharedFlow<Unit> = _skipEvent.asSharedFlow()

    init {
        viewModelScope.launch {
            val prefs = prefsStore.read()
            _uiState.update {
                it.copy(
                    noteTypeName = prefs.noteTypeName,
                    exportPreference = prefs.exportPreference,
                    checkResult = exportService.checkSetup(prefsStore),
                )
            }
        }
    }

    fun runSetupCheck() {
        viewModelScope.launch {
            val result = exportService.checkSetup(prefsStore)
            _uiState.update { it.copy(checkResult = result) }
        }
    }

    fun onNoteTypeSelected(name: String) {
        _uiState.update { it.copy(noteTypeName = name) }
    }

    fun onExportPreferenceSelected(pref: ExportPreference) {
        _uiState.update { it.copy(exportPreference = pref) }
    }

    fun onSave() {
        _uiState.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            val current = _uiState.value
            prefsStore.save(
                AnkiDroidSetupPrefs(
                    noteTypeName = current.noteTypeName,
                    exportPreference = current.exportPreference,
                    setupCompleted = true,
                ),
            )
            runSetupCheck()
            _uiState.update { it.copy(isSaving = false) }
            _setupCompleteEvent.tryEmit(Unit)
        }
    }

    fun onSkipSetup() {
        viewModelScope.launch {
            val current = _uiState.value
            prefsStore.save(
                AnkiDroidSetupPrefs(
                    noteTypeName = current.noteTypeName,
                    exportPreference = current.exportPreference,
                    setupCompleted = true,
                ),
            )
            _skipEvent.tryEmit(Unit)
        }
    }

    fun onPermissionGranted() {
        runSetupCheck()
    }

}
