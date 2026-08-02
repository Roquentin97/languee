package com.example.langueedroid.core.data

import com.example.langueedroid.di.ApplicationScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

private const val PING_INTERVAL_MS = 15_000L

@Singleton
class OfflineStateManager
    @Inject
    constructor(
        private val connectivityObserver: ConnectivityObserver,
        private val serverReachabilityChecker: ServerReachabilityChecker,
        @ApplicationScope private val appScope: CoroutineScope,
    ) {
        private val _isOffline = MutableStateFlow(false)
        val isOffline: StateFlow<Boolean> = _isOffline.asStateFlow()

        private var pingJob: Job? = null

        init {
            appScope.launch {
                connectivityObserver.isConnected.collect { hasNetwork ->
                    if (!hasNetwork) {
                        pingJob?.cancel()
                        _isOffline.value = true
                    } else {
                        startPingLoop()
                    }
                }
            }
        }

        private fun startPingLoop() {
            pingJob?.cancel()
            pingJob =
                appScope.launch {
                    while (true) {
                        val reachable = serverReachabilityChecker.isReachable()
                        _isOffline.value = !reachable
                        if (reachable) break
                        delay(PING_INTERVAL_MS)
                    }
                }
        }
    }
