"""deploy-stack.sh failure handling, with stubbed sync script and docker."""

import os
import stat
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "deploy-stack.sh"

SYNC_STUB = """#!/bin/bash
echo "sync $*" >> "$APP_DIR/calls.log"
case "$1" in
  --app-dir) shift 2 ;;
esac
case "$1" in
  --status) cat "$APP_DIR/state" ;;
  --restore-previous) echo restored ;;
  *) echo '{"tag": "new"}' > "$APP_DIR/state" ;;
esac
"""

DOCKER_STUB = """#!/bin/bash
echo "docker $*" >> "$APP_DIR/calls.log"
if [ "$2" = "run" ]; then echo "migration boom" >&2; exit 1; fi
"""


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _deploy(tmp_path: Path, state_before: str) -> tuple[subprocess.CompletedProcess[str], str]:
    app = tmp_path / "app"
    (app / "scripts").mkdir(parents=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _executable(app / "scripts" / "sync-vault-config.py", SYNC_STUB)
    _executable(bin_dir / "docker", DOCKER_STUB)
    (app / "state").write_text(state_before)
    env = {
        **os.environ,
        "APP_DIR": str(app),
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
    }
    # The deploy script invokes the sync stub as `python3 <script>`.
    (bin_dir / "python3").write_text('#!/bin/bash\nexec "$@"\n')
    (bin_dir / "python3").chmod(0o755)
    result = subprocess.run(
        ["bash", str(SCRIPT), "--tag", "sha-1234567"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, (app / "calls.log").read_text()


def test_failure_on_initial_apply_reports_without_restoring(tmp_path):
    result, calls = _deploy(tmp_path, "{}")
    assert result.returncode == 1
    assert "migration boom" in result.stderr
    assert "no earlier configuration to restore" in result.stderr
    assert "--restore-previous" not in calls


def test_failure_after_established_deploy_restores_previous(tmp_path):
    result, calls = _deploy(tmp_path, '{"tag": "old"}')
    assert result.returncode == 1
    assert "restoring previous configuration" in result.stderr
    assert "--restore-previous" in calls
    assert "up -d --force-recreate --no-deps languee-nlp languee-back" in calls
