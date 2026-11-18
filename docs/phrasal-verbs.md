# Contextual verb alternatives

Vocabulary capture supports English particle verbs, prepositional verbs and
three-part verbs, including separated components. Recognition uses the existing
`en_core_web_md` parser and dictionary-validated PostgreSQL lexical entries.
It does not recognize arbitrary idioms.

## Public lookup contract

`POST /api/v1/vocabulary/lookup` accepts `text`, `language`, optional `context`,
optional `selectionRanges`, `disablePosFiltering` and `includeSuggestions`
(default `true`). The former vocabulary GET request is removed. The separate
word-specific dictionary endpoint is unchanged. Backend and Android must be
released together.

Ranges are ordered, non-overlapping, half-open Unicode code-point offsets into
the exact supplied context, with one range per selected word. Joining the
selected components with single spaces must reconstruct `text`, allowing case
and NFC normalization. Validate offsets before normalizing text: normalization
can change its length. Manual lookup without context or ranges remains valid,
but cannot generate contextual alternatives. The existing capture/context
limits and six-word selection limit apply.

Lookup retains the original target and definitions. Its `alternatives` array
contains at most one optional action with surface `text`, canonical `lemma`,
nullable `entryId`, `selectionRanges`, `type`, `reason` and `prominence`.
A verb-only selection may offer a known contextual expression normally. An
expression with definitions may offer its base verb subtly; a dictionary miss
may offer that verb prominently. Provider failure is distinct from a dictionary
miss.

Android looks up an alternative using its surface components and exact ranges
with `includeSuggestions=false`. It preserves the original result while loading
and on failure, and provides a return action. Saves and evaluation choices use
the displayed target's lookup ID and definition.

## Discovery and ownership

Successful explicit expression lookups enrich the existing independent
`LexicalEntry` and definition records. Empty searches do not create recognition
entries. There is no initial expression inventory: lack of a suggestion can mean
the application has not learned the expression yet.

The backend owns dictionary enrichment, PostgreSQL access and orchestration.
It retrieves known `phrasal_verb` and `expression` entry IDs and canonical labels
in one language-scoped, escaped prefix query for the head lemma plus a space.
A B-tree index with `text_pattern_ops` supports this query. Definitions are
fetched only when the learner selects an alternative.

NLP owns occurrence analysis and contextual matching. `POST /analyze` accepts
`selection_ranges` and returns `selection_analysis` alongside the existing
analysis. Explicit offsets disambiguate repeated words. `POST /match-expressions`
accepts the original context, selected verb range and known candidates. It
matches ordered components in that verb's sentence with dependency evidence
and conservative object filters, ranking by component count, occurrence span,
then canonical text. Each endpoint parses its context once; there is no
cross-request parse cache. Morphology endpoints and Basic authentication remain
unchanged.

Candidate matching is optional, with a two-second request timeout and no retry.
A matcher failure leaves the original lookup available without an expression
suggestion. Syntactic attachment is evidence of a construction, not certainty
about its meaning; normal alternatives avoid claiming the original is wrong.
Dictionary-listed literal and directional senses are eligible.

## Capture and review

Cloze cards retain occurrence-specific `targetRanges` JSONB on the capture,
independently of shared definitions. Explicit ranges mask exactly the selected
components while leaving intervening objects and repeated occurrences visible.
One answer field accepts their joined surface text alongside existing accepted
canonical and inflected forms. Captures without ranges retain legacy masking.

An eligible expression can share an inflection card with its base verb. NLP
resolves the head lemma, and the existing dictionary/morphology path validates
the base entry before applying existing eligibility and deduplication rules.
There is no mandatory expression-to-base-entry foreign key. Optional base-verb
enrichment failure does not block saving the expression's meaning.
If a retry cannot resolve that optional base, its response can contain only the
meaning cards; an existing shared inflection card and its deck memberships remain
intact.

Android persists chosen target ranges through offline capture and pending-save
retries. Lexical evaluation retains multiple component ranges. PostgreSQL and
Room schema changes must be applied with their respective migrations; shared
databases must not be reset for development validation.

## Evaluation

