package com.example.langueedroid

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.langueedroid.presentation.AppState
import com.example.langueedroid.presentation.MainViewModel
import com.example.langueedroid.ui.CaptureScreen
import com.example.langueedroid.ui.ListScreen
import com.example.langueedroid.ui.theme.LangueeDroidTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val sharedText: String? = if (intent?.action == Intent.ACTION_SEND) {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf { it.isNotBlank() }
        } else {
            null
        }

        setContent {
            LangueeDroidTheme {
                LangueeApp(initialSharedText = sharedText)
            }
        }
    }
}

@Composable
private fun LangueeApp(initialSharedText: String?) {
    val navController = rememberNavController()
    val viewModel: MainViewModel = viewModel()
    val state by viewModel.state.collectAsState()

    // Drive navigation from ViewModel state.
    LaunchedEffect(state) {
        when (state) {
            is AppState.Screen.List -> {
                navController.popBackStack("list", inclusive = false)
            }
            else -> {
                navController.navigate("capture") { launchSingleTop = true }
            }
        }
    }

    // Forward any incoming shared text to the ViewModel once on launch.
    LaunchedEffect(initialSharedText) {
        if (initialSharedText != null) {
            viewModel.startSharedTextCapture(initialSharedText)
        }
    }

    NavHost(
        navController = navController,
        startDestination = "list",
    ) {
        composable("list") {
            val listState = state as? AppState.Screen.List
                ?: AppState.Screen.List()
            ListScreen(
                entries = listState.entries,
                onAddEntry = { viewModel.startManualAdd() },
            )
        }
        composable("capture") {
            BackHandler { viewModel.dismissCapture() }
            val captureState = state as? AppState.Screen
            if (captureState != null && captureState !is AppState.Screen.List) {
                CaptureScreen(
                    state = captureState,
                    onAddEntry = { word, context -> viewModel.addEntry(word, context) },
                    onStartManualAdd = { viewModel.startManualAdd() },
                    onSelectTargetWord = { token -> viewModel.selectTargetWord(token) },
                    onConfirmTruncation = { viewModel.confirmTruncation() },
                    onKeepFullContext = { viewModel.keepFullContext() },
                    onDismiss = { viewModel.dismissCapture() },
                )
            }
        }
    }
}
