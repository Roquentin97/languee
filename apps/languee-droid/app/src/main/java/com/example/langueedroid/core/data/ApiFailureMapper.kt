package com.example.langueedroid.core.data

import com.example.langueedroid.core.domain.AccountAlreadyExistsException
import com.example.langueedroid.core.domain.CardAlreadyExistsException
import com.example.langueedroid.core.domain.ContextTooLongException
import com.example.langueedroid.core.domain.DeckConflictException
import com.example.langueedroid.core.domain.DefinitionAlreadyExistsException
import com.example.langueedroid.core.domain.InvalidCredentialsException
import com.example.langueedroid.core.domain.LookupInputInvalidException
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RemoteOperationFailureException
import com.example.langueedroid.core.domain.StaleReferenceException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.VocabularyNotFoundException
import com.google.gson.JsonParser
import retrofit2.Response

internal enum class ApiOperation {
    AUTH_LOGIN,
    AUTH_REGISTER,
    AUTH_REFRESH,
    VOCABULARY_LOOKUP,
    SAVED_MATCHES,
    USER_DEFINITION_CREATE,
    DECK_LIST,
    DECK_CREATE,
    CARD_CREATE,
    CARD_LIST,
    CARD_GET,
    REVIEW_SUMMARY,
    REVIEW_QUEUE,
    REVIEW_CHECK_ANSWER,
    REVIEW_CHECK_FORMS,
    REVIEW_REVEAL,
    REVIEW_GRADE,
    EXPORT_CREATE,
    EXPORT_RECORD,
    EXPORT_STATUS_LIST,
}

internal fun Response<*>.throwIfUnsuccessful(operation: ApiOperation) {
    if (!isSuccessful) throw mapApiFailure(code(), errorBody()?.string(), operation)
}

internal fun <T : Any> Response<T>.bodyOrThrow(operation: ApiOperation): T =
    body() ?: throw RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED, code())

internal fun mapApiFailure(
    statusCode: Int,
    body: String?,
    operation: ApiOperation,
): Exception {
    val message = backendMessage(body)
    return when (statusCode) {
        400 -> mapBadRequest(operation, message, statusCode)
        401 -> mapUnauthorized(operation, message)
        403 -> RemoteOperationFailureException(RemoteFailureKind.FORBIDDEN, statusCode)
        404 -> mapNotFound(operation, message, statusCode)
        409 -> mapConflict(operation, message, statusCode)
        429 -> RemoteOperationFailureException(RemoteFailureKind.RATE_LIMITED, statusCode)
        in 500..599 -> RemoteOperationFailureException(RemoteFailureKind.SERVICE_UNAVAILABLE, statusCode)
        else -> RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED, statusCode)
    }
}

private fun mapBadRequest(
    operation: ApiOperation,
    message: String?,
    statusCode: Int,
): Exception =
    when {
        operation == ApiOperation.VOCABULARY_LOOKUP && message == "INPUT_INVALID" -> LookupInputInvalidException()
        operation == ApiOperation.VOCABULARY_LOOKUP && message == "CONTEXT_TOO_LONG" -> ContextTooLongException()
        operation == ApiOperation.USER_DEFINITION_CREATE && message == "INPUT_INVALID" -> LookupInputInvalidException()
        else -> RemoteOperationFailureException(RemoteFailureKind.BAD_REQUEST, statusCode)
    }

private fun mapUnauthorized(
    operation: ApiOperation,
    message: String?,
): Exception =
    when (operation) {
        ApiOperation.AUTH_LOGIN ->
            if (message == "Invalid credentials") {
                InvalidCredentialsException()
            } else {
                RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED, 401)
            }
        ApiOperation.AUTH_REFRESH -> UnauthorizedException()
        ApiOperation.AUTH_REGISTER -> RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED, 401)
        else -> UnauthorizedException()
    }

private fun mapNotFound(
    operation: ApiOperation,
    message: String?,
    statusCode: Int,
): Exception =
    when {
        operation == ApiOperation.VOCABULARY_LOOKUP && message == "DEFINITIONS_NOT_FOUND" -> VocabularyNotFoundException()
        operation == ApiOperation.CARD_CREATE && message in setOf("DECK_NOT_FOUND", "DEFINITION_NOT_FOUND") -> StaleReferenceException()
        operation == ApiOperation.CARD_GET && message == "CARD_NOT_FOUND" -> StaleReferenceException()
        operation in reviewOperations && message in setOf("CARD_NOT_FOUND", "DECK_NOT_FOUND") -> StaleReferenceException()
        operation == ApiOperation.EXPORT_CREATE && message == "CARD_NOT_FOUND" -> StaleReferenceException()
        operation == ApiOperation.EXPORT_RECORD && message == "EXPORT_NOT_FOUND" -> StaleReferenceException()
        else -> RemoteOperationFailureException(RemoteFailureKind.NOT_FOUND, statusCode)
    }

private fun mapConflict(
    operation: ApiOperation,
    message: String?,
    statusCode: Int,
): Exception =
    when {
        operation == ApiOperation.AUTH_REGISTER && message == "Email already exists" -> AccountAlreadyExistsException()
        operation == ApiOperation.DECK_CREATE && message == "DECK_ALREADY_EXISTS" -> DeckConflictException()
        operation == ApiOperation.CARD_CREATE && message == "CARD_ALREADY_EXISTS" -> CardAlreadyExistsException()
        operation == ApiOperation.USER_DEFINITION_CREATE && message == "DEFINITION_ALREADY_EXISTS" -> DefinitionAlreadyExistsException()
        else -> RemoteOperationFailureException(RemoteFailureKind.CONFLICT, statusCode)
    }

private fun backendMessage(body: String?): String? =
    try {
        val element = body?.let(JsonParser::parseString) ?: return null
        if (!element.isJsonObject) return null
        val message = element.asJsonObject.get("message") ?: return null
        when {
            message.isJsonPrimitive && message.asJsonPrimitive.isString -> message.asString
            message.isJsonArray && message.asJsonArray.size() == 1 -> message.asJsonArray[0].asString
            else -> null
        }
    } catch (_: Exception) {
        null
    }

private val reviewOperations =
    setOf(
        ApiOperation.REVIEW_SUMMARY,
        ApiOperation.REVIEW_QUEUE,
        ApiOperation.REVIEW_CHECK_ANSWER,
        ApiOperation.REVIEW_CHECK_FORMS,
        ApiOperation.REVIEW_REVEAL,
        ApiOperation.REVIEW_GRADE,
    )
