// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    id("dev.detekt") version "2.0.0-alpha.6" apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ktlint) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
}