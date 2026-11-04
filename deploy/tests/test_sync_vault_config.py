"""Unit tests for deploy/scripts/sync-vault-config.py. No OCI access needed."""

from __future__ import annotations

import base64
import importlib.util
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "deploy/scripts/sync-vault-config.py"

spec = importlib.util.spec_from_file_location("sync_vault_config", SCRIPT)
svc = importlib.util.module_from_spec(spec)
sys.modules["sync_vault_config"] = svc
spec.loader.exec_module(svc)

# Obviously fake, test-only values.
PG_PASSWORD = "pg-test-password-0123456789"
REDIS_PASSWORD = "redis-test-password-0123456789"
NLP_PASSWORD = "nlp-test-password-0123"
SWAGGER_PASSWORD = "swagger-test-password-0123"
JWT = "jwt-test-secret-0123456789abcdef"
HEALTH_URL = "https://hc-ping.example.com/00000000-test"
TELEMETRY_HASH = "$2a$14$" + "a" * 53


def valid_config() -> dict[str, str]:
    return {
        "DOMAIN": "languee-dev.example.com",
        "MONITOR_DOMAIN": "monitor.languee-dev.example.com",
        "TELEMETRY_DOMAIN": "telemetry.languee-dev.example.com",
        "GRAFANA_ADMIN_USER": "admin",
        "GRAFANA_ADMIN_PASSWORD": "grafana-password-012345",
        "TELEMETRY_USERNAME": "android-ingest",
        "TELEMETRY_PASSWORD_HASH": TELEMETRY_HASH,
        "LANGUEE_BACK_POSTGRES_USER": "languee",
        "LANGUEE_BACK_POSTGRES_PASSWORD": PG_PASSWORD,
        "LANGUEE_BACK_POSTGRES_DB": "languee",
        "LANGUEE_BACK_REDIS_PASSWORD": REDIS_PASSWORD,
        "BACKUP_RCLONE_REMOTE": "r2:languee-db-backups",
        "BACKUP_RETENTION_DAYS": "90",
        "BACKUP_HEALTHCHECK_URL": HEALTH_URL,
        "PORT": "3000",
        "NODE_ENV": "production",
        "REDIS_HOST": "redis",
        "REDIS_PORT": "6379",
        "JWT_SECRET": JWT,
        "JWT_EXPIRES_IN": "15m",
        "BASIC_AUTH": "admin",
        "BASIC_PASSWORD": SWAGGER_PASSWORD,
        "LANGUEE_NLP_BASE_URL": "http://languee-nlp:8000",
        "LANGUEE_NLP_BASIC_AUTH_LOGIN": "nlp-user",
        "LANGUEE_NLP_BASIC_AUTH_PASSWORD": NLP_PASSWORD,
        "LOG_FORMAT": "json",
        "SERVICE_NAME": "languee-back",
        "PRINT_DEBUG_LOGS": "false",
        "PRINT_PRETTY_JSON_LOGS": "false",
        "TRACING_ENABLED": "true",
        "OTEL_TRACES_SAMPLER": "parentbased_always_on",
        "OTEL_TRACES_SAMPLER_ARG": "1.0",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "http://alloy:4318",
        "LANGUEE_NLP_SPACY_MODEL": "en_core_web_md",
        "LANGUEE_NLP_LOG_FORMAT": "json",
        "LANGUEE_NLP_LOG_LEVEL": "info",
        "LANGUEE_NLP_SERVICE_NAME": "languee-nlp",
        "LANGUEE_NLP_ENVIRONMENT": "production",
        "LANGUEE_NLP_TRACING_ENABLED": "true",
        "LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT": "http://alloy:4318",
    }


def parse_env(text: str) -> dict[str, str]:
    return dict(
        line.split("=", 1) for line in text.splitlines() if line and not line.startswith("#")
    )


def fake_fetcher(config: dict | None = None, version: int = 3, raw: bytes | None = None):
    payload = raw if raw is not None else json.dumps(config or valid_config()).encode()

    def fetch(**_kwargs):
        return payload, version

    return fetch


