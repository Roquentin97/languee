# Android Kotlin Rules

## Project Layout

Android app code lives under `apps/languee-droid/`.
Keep all file operations, imports, Gradle commands, and generated files relative to that
service path unless the Architect explicitly plans a root-level or cross-service change.

Prefer a conventional Android project layout:

```text
apps/languee-droid/
app/
  src/main/AndroidManifest.xml
  src/main/java/... or src/main/kotlin/...
  src/main/res/
  src/test/
  src/androidTest/
build.gradle.kts
settings.gradle.kts
gradle/libs.versions.toml
gradlew
```

Use Gradle Kotlin DSL (`*.gradle.kts`) and a version catalog when the project already has
one or when adding a new Android module.

## Kotlin Conventions

- Write Kotlin-first code: no unnecessary Java-style builders, mutable globals, or
  nullable values where a sealed state or explicit result type is clearer.
- Prefer immutable data classes and explicit UI/domain/data models.
- Do not use `!!` in production code. Handle nullability at the boundary where it appears.
- Keep public APIs typed explicitly when inference would hide an important contract.
- Use coroutines for async work. Inject `CoroutineDispatcher` or equivalent abstractions
  where deterministic tests need them.
- Expose observable state with `StateFlow` or `Flow` from view models and repositories.
- Avoid `GlobalScope`, raw threads, and blocking calls on the main dispatcher.

## Architecture

- Keep business logic out of Activities, Fragments, and Composables.
- Activities and Fragments should only wire lifecycle, navigation, dependency access, and
  top-level UI setup.
- ViewModels own screen state and user intents, not networking or persistence details.
- Repositories own data access and remote/local coordination.
- Use small mapper functions for API DTO to domain/UI transformations.
- Introduce use cases only when they remove real duplication or isolate meaningful
  business behavior.
- Keep packages grouped by feature when a feature owns UI, presentation, and data code.
  Use shared packages only for genuinely shared infrastructure.

## UI

Prefer Jetpack Compose and Material 3 for new UI unless the existing app is XML-based.

Compose rules:

- Composables should be deterministic functions of state and callbacks.
- Do not start network calls, database writes, or long-running work directly in
  Composables.
- Use lifecycle-aware collection from flows.
- Hoist state out of reusable Composables.
- Provide loading, empty, error, offline, and success states for user-facing flows.
- Add content descriptions for meaningful icons and images. Mark decorative visuals as
  decorative according to Android accessibility conventions.
- Keep user-facing strings in resources unless the surrounding project has a different
  established convention for generated or temporary UI text.

XML/View rules:

- Use ViewModels and lifecycle-aware observers.
- Keep adapters and view holders free of business logic.
- Put reusable styles, dimensions, and strings in resources.

## Networking And Contracts

- Treat `languee-back` API interactions as explicit cross-service contracts.
- The Architect must specify request shape, response shape, auth behavior, timeout
  behavior, retry policy, and error mapping before implementation.
- Keep transport DTOs separate from domain/UI models when the API shape is not identical
  to app behavior.
- Never silently swallow network or parsing errors. Map them to explicit user-facing or
  recoverable states.
- Do not hardcode backend URLs, credentials, API keys, or auth tokens in source.

## Persistence And Secrets

- Use Android DataStore for small app preferences and token-like app state unless the
  spec requires another store.
- Use Room for structured local relational data.
- Keep encryption, token storage, and credential handling explicit in the Architect plan
  before writing code.
- Never commit secrets. Use `local.properties`, Gradle properties, CI environment
  variables, or Android keystore-backed storage as appropriate.

## Dependencies

- Do not add libraries unless the spec or Architect names the need and the package solves
  a concrete project problem.
- Prefer Jetpack, KotlinX, and AndroidX libraries over custom infrastructure.
- Keep dependency versions pinned through the version catalog or Gradle plugin management.
- If adding a dependency, update the relevant Gradle file and lock/version catalog
  consistently.

## Testing

- Put JVM unit tests under `app/src/test/`.
- Put Android framework or device/emulator tests under `app/src/androidTest/`.
- Write unit tests for ViewModels, use cases, repositories, mappers, reducers, and error
  mapping.
- Use fake repositories or fake data sources for presentation tests.
- Mock network and platform boundaries, not internal business logic.
- Add Compose UI tests for critical screen behavior when Compose UI changes are user
  facing.
- Tests must cover every Architect edge case.

## Commands

Run commands from `apps/languee-droid/`.

- Format: `./gradlew ktlintFormat`. The Forge Android target expects ktlint to be
  configured for formatter support.
- Lint: `./gradlew lintDebug`
- Unit tests: `./gradlew testDebugUnitTest`
- Build: `./gradlew assembleDebug`
- Coverage: use the configured Gradle coverage task when present.

If detekt or coverage tasks are not configured, do not invent commands. Report the
missing command in the agent output and run the configured Android lint, unit test, and
build tasks. If `ktlintFormat` is missing, report it as a project configuration issue
because the Forge auto-lint step depends on it.

## Review Checklist

- No business logic in Android UI classes or Composables.
- State is explicit and covers loading, error, empty, and success states.
- Coroutine work is lifecycle-aware and testable.
- Nullability is handled without `!!`.
- Backend contracts match the Architect service contract.
- User-facing strings and accessibility labels are present where appropriate.
- Gradle changes are scoped to the Android app.
- Secrets and environment-specific values are not committed.
