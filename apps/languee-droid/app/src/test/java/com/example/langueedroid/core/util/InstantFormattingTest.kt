package com.example.langueedroid.core.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class InstantFormattingTest {
    private fun utcMillis(
        year: Int,
        month: Int,
        day: Int,
        hour: Int,
        minute: Int,
        second: Int,
        millis: Int,
    ): Long {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US)
        cal.clear()
        cal.set(year, month, day, hour, minute, second)
        cal.set(Calendar.MILLISECOND, millis)
        return cal.timeInMillis
    }

    @Test
    fun `parses ISO UTC instant with milliseconds`() {
        val expected = utcMillis(2026, Calendar.JULY, 24, 13, 54, 38, 936)
        assertEquals(expected, parseIsoInstantToEpochMillis("2026-07-24T13:54:38.936Z"))
    }

    @Test
    fun `parses ISO UTC instant without milliseconds`() {
        val expected = utcMillis(2026, Calendar.JULY, 24, 13, 54, 38, 0)
        assertEquals(expected, parseIsoInstantToEpochMillis("2026-07-24T13:54:38Z"))
    }

    @Test
    fun `returns null for unparseable input`() {
        assertNull(parseIsoInstantToEpochMillis("not-a-timestamp"))
        assertNull(parseIsoInstantToEpochMillis(""))
    }
}
