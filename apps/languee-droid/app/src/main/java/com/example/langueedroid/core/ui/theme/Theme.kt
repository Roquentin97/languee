package com.example.langueedroid.core.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = GreenPrimary,
    onPrimary = Color.White,
    primaryContainer = GreenContainer,
    onPrimaryContainer = GreenPrimaryDark,
    secondary = GreenAccent,
    onSecondary = Color.White,
    secondaryContainer = GreenHighlight,
    onSecondaryContainer = GreenPrimaryDark,
    tertiary = Color(0xFF3A5842),
    onTertiary = Color.White,
    background = SurfaceWarm,
    onBackground = TextPrimary,
    surface = Color.White,
    onSurface = TextPrimary,
    surfaceVariant = Color(0xFFF0EDE8),
    onSurfaceVariant = TextSecondary,
    outline = DividerLight,
    outlineVariant = CardBorder,
    error = Color(0xFFD32F2F),
    onError = Color.White,
    errorContainer = Color(0xFFFFEDEB),
    onErrorContainer = Color(0xFFB71C1C),
)

@Composable
fun LangueeDroidTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = Typography,
        content = content,
    )
}
