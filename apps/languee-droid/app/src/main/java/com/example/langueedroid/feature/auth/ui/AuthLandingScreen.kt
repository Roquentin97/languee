package com.example.langueedroid.feature.auth.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.langueedroid.core.ui.theme.GreenBorder
import com.example.langueedroid.core.ui.theme.GreenPrimary
import com.example.langueedroid.core.ui.theme.LoraFontFamily
import com.example.langueedroid.core.ui.theme.TextPrimary
import com.example.langueedroid.core.ui.theme.TextSecondary

@Composable
fun AuthLandingScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToRegister: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(GreenPrimary),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(top = 56.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(26.dp))
                    .background(Color.White.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                LangueeLeafIcon(
                    modifier = Modifier.size(44.dp),
                    leafColor = Color.White,
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Languee",
                fontFamily = LoraFontFamily,
                fontSize = 40.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                color = Color.White,
                letterSpacing = (-1.5).sp,
                lineHeight = 44.sp,
            )
            Spacer(modifier = Modifier.height(13.dp))
            Text(
                text = "Capture words. Build vocabulary.\nExport to AnkiDroid.",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.58f),
                textAlign = TextAlign.Center,
                lineHeight = 23.sp,
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .clip(RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp))
                .background(Color.White)
                .padding(start = 24.dp, end = 24.dp, top = 28.dp, bottom = 32.dp),
        ) {
            Text(
                text = "Get started",
                style = MaterialTheme.typography.headlineSmall,
                color = TextPrimary,
            )
            Spacer(modifier = Modifier.height(5.dp))
            Text(
                text = "Sign in or create a free account",
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
            )
            Spacer(modifier = Modifier.height(22.dp))
            Button(
                onClick = onNavigateToLogin,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = GreenPrimary),
            ) {
                Text(
                    text = "Sign in",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedButton(
                onClick = onNavigateToRegister,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(14.dp),
                border = androidx.compose.foundation.BorderStroke(1.5.dp, GreenBorder),
            ) {
                Text(
                    text = "Create account",
                    style = MaterialTheme.typography.labelLarge,
                    color = GreenPrimary,
                )
            }
        }
    }
}

@Composable
internal fun LangueeLeafIcon(
    modifier: Modifier = Modifier,
    leafColor: Color = GreenPrimary,
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val scale = minOf(w, h) / 44f

        val leafPath = Path().apply {
            moveTo(w * 0.5f, h * 0.114f)
            cubicTo(w * 0.341f, h * 0.114f, w * 0.227f, h * 0.284f, w * 0.227f, h * 0.477f)
            cubicTo(w * 0.227f, h * 0.648f, w * 0.341f, h * 0.795f, w * 0.5f, h * 0.841f)
            cubicTo(w * 0.608f, h * 0.705f, w * 0.670f, h * 0.511f, w * 0.670f, h * 0.352f)
            cubicTo(w * 0.670f, h * 0.193f, w * 0.608f, h * 0.114f, w * 0.5f, h * 0.114f)
            close()
        }
        drawPath(leafPath, leafColor.copy(alpha = leafColor.alpha * 0.92f))

        drawLine(
            color = leafColor.copy(alpha = leafColor.alpha * 0.5f),
            start = Offset(w * 0.5f, h * 0.841f),
            end = Offset(w * 0.5f, h * 0.432f),
            strokeWidth = 2.2f * scale,
            cap = StrokeCap.Round,
        )
    }
}
