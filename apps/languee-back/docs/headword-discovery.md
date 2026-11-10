# Canonical headword discovery

`HeadwordDiscoveryService.discover` returns owning headword IDs and definitions
scoped to the selected spelling's validated POS relationships. Fetching any
candidate caches its complete supported independent POS inventory. The public
lookup selects one headword, preferring the contextual lemma when it is among
the resolved interpretations; it does not flatten other headwords into that lemma.

`MorphologyModule` registers the replaceable `MorphologyProvider` and exports
`MorphologyService`, which owns WordForm indexing, reverse lookup, and batched
paradigm projections. Dictionary discovery accesses lexical records through
`WordsService` and `DefinitionService`; its own persistence is limited to
LookupState. Cards obtain current morphology and new snapshots through
`MorphologyService`, keeping paradigm helpers internal to the morphology domain.

`MorphologyProvider` supplies POS-independent candidates and typed paradigms.
`NlpMorphologyAdapter` uses authenticated `/morphology/lemmas`,
`/morphology/inflections`, and `/morphology/inflections/batch` requests.
Lookup requests have a ten-second deadline and emit a warning after three
seconds in flight. None of these operations invokes spaCy.
Dictionary adapters may implement `fetchEntry` for structured references; the
legacy semantic-only `fetch` operation remains supported with empty references.

`dictionaryFetchedAt` is written after the exact spelling's definitions,
paradigms, and recognized reference dependencies are processed. A dependency
failure permits a conservative source refetch. `discoveryCompletedAt` is written
last, only for the selected spelling. Negative results need no `Word` row.
Uniqueness constraints and conflict-safe inserts make retries idempotent.

The migration removes definition morphology without backfilling unvalidated
historical JSON. Words, definitions, gap-fill metadata, cards, deck links, exports,
and review logs retain their identities. Existing card snapshots are never
rewritten. New lexical snapshots derive from WordForm at the canonical word/POS;
variant answers live in the optional snapshot `variants` map. Explicit spelling
aliases are excluded from grammatical answers and irregularity calculations.

The parser uses marked target links and a finite grammar of recognized references.
Conflicting links, unknown grammatical phrases and uncertain POS are unresolved.
An unmarked linked multiword cross-reference such as “Had better” is excluded;
ordinary linked semantic glosses remain definitions. This conservative heuristic
is not a general proof of semantic independence. New constructions need frozen
fixtures and explicit rules before becoming trusted mappings. The diagnostic
corpus is not evidence of full linguistic coverage or sense-specific morphology.

## Verification

From the monorepo root:

```sh
sh scripts/load-env.sh make cc languee-back
sh scripts/load-env.sh make cc languee-nlp
```

The PostgreSQL integration suite requires `HEADWORD_TEST_DATABASE_URL` pointing to
an **empty disposable PostgreSQL 18 database**. It applies the committed migrations,
seeds saved records before the morphology migration, and truncates test tables
between cases. Do not point it at an application database.

```sh
sh scripts/load-env.sh yarn --cwd apps/languee-back test:headwords
```

Fixtures in `src/modules/lexicon/enrichment/dictionary/fixtures` are frozen diagnostic payloads.
`corpus.json` records their provenance and the controlled acceptance cases.
Morphology tests cover both mocked exact resource output and installed
LemmInflect 0.2.3 output. Missing tags remain absent; controlled English cases
exercise orchestration independently of resource completeness.