The research corpora are regression fixtures, not a production inventory or an
independently adjudicated gold standard. Preserve original annotations and
record dictionary-backed corrections explicitly. Report suggestion precision,
recall and timing separately from inventory coverage. Naturally occurring
ambiguous prepositions and parser attachment errors remain limitations of the
lexical-plus-syntax approach.

The [matcher report](../apps/languee-nlp/benchmarks/expression-matching/report.md)
scores 104 verb-only cases. With 30 candidate entries derived from those labels,
exact precision is 72/74 (97.3%) and recall 72/73 (98.6%). This optimistic candidate
set measures matching with known entries. The separate 16-entry historical fixture
has precision 47/49 (95.9%) and recall 47/73 (64.4%), with 26 inventory misses.
The closed-set miss is `handed their reports in`, rejected by the conservative
object filter. Both sets make two ambiguous `run into` suggestions. These results
are regression evidence, not production accuracy estimates.

An actual-model HTTP smoke run covered adjacent and separated `turn off`,
`gave it up`, `depend on`, longest-match `put up with`, a repeated verb's second
occurrence, clause/sentence rejection, and emoji plus decomposed Unicode
context. Warm `/analyze` calls took roughly 10–12 ms and `/match-expressions`
6–8 ms in this small local run; the first analysis call took 216 ms, including
initialization. These are endpoint measurements, not full application timings.
One explicit residual ambiguity is `She looked after lunch.`: a known
`look after` candidate passes the syntax filters even when the intended
reading is temporal. The normal alternative action leaves the original lookup
available; syntax alone does not resolve this meaning.

The database-backed growth integration uses real NLP HTTP requests and PostgreSQL
with a deterministic in-process dictionary provider. One measured sequence took
127 ms for the initial verb lookup without an expression candidate, 40 ms for
the explicit expression lookup that persisted its definitions, and 38 ms for
the later verb lookup with a contextual suggestion. These are service-level
observations from one local run, excluding the backend HTTP boundary, Android,
and external provider/network latency.

### PostgreSQL validation

The complete migration chain was applied to an empty PostgreSQL 18 database.
An upgrade database also retained a pre-existing evaluation capture as
`[{"start":0,"end":4}]` after converting its former scalar offsets. Validation
used a separate disposable container, without modifying shared databases.

The emitted Prisma candidate query was checked on 100,008 synthetic entries
across two languages and all entry kinds. It retrieves IDs and labels in one
parameterized SELECT, filtering on language and eligible kinds. For the `turn `
prefix, `EXPLAIN (ANALYZE, BUFFERS)` selected
`lexical_entries_language_lemma_prefix_idx`, read four index/heap buffer hits,
and returned the two eligible English entries. Query execution was 0.134 ms
on that run; warm service calls for escaped-prefix probes were 1.2–1.7 ms.
These small local measurements exclude NLP and dictionary requests and are
not a production latency estimate.

Literal `%`, `_` and backslash probes each returned only the matching literal
prefix, with the same index selected. Entry uniqueness remains enforced by
the separate `(lemma, language)` unique index, independently of kind.
Prisma introspection omits the B-tree operator class, so the SQL migration owns
`text_pattern_ops` and the Prisma schema represents the named index without
the operator-class annotation. The migrated database reports no Prisma schema
drift with that representation.

### Executed checks

The delivery impact and working-tree checks selected backend, NLP and Android,
with no unresolved impact. All three `make cc` targets passed. The unit suites
passed 842 backend tests, 230 NLP tests and 469 Android tests.

Additional executable checks passed 15 vocabulary HTTP contract tests, seven
card-capture HTTP contract tests, the real PostgreSQL/NLP growth integration,
and the repeated-occurrence backend/NLP integration. An isolated Android 15
emulator passed eight instrumentation tests: two Room migration tests, one
alternative-action UI test and five capture workspace tests. The migration
tests include a discontinuous pending capture with its chosen definition,
lookup ID, ranges and disabled recursive suggestions.

The regression suite also covers saving during an alternative request and
attempted target changes while saving: the save uses an immutable capture
snapshot and cancels the optional request before it can replace the result.
