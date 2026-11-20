"""Targeted deployment and recovery behaviour, with command stubs only."""

import base64
import importlib.util
import io
import json
import os
import shutil
import stat
import subprocess
import tarfile
import sys
import shlex
from pathlib import Path

from test_sync_vault_config import valid_config


SCRIPT = Path(__file__).parents[1] / "scripts" / "deploy-stack.sh"
SYNC_SCRIPT = Path(__file__).parents[1] / "scripts" / "sync-vault-config.py"
TAG = "dev-123001-abcdef123456"

_sync_spec = importlib.util.spec_from_file_location("sync_vault_config", SYNC_SCRIPT)
assert _sync_spec and _sync_spec.loader
sync_vault = importlib.util.module_from_spec(_sync_spec)
sys.modules["sync_vault_config"] = sync_vault
_sync_spec.loader.exec_module(sync_vault)

SYNC_STUB = """#!/bin/bash
echo "sync $*" >> "$APP_DIR/calls.log"
case "$1" in --app-dir) shift 2 ;; esac
case "$1" in
  --status) cat "$APP_DIR/state" ;;
  --restore-previous) echo restored ;;
  *) echo '{"back_tag": "new", "nlp_tag": "new"}' > "$APP_DIR/state"; echo 'updated: no env changes' ;;
esac
"""

DOCKER_STUB = """#!/bin/bash
echo "docker $*" >> "$APP_DIR/calls.log"
if [ "$1" = compose ] && [ "$2" = config ]; then
  if [ "$3" = --hash ]; then echo "$4 test-hash"; else echo '{"services":{"postgres":{"image":"postgres:18@sha256:old"},"redis":{"image":"redis:7@sha256:old"}}}'; fi
fi
if [ "$1" = image ] && [ "$2" = inspect ]; then
  case "$4" in
    *version*) echo "${ARTIFACT_VERSION:-0.0.123001}" ;;
    *revision*) echo abcdef1234560000000000000000000000000000 ;;
  esac
fi
if [ "$2" = run ]; then echo "migration boom" >&2; exit 1; fi
"""

SUCCESS_DOCKER_STUB = """#!/bin/bash
echo "docker $*" >> "$APP_DIR/calls.log"
if [ "$1" = compose ] && [ "$2" = config ]; then
  if [ "$3" = --hash ]; then echo "$4 test-hash"; else echo '{"services":{"postgres":{"image":"postgres:18@sha256:old"},"redis":{"image":"redis:7@sha256:old"}}}'; fi
fi
if [ "$1" = image ] && [ "$2" = inspect ]; then
  case "$4" in
    *version*) echo "${ARTIFACT_VERSION:-0.0.123001}" ;;
    *revision*) echo "${ARTIFACT_REVISION:-abcdef1234560000000000000000000000000000}" ;;
  esac
fi
"""

PERSISTENT_HASH_DOCKER_STUB = """#!/bin/bash
echo "docker $*" >> "$APP_DIR/calls.log"
if [ "$1" = compose ] && [ "$2" = config ]; then
  if [ "$3" = --hash ]; then
    echo "$4 desired-hash"
  else
    echo '{"services":{"postgres":{"image":"postgres:18@sha256:old"},"redis":{"image":"redis:7@sha256:old"}}}'
  fi
fi
if [ "$1" = compose ] && [ "$2" = ps ]; then
  echo "$4-container"
fi
if [ "$1" = inspect ]; then
  case "$3" in
    *config-hash*) echo "$PERSISTENT_ACTUAL_HASH" ;;
    *)
      case "$4" in
        postgres-container) echo "postgres:18@sha256:old" ;;
        redis-container) echo "redis:7@sha256:old" ;;
      esac
      ;;
  esac
fi
"""

MONITORING_FAILURE_DOCKER_STUB = """#!/bin/bash
echo "docker $*" >> "$APP_DIR/calls.log"
if [ "$1" = compose ] && [ "$2" = config ]; then
  if [ "$3" = --hash ]; then echo "$4 test-hash"; else echo '{"services":{"postgres":{"image":"postgres:18@sha256:old"},"redis":{"image":"redis:7@sha256:old"}}}'; fi
fi
if [[ "$*" == *"loki tempo prometheus alloy grafana"* ]]; then
  echo "monitoring unavailable" >&2
  exit 1
fi
"""

