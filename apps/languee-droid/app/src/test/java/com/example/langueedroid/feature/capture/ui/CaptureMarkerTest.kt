package com.example.langueedroid.feature.capture.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class CaptureMarkerTest {
    @Test
    fun `completed occurrence overrides saved headword without affecting other occurrences`() {
        val completed = setOf(0)
        val saved = setOf("bank")
        assertEquals(CaptureMarker.COMPLETED, captureMarker(0, "Bank", completed, saved))
        assertEquals(CaptureMarker.SAVED, captureMarker(4, "bank", completed, saved))
        assertEquals(CaptureMarker.NONE, captureMarker(6, "banker", completed, saved))
    }
}
