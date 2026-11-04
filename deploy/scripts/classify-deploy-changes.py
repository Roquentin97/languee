#!/usr/bin/env python3
"""Classify a develop push into independently deployable server changes.

The classifier deliberately treats an unknown or bootstrap range as affecting
both application images. It is used by the deployment workflow and has no
GitHub-specific dependencies, which keeps its ownership map testable.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def classify(paths: list[str], *, conservative: bool = False, manual: bool = False) -> dict[str, object]:
    """Return build and apply decisions for paths changed in one push range."""
    result: dict[str, object] = {
        "back": conservative or manual,
        "nlp": conservative or manual,
        "config": False,
        "production_compose": False,
        "local_only": False,
        "relevant": conservative or manual,
    }
    for path in paths:
        if path.startswith("apps/languee-back/"):
            result["back"] = True
            result["relevant"] = True
        elif path.startswith("apps/languee-nlp/"):
            result["nlp"] = True
            result["relevant"] = True
        elif path in {"package.json", "yarn.lock", ".dockerignore"}:
            # Shared build tooling can change a service's produced bytes.
            result["back"] = True
            result["nlp"] = True
            result["relevant"] = True
        elif path == "docker-compose.prod.yml":
            result["config"] = True
            result["production_compose"] = True
            result["relevant"] = True
        elif (
            path.startswith("deploy/caddy/")
            or path.startswith("deploy/scripts/")
            or path.startswith("deploy/env/")
            or path.startswith("provision/")
        ):
            result["config"] = True
            result["relevant"] = True
        elif path == "docker-compose.yml" or path.startswith("deploy/local/"):
            result["local_only"] = True
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--files", type=Path, required=True, help="newline-separated changed paths")
    parser.add_argument("--conservative", action="store_true", help="missing/zero previous SHA")
    parser.add_argument("--manual", action="store_true", help="manual build/deploy request")
    args = parser.parse_args()
    paths = [line for line in args.files.read_text(encoding="utf-8").splitlines() if line]
    print(json.dumps(classify(paths, conservative=args.conservative, manual=args.manual), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
