"""Guard the recorded expression-suggestion accuracy on the reviewed corpora."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

BENCHMARK = (
    Path(__file__).resolve().parents[1] / "benchmarks/expression-matching/run.py"
)

# Exact counts from report.md, avoiding rounded percentage comparisons.
BASELINES = {
    "historical_experimental": {"entries": 16, "true_positives": 47, "predictions": 49},
    "closed_corpus_labels": {"entries": 30, "true_positives": 72, "predictions": 74},
}


def test_expression_suggestion_accuracy_does_not_regress(tmp_path: Path) -> None:
    report_path = tmp_path / "expression-accuracy.json"
    subprocess.run(
        [
            sys.executable,
            str(BENCHMARK),
            "--repeats",
            "1",
            "--output",
            str(report_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(report_path.read_text())
    assert report["model"] == "en_core_web_md@3.8.0"
    results = {result["inventory"]: result for result in report["results"]}
    assert results.keys() == BASELINES.keys()

    for name, baseline in BASELINES.items():
        result = results[name]
        counts = result["counts"]
        assert result["inventory_size"] == baseline["entries"], (
            f"{name}: candidate inventory changed; review the baseline"
        )
        assert counts["verb_only_cases"] == 104, (
            f"{name}: corpus size changed; review the baseline"
        )
        assert counts["expected_expansions"] == 73, (
            f"{name}: positive labels changed; review the baseline"
        )
        assert counts["controls"] == 31, (
            f"{name}: control labels changed; review the baseline"
        )

        true_positives = counts["true_positives"]
        predictions = counts["predictions"]
        errors = [
            f"{case['id']}: expected {case['expected_canonical'] or 'abstain'}, "
            f"got {(case['prediction'] or {}).get('canonical_text', 'abstain')}"
            for case in result["cases"]
            if (case["expected_action"] == "expand" and not case["exact"])
            or (case["expected_action"] != "expand" and case["prediction"] is not None)
        ]
        details = "\n".join(errors)
        assert predictions > 0, f"{name}: no suggestions produced\n{details}"
        assert true_positives >= baseline["true_positives"], (
            f"{name}: recall regressed: {true_positives}/73, "
            f"baseline {baseline['true_positives']}/73\n{details}"
        )
        assert (
            true_positives * baseline["predictions"]
            >= baseline["true_positives"] * predictions
        ), (
            f"{name}: precision regressed: {true_positives}/{predictions}, "
            f"baseline {baseline['true_positives']}/{baseline['predictions']}"
            f"\n{details}"
        )


@pytest.mark.parametrize(
    ("true_positives", "predictions", "message"),
    [(46, 49, "recall regressed"), (47, 50, "precision regressed")],
)
def test_accuracy_gate_rejects_regressions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    true_positives: int,
    predictions: int,
    message: str,
) -> None:
    def write_report(command: list[str], **_kwargs: object) -> None:
        results = []
        for name, baseline in BASELINES.items():
            tp = (
                true_positives
                if name == "historical_experimental"
                else baseline["true_positives"]
            )
            predicted = (
                predictions
                if name == "historical_experimental"
                else baseline["predictions"]
            )
            results.append(
                {
                    "inventory": name,
                    "inventory_size": baseline["entries"],
                    "counts": {
                        "verb_only_cases": 104,
                        "expected_expansions": 73,
                        "controls": 31,
                        "true_positives": tp,
                        "predictions": predicted,
                    },
                    "cases": [],
                }
            )
        Path(command[-1]).write_text(
            json.dumps({"model": "en_core_web_md@3.8.0", "results": results})
        )

    monkeypatch.setattr(subprocess, "run", write_report)
    with pytest.raises(AssertionError, match=message):
        test_expression_suggestion_accuracy_does_not_regress(tmp_path)
