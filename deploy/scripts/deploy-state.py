#!/usr/bin/env python3
"""Invalidate, inspect, and atomically record verified deployment identities."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_FILE = ".applied-deploy-state.json"
DIRTY_FILE = ".applied-deploy-state.dirty"
REVISION = re.compile(r"[0-9a-f]{40}")
IMAGE_TAG = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}")
CONFIG_HASH = re.compile(r"[A-Za-z0-9_-]{1,128}")
IMAGE_PREFIX = "ghcr.io/roquentin97/languee"
PERSISTENT_SERVICES = ("postgres", "redis")


class StateError(Exception):
    """A safe, actionable state error without configuration values."""


def _valid_component(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("source_revision"), str)
        and REVISION.fullmatch(value["source_revision"]) is not None
        and isinstance(value.get("artifact_revision"), str)
        and REVISION.fullmatch(value["artifact_revision"]) is not None
        and isinstance(value.get("image_tag"), str)
        and IMAGE_TAG.fullmatch(value["image_tag"]) is not None
    )


def state_problem(value: Any) -> str | None:
    """Return why a persisted deployment state cannot be trusted."""
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        return "missing or unsupported schema"
    components = value.get("components")
    if not isinstance(components, dict):
        return "component state is missing"
    for name in ("backend", "nlp"):
        if not _valid_component(components.get(name)):
            return f"{name} state is missing or malformed"
    configuration = value.get("configuration")
    if (
        not isinstance(configuration, dict)
        or not isinstance(configuration.get("source_revision"), str)
        or REVISION.fullmatch(configuration["source_revision"]) is None
    ):
        return "configuration state is missing or malformed"
    persistent = value.get("persistent_config_hashes")
    if persistent is not None and (
        not isinstance(persistent, dict)
        or any(
            not isinstance(persistent.get(name), str)
            or CONFIG_HASH.fullmatch(persistent[name]) is None
            for name in PERSISTENT_SERVICES
        )
    ):
        return "persistent infrastructure state is missing or malformed"
    if value.get("phase", "verified") == "applying":
        return "a previous deployment did not reach verification"
    if value.get("phase", "verified") != "verified":
        return "deployment state has an unsupported phase"
    return None


def load_state(
    path: Path, *, allow_applying: bool = False
) -> tuple[dict[str, Any] | None, str | None]:
    """Read trusted state; missing and corrupt files request conservative repair."""
    dirty_path = path.parent / DIRTY_FILE
    dirty = dirty_path.exists()
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, "missing"
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None, "corrupt"
    if allow_applying and isinstance(state, dict) and state.get("phase") == "applying":
        return state, None
    if dirty and not (
        allow_applying and isinstance(state, dict) and state.get("phase") == "applying"
    ):
        return None, "a previous deployment did not reach verification"
    problem = state_problem(state)
    if allow_applying and problem == "a previous deployment did not reach verification":
        return state, None
    if problem is None:
        return state, None
    if problem == "a previous deployment did not reach verification":
        return None, problem
    return None, "corrupt"


def status(app_dir: Path) -> dict[str, Any]:
    """Return JSON-safe metadata suitable for the workflow resolver."""
    state, reason = load_state(app_dir / STATE_FILE)
    if state is None:
        return {"known": False, "reason": reason or "corrupt"}
    return {"known": True, "state": state}


def begin(app_dir: Path) -> dict[str, Any]:
    """Mark state untrusted before a workflow mutates the running stack."""
    state_path = app_dir / STATE_FILE
    current, _reason = load_state(state_path, allow_applying=True)
    had_verified_baseline = (
        current is not None and current.get("phase", "verified") == "verified"
    )
    if current is None:
        current = {
            "schema_version": 1,
            "components": {},
            "configuration": {},
        }
    elif not isinstance(current.get("components"), dict) or not isinstance(
        current.get("configuration"), dict
    ):
        current = {
            "schema_version": 1,
            "components": {},
            "configuration": {},
        }
    current = json.loads(json.dumps(current))
    current["phase"] = "applying"
    current["baseline_verified"] = had_verified_baseline
    current["started_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    _atomic_write(
        app_dir / DIRTY_FILE,
        {"started_at": current["started_at"]},
    )
    _atomic_write(state_path, current)
    return {"known": False, "reason": "deployment in progress"}


def _artifact_revision(service: str, tag: str, prefix: str) -> str:
    image_name = "languee-back" if service == "backend" else "languee-nlp"
    image = f"{prefix}/{image_name}:{tag}"
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}", image],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise StateError(f"could not inspect applied {service} image") from None
    revision = result.stdout.strip()
    if result.returncode != 0 or REVISION.fullmatch(revision) is None:
        raise StateError(f"applied {service} image has no valid source revision label")
    if tag.startswith("dev-") and revision[:12] != tag.rsplit("-", 1)[-1]:
        raise StateError(f"applied {service} image revision does not match its tag")
    return revision


def _persistent_config_hashes(app_dir: Path) -> dict[str, str]:
    """Capture the resolved protected-service definitions after a healthy apply."""
    hashes: dict[str, str] = {}
    for service in PERSISTENT_SERVICES:
        try:
            result = subprocess.run(
                ["docker", "compose", "config", "--hash", service],
                cwd=app_dir,
                capture_output=True,
                text=True,
                check=False,
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired):
            raise StateError(f"could not inspect the applied {service} Compose definition") from None
        if result.returncode != 0:
            raise StateError(f"could not inspect the applied {service} Compose definition")
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[0] == service and CONFIG_HASH.fullmatch(parts[1]):
                hashes[service] = parts[1]
                break
        if service not in hashes:
            raise StateError(f"the applied {service} Compose definition has no valid hash")
    return hashes


def _atomic_write(path: Path, state: dict[str, Any]) -> None:
    fd, name = tempfile.mkstemp(prefix=".applied-deploy-state-", dir=path.parent)
    temporary = Path(name)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _clear_dirty_marker(path: Path) -> None:
    marker = path.parent / DIRTY_FILE
    marker.unlink(missing_ok=True)
    directory_fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def finish_vault_apply(app_dir: Path) -> None:
    """Close a successful Vault-only apply without advancing source identity."""
    state_path = app_dir / STATE_FILE
    current, _reason = load_state(state_path, allow_applying=True)
    if current is None or current.get("phase") != "applying":
        raise StateError("Vault apply has no active deployment marker")
    if current.get("baseline_verified") is not True:
        result = status(app_dir)
        print(json.dumps(result, sort_keys=True))
        return

    candidate = json.loads(json.dumps(current))
    candidate["phase"] = "verified"
    candidate.pop("baseline_verified", None)
    candidate.pop("started_at", None)
    candidate["verified_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    problem = state_problem(candidate)
    if problem is not None:
        raise StateError(f"cannot preserve incomplete applied source state: {problem}")
    _atomic_write(state_path, candidate)
    _clear_dirty_marker(state_path)
    print(json.dumps(status(app_dir), sort_keys=True))


def record(args: argparse.Namespace) -> None:
    """Record only artifacts verified by the caller after readiness succeeds."""
    state_path = args.app_dir / STATE_FILE
    current, _reason = load_state(state_path, allow_applying=True)
    if current is None or current.get("phase") != "applying":
        raise StateError("deployment state must be marked applying before it can be recorded")
    baseline_verified = current.get("baseline_verified") is True
    current = json.loads(json.dumps(current))
    if not baseline_verified and not (
        args.backend_tag
        and args.nlp_tag
        and args.configuration_source_revision
    ):
        raise StateError(
            "cannot record a partial deployment from unknown or interrupted state; verify both services and configuration"
        )

    updates = 0
    for name, tag, source_revision in (
        ("backend", args.backend_tag, args.backend_source_revision),
        ("nlp", args.nlp_tag, args.nlp_source_revision),
    ):
        if not tag:
            continue
        if IMAGE_TAG.fullmatch(tag) is None:
            raise StateError(f"invalid {name} image tag")
        artifact_revision = _artifact_revision(name, tag, args.image_prefix)
        revision = artifact_revision if args.rollback else source_revision
        if not isinstance(revision, str) or REVISION.fullmatch(revision) is None:
            raise StateError(f"missing valid {name} source revision to record")
        current["components"][name] = {
            "source_revision": revision,
            "artifact_revision": artifact_revision,
            "image_tag": tag,
        }
        updates += 1

    if args.configuration_source_revision:
        if REVISION.fullmatch(args.configuration_source_revision) is None:
            raise StateError("invalid configuration source revision")
        current["configuration"] = {
            "source_revision": args.configuration_source_revision,
        }
        updates += 1

    if updates == 0:
        raise StateError("no verified deployment component was supplied")
    current["persistent_config_hashes"] = _persistent_config_hashes(args.app_dir)
    current["schema_version"] = 1
    current["phase"] = "verified"
    current.pop("baseline_verified", None)
    current.pop("started_at", None)
    current["verified_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    problem = state_problem(current)
    if problem is not None:
        raise StateError(f"verified state would be incomplete: {problem}")
    _atomic_write(state_path, current)
    _clear_dirty_marker(state_path)
    result = status(args.app_dir)
    if not result["known"]:
        raise StateError(
            "verified state remains incomplete; a normal deploy must verify all components"
        )
    print(json.dumps(result, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("status", "begin", "finish-vault", "record"))
    parser.add_argument("--app-dir", type=Path, default=Path("/opt/languee"))
    parser.add_argument("--image-prefix", default=os.environ.get("IMAGE_PREFIX", IMAGE_PREFIX))
    parser.add_argument("--backend-tag", default="")
    parser.add_argument("--nlp-tag", default="")
    parser.add_argument("--backend-source-revision", default="")
    parser.add_argument("--nlp-source-revision", default="")
    parser.add_argument("--configuration-source-revision", default="")
    parser.add_argument("--rollback", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.action == "status":
            print(json.dumps(status(args.app_dir), sort_keys=True))
        elif args.action == "begin":
            print(json.dumps(begin(args.app_dir), sort_keys=True))
        elif args.action == "finish-vault":
            finish_vault_apply(args.app_dir)
        else:
            record(args)
    except (OSError, StateError) as exc:
        print(f"deployment state error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