def run(app_dir: Path, *argv: str, fetcher=None, region: str | None = "eu-test-1") -> int:
    args = ["--app-dir", str(app_dir), "--secret-ocid", "ocid1.test"]
    if region is not None:
        args.extend(["--region", region])
    return svc.main([*args, *argv], fetcher)


@pytest.fixture
def app_dir(tmp_path: Path) -> Path:
    return tmp_path


# --- mapping -----------------------------------------------------------------


def test_render_maps_keys_into_three_files():
    files = svc.render(valid_config(), "sha-back1234", "sha-nlp1234", 3)
    stack, back, nlp = (parse_env(files[n]) for n in (".env", "languee-back.env", "languee-nlp.env"))

    assert stack["COMPOSE_FILE"] == "docker-compose.prod.yml"
    assert stack["LANGUEE_BACK_TAG"] == "sha-back1234" and stack["LANGUEE_NLP_TAG"] == "sha-nlp1234"
    assert stack["DOMAIN"] == "languee-dev.example.com"
    assert stack["MONITOR_DOMAIN"] == "monitor.languee-dev.example.com"
    assert stack["TELEMETRY_PASSWORD_HASH"] == f"'{TELEMETRY_HASH}'"
    assert stack["BACKUP_HEALTHCHECK_URL"] == HEALTH_URL
    assert "JWT_SECRET" not in stack and "DATABASE_URL" not in back
    assert back["JWT_SECRET"] == JWT
    assert back["LANGUEE_NLP_BASIC_AUTH_PASSWORD"] == NLP_PASSWORD
    assert "LANGUEE_BACK_POSTGRES_PASSWORD" not in back


def test_nlp_credentials_come_from_nlp_keys_not_swagger_password():
    files = svc.render(valid_config(), "back-t", "nlp-t", 1)
    nlp = parse_env(files["languee-nlp.env"])
    back = parse_env(files["languee-back.env"])

    assert nlp["BASIC_LOGIN"] == "nlp-user"
    assert nlp["BASIC_PASSWORD"] == NLP_PASSWORD
    assert nlp["BASIC_PASSWORD"] != back["BASIC_PASSWORD"] == SWAGGER_PASSWORD


