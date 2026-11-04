"""Representative trace-id formats accepted by Grafana datasource provisioning."""

from pathlib import Path
import re


ROOT = Path(__file__).parents[2]
LOKI = (ROOT / "provision/grafana/provisioning/datasources/loki.yaml").read_text()
TEMPO = (ROOT / "provision/grafana/provisioning/datasources/tempo.yaml").read_text()
TRACE_ID = "aabbccddeeff00112233445566778899"


def provisioned_scalar(document: str, key: str) -> str:
    match = re.search(rf"^\s*{key}: '(.+)'$", document, re.MULTILINE)
    assert match, f"{key} is missing from provisioning"
    return match.group(1)


def test_loki_trace_id_matcher_accepts_container_json_and_otlp_attributes():
    matcher = re.compile(provisioned_scalar(LOKI, "matcherRegex"))
    for line in (
        f'{{"message":"request complete","trace_id":"{TRACE_ID}","span_id":"0011223344556677"}}',
        f'event=network.failure trace_id={TRACE_ID} span_id=0011223344556677',
        f'event=network.failure trace_id:"{TRACE_ID}"',
    ):
        assert matcher.search(line).group(1) == TRACE_ID

    assert "matcherRegex: '(?:\"trace_id\"" in LOKI
    assert 'trace_id[=:]' in LOKI


def test_tempo_to_loki_query_matches_both_log_representations_without_trace_labels():
    query = provisioned_scalar(TEMPO, "query")
    expression = re.search(r"\|~ `(.+)`$", query).group(1)
    matcher = re.compile(expression.replace("$${__trace.traceId}", TRACE_ID))
    assert matcher.search(f'{{"trace_id":"{TRACE_ID}"}}')
    assert matcher.search(f"event=network.failure trace_id={TRACE_ID}")
    assert 'trace_id=' not in LOKI.split("matcherRegex:", 1)[0]
