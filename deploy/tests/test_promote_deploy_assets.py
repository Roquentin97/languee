"""Staged deployment payload promotion and recovery tests."""

import os
import subprocess
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "promote-deploy-assets.sh"


def _payload(stage: Path, revision: str) -> None:
    for relative in (
        "scripts/backup-db.sh",
        "scripts/check-disk-health.py",
        "scripts/classify-deploy-changes.py",
        "scripts/cleanup-images.py",
        "scripts/deploy-stack.sh",
        "scripts/deploy-state.py",
        "scripts/promote-deploy-assets.sh",
        "scripts/provision.sh",
        "scripts/reconcile-deploy.py",
        "scripts/sync-vault-config.py",
        "provision/alloy/config.alloy",
        "provision/grafana/provisioning/dashboards/dashboards.yaml",
        "provision/grafana/provisioning/dashboards/languee-red.json",
        "provision/grafana/provisioning/datasources/loki.yaml",
        "provision/grafana/provisioning/datasources/prometheus.yaml",
        "provision/grafana/provisioning/datasources/tempo.yaml",
        "provision/loki-config.yaml",
        "provision/prometheus/prometheus.yml",
        "provision/tempo/tempo.yaml",
    ):
        path = stage / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{relative} {revision}\n")
    (stage / "caddy/Caddyfile").parent.mkdir(parents=True)
    (stage / "caddy/Caddyfile").write_text(f"proxy {revision}\n")
    (stage / "docker-compose.prod.yml").write_text(f"compose {revision}\n")


def _run(app: Path, stage: Path) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "APP_DIR": str(app),
        "DEPLOY_STAGE": str(stage),
    }
    return subprocess.run(
        ["bash", str(SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_promotion_replaces_tracked_assets_and_removes_stale_provisioning(tmp_path):
    app = tmp_path / "app"
    stage = app / ".deploy-staging/12345-1"
    _payload(stage, "new")
    (app / "scripts").mkdir(parents=True)
    (app / "scripts/old-script.sh").write_text("old\n")
    (app / "provision").mkdir()
    (app / "provision/obsolete.yaml").write_text("obsolete\n")
    (app / "caddy").mkdir()
    (app / "caddy/Caddyfile").write_text("old proxy\n")
    (app / "docker-compose.prod.yml").write_text("old compose\n")

    result = _run(app, stage)

    assert result.returncode == 0, result.stderr
    assert (app / "scripts/deploy-stack.sh").read_text() == "scripts/deploy-stack.sh new\n"
    assert not (app / "scripts/old-script.sh").exists()
    assert (app / "provision/loki-config.yaml").read_text() == "provision/loki-config.yaml new\n"
    assert not (app / "provision/obsolete.yaml").exists()
    assert (app / "caddy/Caddyfile").read_text() == "proxy new\n"
    assert (app / "docker-compose.prod.yml").read_text() == "compose new\n"


def test_incomplete_promotion_fails_and_next_run_replaces_partial_tree(tmp_path):
    app = tmp_path / "app"
    first = app / ".deploy-staging/12345-1"
    _payload(first, "partial")
    (first / "provision/loki-config.yaml").unlink()
    (app / "scripts").mkdir(parents=True)
    (app / "scripts/deploy-stack.sh").write_text("old\n")

    failed = _run(app, first)
    assert failed.returncode != 0
    assert (app / "scripts/deploy-stack.sh").read_text() == "old\n"

    second = app / ".deploy-staging/12346-1"
    _payload(second, "recovered")
    recovered = _run(app, second)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / "scripts/deploy-stack.sh").read_text() == "scripts/deploy-stack.sh recovered\n"
    assert (app / "provision/loki-config.yaml").read_text() == "provision/loki-config.yaml recovered\n"
    assert (app / "docker-compose.prod.yml").read_text() == "compose recovered\n"
