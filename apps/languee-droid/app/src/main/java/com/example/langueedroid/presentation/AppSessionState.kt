package com.example.langueedroid.presentation

sealed class AppSessionState {
    object CheckingSession : AppSessionState()
    object Unauthorized : AppSessionState()
    data class Authorized(val userId: String, val userEmail: String) : AppSessionState()
    data class AuthorizedPendingAnkiSetup(val userId: String, val userEmail: String) : AppSessionState()
}
