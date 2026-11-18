# Expression matcher measurements

Run: 2026-11-17, CPython 3.12.13, spaCy 3.8.18, `en_core_web_md` 3.8.0. The model
loaded in 1.19 s. The runner used three repetitions and scored 104 single-range,
verb-only cases from 148 authored examples: 73 expected expansions and 31 controls.
Multiword selections are outside this verb-only candidate-matching measurement.

## Accuracy

An exact true positive requires the predicted canonical label and every component
range to match the reviewed annotation. Recall counts known-inventory misses as
misses. Conditional matcher recall excludes only entries absent from that candidate
inventory.

| Candidate source | Entries | Precision | Recall, including inventory misses | Inventory coverage | Conditional matcher recall | Inventory misses | Matcher errors when target is known | False positives |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Historical experimental list | 16 | 47/49 (95.9%) | 47/73 (64.4%) | 47/73 (64.4%) | 47/47 (100%) | 26 | 0 | 2 |
| Closed set derived from these corpus labels | 30 | 72/74 (97.3%) | 72/73 (98.6%) | 73/73 (100%) | 72/73 (98.6%) | 0 | 1 | 2 |

The historical fixture misses 26 labeled targets, all in the classical corpus:
`call off`, `set up`, `carry out`, `hold back`, `get over`, `figure out`, `figure in`,
`fill in`, `hand in`, `point out`, `wear out`, `go over`, `go to`, and `stand by`.
Those are candidate-inventory gaps, not contextual matching failures. The one
closed-set matching failure is `classical-023`, “They handed their reports in.”
The direct-preposition object guard rejects that separated-object construction.

Both candidate sets make the same two false suggestions: `run into` for “She ran
into something” and for “The dog ran into the garage.” The dependency pattern cannot
decide whether these contexts express the dictionary expression or physical motion.
A separate HTTP smoke probe also matched `look after` in “She looked after lunch,”
where the intended reading is temporal. That probe is outside the scored corpora and
is recorded as an unresolved semantic ambiguity, not a label correction.

The closed set is optimistic by construction: its 30 entries are derived from the
same reviewed alternatives being evaluated. It isolates matcher behavior when the
expected entry is known; it is not an independent inventory or production accuracy
estimate. The historical list is also a small experimental fixture, not a production
dictionary. Both sets are agent-authored regression evidence. The reviewed and
original labels, including every policy correction, are listed in
[README.md](README.md).

## Timings

The script measures stages directly and exercises the routes through FastAPI's
in-process `TestClient`. Values below are warm p50/p95 milliseconds; the range
reflects the sequential historical-inventory and closed-inventory runs. Direct
matcher samples include only cases with an eligible verb and supplied candidates.

| Stage | p50 ms | p95 ms | Samples per inventory |
| --- | ---: | ---: | ---: |
| Parse original context | 5.2–5.3 | 8.6–11.2 | 312 |
| Match candidates after parse | 0.07–0.09 | 0.16 | 312 |
| `POST /analyze` in-process | 12.7–12.8 | 20.8–23.1 | 312 |
| `POST /match-expressions` in-process | 8.0–8.1 | 12.0–12.4 | 192–312 |
| Analyze plus optional matcher chain | 19.0–20.6 | 31.8–32.9 | 312 |

The chain includes JSON validation, ASGI/test-client overhead, analysis of the
selected text, a second context parse for matching, and response serialization. A
separate local HTTP smoke run measured warm `/analyze` requests at 10.8–12.2 ms and
`/match-expressions` at 6.5–7.9 ms; its first analyze request took 215.5 ms while the
process initialized. These NLP-only timings exclude SQL lookup, dictionary-provider
work, remote network latency, and full application orchestration.

Timing samples are short CPU measurements on one shared development host, not a load
test. The small authored corpus and confidence intervals do not support a production
precision guarantee.
