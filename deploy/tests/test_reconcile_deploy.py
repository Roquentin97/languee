"""Deployment reconciliation and verified state regression tests."""

import importlib.util
import json
import subprocess
from pathlib import Path

import pytest


SCRIPTS = Path(__file__).parents[1] / "scripts"


def load_script(name, module_name):
    spec = importlib.util.spec_from_file_location(module_name, SCRIPTS / name)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


state_module = load_script("deploy-state.py", "deploy_state")
reconcile = load_script("reconcile-deploy.py", "reconcile_deploy")

BACK_OLD = "1" * 40
BACK_NEW = "2" * 40
NLP_OLD = "3" * 40
NLP_NEW = "4" * 40
CONFIG_OLD = "5" * 40
CONFIG_NEW = "6" * 40


def state(backend=BACK_OLD, nlp=NLP_OLD, config=CONFIG_OLD):
    return {
        "schema_version": 1,
        "components": {
            "backend": {
                "source_revision": backend,
                "artifact_revision": backend,
                "image_tag": "back-old",
            },
            "nlp": {
                "source_revision": nlp,
                "artifact_revision": nlp,
                "image_tag": "nlp-old",
            },
        },
        "configuration": {"source_revision": config},
    }


def _commit(directory: Path, message: str) -> str:
    subprocess.run(["git", "add", "."], cwd=directory, check=True)
    subprocess.run(
        ["git", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", message],
        cwd=directory,
        check=True,
        capture_output=True,
        text=True,
    )
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=directory, text=True).strip()


def _repo(tmp_path: Path) -> tuple[Path, dict[str, str]]:
    directory = tmp_path / "repo"
    directory.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "develop"], cwd=directory, check=True)
    (directory / "apps/languee-back").mkdir(parents=True)
    (directory / "apps/languee-nlp").mkdir(parents=True)
    (directory / "deploy/scripts").mkdir(parents=True)
    (directory / "provision").mkdir()
    (directory / "deploy/caddy").mkdir()
    (directory / "deploy/env").mkdir()
    (directory / "apps/languee-back/main.ts").write_text("v1\n")
    (directory / "apps/languee-nlp/main.py").write_text("v1\n")
    (directory / "deploy/scripts/deploy-stack.sh").write_text("v1\n")
    (directory / "docker-compose.prod.yml").write_text(
        "services:\n"
        "  postgres:\n    image: postgres:18@sha256:old\n"
        "  redis:\n    image: redis:7@sha256:old\n"
        "  caddy:\n    image: caddy:2@sha256:old\n"
    )
    base = _commit(directory, "initial")
    (directory / "apps/languee-back/main.ts").write_text("v2\n")
    backend = _commit(directory, "backend change")
    (directory / "apps/languee-nlp/main.py").write_text("v2\n")
    nlp = _commit(directory, "nlp change")
    (directory / "deploy/scripts/deploy-stack.sh").write_text("v2\n")
    config = _commit(directory, "config change")
    return directory, {"base": base, "backend": backend, "nlp": nlp, "config": config}


