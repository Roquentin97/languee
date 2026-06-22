package com.example.langueedroid.core.domain

class UnauthorizedException(message: String = "Unauthorized") : Exception(message)

class CardAlreadyExistsException(message: String = "Card already exists in this deck") : Exception(message)

class StaleReferenceException(message: String = "Deck or definition no longer exists") : Exception(message)

class DeckConflictException(message: String = "A deck with this name already exists") : Exception(message)
