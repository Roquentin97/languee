package com.example.langueedroid.ankidroid

object NoteTypeTemplates {
    const val LEGACY_LANGUEE_TYPE_IN_VOCABULARY = "Languee Type-in Vocabulary"
    const val LEGACY_LANGUEE_TYPE_IN_INFLECTIONS = "Languee Type-in Inflections Vocabulary"
    const val LANGUEE_TYPE_IN_VOCABULARY = "Languee Mobile Native Type Vocabulary"
    const val LANGUEE_BASIC_REVERSED = "Languee Basic + Reversed Vocabulary"
    const val TEMPLATE_VERSION = "4"

    val SHARED_FIELDS =
        arrayOf(
            "Lemma",
            "Pronunciation",
            "PartOfSpeech",
            "Definition",
            "Example",
            "CleanInflections",
            "TypeLabels",
            "TypeAnswer",
            "LangueeCardId",
        )

    fun normalizeNoteTypeName(noteTypeName: String): String =
        when (noteTypeName) {
            LEGACY_LANGUEE_TYPE_IN_VOCABULARY,
            LEGACY_LANGUEE_TYPE_IN_INFLECTIONS,
            -> LANGUEE_TYPE_IN_VOCABULARY
            else -> noteTypeName
        }

    const val CSS = """
.card {
  color: #1f2933;
  font-family: Arial, sans-serif;
  font-size: 20px;
  line-height: 1.45;
  text-align: left;
}

.languee-card {
  margin: 0 auto;
  max-width: 42rem;
}

.languee-section {
  margin: 0 0 1rem;
}

.languee-label {
  color: #667085;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.languee-definition {
  font-size: 22px;
  font-weight: 600;
}

.languee-lemma-row {
  align-items: baseline;
  display: flex;
  gap: 8px;
  justify-content: flex-start;
}

.languee-lemma {
  font-size: 28px;
  font-weight: 700;
}

.languee-ipa {
  color: #475467;
  font-size: 19px;
  white-space: nowrap;
}

.languee-inflections {
  white-space: pre-line;
}

.languee-example {
  border-left: 3px solid #98a2b3;
  color: #344054;
  padding-left: 12px;
}

.type-labels {
  color: #344054;
  font-size: 17px;
  font-weight: 700;
}

.type-hint {
  color: #667085;
  font-size: 15px;
  margin-top: 6px;
}

#typeans {
  display: block;
  font-size: 22px;
  margin-top: 8px;
  text-align: left;
  width: 100%;
}

hr#answer {
  border: 0;
  border-top: 1px solid #d0d5dd;
  margin: 24px 0;
}
"""

    private const val ANSWER_DETAILS = """
<div class="languee-card">
  <div class="languee-section">
    <div class="languee-label">Definition</div>
    <div class="languee-definition">{{Definition}}</div>
  </div>
  {{#Example}}
  <div class="languee-section">
    <div class="languee-label">Example</div>
    <div class="languee-example">{{Example}}</div>
  </div>
  {{/Example}}
  <div class="languee-section">
    <div class="languee-label">Lemma</div>
    <div class="languee-lemma-row">
      <div class="languee-lemma">{{Lemma}}</div>
      {{#Pronunciation}}<div class="languee-ipa">{{Pronunciation}}</div>{{/Pronunciation}}
    </div>
  </div>
  {{#CleanInflections}}
  <div class="languee-section">
    <div class="languee-label">Inflections</div>
    <div class="languee-inflections">{{CleanInflections}}</div>
  </div>
  {{/CleanInflections}}
</div>
"""

    private const val DEFINITION_TYPE_PROMPT = """
<div class="languee-card">
  <div class="languee-section">
    <div class="languee-label">Definition</div>
    <div class="languee-definition">{{Definition}}</div>
  </div>
  <div class="languee-section">
    <div class="languee-label">Answer pattern</div>
    <div class="type-labels">{{TypeLabels}}</div>
    <div class="type-hint">Separate answers with spaces.</div>
  </div>
  {{type:TypeAnswer}}
</div>
"""

    private const val LEMMA_PROMPT = """
<div class="languee-card">
  <div class="languee-section">
    <div class="languee-label">Lemma</div>
    <div class="languee-lemma">{{Lemma}}</div>
  </div>
  {{#CleanInflections}}
  <div class="languee-section">
    <div class="languee-label">Inflections</div>
    <div class="languee-inflections">{{CleanInflections}}</div>
  </div>
  {{/CleanInflections}}
</div>
"""

    private const val DEFINITION_PROMPT = """
<div class="languee-card">
  <div class="languee-section">
    <div class="languee-label">Definition</div>
    <div class="languee-definition">{{Definition}}</div>
  </div>
</div>
"""

    // Interleaved [front1, back1, front2, back2] format.
    val TYPE_IN_CARDS =
        arrayOf(
            DEFINITION_TYPE_PROMPT,
            "{{FrontSide}}\n<hr id=\"answer\">\n$ANSWER_DETAILS",
            LEMMA_PROMPT,
            ANSWER_DETAILS,
        )

    val BASIC_REVERSED_CARDS =
        arrayOf(
            LEMMA_PROMPT,
            ANSWER_DETAILS,
            DEFINITION_PROMPT,
            ANSWER_DETAILS,
        )
}
