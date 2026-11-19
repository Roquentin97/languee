#!/usr/bin/env python3
"""Select builds and deploys from desired develop inputs and verified state."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

STATE_SCRIPT = Path(__file__).with_name("deploy-state.py")
_spec = importlib.util.spec_from_file_location("deploy_state", STATE_SCRIPT)
assert _spec and _spec.loader
deploy_state = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(deploy_state)

BACKEND_PATHS = ("apps/languee-back", "package.json", "yarn.lock", ".dockerignore")
NLP_PATHS = ("apps/languee-nlp", "package.json", "yarn.lock", ".dockerignore")
CONFIG_PATHS = (
    "docker-compose.prod.yml",
    "deploy/caddy",
    "deploy/scripts",
    "deploy/env",
    "provision",
)
INFRA_SERVICES = ("postgres", "redis", "caddy")
SERVICE_HEADING = re.compile(r"^  ([a-z][a-z0-9-]*):\s*$")


def _git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or "git command failed"
        raise RuntimeError(detail)
    return result.stdout.strip()


def latest_revision(ref: str, paths: tuple[str, ...]) -> str:
    """Return the latest commit that changed any source path for a component."""
    revision = _git("log", "-1", "--format=%H", ref, "--", *paths)
    return revision if deploy_state.REVISION.fullmatch(revision) else _git("rev-parse", ref)


def _compose_images(source: str) -> dict[str, str]:
    images: dict[str, str] = {}
    service = ""
    for line in source.splitlines():
        heading = SERVICE_HEADING.fullmatch(line)
        if heading:
            service = heading.group(1)
            continue
        if service in INFRA_SERVICES and line.startswith("    image:"):
            images[service] = line.split("image:", 1)[1].strip().strip("\"'")
    return images


def changed_infra_services(previous_revision: str, ref: str) -> list[str]:
    """Find pinned infrastructure image changes since the verified config revision."""
    try:
        previous = _git("show", f"{previous_revision}:docker-compose.prod.yml")
        current = _git("show", f"{ref}:docker-compose.prod.yml")
    except RuntimeError:
        return list(INFRA_SERVICES)
    before, after = _compose_images(previous), _compose_images(current)
    return [service for service in INFRA_SERVICES if before.get(service) != after.get(service)]


def _status(raw: str) -> tuple[dict[str, Any] | None, str]:
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None, "unreadable"
    if isinstance(value, dict) and value.get("known") is False:
        reason = value.get("reason")
        return None, reason if isinstance(reason, str) else "unknown"
    problem = deploy_state.state_problem(value)
    if problem is not None:
        return None, problem
    return value, "verified"


def decisions(
    *,
    raw_state: str,
    ref: str,
    head: str,
    force: bool = False,
    rollback_backend: str = "",
    rollback_nlp: str = "",
) -> dict[str, Any]:
    """Compare latest source revisions with the last verified host state."""
    desired = {
        "backend": latest_revision(ref, BACKEND_PATHS),
        "nlp": latest_revision(ref, NLP_PATHS),
        "configuration": latest_revision(ref, CONFIG_PATHS),
    }
    state, state_reason = _status(raw_state)
    stale = head != ref
    rollback = bool(rollback_backend or rollback_nlp)

    if stale:
        selected = {"backend": False, "nlp": False, "configuration": False}
        applied = {"backend": "unknown", "nlp": "unknown", "configuration": "unknown"}
        infra: list[str] = []
    elif rollback:
        selected = {
            "backend": bool(rollback_backend),
            "nlp": bool(rollback_nlp),
            "configuration": state is None
            or state["configuration"]["source_revision"] != desired["configuration"],
        }
        applied = {
            "backend": state["components"]["backend"]["source_revision"] if state else "unknown",
            "nlp": state["components"]["nlp"]["source_revision"] if state else "unknown",
            "configuration": state["configuration"]["source_revision"] if state else "unknown",
        }
        infra = (
            changed_infra_services(
                state["configuration"]["source_revision"], ref
            )
            if state and selected["configuration"]
            else []
        )
    elif state is None:
        selected = {"backend": True, "nlp": True, "configuration": True}
        applied = {"backend": "unknown", "nlp": "unknown", "configuration": "unknown"}
        infra = []
    else:
        applied = {
            "backend": state["components"]["backend"]["source_revision"],
            "nlp": state["components"]["nlp"]["source_revision"],
            "configuration": state["configuration"]["source_revision"],
        }
        selected = {
            "backend": force or applied["backend"] != desired["backend"],
            "nlp": force or applied["nlp"] != desired["nlp"],
            "configuration": applied["configuration"] != desired["configuration"],
        }
        infra = (
            changed_infra_services(applied["configuration"], ref)
            if selected["configuration"]
            else []
        )

    deploy = any(selected.values()) or bool(infra)
    result = {
        "head": head,
        "ref": ref,
        "stale": stale,
        "state_known": state is not None,
        "state_reason": state_reason,
        "desired": desired,
        "applied": applied,
        "backend": selected["backend"],
        "nlp": selected["nlp"],
        "build_backend": selected["backend"] and not rollback,
        "build_nlp": selected["nlp"] and not rollback,
        "config": selected["configuration"],
        "infra": " ".join(infra),
        "deploy": deploy,
        "rollback": rollback,
        "tag": "",
    }
    return result


def _summary(result: dict[str, Any]) -> str:
    rows = [
        ("Backend", "backend"),
        ("NLP", "nlp"),
        ("Configuration", "configuration"),
    ]
    lines = [
        "## Development deployment reconciliation",
        "",
        "| Component | Desired source revision | Last verified source revision | Decision |",
        "| --- | --- | --- | --- |",
    ]
    for label, name in rows:
        desired = result["desired"][name]
        applied = result["applied"][name]
        key = "config" if name == "configuration" else name
        if result["rollback"] and result[key] and key != "config":
            action = "rollback selected artifact"
        else:
            action = "deploy" if result[key] else "already applied"
        lines.append(f"| {label} | `{desired}` | `{applied}` | {action} |")
    if result["infra"]:
        lines.extend(["", f"Infrastructure image updates selected: `{result['infra']}`."])
    if not result["state_known"]:
        lines.extend(["", f"Applied state is {result['state_reason']}; application artifacts will be rebuilt conservatively."])
    if result["stale"]:
        lines.extend(["", "This run targets a superseded develop head; it will not deploy."])
    elif not result["deploy"]:
        lines.extend(["", "All tracked components match their last health-verified state; no deployment is needed."])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default=os.environ.get("GITHUB_SHA", "HEAD"))
    parser.add_argument("--head", default="")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--rollback-back", default="")
    parser.add_argument("--rollback-nlp", default="")
    args = parser.parse_args()
    head = args.head or _git("rev-parse", "origin/develop")
    raw_state = sys.stdin.read()
    try:
        result = decisions(
            raw_state=raw_state,
            ref=args.ref,
            head=head,
            force=args.force,
            rollback_backend=args.rollback_back,
            rollback_nlp=args.rollback_nlp,
        )
    except (RuntimeError, OSError) as exc:
        print(f"deployment reconciliation failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(_summary(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
