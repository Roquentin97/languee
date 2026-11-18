"""Measure dictionary-known expression matching on the reviewed local corpora."""

import argparse
import hashlib
import json
import os
import platform
import statistics
import time
import unicodedata
from pathlib import Path
from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid5

os.environ["BASIC_LOGIN"] = "fixture"
os.environ["BASIC_PASSWORD"] = "fixture"
os.environ["LANGUEE_NLP_TRACING_ENABLED"] = "false"
os.environ["LANGUEE_NLP_LOG_LEVEL"] = "error"

import spacy
from fastapi.testclient import TestClient
from spacy.tokens import Doc, Token

from languee_nlp.main import app
from languee_nlp.nlp.expression_matcher import match_expressions
from languee_nlp.schemas import MatchCandidate, SelectionRange

ROOT = Path(__file__).resolve().parent
CORPORA = (
    ROOT / "corpus-reviewed.json",
    ROOT / "corpus-followup-reviewed.json",
    ROOT / "classical" / "corpus-reviewed.json",
)
AUTH = ("fixture", "fixture")


def _normalize(value: str) -> str:
    return unicodedata.normalize("NFC", value).lower()


def _load_cases() -> list[dict]:
    cases = []
    for path in CORPORA:
        payload = json.loads(path.read_text())
        cases.extend(
            {**case, "fixture": path.relative_to(ROOT).as_posix()}
            for case in payload["cases"]
        )
    return cases


def _candidate_rows(patterns: list[str], head_lemma: str) -> list[dict]:
    return [
        {
            "entry_id": str(uuid5(NAMESPACE_URL, f"languee-fixture:{pattern}")),
            "canonical_text": pattern,
        }
        for pattern in patterns
        if len(pattern.split()) > 1
        and _normalize(pattern.split()[0]) == _normalize(head_lemma)
    ]


def _candidate_models(rows: list[dict]) -> list[MatchCandidate]:
    return [MatchCandidate.model_validate(row) for row in rows]


def _selected_token(doc: Doc, span: dict) -> Token | None:
    return next(
        (
            token
            for token in doc
            if token.idx == span["start"] and token.idx + len(token.text) == span["end"]
        ),
        None,
    )


def _percentile(values: list[float], percentile: int) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, (len(ordered) * percentile + 99) // 100 - 1)
    return ordered[index]


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _measure_direct_matcher(
    case: dict,
    patterns: list[str],
    nlp: spacy.language.Language,
    repeats: int,
    parse_times: list[float],
    match_times: list[float],
) -> tuple[Token | None, list]:
    selected = case["selection"][0]
    head: Token | None = None
    matches = []
    for _ in range(repeats):
        started = time.perf_counter()
        doc = nlp(case["context"])
        parse_times.append((time.perf_counter() - started) * 1000)
        head = _selected_token(doc, selected)
        matches = []
        if head is None or head.pos_ != "VERB":
            continue
        candidates = _candidate_models(_candidate_rows(patterns, head.lemma_))
        started = time.perf_counter()
        matches = match_expressions(
            doc,
            SelectionRange(start=selected["start"], end=selected["end"]),
            candidates,
        )
        match_times.append((time.perf_counter() - started) * 1000)
    return head, matches


def _measure_endpoint_chain(
    case: dict,
    patterns: list[str],
    client: TestClient,
    repeats: int,
    analyze_times: list[float],
    match_times: list[float],
    chain_times: list[float],
) -> tuple[dict | None, bool]:
    selected = case["selection"][0]
    request = {
        "text": case["selected_text"],
        "input_text": case["context"],
        "language": "en",
        "selection_ranges": [selected],
    }
    endpoint_prediction: dict | None = None
    analysis_head_found = False
    for _ in range(repeats):
        chain_started = time.perf_counter()
        analyze_started = time.perf_counter()
        analyze_response = client.post("/analyze", json=request, auth=AUTH)
        analyze_times.append((time.perf_counter() - analyze_started) * 1000)
        if analyze_response.status_code != 200:
            raise RuntimeError(
                f"/analyze returned {analyze_response.status_code} for {case['id']}"
            )
        analysis = analyze_response.json()
        selection_analysis = analysis["selection_analysis"]
        analysis_head_found = bool(
            selection_analysis is not None and selection_analysis["pos"] == "VERB"
        )
        if not analysis_head_found:
            endpoint_prediction = None
            chain_times.append((time.perf_counter() - chain_started) * 1000)
            continue

        candidate_rows = _candidate_rows(patterns, selection_analysis["head_lemma"])
        if not candidate_rows:
            endpoint_prediction = None
            chain_times.append((time.perf_counter() - chain_started) * 1000)
            continue

        match_started = time.perf_counter()
        match_response = client.post(
            "/match-expressions",
            json={
                "language": "en",
                "input_text": case["context"],
                "selected_verb_range": selection_analysis["head_range"],
                "candidates": candidate_rows,
            },
            auth=AUTH,
        )
        match_times.append((time.perf_counter() - match_started) * 1000)
        if match_response.status_code != 200:
            raise RuntimeError(
                f"/match-expressions returned {match_response.status_code} "
                f"for {case['id']}"
            )
        matches = match_response.json()["matches"]
        endpoint_prediction = matches[0] if matches else None
        chain_times.append((time.perf_counter() - chain_started) * 1000)
    return endpoint_prediction, analysis_head_found


