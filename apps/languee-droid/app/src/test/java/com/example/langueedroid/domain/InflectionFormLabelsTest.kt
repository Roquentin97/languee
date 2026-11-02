package com.example.langueedroid.domain

import com.example.langueedroid.core.domain.InflectionFormLabels
import com.languee.droid.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InflectionFormLabelsTest {
    // -------------------------------------------------------------------------
    // resourceFor - known keys
    // -------------------------------------------------------------------------

    @Test
    fun `resourceFor maps positive to its label resource`() {
        assertEquals(R.string.inflection_form_positive, InflectionFormLabels.resourceFor("positive"))
    }

    @Test
    fun `resourceFor maps comparative to its label resource`() {
        assertEquals(R.string.inflection_form_comparative, InflectionFormLabels.resourceFor("comparative"))
    }

    @Test
    fun `resourceFor maps superlative to its label resource`() {
        assertEquals(R.string.inflection_form_superlative, InflectionFormLabels.resourceFor("superlative"))
    }

    @Test
    fun `resourceFor maps base to its label resource`() {
        assertEquals(R.string.inflection_form_base, InflectionFormLabels.resourceFor("base"))
    }

    @Test
    fun `resourceFor maps past to its label resource`() {
        assertEquals(R.string.inflection_form_past, InflectionFormLabels.resourceFor("past"))
    }

    @Test
    fun `resourceFor maps present3sg to its label resource`() {
        assertEquals(R.string.inflection_form_present3sg, InflectionFormLabels.resourceFor("present3sg"))
    }

    @Test
    fun `resourceFor maps presentNon3sg to its label resource`() {
        assertEquals(
            R.string.inflection_form_present_non3sg,
            InflectionFormLabels.resourceFor("presentNon3sg"),
        )
    }

    @Test
    fun `resourceFor maps pastParticiple to its label resource`() {
        assertEquals(
            R.string.inflection_form_past_participle,
            InflectionFormLabels.resourceFor("pastParticiple"),
        )
    }

    @Test
    fun `resourceFor maps gerundParticiple to its label resource`() {
        assertEquals(
            R.string.inflection_form_gerund_participle,
            InflectionFormLabels.resourceFor("gerundParticiple"),
        )
    }

    @Test
    fun `resourceFor maps singular to its label resource`() {
        assertEquals(R.string.inflection_form_singular, InflectionFormLabels.resourceFor("singular"))
    }

    @Test
    fun `resourceFor maps plural to its label resource`() {
        assertEquals(R.string.inflection_form_plural, InflectionFormLabels.resourceFor("plural"))
    }

    @Test
    fun `resourceFor maps contextForm to its label resource`() {
        assertEquals(
            R.string.inflection_form_context_form,
            InflectionFormLabels.resourceFor("contextForm"),
        )
    }

    // -------------------------------------------------------------------------
    // resourceFor - unknown keys
    // -------------------------------------------------------------------------

    @Test
    fun `resourceFor returns null for an unmapped key`() {
        assertNull(InflectionFormLabels.resourceFor("someNewKey"))
    }

    @Test
    fun `resourceFor returns null for the type discriminator key`() {
        assertNull(InflectionFormLabels.resourceFor("type"))
    }

    // -------------------------------------------------------------------------
    // humanize - fallback for keys with no explicit mapping
    // -------------------------------------------------------------------------

    @Test
    fun `humanize splits camelCase into capitalized words`() {
        assertEquals("Some New Key", InflectionFormLabels.humanize("someNewKey"))
    }

    @Test
    fun `humanize splits snake_case into capitalized words`() {
        assertEquals("Some New Key", InflectionFormLabels.humanize("some_new_key"))
    }

    @Test
    fun `humanize capitalizes a single lowercase word`() {
        assertEquals("Diminutive", InflectionFormLabels.humanize("diminutive"))
    }

    @Test
    fun `humanize returns blank input unchanged`() {
        assertEquals("", InflectionFormLabels.humanize(""))
    }
}
