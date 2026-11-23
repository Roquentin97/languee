package com.example.langueedroid.core.data

import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RemoteOperationFailureException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.google.gson.JsonParser
import retrofit2.Response

internal fun Response<*>.throwIfUnsuccessful(specificFailure: (Int, String?) -> Exception? = { _, _ -> null }) {
    if (!isSuccessful) {
        val status = code()
        val message = backendMessage(errorBody()?.string())
        throw specificFailure(status, message) ?: mapApiFailure(status)
    }
}

internal fun <T : Any> Response<T>.bodyOrThrow(): T = body() ?: throw RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED, code())

internal fun mapApiFailure(statusCode: Int): Exception =
    when (statusCode) {
        400 -> RemoteOperationFailureException(RemoteFailureKind.BAD_REQUEST, statusCode)
        401 -> UnauthorizedException()
        403 -> RemoteOperationFailureException(RemoteFailureKind.FORBIDDEN, statusCode)
        404 -> RemoteOperationFailureException(RemoteFailureKind.NOT_FOUND, statusCode)
        409 -> RemoteOperationFailureException(RemoteFailureKind.CONFLICT, statusCode)
        429 -> RemoteOperationFailureException(RemoteFailureKind.RATE_LIMITED, statusCode)
        in 500..599 -> RemoteOperationFailureException(RemoteFailureKind.SERVICE_UNAVAILABLE, statusCode)
        else -> RemoteOperationFailureException(RemoteFailureKind.UNEXPECTED, statusCode)
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
