"""Assemble target-specific agent instructions from service manifests and rulesets."""

from __future__ import annotations

import argparse
import tomllib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate target-specific Forge agent instructions.",
    )
    parser.add_argument("--service-name", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--manifest", default="forge/services.toml")
    parser.add_argument("--rules-dir", default=".claude/rules")
    parser.add_argument("--extra-ruleset", action="append", default=[])
    return parser.parse_args()


def load_manifest(path: Path) -> dict[str, Any]:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def format_value(value: object) -> str:
    if value in (None, ""):
        return "none"
    if isinstance(value, list):
        return ", ".join(str(item) for item in value) if value else "none"
    return str(value)


def append_mapping_section(parts: list[str], title: str, values: dict[str, object]) -> None:
    parts.extend([f"## {title}", ""])
    if not values:
        parts.extend(["None.", ""])
        return
    for key, value in values.items():
        parts.append(f"- `{key}`: {format_value(value)}")
    parts.append("")


def ruleset_names(service: dict[str, Any], extra_rulesets: list[str]) -> list[str]:
    names: list[str] = []
    for name in [*service.get("rulesets", []), *extra_rulesets]:
        if name not in names:
            names.append(name)
    return names


def build_instructions(
    service_name: str,
    service: dict[str, Any],
    rules_dir: Path,
    extra_rulesets: list[str],
) -> str:
    names = ruleset_names(service, extra_rulesets)
    commands = service.get("commands", {})
    context = service.get("context", {})

    parts = [
        f"# Agent Instructions: {service_name}",
        "",
        f"Generated at: {datetime.now(timezone.utc).isoformat()}",
        "",
        "These instructions are assembled from `forge/services.toml` and `.claude/rules/`.",
        "They are the target-specific source of truth for this run.",
        "",
        "## Service Facts",
        "",
        f"- `name`: {service_name}",
        f"- `path`: {service['path']}",
        f"- `runtime`: {service['runtime']}",
        f"- `framework`: {service['framework']}",
        f"- `package_manager`: {service['package_manager']}",
        f"- `persistence`: {format_value(service.get('persistence'))}",
        f"- `dev_port`: {service['dev_port']}",
        f"- `api_docs_url`: {format_value(service.get('api_docs_url'))}",
        f"- `api_docs_port_env`: {format_value(service.get('api_docs_port_env'))}",
        f"- `affected_components`: {format_value(service.get('affected_components', []))}",
        f"- `app_version_files`: {format_value(service.get('app_version_files', []))}",
        f"- `app_version_bump`: {format_value(service.get('app_version_bump'))}",
        f"- `rulesets`: {format_value(names)}",
        "",
    ]

    append_mapping_section(parts, "Commands", commands)
    append_mapping_section(
        parts,
        "API Documentation",
        {
            "swagger_docs_url": service.get("api_docs_url"),
            "port_env_override": service.get("api_docs_port_env"),
        },
    )
    append_mapping_section(
        parts,
        "PR Opening Skill",
        {
            "skill": ".claude/skills/open-pr/SKILL.md",
            "requirement": (
                "Use before opening or preparing a PR; it enforces GitHub MCP remote "
                "operations, release-please-compatible PR metadata, and make cc for "
                "affected services."
            ),
        },
    )
    append_mapping_section(
        parts,
        "Environment Variables",
        {"required_or_used": service.get("environment", [])},
    )
    append_mapping_section(
        parts,
        "Context Include Patterns",
        {"include": context.get("include", [])},
    )
    append_mapping_section(
        parts,
        "Context Exclude Patterns",
        {"exclude": context.get("exclude", [])},
    )
    append_mapping_section(
        parts,
        "Always-Full Context Patterns",
        {"always_full": context.get("always_full", [])},
    )

    parts.extend(["# Rulesets", ""])
    for name in names:
        rule_path = rules_dir / f"{name}.md"
        if not rule_path.exists():
            raise FileNotFoundError(f"Missing ruleset '{name}' at {rule_path}")
        parts.append(rule_path.read_text(encoding="utf-8").rstrip())
        parts.append("")

    return "\n".join(parts).rstrip() + "\n"


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest)
    rules_dir = Path(args.rules_dir)
    output_dir = Path(args.output_dir)

    manifest = load_manifest(manifest_path)
    services = manifest["services"]
    if args.service_name not in services:
        valid = ", ".join(sorted(services))
        raise KeyError(f"Unknown service '{args.service_name}'. Valid services: {valid}")

    output_dir.mkdir(parents=True, exist_ok=True)
    instructions = build_instructions(
        args.service_name,
        services[args.service_name],
        rules_dir,
        args.extra_ruleset,
    )
    (output_dir / "agent-instructions.md").write_text(instructions, encoding="utf-8")


if __name__ == "__main__":
    main()