def test_private_alloy_endpoints_are_rendered_for_both_services():
    files = svc.render(valid_config(), "back-t", "nlp-t", 1)
    back = parse_env(files["languee-back.env"])
    nlp = parse_env(files["languee-nlp.env"])
    assert back["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://alloy:4318"
    assert nlp["LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://alloy:4318"


def test_example_json_covers_exactly_the_allowlist():
    example = json.loads((ROOT / "deploy/env/vault-config.example.json").read_text())
    assert set(example) == svc.ALLOWED_KEYS


# --- validation --------------------------------------------------------------


def test_valid_config_passes():
    svc.validate(valid_config())


def test_missing_required_keys_are_all_reported_without_values():
    config = valid_config()
    del config["JWT_SECRET"], config["DOMAIN"]
    with pytest.raises(svc.ConfigError) as err:
        svc.validate(config)
    message = str(err.value)
    assert "JWT_SECRET: missing" in message and "DOMAIN: missing" in message
    assert PG_PASSWORD not in message


def test_unknown_key_is_rejected():
    with pytest.raises(svc.ConfigError, match="EXTRA_KEY"):
        svc.validate(valid_config() | {"EXTRA_KEY": "x"})


@pytest.mark.parametrize(
    ("key", "bad"),
    [
        ("DOMAIN", "https://languee-dev.example.com"),
        ("DOMAIN", "localhost"),
        ("LANGUEE_BACK_POSTGRES_PASSWORD", "short"),
        ("LANGUEE_BACK_POSTGRES_PASSWORD", "has/slash-and-needs-encoding-1"),
        ("LANGUEE_BACK_POSTGRES_PASSWORD", "p@ss-word-with-at-sign-0123"),
        ("LANGUEE_BACK_REDIS_PASSWORD", "changeme"),
        ("BASIC_PASSWORD", "changeme"),
        ("PORT", "8080"),
        ("TRACING_ENABLED", "yes"),
        ("BACKUP_HEALTHCHECK_URL", "https://hc.example.com/ping?a=1&b=2"),
        ("BACKUP_HEALTHCHECK_URL", "http://hc.example.com/ping"),
        ("BACKUP_RETENTION_DAYS", "0"),
        ("LANGUEE_NLP_BASIC_AUTH_LOGIN", "user:name"),
    ],
)
def test_malformed_values_are_rejected(key, bad):
    with pytest.raises(svc.ConfigError) as err:
        svc.validate(valid_config() | {key: bad})
    assert key in str(err.value)
    assert bad not in str(err.value)


@pytest.mark.parametrize("key", ["JWT_SECRET", "SERVICE_NAME", "DOMAIN", "BACKUP_RCLONE_REMOTE"])
@pytest.mark.parametrize("suffix", ["\nINJECTED=1", "\r\nINJECTED=1", "\x00", "\t"])
def test_control_characters_and_multiline_values_are_rejected(key, suffix):
    base = valid_config()[key]
    with pytest.raises(svc.ConfigError, match=key):
        svc.validate(valid_config() | {key: base + suffix})


@pytest.mark.parametrize("bad", ["a$(id)b-secret-0123456789", "a`id`-secret-0123456789", "a b c #x"])
def test_shell_and_env_file_metacharacters_are_rejected(bad):
    with pytest.raises(svc.ConfigError):
        svc.validate(valid_config() | {"JWT_SECRET": bad})
    with pytest.raises(svc.ConfigError):
        svc.validate(valid_config() | {"LANGUEE_BACK_REDIS_PASSWORD": bad})


def test_empty_required_value_is_rejected_but_empty_healthcheck_is_allowed():
    svc.validate(valid_config() | {"BACKUP_HEALTHCHECK_URL": ""})
    with pytest.raises(svc.ConfigError, match="JWT_SECRET: empty"):
        svc.validate(valid_config() | {"JWT_SECRET": ""})


def test_production_telemetry_must_use_private_alloy():
    with pytest.raises(svc.ConfigError, match="TRACING_ENABLED"):
        svc.validate(valid_config() | {"TRACING_ENABLED": "false"})
    with pytest.raises(svc.ConfigError, match="OTEL_EXPORTER_OTLP_ENDPOINT"):
        svc.validate(valid_config() | {"OTEL_EXPORTER_OTLP_ENDPOINT": "https://example.com"})


def test_parse_rejects_bad_json_non_object_nested_and_duplicate_keys():
    for raw, fragment in [
        (b"{not json", "not valid JSON"),
        (b"\xff\xfe", "not valid UTF-8"),
        (b'["a"]', "must be an object"),
        (b'{"A": ["x"]}', "unsupported JSON type"),
        (b'{"A": null}', "unsupported JSON type"),
        (b'{"A": "1.5", "A": "2"}', "repeats key A"),
    ]:
        with pytest.raises(svc.ConfigError, match=fragment):
            svc.parse_secret_json(raw)


def test_parse_normalizes_bool_and_int_scalars():
    assert svc.parse_secret_json(b'{"A": true, "B": false, "C": 6379}') == {
        "A": "true",
        "B": "false",
        "C": "6379",
    }


# --- CLI flows: apply, tags, versions, modes ---------------------------------


def test_initial_deploy_writes_private_files_and_state(app_dir):
    assert run(app_dir, "--back-tag", "sha-back1234", "--nlp-tag", "sha-nlp1234", fetcher=fake_fetcher(version=5)) == 0

    for name in (".env", "languee-back.env", "languee-nlp.env", ".deploy-state.json"):
        mode = stat.S_IMODE((app_dir / name).stat().st_mode)
        assert mode == 0o600, name
    assert parse_env((app_dir / ".env").read_text())["LANGUEE_BACK_TAG"] == "sha-back1234"
    state = json.loads((app_dir / ".deploy-state.json").read_text())
    assert state["back_tag"] == "sha-back1234" and state["nlp_tag"] == "sha-nlp1234" and state["secret_version"] == 5
    assert not [p for p in app_dir.iterdir() if p.name.startswith(".tmp-")]


def test_config_only_apply_preserves_deployed_tag(app_dir):
    run(app_dir, "--back-tag", "sha-back1234", "--nlp-tag", "sha-nlp1234", fetcher=fake_fetcher(version=1))
    updated = valid_config() | {"JWT_EXPIRES_IN": "30m"}

    assert run(app_dir, "--preserve-tags", fetcher=fake_fetcher(updated, version=2)) == 0

    assert parse_env((app_dir / ".env").read_text())["LANGUEE_BACK_TAG"] == "sha-back1234"
    assert parse_env((app_dir / "languee-back.env").read_text())["JWT_EXPIRES_IN"] == "30m"
    state = json.loads((app_dir / ".deploy-state.json").read_text())
    assert state["back_tag"] == "sha-back1234" and state["nlp_tag"] == "sha-nlp1234" and state["secret_version"] == 2


def test_backend_only_update_preserves_the_nlp_tag(app_dir):
    run(app_dir, "--back-tag", "sha-back", "--nlp-tag", "sha-nlp", fetcher=fake_fetcher())
    assert run(app_dir, "--back-tag", "sha-newback", fetcher=fake_fetcher()) == 0
    state = json.loads((app_dir / ".deploy-state.json").read_text())
    assert (state["back_tag"], state["nlp_tag"]) == ("sha-newback", "sha-nlp")


def test_preserve_tag_adopts_tag_from_preexisting_env(app_dir):
    (app_dir / ".env").write_text("COMPOSE_FILE=x\nTAG=sha-legacy1\n")
    run(app_dir, "--preserve-tags", fetcher=fake_fetcher())
    assert parse_env((app_dir / ".env").read_text())["LANGUEE_BACK_TAG"] == "sha-legacy1"
    assert parse_env((app_dir / ".env").read_text())["LANGUEE_NLP_TAG"] == "sha-legacy1"


def test_preserve_tags_migrates_legacy_state_and_keeps_service_tags_independent(app_dir):
    (app_dir / ".deploy-state.json").write_text(json.dumps({"tag": "sha-legacy1", "secret_version": 2}))
    run(app_dir, "--preserve-tags", fetcher=fake_fetcher())
    assert parse_env((app_dir / ".env").read_text())["LANGUEE_BACK_TAG"] == "sha-legacy1"
    assert parse_env((app_dir / ".env").read_text())["LANGUEE_NLP_TAG"] == "sha-legacy1"

    run(app_dir, "--back-tag", "back-next", "--nlp-tag", "nlp-next", fetcher=fake_fetcher(version=4))
    state = json.loads((app_dir / ".deploy-state.json").read_text())
    assert (state["back_tag"], state["nlp_tag"]) == ("back-next", "nlp-next")
    assert run(app_dir, "--preserve-tags", fetcher=fake_fetcher(version=5)) == 0
    state = json.loads((app_dir / ".deploy-state.json").read_text())
    assert (state["back_tag"], state["nlp_tag"]) == ("back-next", "nlp-next")


def test_preserve_tags_without_any_deployed_tag_fails(app_dir, capsys):
    assert run(app_dir, "--preserve-tags", fetcher=fake_fetcher()) == 2
    assert "pass both tags on the first deploy" in capsys.readouterr().err
    assert not (app_dir / ".env").exists()


def test_tag_flags_are_exclusive_and_required(app_dir):
    assert run(app_dir, fetcher=fake_fetcher()) == 2
    assert run(app_dir, "--back-tag", "a", "--nlp-tag", "a", "--preserve-tags", fetcher=fake_fetcher()) == 2
    assert run(app_dir, "--back-tag", "bad tag;rm", "--nlp-tag", "n", fetcher=fake_fetcher()) == 2
    assert not (app_dir / ".env").exists()


def test_new_tag_records_previous_tag(app_dir):
    run(app_dir, "--back-tag", "sha-back111", "--nlp-tag", "sha-nlp111", fetcher=fake_fetcher())
    run(app_dir, "--back-tag", "sha-back222", "--nlp-tag", "sha-nlp222", fetcher=fake_fetcher())
    state = json.loads((app_dir / ".deploy-state.json").read_text())
    assert (state["back_tag"], state["nlp_tag"], state["previous_back_tag"], state["previous_nlp_tag"]) == ("sha-back222", "sha-nlp222", "sha-back111", "sha-nlp111")


def test_identical_reapply_is_a_noop_and_keeps_rollback_snapshot(app_dir, capsys):
    run(app_dir, "--back-tag", "sha-back111", "--nlp-tag", "sha-nlp111", fetcher=fake_fetcher(version=1))
    run(app_dir, "--back-tag", "sha-back222", "--nlp-tag", "sha-nlp222", fetcher=fake_fetcher(version=2))
    snapshot = (app_dir / ".config-previous/.env").read_text()

    run(app_dir, "--back-tag", "sha-back222", "--nlp-tag", "sha-nlp222", fetcher=fake_fetcher(version=2))

    assert "no env changes" in capsys.readouterr().out
    assert (app_dir / ".config-previous/.env").read_text() == snapshot


def test_check_mode_validates_without_writing(app_dir):
    assert run(app_dir, "--check", fetcher=fake_fetcher()) == 0
    assert list(app_dir.iterdir()) == []


def test_status_reports_applied_version_and_tag(app_dir, capsys):
    run(app_dir, "--back-tag", "sha-back1234", "--nlp-tag", "sha-nlp1234", fetcher=fake_fetcher(version=9))
    capsys.readouterr()
    assert run(app_dir, "--status") == 0
    out = json.loads(capsys.readouterr().out)
    assert out == {
        "back_tag": "sha-back1234",
        "nlp_tag": "sha-nlp1234",
        "previous_back_tag": None,
        "previous_nlp_tag": None,
        "secret_version": 9,
    }


def test_requested_secret_version_is_forwarded_to_fetcher(app_dir):
    seen = {}

    def fetch(**kwargs):
        seen.update(kwargs)
        return json.dumps(valid_config()).encode(), 4

    run(app_dir, "--back-tag", "back-t", "--nlp-tag", "nlp-t", "--secret-version", "4", "--region", "eu-test-1", fetcher=fetch)
    assert seen["version"] == 4 and seen["region"] == "eu-test-1"
    assert seen["secret_ocid"] == "ocid1.test"


def test_cli_region_takes_precedence_over_environment(app_dir, monkeypatch):
    monkeypatch.setenv("OCI_REGION", "us-env-9")
    seen = {}

    def fetch(**kwargs):
        seen.update(kwargs)
        return json.dumps(valid_config()).encode(), 4

    assert run(
        app_dir,
        "--back-tag",
        "back-t",
        "--nlp-tag",
        "nlp-t",
        "--region",
        "eu-cli-1",
        fetcher=fetch,
        region=None,
    ) == 0
    assert seen["region"] == "eu-cli-1"


def test_environment_region_is_used_when_cli_region_is_absent(app_dir, monkeypatch):
    monkeypatch.setenv("OCI_REGION", "us-env-9")
    seen = {}

    def fetch(**kwargs):
        seen.update(kwargs)
        return json.dumps(valid_config()).encode(), 4

    assert run(app_dir, "--back-tag", "back-t", "--nlp-tag", "nlp-t", fetcher=fetch, region=None) == 0
    assert seen["region"] == "us-env-9"


def test_missing_region_fails_before_fetching(app_dir, monkeypatch, capsys):
    monkeypatch.delenv("OCI_REGION", raising=False)
    called = False

    def fetch(**_kwargs):
        nonlocal called
        called = True
        return json.dumps(valid_config()).encode(), 4

    assert run(
        app_dir, "--back-tag", "back-t", "--nlp-tag", "nlp-t", fetcher=fetch, region=None
    ) == 2
    assert "OCI region missing" in capsys.readouterr().err
    assert not called


@pytest.mark.parametrize("region", ["EU-FRANKFURT-1", "eu frankfurt 1", "eu-frankfurt"])
def test_invalid_region_fails_before_fetching(app_dir, capsys, region):
    assert run(
        app_dir, "--back-tag", "back-t", "--nlp-tag", "nlp-t", fetcher=fake_fetcher(), region=region
    ) == 2
    assert "OCI region must be" in capsys.readouterr().err


# --- failure handling: no partial writes, rollback ---------------------------


def test_invalid_secret_leaves_existing_good_config_untouched(app_dir, capsys):
    run(app_dir, "--back-tag", "sha-back1234", "--nlp-tag", "sha-nlp1234", fetcher=fake_fetcher(version=1))
    before = {p.name: p.read_bytes() for p in app_dir.iterdir() if p.is_file()}
    bad = valid_config() | {"LANGUEE_BACK_POSTGRES_PASSWORD": "short"}

    assert run(app_dir, "--preserve-tags", fetcher=fake_fetcher(bad, version=2)) == 2

    after = {p.name: p.read_bytes() for p in app_dir.iterdir() if p.is_file()}
    assert before == after
    err = capsys.readouterr().err
    assert "LANGUEE_BACK_POSTGRES_PASSWORD" in err and "short" not in err.replace("shortcut", "")


def test_invalid_json_writes_nothing_and_does_not_echo_content(app_dir, capsys):
    secret_bits = b"{" + PG_PASSWORD.encode()
    assert run(app_dir, "--back-tag", "back-t", "--nlp-tag", "nlp-t", fetcher=fake_fetcher(raw=secret_bits)) == 2
    assert PG_PASSWORD not in capsys.readouterr().err
    assert list(app_dir.iterdir()) == []


def test_failure_midway_through_replacement_restores_previous_files(app_dir, monkeypatch):
    run(app_dir, "--back-tag", "sha-back111", "--nlp-tag", "sha-nlp111", fetcher=fake_fetcher(version=1))
    before = {p.name: p.read_bytes() for p in app_dir.iterdir() if p.is_file()}
    real_replace = os.replace
    calls = {"n": 0, "armed": True}

    def flaky_replace(src, dst):
        if calls["armed"] and Path(dst).name == "languee-nlp.env":
            calls["armed"] = False
            raise OSError("disk full")
        return real_replace(src, dst)

    monkeypatch.setattr(svc.os, "replace", flaky_replace)
    updated = valid_config() | {"JWT_EXPIRES_IN": "45m", "LANGUEE_NLP_LOG_LEVEL": "debug"}

    with pytest.raises(OSError, match="disk full"):
        run(app_dir, "--back-tag", "sha-back222", "--nlp-tag", "sha-nlp222", fetcher=fake_fetcher(updated, version=2))

    after = {
        p.name: p.read_bytes()
        for p in app_dir.iterdir()
        if p.is_file()
    }
    assert after == before
    assert not [p for p in app_dir.iterdir() if p.name.startswith(".tmp-")]


def test_failure_during_initial_apply_leaves_no_partial_config(app_dir, monkeypatch):
    real_replace = os.replace

    def flaky_replace(src, dst):
        if Path(dst).name == "languee-nlp.env":
            raise OSError("boom")
        return real_replace(src, dst)

    monkeypatch.setattr(svc.os, "replace", flaky_replace)
    with pytest.raises(OSError):
        run(app_dir, "--back-tag", "back-t", "--nlp-tag", "nlp-t", fetcher=fake_fetcher())
    leftovers = {p.name for p in app_dir.iterdir() if p.is_file()}
    assert leftovers == set()


def test_restore_previous_returns_to_prior_config_and_tag(app_dir):
    run(app_dir, "--back-tag", "sha-back111", "--nlp-tag", "sha-nlp111", fetcher=fake_fetcher(version=1))
    run(app_dir, "--back-tag", "sha-back222", "--nlp-tag", "sha-nlp222", fetcher=fake_fetcher({**valid_config(), "JWT_EXPIRES_IN": "1h"}, 2))

    assert run(app_dir, "--restore-previous") == 0

    assert parse_env((app_dir / ".env").read_text())["LANGUEE_BACK_TAG"] == "sha-back111"
    assert parse_env((app_dir / "languee-back.env").read_text())["JWT_EXPIRES_IN"] == "15m"
    assert json.loads((app_dir / ".deploy-state.json").read_text())["secret_version"] == 1
    assert stat.S_IMODE((app_dir / ".env").stat().st_mode) == 0o600


def test_restore_previous_refuses_after_initial_apply(app_dir, capsys):
    run(app_dir, "--back-tag", "sha-back111", "--nlp-tag", "sha-nlp111", fetcher=fake_fetcher())
    assert run(app_dir, "--restore-previous") == 2
    assert "initial" in capsys.readouterr().err
    assert (app_dir / ".env").exists()


def test_snapshot_directory_is_private(app_dir):
    run(app_dir, "--back-tag", "sha-back111", "--nlp-tag", "sha-nlp111", fetcher=fake_fetcher())
    run(app_dir, "--back-tag", "sha-back222", "--nlp-tag", "sha-nlp222", fetcher=fake_fetcher())
    assert stat.S_IMODE((app_dir / ".config-previous").stat().st_mode) == 0o700
    assert stat.S_IMODE((app_dir / ".config-previous/.env").stat().st_mode) == 0o600


# --- OCI CLI adapter ---------------------------------------------------------


def _completed(stdout: str, code: int = 0, stderr: str = ""):
    return subprocess.CompletedProcess([], code, stdout=stdout, stderr=stderr)


def test_oci_cli_adapter_decodes_base64_bundle_and_builds_instance_principal_command(monkeypatch):
    content = base64.b64encode(json.dumps(valid_config()).encode()).decode()
    bundle = {
        "data": {
            "version-number": 7,
            "secret-bundle-content": {"content-type": "BASE64", "content": content},
        }
    }
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return _completed(json.dumps(bundle))

    monkeypatch.setattr(svc.subprocess, "run", fake_run)
    payload, version = svc.fetch_with_oci_cli(
        oci_bin=sys.executable, secret_ocid="ocid1.x", region="eu-frankfurt-1", version=None
    )

    assert version == 7 and json.loads(payload) == valid_config()
    cmd = captured["cmd"]
    assert cmd[cmd.index("--auth") + 1] == "instance_principal"
    assert cmd[cmd.index("--stage") + 1] == "CURRENT"
    assert "--version-number" not in cmd


def test_oci_cli_adapter_pins_requested_version(monkeypatch):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return _completed("{}", 1, "ServiceError")

    monkeypatch.setattr(svc.subprocess, "run", fake_run)
    with pytest.raises(svc.ConfigError, match="exit 1"):
        svc.fetch_with_oci_cli(oci_bin=sys.executable, secret_ocid="o", region="r", version=3)
    assert captured["cmd"][captured["cmd"].index("--version-number") + 1] == "3"


def test_oci_cli_adapter_rejects_unexpected_response_without_echo(monkeypatch):
    monkeypatch.setattr(
        svc.subprocess, "run", lambda *a, **k: _completed('{"data": {"leak": "' + PG_PASSWORD + '"}}')
    )
    with pytest.raises(svc.ConfigError) as err:
        svc.fetch_with_oci_cli(oci_bin=sys.executable, secret_ocid="o", region="r", version=None)
    assert PG_PASSWORD not in str(err.value)


def test_find_oci_prefers_explicit_then_default_venv_then_path(tmp_path, monkeypatch):
    fake = tmp_path / "oci"
    fake.write_text("#!/bin/sh\n")
    fake.chmod(0o755)
    assert svc.find_oci(str(fake)) == str(fake)

    monkeypatch.delenv("OCI_CLI_BIN", raising=False)
    monkeypatch.setattr(svc.Path, "home", lambda: tmp_path)
    venv_bin = tmp_path / ".venvs/oci/bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "oci").write_text("#!/bin/sh\n")
    (venv_bin / "oci").chmod(0o755)
    assert svc.find_oci(None) == str(venv_bin / "oci")

    (venv_bin / "oci").unlink()
    monkeypatch.setattr(svc.shutil, "which", lambda name: None)
    with pytest.raises(svc.ConfigError, match="OCI CLI not found"):
        svc.find_oci(None)
