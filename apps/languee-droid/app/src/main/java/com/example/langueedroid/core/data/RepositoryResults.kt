package com.example.langueedroid.core.data

import kotlinx.coroutines.CancellationException

/** Matches Result's ergonomics without turning coroutine cancellation into a user error. */
internal suspend inline fun <T> runCatchingCancellable(crossinline block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        Result.failure(error)
    }
