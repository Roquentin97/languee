package com.example.langueedroid.core.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.example.langueedroid.core.audio.Speaker
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.languee.droid.R

/**
 * Small icon button that speaks [text] in [languageCode] via [speaker] when tapped.
 * Reused next to the target word on card creation and next to the accepted answer on a
 * correct review — never on the review question, where the masked target would leak the
 * answer.
 */
@Composable
fun SpeakerIconButton(
    text: String,
    languageCode: String,
    speaker: Speaker,
    modifier: Modifier = Modifier,
) {
    IconButton(
        onClick = { speaker.speak(text, languageCode) },
        modifier = modifier,
    ) {
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = stringResource(R.string.tts_pronounce_description),
            tint = GreenPrimary,
        )
    }
}
