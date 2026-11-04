"""Targeted deployment and recovery behaviour, with command stubs only."""

import os
import stat
import subprocess
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "deploy-stack.sh"
TAG = "dev-123001-abcdef123456"

SYNC_STUB = """#!/bin/bash
echo "sync $*" >> "$APP_DIR/calls.log"
case "$1" in --app-dir) shift 2 ;; esac
case "$1" in
  --status) cat "$APP_DIR/state" ;;
  --restore-previous) echo restored ;;
  *) echo '{"back_tag": "new", "nlp_tag": "new"}' > "$APP_DIR/state"; echo 'updated: .env' ;;
esac
"""

DOCKER_STUB = """#!/bin/bash
echo "docker $*" >> "$APP_DIR/calls.log"
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
"""

CURL_SUCCESS_STUB = """#!/bin/bash
echo "curl $*" >> "$APP_DIR/calls.log"
exit 0
"""

CURL_FAILURE_STUB = """#!/bin/bash
echo "curl $*" >> "$APP_DIR/calls.log"
exit 22
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
    _executable(bin_dir / "python3", '#!/bin/bash\nexec "$@"\n')
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
    tmp_path: Path, curl_stub: str
) -> tuple[subprocess.CompletedProcess[str], str]:
    app = tmp_path / "app"
    (app / "scripts").mkdir(parents=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _executable(app / "scripts" / "sync-vault-config.py", SYNC_STUB)
    _executable(bin_dir / "docker", SUCCESS_DOCKER_STUB)
    _executable(bin_dir / "curl", curl_stub)
    _executable(bin_dir / "python3", '#!/bin/bash\nexec "$@"\n')
    (app / "state").write_text('{"back_tag": "old", "nlp_tag": "old"}')
    (app / ".env").write_text("DOMAIN=example.test\n")
    result = subprocess.run(
        ["bash", str(SCRIPT), "--preserve-tags"],
        env={**os.environ, "APP_DIR": str(app), "PATH": f"{bin_dir}:{os.environ['PATH']}"},
        capture_output=True,
        text=True,
        check=False,
    )
    return result, (app / "calls.log").read_text()


def test_failure_on_initial_apply_reports_without_restoring(tmp_path):
    result, calls = _deploy(tmp_path, '{"back_tag": null, "nlp_tag": null}')
    assert result.returncode == 1
    assert "migration boom" in result.stderr
    assert "no earlier configuration to restore" in result.stderr
    assert "--restore-previous" not in calls


def test_failure_after_established_deploy_restores_only_affected_apps(tmp_path):
    result, calls = _deploy(tmp_path, '{"back_tag": "old", "nlp_tag": "old"}')
    assert result.returncode == 1
    assert "restoring the previous image references" in result.stderr
    assert "--restore-previous" in calls
    assert "up -d --force-recreate --no-deps" not in calls  # migration failed before app mutation


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
    _executable(bin_dir / "python3", '#!/bin/bash\nexec "$@"\n')
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


def test_production_backend_healthcheck_uses_liveness_endpoint():
    compose = (Path(__file__).parents[2] / "docker-compose.prod.yml").read_text()

    assert "http://localhost:3000/health/live" in compose
    assert "http://localhost:3000/health/ready" not in compose