CURL_SUCCESS_STUB = """#!/bin/bash
echo "curl $*" >> "$APP_DIR/calls.log"
exit 0
"""

CURL_FAILURE_STUB = """#!/bin/bash
echo "curl $*" >> "$APP_DIR/calls.log"
exit 22
"""

CURL_ARTIFACT_SUCCESS_STUB = """#!/bin/bash
echo "curl $*" >> "$APP_DIR/calls.log"
if [[ "$*" == *"/version"* ]]; then
  printf '{"version":"%s","commit":"%s"}' "$ARTIFACT_VERSION" "$ARTIFACT_REVISION"
fi
exit 0
"""


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _deploy(
    tmp_path: Path, state_before: str, artifact_version: str = "0.0.123001"
) -> tuple[subprocess.CompletedProcess[str], str]:
    app = tmp_path / "app"
    (app / "scripts").mkdir(parents=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _executable(app / "scripts" / "sync-vault-config.py", SYNC_STUB)
    _executable(bin_dir / "docker", DOCKER_STUB)
    (app / "state").write_text(state_before)
    (app / ".env").write_text("DOMAIN=example.test\n")
    env = {
        **os.environ,
        "APP_DIR": str(app),
        "ARTIFACT_VERSION": artifact_version,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
    }
    _executable(bin_dir / "python3", '#!/bin/bash\nif [[ "$1" = -* ]]; then exec /usr/bin/python3 "$@"; else exec "$@"; fi\n')
    _executable(bin_dir / "curl", "#!/bin/bash\nexit 0\n")
    result = subprocess.run(
        ["bash", str(SCRIPT), "--back-tag", TAG, "--nlp-tag", TAG],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, (app / "calls.log").read_text()


def _deploy_readiness(
    tmp_path: Path,
    curl_stub: str,
    docker_stub: str = SUCCESS_DOCKER_STUB,
    extra_args: tuple[str, ...] = (),
    applied_state: dict | None = None,
) -> tuple[subprocess.CompletedProcess[str], str]:
    app = tmp_path / "app"
    (app / "scripts").mkdir(parents=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _executable(app / "scripts" / "sync-vault-config.py", SYNC_STUB)
    _executable(bin_dir / "docker", docker_stub)
    _executable(bin_dir / "curl", curl_stub)
    _executable(bin_dir / "python3", '#!/bin/bash\nif [[ "$1" = -* ]]; then exec /usr/bin/python3 "$@"; else exec "$@"; fi\n')
    (app / "state").write_text('{"back_tag": "old", "nlp_tag": "old"}')
    (app / ".env").write_text("DOMAIN=example.test\n")
    if applied_state is not None:
        (app / ".applied-deploy-state.json").write_text(json.dumps(applied_state))
    result = subprocess.run(
        ["bash", str(SCRIPT), "--preserve-tags", *extra_args],
        env={**os.environ, "APP_DIR": str(app), "PATH": f"{bin_dir}:{os.environ['PATH']}"},
        capture_output=True,
        text=True,
        check=False,
    )
    return result, (app / "calls.log").read_text()


def _deploy_with_real_vault_sync(
    tmp_path: Path,
    config: dict[str, str],
    *deploy_args: str,
    version: int = 1,
) -> tuple[subprocess.CompletedProcess[str], str, Path]:
    app = tmp_path / "app"
    (app / "scripts").mkdir(parents=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    shutil.copy2(SYNC_SCRIPT, app / "scripts" / "sync-vault-config.py")

    old_tags = ("dev-11001-111111111111", "dev-11002-222222222222")
    for name, contents in sync_vault.render(valid_config(), *old_tags, 1).items():
        (app / name).write_text(contents)
    (app / ".deploy-state.json").write_text(
        json.dumps({"back_tag": old_tags[0], "nlp_tag": old_tags[1], "secret_version": 1})
    )

    bundle_path = tmp_path / "secret-bundle.json"
    payload = json.dumps(config).encode()
    bundle_path.write_text(
        json.dumps(
            {
                "data": {
                    "secret-bundle-content": {
                        "content-type": "BASE64",
                        "content": base64.b64encode(payload).decode(),
                    },
                    "version-number": version,
                }
            }
        )
    )
    _executable(bin_dir / "oci", f"#!/bin/sh\ncat {shlex.quote(str(bundle_path))}\n")
    _executable(bin_dir / "docker", SUCCESS_DOCKER_STUB)
    _executable(bin_dir / "curl", CURL_ARTIFACT_SUCCESS_STUB)
    _executable(
        bin_dir / "python3",
        '#!/bin/bash\nexec /usr/bin/python3 "$@"\n',
    )
    env = {
        **os.environ,
        "APP_DIR": str(app),
        "ARTIFACT_VERSION": "0.0.123001",
        "ARTIFACT_REVISION": "abcdef1234560000000000000000000000000000",
        "OCI_CLI_BIN": str(bin_dir / "oci"),
        "VAULT_SECRET_OCID": "ocid1.test",
        "OCI_REGION": "eu-test-1",
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
    }
    result = subprocess.run(
        ["bash", str(SCRIPT), *deploy_args],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, (app / "calls.log").read_text(), app


def test_failure_on_initial_apply_reports_without_restoring(tmp_path):
    result, calls = _deploy(tmp_path, '{"back_tag": null, "nlp_tag": null}')
    assert result.returncode == 1
    assert "migration boom" in result.stderr
    assert "no earlier configuration to restore" in result.stderr
    assert "--restore-previous" not in calls


def test_nlp_is_verified_before_migration_and_restored_when_migration_fails(tmp_path):
    result, calls = _deploy(tmp_path, '{"back_tag": "old", "nlp_tag": "old"}')
    assert result.returncode == 1
    assert "restoring the previous image references" in result.stderr
    assert "--restore-previous" in calls
    nlp_apply = calls.index("docker compose up -d --no-deps --wait languee-nlp")
    migration = calls.index("docker compose run --rm migrate")
    assert nlp_apply < migration
    assert "docker compose up -d --force-recreate --no-deps languee-nlp" in calls
    assert "docker compose up -d --force-recreate --no-deps languee-back" not in calls


def test_real_vault_tag_only_update_does_not_recreate_unselected_service(tmp_path):
    result, calls, _app = _deploy_with_real_vault_sync(
        tmp_path,
        valid_config(),
        "--back-tag",
        TAG,
    )

    assert result.returncode == 0, result.stderr
    assert "updated: .env" in result.stdout
    assert "backend tag=true, backend env=false, NLP tag=false, NLP env=false" in result.stdout
    assert "stack config=false" in result.stdout
    assert "docker compose up -d --no-deps --wait languee-back" in calls
    assert "docker compose up -d --no-deps --wait languee-nlp" not in calls
    assert "docker compose up -d --force-recreate --no-deps --wait languee-back" not in calls


def test_real_vault_app_env_update_reconciles_both_services_with_preserved_tags(tmp_path):
    config = valid_config()
    config["LOG_FORMAT"] = "pretty"
    config["LANGUEE_NLP_LOG_LEVEL"] = "debug"
    result, calls, _app = _deploy_with_real_vault_sync(
        tmp_path, config, "--preserve-tags", version=2
    )

    assert result.returncode == 0, result.stderr
    assert "languee-back.env" in result.stdout
    assert "languee-nlp.env" in result.stdout
    assert "backend tag=false, backend env=true" in result.stdout
    assert "NLP tag=false, NLP env=true" in result.stdout
    assert "docker compose up -d --no-deps --wait languee-nlp" in calls
    assert "docker compose up -d --no-deps --wait languee-back" in calls
    assert "docker compose run --rm migrate" not in calls
    assert "docker compose up -d --force-recreate --no-deps --wait languee-nlp" not in calls
    assert "docker compose up -d --force-recreate --no-deps --wait languee-back" not in calls


def test_real_vault_stack_env_change_reconciles_backend_without_persistent_drift(tmp_path):
    config = valid_config()
    config["MONITOR_DOMAIN"] = "new-monitor.languee-dev.example.com"
    result, calls, _app = _deploy_with_real_vault_sync(
        tmp_path, config, "--preserve-tags", version=2
    )

    assert result.returncode == 0, result.stderr
    assert "backend env=false, NLP tag=false, NLP env=false, stack config=true" in result.stdout
    assert "docker compose up -d --no-deps --wait languee-back" in calls
    assert "docker compose up -d --no-deps --wait languee-nlp" not in calls
    assert "docker compose up -d --no-recreate --wait postgres redis" in calls
    assert "docker compose up -d --force-recreate --no-deps postgres" not in calls
    assert "docker compose up -d --force-recreate --no-deps redis" not in calls


def test_config_only_compose_change_reconciles_app_definitions_without_touching_databases(tmp_path):
    result, calls = _deploy_readiness(
        tmp_path,
        CURL_SUCCESS_STUB,
        extra_args=("--config",),
    )

    assert result.returncode == 0, result.stderr
    assert "docker compose up -d --no-deps --wait languee-nlp" in calls
    assert "docker compose up -d --no-deps --wait languee-back" in calls
    assert "docker compose up -d --no-recreate --wait postgres redis" in calls
    assert "docker compose up -d --force-recreate --no-deps postgres" not in calls
    assert "docker compose up -d --force-recreate --no-deps redis" not in calls


def test_persistent_compose_hash_change_fails_before_no_recreate_without_approval(tmp_path):
    result, calls = _deploy_readiness(
        tmp_path,
        CURL_SUCCESS_STUB,
        PERSISTENT_HASH_DOCKER_STUB,
        applied_state={
            "phase": "applying",
            "baseline_verified": True,
            "persistent_config_hashes": {"postgres": "old-hash", "redis": "old-hash"},
        },
    )

    assert result.returncode == 2
    assert "rendered service definition changed" in result.stderr
    assert "docker compose up -d --no-recreate --wait postgres redis" not in calls
    assert "docker compose pull postgres" not in calls


def test_persistent_compose_hash_change_applies_only_with_explicit_maintenance_approval(tmp_path):
    result, calls = _deploy_readiness(
        tmp_path,
        CURL_SUCCESS_STUB,
        PERSISTENT_HASH_DOCKER_STUB,
        ("--allow-persistent-infra",),
        {
            "phase": "applying",
            "baseline_verified": True,
            "persistent_config_hashes": {"postgres": "old-hash", "redis": "old-hash"},
        },
    )

    assert result.returncode == 0, result.stderr
    assert "persistent infrastructure update approved: postgres" in result.stdout
    assert "persistent infrastructure update approved: redis" in result.stdout
    assert "docker compose pull postgres" in calls
    assert "docker compose pull redis" in calls


def test_existing_persistent_volume_without_verified_hash_requires_maintenance(tmp_path):
    result, calls = _deploy_readiness(
        tmp_path,
        CURL_SUCCESS_STUB,
        PERSISTENT_HASH_DOCKER_STUB,
    )

    assert result.returncode == 2
    assert "no verified prior service definition is recorded" in result.stderr
    assert "docker compose up -d --no-recreate --wait postgres redis" not in calls


def test_existing_matching_containers_bootstrap_without_maintenance(tmp_path, monkeypatch):
    monkeypatch.setenv("PERSISTENT_ACTUAL_HASH", "desired-hash")
    result, calls = _deploy_readiness(tmp_path, CURL_SUCCESS_STUB, PERSISTENT_HASH_DOCKER_STUB)

    assert result.returncode == 0, result.stderr
    assert "docker compose up -d --no-recreate --wait postgres redis" in calls
    assert "docker compose pull postgres" not in calls


def test_vault_rendered_persistent_config_change_requires_maintenance(tmp_path):
    baseline = {
        "phase": "applying",
        "baseline_verified": True,
        "persistent_config_hashes": {"postgres": "desired-hash", "redis": "old-redis-hash"},
    }
    result, calls = _deploy_readiness(
        tmp_path,
        CURL_SUCCESS_STUB,
        PERSISTENT_HASH_DOCKER_STUB,
        applied_state=baseline,
    )

    assert result.returncode == 2
    assert "rendered service definition changed since its last verified apply" in result.stderr
    assert "docker compose pull redis" not in calls


def test_unchanged_persistent_service_hash_uses_no_recreate_without_maintenance(tmp_path):
    baseline = {
        "phase": "applying",
        "baseline_verified": True,
        "persistent_config_hashes": {"postgres": "desired-hash", "redis": "desired-hash"},
    }
    result, calls = _deploy_readiness(
        tmp_path,
        CURL_SUCCESS_STUB,
        PERSISTENT_HASH_DOCKER_STUB,
        applied_state=baseline,
    )

    assert result.returncode == 0, result.stderr
    assert "docker compose up -d --no-recreate --wait postgres redis" in calls
    assert "docker compose pull postgres" not in calls
    assert "docker compose pull redis" not in calls


def test_legacy_artifact_version_is_accepted_for_rollback(tmp_path):
    result, _ = _deploy(
        tmp_path, '{"back_tag": "old", "nlp_tag": "old"}', "0.1.123001"
    )

    assert result.returncode == 1
    assert "OCI labels do not match" not in result.stderr


def test_artifact_version_must_match_its_build_ordinal(tmp_path):
    result, _ = _deploy(
        tmp_path, '{"back_tag": "old", "nlp_tag": "old"}', "0.0.123002"
    )

    assert result.returncode == 1
    assert "OCI labels do not match its build tag" in result.stderr


def test_persistent_infrastructure_requires_explicit_maintenance_approval(tmp_path):
    app = tmp_path / "app"
    (app / "scripts").mkdir(parents=True)
    (app / "state").write_text('{"back_tag": "old", "nlp_tag": "old"}')
    _executable(app / "scripts" / "sync-vault-config.py", SYNC_STUB)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _executable(bin_dir / "python3", '#!/bin/bash\nif [[ "$1" = -* ]]; then exec /usr/bin/python3 "$@"; else exec "$@"; fi\n')
    result = subprocess.run(
        ["bash", str(SCRIPT), "--infra", "postgres"],
        env={**os.environ, "APP_DIR": str(app), "PATH": f"{bin_dir}:{os.environ['PATH']}"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2
    assert "verified backup and compatibility review" in result.stderr


def test_deploy_gates_success_on_local_caddy_readiness(tmp_path):
    result, calls = _deploy_readiness(tmp_path, CURL_SUCCESS_STUB)

    assert result.returncode == 0
    assert "https://example.test/health/ready" in calls
    assert "--resolve example.test:443:127.0.0.1" in calls
    assert "--retry 10" in calls


def test_deploy_fails_when_local_caddy_is_not_ready(tmp_path):
    result, calls = _deploy_readiness(tmp_path, CURL_FAILURE_STUB)

    assert result.returncode == 22
    assert "https://example.test/health/ready" in calls


def test_monitoring_failure_does_not_block_application_deployment(tmp_path):
    result, calls = _deploy_readiness(tmp_path, CURL_SUCCESS_STUB, MONITORING_FAILURE_DOCKER_STUB)

    assert result.returncode == 0
    assert "WARNING: monitoring stack did not become healthy" in result.stderr
    assert "up -d --no-deps --wait caddy" in calls


def test_production_backend_healthcheck_uses_liveness_endpoint():
    compose = (Path(__file__).parents[2] / "docker-compose.prod.yml").read_text()

    assert "http://localhost:3000/health/live" in compose
    assert "http://localhost:3000/health/ready" not in compose


def test_monitoring_services_have_no_health_gated_dependencies():
    compose = (Path(__file__).parents[2] / "docker-compose.prod.yml").read_text()
    alloy = compose.split("  alloy:\n", 1)[1].split("  grafana:\n", 1)[0]
    grafana = compose.split("  grafana:\n", 1)[1].split("\nvolumes:", 1)[0]

    assert "depends_on:" not in alloy
    assert "depends_on:" not in grafana
    assert '["CMD", "/tempo", "--health"]' in compose
    assert '["CMD", "/bin/wget", "-qO-", "http://localhost:9090/-/healthy"]' in compose
    assert '["CMD", "/usr/bin/wget", "-qO-", "http://localhost:3000/api/health"]' in compose


def test_pinned_monitoring_images_contain_healthcheck_executables():
    if shutil.which("docker") is None:
        return

    images = {
        "grafana/tempo:2.7.1": "/tempo",
        "prom/prometheus:v3.4.0": "/bin/wget",
        "grafana/grafana:13.0.1-security-01": "/usr/bin/wget",
    }
    for image, executable in images.items():
        container = subprocess.check_output(["docker", "create", image], text=True).strip()
        try:
            exported = subprocess.check_output(["docker", "export", container])
            with tarfile.open(fileobj=io.BytesIO(exported)) as archive:
                assert executable.lstrip("/") in archive.getnames(), image
        finally:
            subprocess.run(["docker", "rm", "-f", container], check=False, capture_output=True)


def test_deploy_workflow_copies_disk_health_script():
    workflow = (Path(__file__).parents[2] / ".github/workflows/deploy.yml").read_text()
    assert "source: deploy/caddy/,deploy/scripts/" in workflow
    assert "deploy/scripts/" in workflow
