package com.example.langueedroid.core.data

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExportStatusNotifier
    @Inject
    constructor() {
        private val _failures = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val failures = _failures.asSharedFlow()

        fun reportFailure() {
            _failures.tryEmit(Unit)
        }
    }
