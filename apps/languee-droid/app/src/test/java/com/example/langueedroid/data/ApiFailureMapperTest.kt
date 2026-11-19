package com.example.langueedroid.data

import com.example.langueedroid.core.data.ApiOperation
import com.example.langueedroid.core.data.mapApiFailure
import com.example.langueedroid.core.domain.InvalidCredentialsException
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RemoteOperationFailureException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.VocabularyNotFoundException
import com.example.langueedroid.core.domain.remoteFailureKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.SocketTimeoutException

class ApiFailureMapperTest {
    @Test
    fun `login maps only verified invalid credentials response`() {
        val invalidCredentials = mapApiFailure(401, """{"message":"Invalid credentials"}""", ApiOperation.AUTH_LOGIN)
        val unknownUnauthorized = mapApiFailure(401, """{"message":"Unauthorized"}""", ApiOperation.AUTH_LOGIN)

        assertTrue(invalidCredentials is InvalidCredentialsException)
        assertEquals(RemoteFailureKind.UNEXPECTED, (unknownUnauthorized as RemoteOperationFailureException).kind)
        assertEquals(401, unknownUnauthorized.statusCode)
    }

    @Test
    fun `refresh unauthorized maps to expired session`() {
        val error = mapApiFailure(401, "{}", ApiOperation.AUTH_REFRESH)

        assertTrue(error is UnauthorizedException)
    }

    @Test
    fun `lookup maps exact dictionary miss but not route or malformed 404`() {
        val dictionaryMiss =
            mapApiFailure(
                404,
                """{"message":"DEFINITIONS_NOT_FOUND","statusCode":404}""",
                ApiOperation.VOCABULARY_LOOKUP,
            )
        val routeMiss =
            mapApiFailure(
                404,
                """{"message":"Cannot POST /api/v1/vocabulary/lookup","statusCode":404}""",
                ApiOperation.VOCABULARY_LOOKUP,
            )
        val malformed = mapApiFailure(404, "not-json", ApiOperation.VOCABULARY_LOOKUP)

        assertTrue(dictionaryMiss is VocabularyNotFoundException)
        assertEquals(RemoteFailureKind.NOT_FOUND, (routeMiss as RemoteOperationFailureException).kind)
        assertEquals(404, routeMiss.statusCode)
        assertEquals(RemoteFailureKind.NOT_FOUND, (malformed as RemoteOperationFailureException).kind)
    }

    @Test
    fun `connection timeout and server failures have safe typed categories`() {
        val badRequest = mapApiFailure(400, "{}", ApiOperation.VOCABULARY_LOOKUP)
        val serverFailure = mapApiFailure(503, "{}", ApiOperation.VOCABULARY_LOOKUP)

        assertEquals(RemoteFailureKind.BAD_REQUEST, (badRequest as RemoteOperationFailureException).kind)
        assertEquals(RemoteFailureKind.SERVICE_UNAVAILABLE, (serverFailure as RemoteOperationFailureException).kind)
        assertEquals(RemoteFailureKind.CONNECTION, SocketTimeoutException("private timeout detail").remoteFailureKind())
    }
}
