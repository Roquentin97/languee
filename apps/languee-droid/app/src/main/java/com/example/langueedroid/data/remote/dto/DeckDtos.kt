package com.example.langueedroid.data.remote.dto

data class DeckResponseDto(
    val id: String,
    val userId: String,
    val name: String,
    val language: String,
    val createdAt: String,
    val updatedAt: String,
)

data class CreateDeckRequest(
    val name: String,
    val language: String,
)
