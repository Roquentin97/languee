package com.example.langueedroid.core.domain

import com.languee.droid.R

/**
 * Maps the raw inflection-form keys returned by the backend (see
 * `apps/languee-back/src/modules/dictionary/types/inflection-forms.types.ts`)
 * to human-readable display labels for the definition-lookup and review
 * screens. Pure and unit-testable: no Android Context or Composable state is
 * required to resolve a key to either a string resource id or a fallback
 * label.
 */
object InflectionFormLabels {
    private val KNOWN_KEYS: Map<String, Int> =
        mapOf(
            "positive" to R.string.inflection_form_positive,
            "comparative" to R.string.inflection_form_comparative,
            "superlative" to R.string.inflection_form_superlative,
            "base" to R.string.inflection_form_base,
            "past" to R.string.inflection_form_past,
            "present3sg" to R.string.inflection_form_present3sg,
            "presentNon3sg" to R.string.inflection_form_present_non3sg,
            "pastParticiple" to R.string.inflection_form_past_participle,
            "gerundParticiple" to R.string.inflection_form_gerund_participle,
            "singular" to R.string.inflection_form_singular,
            "plural" to R.string.inflection_form_plural,
            "contextForm" to R.string.inflection_form_context_form,
        )

    /**
     * Returns the string resource id for [key]'s human-readable label, or
     * `null` when [key] has no explicit mapping. Callers should fall back to
     * [humanize] in that case.
     */
    fun resourceFor(key: String): Int? = KNOWN_KEYS[key]

    /**
     * Produces a readable label for a key with no explicit mapping by
     * splitting camelCase/snake_case words and capitalizing each one, e.g.
     * "someNewKey" becomes "Some New Key" and "some_new_key" becomes the same.
     */
    fun humanize(key: String): String {
        if (key.isBlank()) return key
        return key
            .replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
            .split(' ', '_', '-')
            .filter { it.isNotBlank() }
            .joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }
    }
}