def _run_inventory(
    name: str,
    patterns: list[str],
    cases: list[dict],
    nlp: spacy.language.Language,
    client: TestClient,
    repeats: int,
) -> dict:
    rows = []
    parse_times: list[float] = []
    direct_match_times: list[float] = []
    analyze_times: list[float] = []
    matcher_endpoint_times: list[float] = []
    endpoint_chain_times: list[float] = []

    for case in cases:
        if len(case["selection"]) != 1:
            continue
        direct_head, direct_matches = _measure_direct_matcher(
            case,
            patterns,
            nlp,
            repeats,
            parse_times,
            direct_match_times,
        )
        predicted, analysis_head_found = _measure_endpoint_chain(
            case,
            patterns,
            client,
            repeats,
            analyze_times,
            matcher_endpoint_times,
            endpoint_chain_times,
        )

        expected_positive = case["expected_action"] == "expand"
        target = case.get("alternative_lemma")
        inventory_has_target = target is not None and any(
            _normalize(pattern) == _normalize(target) for pattern in patterns
        )
        exact = bool(
            expected_positive
            and predicted is not None
            and _normalize(predicted["canonical_text"]) == _normalize(target)
            and predicted["component_ranges"] == case["alternative_ranges"]
        )
        rows.append(
            {
                "id": case["id"],
                "fixture": case["fixture"],
                "split": case.get("split"),
                "category": case.get("category"),
                "context": case["context"],
                "selected_text": case["selected_text"],
                "expected_action": case["expected_action"],
                "expected_canonical": target,
                "expected_ranges": case["alternative_ranges"],
                "target_in_inventory": inventory_has_target,
                "selected_verb_lemma": (
                    direct_head.lemma_ if direct_head is not None else None
                ),
                "prediction": predicted,
                "direct_prediction": (
                    direct_matches[0].model_dump() if direct_matches else None
                ),
                "exact": exact,
                "analysis_head_found": direct_head is not None,
            }
        )

    positives = [row for row in rows if row["expected_action"] == "expand"]
    predictions = [row for row in rows if row["prediction"] is not None]
    true_positives = sum(row["exact"] for row in rows)
    false_positives = len(predictions) - true_positives
    inventory_misses = sum(not row["target_in_inventory"] for row in positives)
    matcher_errors = sum(
        row["target_in_inventory"] and not row["exact"] for row in positives
    )
    controls = [row for row in rows if row["expected_action"] != "expand"]
    correct_abstentions = sum(row["prediction"] is None for row in controls)
    return {
        "inventory": name,
        "inventory_size": len(set(patterns)),
        "counts": {
            "verb_only_cases": len(rows),
            "expected_expansions": len(positives),
            "controls": len(controls),
            "predictions": len(predictions),
            "true_positives": true_positives,
            "false_positives": false_positives,
            "inventory_misses": inventory_misses,
            "matching_errors_when_target_known": matcher_errors,
            "unresolved_selected_heads": sum(
                not row["analysis_head_found"] for row in positives
            ),
        },
        "metrics": {
            "precision": _rate(true_positives, len(predictions)),
            "recall_including_inventory_misses": _rate(true_positives, len(positives)),
            "inventory_coverage": _rate(
                len(positives) - inventory_misses, len(positives)
            ),
            "conditional_matcher_recall": _rate(
                true_positives, len(positives) - inventory_misses
            ),
            "control_abstention": _rate(correct_abstentions, len(controls)),
        },
        "timings_ms": {
            "parse_context": {
                "samples": len(parse_times),
                "p50": statistics.median(parse_times) if parse_times else None,
                "p95": _percentile(parse_times, 95),
            },
            "direct_matcher": {
                "samples": len(direct_match_times),
                "p50": (
                    statistics.median(direct_match_times)
                    if direct_match_times
                    else None
                ),
                "p95": _percentile(direct_match_times, 95),
            },
            "analyze_http_endpoint": {
                "samples": len(analyze_times),
                "p50": statistics.median(analyze_times) if analyze_times else None,
                "p95": _percentile(analyze_times, 95),
            },
            "matcher_http_endpoint": {
                "samples": len(matcher_endpoint_times),
                "p50": (
                    statistics.median(matcher_endpoint_times)
                    if matcher_endpoint_times
                    else None
                ),
                "p95": _percentile(matcher_endpoint_times, 95),
            },
            "endpoint_chain": {
                "samples": len(endpoint_chain_times),
                "p50": (
                    statistics.median(endpoint_chain_times)
                    if endpoint_chain_times
                    else None
                ),
                "p95": _percentile(endpoint_chain_times, 95),
            },
        },
        "cases": rows,
    }


def run(repeats: int) -> dict:
    cases = _load_cases()
    historical = json.loads((ROOT / "historical-lexicon.json").read_text())["patterns"]
    closed = sorted(
        {
            case["alternative_lemma"]
            for case in cases
            if case["expected_action"] == "expand" and case.get("alternative_lemma")
        }
    )
    load_started = time.perf_counter()
    nlp = spacy.load("en_core_web_md")
    model_load_ms = (time.perf_counter() - load_started) * 1000
    nlp("Warm up the expression matcher.")

    with (
        TestClient(app) as client,
        patch("languee_nlp.routers.analyze.get_nlp", return_value=nlp),
        patch("languee_nlp.routers.match_expressions.get_nlp", return_value=nlp),
    ):
        results = [
            _run_inventory(
                "historical_experimental", historical, cases, nlp, client, repeats
            ),
            _run_inventory("closed_corpus_labels", closed, cases, nlp, client, repeats),
        ]

    hashes = {
        path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (*CORPORA, ROOT / "historical-lexicon.json")
    }
    return {
        "model": f"{nlp.meta['lang']}_{nlp.meta['name']}@{nlp.meta['version']}",
        "spacy_version": spacy.__version__,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "model_load_ms": model_load_ms,
        "repeats": repeats,
        "fixture_hashes_sha256": hashes,
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    report = run(args.repeats)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
