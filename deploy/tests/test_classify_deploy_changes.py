"""Regression coverage for deploy build/apply ownership decisions."""

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "classify-deploy-changes.py"
spec = importlib.util.spec_from_file_location("classify_deploy_changes", SCRIPT)
classifier = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(classifier)


def decisions(*paths: str, **kwargs):
    return classifier.classify(list(paths), **kwargs)


def test_backend_change_only_builds_backend_pair():
    assert decisions("apps/languee-back/src/main.ts") == {
        "back": True,
        "nlp": False,
        "config": False,
        "production_compose": False,
        "local_only": False,
        "relevant": True,
    }


def test_nlp_change_only_builds_nlp():
    assert decisions("apps/languee-nlp/Dockerfile")["back"] is False
    assert decisions("apps/languee-nlp/Dockerfile")["nlp"] is True


def test_android_and_docs_changes_do_not_target_the_vm():
    assert decisions("apps/languee-droid/app/build.gradle.kts", "README.md")["relevant"] is False


def test_production_config_and_local_observability_are_separate_domains():
    production = decisions("docker-compose.prod.yml")
    assert production["config"] and production["production_compose"]
    local = decisions("docker-compose.yml")
    assert local["local_only"] and not local["relevant"]


def test_observability_provisioning_is_config_only():
    result = decisions("provision/alloy/config.alloy", "provision/grafana/provisioning/datasources/loki.yaml")
    assert result["config"] and result["relevant"]
    assert not result["back"] and not result["nlp"]


def test_observability_provisioning_and_backend_change_builds_only_backend():
    result = decisions("provision/tempo/tempo.yaml", "apps/languee-back/src/main.ts")
    assert result["config"] and result["back"] and not result["nlp"]


def test_missing_history_is_conservative_for_application_images():
    result = decisions("README.md", conservative=True)
    assert result["back"] and result["nlp"] and result["relevant"]
