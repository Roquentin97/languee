package com.example.langueedroid.core.domain

class UnauthorizedException(
    message: String = "Unauthorized",
) : Exception(message)

class CardAlreadyExistsException(
    message: String = "Card already exists in this deck",
) : Exception(message)

class StaleReferenceException(
    message: String = "Deck or definition no longer exists",
) : Exception(message)

class DeckConflictException(
    message: String = "A deck with this name already exists",
) : Exception(message)

class DefinitionAlreadyExistsException(
    message: String = "Definition already exists",
) : Exception(message)

class ExpressionTooLongException(
    message: String = "Expression exceeds the maximum supported token count",
) : Exception(message)

class LookupInputInvalidException(
    message: String = "Lookup input was rejected as invalid",
) : Exception(message)
