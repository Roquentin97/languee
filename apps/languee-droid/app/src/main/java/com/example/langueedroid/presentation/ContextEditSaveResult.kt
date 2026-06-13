package com.example.langueedroid.presentation

sealed class ContextEditSaveResult {
    object Valid : ContextEditSaveResult()
    object EmptyContextPendingConfirmation : ContextEditSaveResult()
    data class InvalidContextBlockedSave(val targetWord: String) : ContextEditSaveResult()
}
