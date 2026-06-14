//noinspection MissingCopyrightHeader #8659
package com.ichi2.anki.api

internal class BasicModel {
    companion object {
        @JvmField
        var FIELDS = arrayOf("Front", "Back")

        @JvmField
        val CARD_NAMES = arrayOf("Card 1")

        @JvmField
        val QFMT = arrayOf("{{Front}}")

        @JvmField
        val AFMT = arrayOf(
            """{{FrontSide}}

        |<hr id="answer">

        |{{Back}}
            """.trimMargin()
        )
    }
}
