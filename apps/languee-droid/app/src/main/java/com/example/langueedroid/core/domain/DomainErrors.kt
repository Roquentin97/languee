package com.example.langueedroid.core.domain

import java.io.IOException

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

class VocabularyNotFoundException(
    message: String = "No dictionary entry was found",
) : Exception(message)

class InvalidCredentialsException : Exception("Invalid credentials")

class AccountMismatchException : Exception("Recovery requires the original account")

class AccountAlreadyExistsException : Exception("Account already exists")

class ContextTooLongException : Exception("Context is too long")

enum class RemoteFailureKind {
    CONNECTION,
    BAD_REQUEST,
    FORBIDDEN,
    NOT_FOUND,
    CONFLICT,
    RATE_LIMITED,
    SERVICE_UNAVAILABLE,
    UNEXPECTED,
}

/** A safe, operation-scoped failure. Backend messages and exception details stay out of UI copy. */
class RemoteOperationFailureException(
    val kind: RemoteFailureKind,
    val statusCode: Int? = null,
) : Exception("Remote operation failed")

fun Throwable.remoteFailureKind(): RemoteFailureKind {
    var current: Throwable? = this
    var sawIoFailure = false
    val seen = mutableSetOf<Throwable>()

    while (current != null && seen.add(current)) {
        when (current) {
            is RemoteOperationFailureException -> return current.kind
            is StaleReferenceException -> return RemoteFailureKind.NOT_FOUND
            is VocabularyNotFoundException -> return RemoteFailureKind.NOT_FOUND
            is DeckConflictException,
            is CardAlreadyExistsException,
            is DefinitionAlreadyExistsException,
            is AccountAlreadyExistsException,
            -> return RemoteFailureKind.CONFLICT
            is LookupInputInvalidException,
            is ContextTooLongException,
            -> return RemoteFailureKind.BAD_REQUEST
            is IOException -> sawIoFailure = true
        }
        current = current.cause
    }

    return if (sawIoFailure) RemoteFailureKind.CONNECTION else RemoteFailureKind.UNEXPECTED
}
