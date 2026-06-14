//noinspection MissingCopyrightHeader #8659
package com.ichi2.anki.api

internal object Basic2Model {
    @JvmField
    val FIELDS = arrayOf("Front", "Back")

    @JvmField
    val CARD_NAMES = arrayOf("Card 1", "Card 2")

    @JvmField
    internal val QFMT = arrayOf("{{Front}}", "{{Back}}")

    @JvmField
    internal val AFMT = arrayOf(
        """{{FrontSide}}

    |<hr id="answer">

    |{{Back}}
        """.trimMargin(),
        """{{FrontSide}}

    |<hr id="answer">

    |{{Front}}
        """.trimMargin()
    )
}
