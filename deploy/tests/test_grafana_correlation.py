"""Representative trace-id formats accepted by Grafana datasource provisioning."""

from pathlib import Path
import re


ROOT = Path(__file__).parents[2]
LOKI = (ROOT / "provision/grafana/provisioning/datasources/loki.yaml").read_text()
TEMPO = (ROOT / "provision/grafana/provisioning/datasources/tempo.yaml").read_text()
TRACE_ID = "aabbccddeeff00112233445566778899"
MATCHER = re.compile(r'(?:"trace_id"\s*:\s*"|trace_id[=:]\s*"?)([a-f0-9]{32})')


def test_loki_trace_id_matcher_accepts_container_json_and_otlp_attributes():
    for line in (
        f'{{"message":"request complete","trace_id":"{TRACE_ID}","span_id":"0011223344556677"}}',
        f'event=network.failure trace_id={TRACE_ID} span_id=0011223344556677',
        f'event=network.failure trace_id:"{TRACE_ID}"',
    ):
        assert MATCHER.search(line).group(1) == TRACE_ID

    assert "matcherRegex: '(?:\"trace_id\"" in LOKI
    assert 'trace_id[=:]' in LOKI


def test_tempo_to_loki_query_matches_both_log_representations_without_trace_labels():
    assert 'trace_id[=:]' in TEMPO
    assert "trace_id" in TEMPO
    assert 'trace_id=' not in LOKI.split("matcherRegex:", 1)[0]
