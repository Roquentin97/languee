"""Caddy access logs correlate requests without retaining headers or query data."""

from pathlib import Path


ROOT = Path(__file__).parents[2]
CADDYFILE = (ROOT / "deploy/caddy/Caddyfile").read_text()


def test_all_sites_remove_request_and_response_headers_and_full_uri():
    assert CADDYFILE.count("request>headers delete") == 3
    assert CADDYFILE.count("request>uri delete") == 3
    assert CADDYFILE.count("resp_headers delete") == 3
    assert CADDYFILE.count("request>remote_ip delete") == 3
    assert CADDYFILE.count("request>client_ip delete") == 3


def test_access_records_keep_safe_path_and_request_correlation_fields():
    assert CADDYFILE.count("log_append path {http.request.uri.path}") == 3
    assert CADDYFILE.count(
        "log_append requestId {http.response.header.X-Request-ID}"
    ) == 3
    assert CADDYFILE.count("log_append proxyRequestId {http.request.uuid}") == 3
    assert "traceparent" not in CADDYFILE.lower()


def test_access_logs_never_capture_request_bodies():
    assert CADDYFILE.count("request_body {") == 1
    assert CADDYFILE.count("max_size 1MB") == 1
    assert "request>body" not in CADDYFILE
