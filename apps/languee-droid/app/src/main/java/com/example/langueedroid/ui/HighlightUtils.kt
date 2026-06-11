package com.example.langueedroid.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import com.example.langueedroid.domain.EntryValidator

fun buildHighlightedAnnotatedString(
    context: String,
    word: String,
    highlightStyle: SpanStyle,
): AnnotatedString = buildAnnotatedString {
    append(context)
    val ranges = EntryValidator.findStandaloneMatches(word, context)
    for (range in ranges) {
        addStyle(
            style = highlightStyle,
            start = range.first,
            end = range.last + 1,
        )
    }
}
