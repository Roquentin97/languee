package com.example.langueedroid.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.langueedroid.presentation.AppState
import com.example.langueedroid.presentation.MainViewModel

@Composable
fun MainScreen(
    userEmail: String,
    onLogout: () -> Unit,
    logoutInProgress: Boolean,
    modifier: Modifier = Modifier,
) {
    val mainViewModel: MainViewModel = viewModel()
    val state by mainViewModel.state.collectAsState()

    when (val currentState = state) {
        is AppState.Screen.List -> ListScreen(
            entries = currentState.entries,
            onAddEntry = { mainViewModel.startManualAdd() },
            onLogout = onLogout,
            logoutInProgress = logoutInProgress,
            modifier = modifier,
        )

        is AppState.Screen.ManualCapture,
        is AppState.Screen.SharedWordCapture,
        is AppState.Screen.SharedContextCapture,
        is AppState.Screen.ContextReview,
        is AppState.Screen.ContextEdit,
        -> CaptureScreen(
            state = currentState as AppState.Screen,
            onAddEntry = { word, context -> mainViewModel.addEntry(word, context) },
            onStartManualAdd = { mainViewModel.startManualAdd() },
            onSelectTargetWord = { token -> mainViewModel.selectTargetWord(token) },
            onConfirmTruncation = { mainViewModel.confirmTruncation() },
            onKeepFullContext = { mainViewModel.keepFullContext() },
            onEditContext = {
                val reviewState = currentState as? AppState.Screen.ContextReview
                if (reviewState != null) {
                    mainViewModel.startContextEdit(reviewState.targetWord, reviewState.context)
                }
            },
            onDismiss = { mainViewModel.dismissCapture() },
            onContextEditSave = { editedContext -> mainViewModel.onContextEditSave(editedContext) },
            onConfirmSaveWithoutContext = {
                val editState = currentState as? AppState.Screen.ContextEdit
                if (editState != null) {
                    mainViewModel.confirmSaveWithoutContext(editState.targetWord)
                }
            },
            modifier = modifier,
        )
    }
}
