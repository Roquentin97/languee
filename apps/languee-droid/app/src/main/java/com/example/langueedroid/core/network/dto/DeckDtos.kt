package com.example.langueedroid.core.network.dto

data class DeckResponseDto(
    val id: String,
    val userId: String,
    val name: String,
    val createdAt: String,
    val updatedAt: String,
)

data class CreateDeckRequest(
    val name: String,
)
