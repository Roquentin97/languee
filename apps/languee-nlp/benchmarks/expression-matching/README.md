# Expression matcher regression fixtures

These fixtures carry the previously researched 60-case corpus, 48-case follow-up,
and 40-case classical set into the feature worktree. Each original corpus is kept
beside its reviewed version so policy corrections remain visible. They are small,
agent-authored examples and do not establish production precision.

The reviewed files record these explicit annotation changes:

| Fixture | Case | Before | After | Reason |
| --- | --- | --- | --- | --- |
| `corpus-reviewed.json` | `pv-005` | reduce | abstain | Dictionary-listed directional `turn off` sense |
| `corpus-reviewed.json` | `pv-009` | reduce | abstain | Dictionary-listed directional `look up` sense |
| `corpus-reviewed.json` | `pv-010` | abstain | expand | Dictionary-listed directional `look up` sense |
| `corpus-followup-reviewed.json` | `followup-002` | reduce | abstain | Dictionary-listed directional `turn off` sense |
| `corpus-followup-reviewed.json` | `followup-004` | abstain | expand | Dictionary-listed directional `turn off` sense |
| `corpus-followup-reviewed.json` | `followup-006` | reduce | abstain | Dictionary-listed directional `look up` sense |
| `corpus-followup-reviewed.json` | `followup-008` | abstain | expand | Dictionary-listed directional `look up` sense |
| `classical/corpus-reviewed.json` | `classical-033` | abstain | expand | WordNet 3.0 `go_to` attendance sense |

The original files preserve all earlier labels. The reviewed JSON metadata records
the cited dictionary sources and case-level changes; no failures were relabeled based
on this matcher’s predictions.

`historical-lexicon.json` is the 16-pattern experimental fixture from the earlier NLP
research. It is a deliberately incomplete candidate inventory for measurement only.
It is not loaded by the service and is not an initial production inventory. The
benchmark also derives a closed candidate set from the reviewed labels; results on
that set are conditional matcher measurements because expected labels supply the
candidate entries.

`run.py` scores only cases with one selected token, matching the verb-only suggestion
path. A correct prediction requires the expected canonical expression and every
component range to match. It reports inventory misses separately from matching
errors for targets present in the historical fixture, and counts any prediction on a
control as a false positive. Parsing and direct matcher timings are separate from
the in-process `/analyze` plus `/match-expressions` HTTP chain. These timings exclude
model startup, backend/SQL work, dictionary providers, and network latency.

Run from `apps/languee-nlp` after installing the service dependencies and
`en_core_web_md` model:

```sh
uv run python benchmarks/expression-matching/run.py \
  --output /tmp/expression-matcher-report.json
```

The model/package identity, fixture hashes, timing sample counts, and per-case
predictions are included in the JSON output. Residual semantic ambiguities remain
outside this syntactic matcher; for example, the known candidate `look after` is
matched in “She looked after lunch,” where the intended reading is temporal.

The NLP pytest suite runs the reviewed corpora with the pinned `en_core_web_md`
3.8.0 model and fails if precision or recall falls below the exact counts in
`report.md` for either candidate inventory. It also checks corpus and inventory
sizes so changes to the evaluation inputs require an explicit baseline review.
The gate compares aggregate accuracy; an improvement on one case can offset a
regression on another. Timing measurements are not gated.
