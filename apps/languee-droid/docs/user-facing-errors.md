# Android user-facing error mapping

The Android client maps Retrofit failures to typed, operation-scoped errors in
`core/data/ApiFailureMapper.kt`. It reads only the backend `message` field for
verified contracts. Unknown, malformed, or route-level error bodies stay generic;
backend response text and exception messages are not shown in the UI.

| Operation | Verified response | Client behavior | Recovery |
| --- | --- | --- | --- |
| Mobile login | `401`, `message: "Invalid credentials"` | Inline invalid-credentials message; retain email/password and stay on login | Correct credentials and submit again |
| Mobile login | Any other `401` body | Generic service error; never infer invalid credentials from status alone | Retry after checking connectivity/service status |
| Mobile refresh | `401` for invalid or expired refresh token | Clear the rejected session and require sign-in with an explanation | Sign in again |
| Mobile refresh | Connection, timeout, `429`, or `5xx` | Preserve stored session and show retry/sign-in choice | Retry refresh or explicitly sign in |
| Vocabulary lookup | `404`, `message: "DEFINITIONS_NOT_FOUND"` | Dictionary miss; open the manual-definition form where supported | Add a definition or return to the lookup |
| Vocabulary lookup | Route-level `Cannot POST ...`, unknown or malformed `404` | Service/route failure, never a dictionary miss | Retry later |
| Vocabulary lookup | `400`, `INPUT_INVALID` or `CONTEXT_TOO_LONG` | Explain the selection/context constraint | Shorten or simplify the input |
| User definition | `409`, `DEFINITION_ALREADY_EXISTS` | Explain that the definition exists and refresh the lookup | Choose the existing definition |
| Deck creation | `409`, `DECK_ALREADY_EXISTS` | Keep the create dialog and draft open with a name-specific message | Choose another name |
| Card creation | `409`, `CARD_ALREADY_EXISTS` | Mark the selected definition as already saved | Choose another deck/definition |
| Card creation | `404`, `DECK_NOT_FOUND` or `DEFINITION_NOT_FOUND` | Explain that a selected reference became stale; reload available decks | Select a current deck/definition |
| Card/review/export reads | Verified `CARD_NOT_FOUND`, `DECK_NOT_FOUND`, or `EXPORT_NOT_FOUND` | Show a stale/missing-item message; do not label arbitrary 404s as absent data | Return and refresh the list |
| Review answer check | Connection or retryable service failure | Preserve typed answers/forms and offer a safe retry of the same read/check | Retry without re-entering the answer |
| Review grade/reveal-grade | Any ambiguous failure | Explain that the grade may have been saved; do not offer a blind duplicate grade | Return to decks and refresh the queue |
| Pending export sync | Failure to load pending records or decks | Show a sync failure; never show “up to date” for an unsuccessful read | Retry sync |
| AnkiDroid setup | Setup is incomplete | Explain setup is required and open integration settings | Complete setup, then retry |
| Remaining API failures | `400`, `403`, unknown `404`/`409`, `429`, `5xx`, or unexpected response | Use localized, safe copy with operation context | Retry only for reads or retry-safe actions |

Connection errors are identified from `IOException` causes, including timeouts.
`401` on authenticated requests still follows the existing authenticator flow;
only a rejected refresh token expires the session. A transient refresh failure is
surfaced as an I/O failure and does not force logout. When an authenticated request
does prove the session expired, the login dialog is shown over the still-composed
main screen so capture and review input remain available after sign-in.

`core/ui/components/ErrorMessage.kt` provides the shared live-region text treatment
for screen and inline failures. It uses normal Compose text measurement and typography
so long messages wrap at narrow widths and follow the system font scale. Form errors
remain by their form; retry buttons are shown only where the operation is safe to
repeat.