def test_nlp_only_followup_reconciles_backend_skipped_after_failed_nlp_build(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    # #261 built backend but failed NLP, so Deploy was skipped and state stayed
    # at the pre-incident revisions. The later NLP-only #263 head must retry both.
    host = state(backend=commits["base"], nlp=commits["base"], config=commits["base"])
    result = reconcile.decisions(
        raw_state=json.dumps(host), ref=commits["nlp"], head=commits["nlp"]
    )
    assert result["backend"] is True
    assert result["nlp"] is True
    assert result["config"] is False
    assert result["deploy"] is True


def test_later_unrelated_or_config_only_push_reconciles_missing_backend(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    (repo / "README.md").write_text("unrelated\n")
    head = _commit(repo, "unrelated change")
    # Models #265 applying config while the backend artifact is still stale.
    host = state(backend=commits["base"], nlp=commits["nlp"], config=commits["config"])
    result = reconcile.decisions(raw_state=json.dumps(host), ref=head, head=head)
    assert result["backend"] is True
    assert result["nlp"] is False


def test_latest_queued_head_reconciles_components_from_superseded_pushes(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    (repo / "README.md").write_text("newer queued head\n")
    latest = _commit(repo, "queued unrelated update")
    # A pending NLP-only run can be superseded by the latest queued workflow;
    # reconciliation is against the latest source state, not that event's diff.
    host = state(backend=commits["base"], nlp=commits["base"], config=commits["base"])
    stale_run = reconcile.decisions(
        raw_state=json.dumps(host), ref=commits["nlp"], head=latest
    )
    assert stale_run["stale"] is True
    assert stale_run["deploy"] is False
    result = reconcile.decisions(raw_state=json.dumps(host), ref=latest, head=latest)
    assert result["backend"] is True
    assert result["nlp"] is True
    assert result["config"] is True


def test_canceled_or_failed_apply_state_is_unknown_on_next_resolve(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    host = state(
        backend=commits["backend"], nlp=commits["nlp"], config=commits["config"]
    )
    state_path = tmp_path / state_module.STATE_FILE
    state_path.write_text(json.dumps(host))
    state_module.begin(tmp_path)

    # Cancellation after host mutation has no record step; the dirty marker
    # must make the next resolver abandon the old trusted revisions.
    interrupted = state_module.status(tmp_path)
    result = reconcile.decisions(
        raw_state=json.dumps(interrupted), ref=commits["config"], head=commits["config"]
    )

    assert interrupted == {"known": False, "reason": "a previous deployment did not reach verification"}
    assert result["state_known"] is False
    assert result["state_reason"] == "a previous deployment did not reach verification"
    assert result["backend"] is True
    assert result["nlp"] is True
    assert result["config"] is True


@pytest.mark.parametrize("interruption", ["readiness", "state-write", "force", "rollback"])
def test_interrupted_force_or_rollback_cannot_leave_verified_source_state(
    tmp_path, monkeypatch, interruption
):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    host = state(
        backend=commits["backend"], nlp=commits["nlp"], config=commits["config"]
    )
    state_path = tmp_path / state_module.STATE_FILE
    state_path.write_text(json.dumps(host))
    previous_run = reconcile.decisions(
        raw_state=json.dumps(host),
        ref=commits["config"],
        head=commits["config"],
        force=interruption in ("readiness", "state-write", "force"),
        rollback_backend=("dev-1001-abcdef123456" if interruption == "rollback" else ""),
    )
    assert previous_run["deploy"] is True
    assert previous_run["rollback"] is (interruption == "rollback")
    state_module.begin(tmp_path)

    # A public readiness failure never reaches `record`; a failed state write
    # must leave the same marker. Force and rollback use the same begin path.
    if interruption == "state-write":
        monkeypatch.setattr(state_module, "_artifact_revision", lambda *_: BACK_NEW)
        monkeypatch.setattr(
            state_module,
            "_atomic_write",
            lambda *_: (_ for _ in ()).throw(OSError("disk full")),
        )
        args = state_module.build_parser().parse_args(
            ["record", "--app-dir", str(tmp_path), "--backend-tag", "candidate", "--backend-source-revision", BACK_NEW]
        )
        with pytest.raises(OSError, match="disk full"):
            state_module.record(args)

    state_after_failure = state_module.status(tmp_path)
    result = reconcile.decisions(
        raw_state=json.dumps(state_after_failure),
        ref=commits["config"],
        head=commits["config"],
    )
    assert not state_after_failure["known"], interruption
    assert result["backend"] is True, interruption
    assert result["nlp"] is True, interruption
    assert result["config"] is True, interruption


def test_successful_incremental_deploy_and_no_change(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    host = state(backend=commits["backend"], nlp=commits["nlp"], config=commits["config"])
    result = reconcile.decisions(
        raw_state=json.dumps(host), ref=commits["config"], head=commits["config"]
    )
    assert result["backend"] is False
    assert result["nlp"] is False
    assert result["config"] is False
    assert result["deploy"] is False


def test_missing_or_corrupt_state_rebuilds_conservatively(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    for raw in ("", "not json", json.dumps({"schema_version": 1})):
        result = reconcile.decisions(raw_state=raw, ref=commits["config"], head=commits["config"])
        assert result["state_known"] is False
        assert result["backend"] is True
        assert result["nlp"] is True
        assert result["config"] is True
        assert result["deploy"] is True


def test_force_builds_both_without_forcing_configuration(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    host = state(backend=commits["backend"], nlp=commits["nlp"], config=commits["config"])
    result = reconcile.decisions(
        raw_state=json.dumps(host), ref=commits["config"], head=commits["config"], force=True
    )
    assert result["backend"] is True
    assert result["nlp"] is True
    assert result["config"] is False


def test_superseded_run_does_not_claim_deployment(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    (repo / "README.md").write_text("newer develop head\n")
    current_head = _commit(repo, "newer head")
    result = reconcile.decisions(
        raw_state=json.dumps(state()), ref=commits["config"], head=current_head
    )
    assert result["stale"] is True
    assert result["deploy"] is False


def test_rollback_selects_only_requested_service_and_does_not_update_source_revision(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    host = state(backend=commits["backend"], nlp=commits["nlp"], config=commits["config"])
    result = reconcile.decisions(
        raw_state=json.dumps(host),
        ref=commits["config"],
        head=commits["config"],
        rollback_backend="dev-1001-abcdef123456",
    )
    assert result["rollback"] is True
    assert result["backend"] is True
    assert result["build_backend"] is False
    assert result["nlp"] is False
    assert result["config"] is False


def test_config_image_changes_select_only_changed_infrastructure(tmp_path, monkeypatch):
    repo, commits = _repo(tmp_path)
    monkeypatch.chdir(repo)
    compose = repo / "docker-compose.prod.yml"
    compose.write_text(compose.read_text().replace("redis:7@sha256:old", "redis:7@sha256:new"))
    new_config = _commit(repo, "redis image update")
    host = state(backend=commits["backend"], nlp=commits["nlp"], config=commits["config"])
    result = reconcile.decisions(raw_state=json.dumps(host), ref=new_config, head=new_config)
    assert result["config"] is True
    assert result["infra"] == "redis"


def test_status_marks_partial_and_corrupt_state_unknown(tmp_path):
    assert state_module.status(tmp_path) == {"known": False, "reason": "missing"}
    path = tmp_path / state_module.STATE_FILE
    path.write_text("{")
    assert state_module.status(tmp_path) == {"known": False, "reason": "corrupt"}
    path.write_text(json.dumps({"schema_version": 1, "components": {}, "configuration": {}}))
    assert state_module.status(tmp_path) == {"known": False, "reason": "corrupt"}


def test_record_verifies_artifact_before_atomic_state_write(tmp_path, monkeypatch, capsys):
    revision = "a" * 40
    monkeypatch.setattr(state_module, "_artifact_revision", lambda *_: revision)
    args = state_module.build_parser().parse_args(
        [
            "record",
            "--app-dir",
            str(tmp_path),
            "--backend-tag",
            "back-tag",
            "--backend-source-revision",
            BACK_NEW,
            "--nlp-tag",
            "nlp-tag",
            "--nlp-source-revision",
            NLP_NEW,
            "--configuration-source-revision",
            CONFIG_NEW,
        ]
    )
    state_module.record(args)
    saved = json.loads((tmp_path / state_module.STATE_FILE).read_text())
    assert saved["components"]["backend"] == {
        "source_revision": BACK_NEW,
        "artifact_revision": revision,
        "image_tag": "back-tag",
    }
    assert saved["configuration"]["source_revision"] == CONFIG_NEW
    assert saved["phase"] == "verified"
    assert state_module.status(tmp_path)["known"] is True
    assert json.loads(capsys.readouterr().out)["known"] is True


def test_rollback_records_artifact_revision_for_future_forward_reconciliation(tmp_path, monkeypatch):
    revision = "b" * 40
    monkeypatch.setattr(state_module, "_artifact_revision", lambda *_: revision)
    (tmp_path / state_module.STATE_FILE).write_text(json.dumps(state()))
    state_module.begin(tmp_path)
    args = state_module.build_parser().parse_args(
        ["record", "--app-dir", str(tmp_path), "--backend-tag", "old-tag", "--rollback"]
    )
    state_module.record(args)
    result = json.loads((tmp_path / state_module.STATE_FILE).read_text())
    assert result["components"]["backend"]["source_revision"] == revision
    assert state_module.status(tmp_path)["known"] is True


def test_partial_rollback_does_not_report_an_incomplete_state_as_current(tmp_path, monkeypatch):
    monkeypatch.setattr(state_module, "_artifact_revision", lambda *_: "b" * 40)
    args = state_module.build_parser().parse_args(
        ["record", "--app-dir", str(tmp_path), "--backend-tag", "old-tag", "--rollback"]
    )
    try:
        state_module.record(args)
    except state_module.StateError as error:
        assert "state remains incomplete" in str(error)
    else:
        raise AssertionError("partial rollback must not produce a successful state record")
    assert state_module.status(tmp_path)["known"] is False


def test_failed_state_write_preserves_previous_file(tmp_path, monkeypatch):
    path = tmp_path / state_module.STATE_FILE
    original = json.dumps(state(BACK_NEW, NLP_NEW, CONFIG_NEW))
    path.write_text(original)
    state_module.begin(tmp_path)
    in_progress = path.read_text()
    monkeypatch.setattr(state_module, "_artifact_revision", lambda *_: "c" * 40)

    def fail_write(*_args):
        raise OSError("disk full")

    monkeypatch.setattr(state_module, "_atomic_write", fail_write)
    args = state_module.build_parser().parse_args(
        ["record", "--app-dir", str(tmp_path), "--backend-tag", "candidate", "--backend-source-revision", BACK_OLD]
    )
    try:
        state_module.record(args)
    except OSError:
        pass
    else:
        raise AssertionError("state write failure should be reported")
    assert path.read_text() == in_progress
    assert state_module.status(tmp_path)["known"] is False


def test_deployment_workflow_records_state_only_after_public_readiness():
    workflow = (Path(__file__).parents[2] / ".github/workflows/deploy.yml").read_text()
    assert workflow.index("Read last verified deployment state") < workflow.index("build-back:")
    assert workflow.index("Mark applied state untrusted before mutation") < workflow.index("Apply selected artifacts")
    assert workflow.index("Check public backend readiness") < workflow.index("Record health-verified state")
    assert "runs-on: ubuntu-24.04-arm" in workflow
    assert "cancel-in-progress: false" in workflow


def test_apply_config_is_vault_only_and_reports_source_drift():
    workflow = (Path(__file__).parents[2] / ".github/workflows/apply-config.yml").read_text()
    assert "group: deploy-dev" in workflow
    assert "--preserve-tags" in workflow
    assert "Read applied source state" in workflow
    assert "This workflow does not build or deploy application code" in workflow
    assert "deploy-state.py record" not in workflow
