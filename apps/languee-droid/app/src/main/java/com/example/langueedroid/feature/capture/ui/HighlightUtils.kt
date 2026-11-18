package com.example.langueedroid.feature.capture.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import com.example.langueedroid.core.domain.EntryValidator
import com.example.langueedroid.core.domain.SelectionRange
import com.example.langueedroid.core.domain.SelectionRanges

fun buildHighlightedAnnotatedString(
    context: String,
    word: String,
    highlightStyle: SpanStyle,
): AnnotatedString =
    buildAnnotatedString {
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

fun buildHighlightedAnnotatedString(
    context: String,
    ranges: List<SelectionRange>,
    highlightStyle: SpanStyle,
): AnnotatedString =
    buildAnnotatedString {
        append(context)
        ranges.mapNotNull { SelectionRanges.toUtf16Range(context, it) }.forEach { range ->
            addStyle(highlightStyle, range.first, range.last + 1)
        }
    }
