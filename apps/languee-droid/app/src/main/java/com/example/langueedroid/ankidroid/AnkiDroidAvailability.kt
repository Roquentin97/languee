package com.example.langueedroid.ankidroid

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.ichi2.anki.api.AddContentApi

object AnkiDroidAvailability {
    fun isInstalled(context: Context): Boolean =
        runCatching {
            context.packageManager.getPackageInfo("com.ichi2.anki", 0)
            true
        }.getOrDefault(false)

    fun isApiAvailable(context: Context): Boolean =
        runCatching {
            AddContentApi.getAnkiDroidPackageName(context) != null
        }.getOrDefault(false)

    fun checkPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            "com.ichi2.anki.permission.READ_WRITE_DATABASE",
        ) == PackageManager.PERMISSION_GRANTED
}
