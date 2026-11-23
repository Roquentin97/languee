package com.example.langueedroid.data

import com.example.langueedroid.core.data.mapApiFailure
import com.example.langueedroid.core.domain.RemoteFailureKind
import com.example.langueedroid.core.domain.RemoteOperationFailureException
import com.example.langueedroid.core.domain.UnauthorizedException
import com.example.langueedroid.core.domain.remoteFailureKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.SocketTimeoutException

class ApiFailureMapperTest {
    @Test
    fun `common failures map to safe categories`() {
        assertTrue(mapApiFailure(401) is UnauthorizedException)
        assertEquals(RemoteFailureKind.BAD_REQUEST, (mapApiFailure(400) as RemoteOperationFailureException).kind)
        assertEquals(RemoteFailureKind.SERVICE_UNAVAILABLE, (mapApiFailure(503) as RemoteOperationFailureException).kind)
        assertEquals(RemoteFailureKind.CONNECTION, SocketTimeoutException("private timeout detail").remoteFailureKind())
    }
}
