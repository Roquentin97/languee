"""Validate Forge agent handoff JSON before another stage consumes it."""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ValidationErrors = list[str]
Validator = Callable[[Any, ValidationErrors], None]

STATUS_DONE_NEEDS = {"done", "needs_revision"}
STATUS_AGENT = {"done", "needs_revision", "pending_more_info"}
PERSISTENCE_KINDS = {"none", "prisma", "alembic", "file", "other"}
COMMAND_STATUSES = {"passed", "failed"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate a Forge agent output or command summary JSON file.",
    )
    parser.add_argument(
        "--stage",
        required=True,
        choices=sorted(VALIDATORS),
        help="Output stage/schema to validate.",
    )
    parser.add_argument("--input", required=True, help="JSON file to validate.")
    parser.add_argument("--summary-file", help="Optional validation summary path.")
    return parser.parse_args()


def load_json(path: Path, errors: ValidationErrors) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"$: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    except OSError as exc:
        errors.append(f"$: could not read file: {exc}")
    return None


def path_join(path: str, key: str | int) -> str:
    if isinstance(key, int):
        return f"{path}[{key}]"
    return f"{path}.{key}" if path != "$" else f"$.{key}"


def require_object(value: Any, path: str, errors: ValidationErrors) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        errors.append(f"{path}: expected object, got {type(value).__name__}")
        return None
    return value


def require_key(obj: dict[str, Any], key: str, path: str, errors: ValidationErrors) -> Any:
    if key not in obj:
        errors.append(f"{path}: missing required key '{key}'")
        return None
    return obj[key]


def require_type(
    value: Any,
    expected: type | tuple[type, ...],
    path: str,
    errors: ValidationErrors,
) -> bool:
    if not isinstance(value, expected):
        if isinstance(expected, tuple):
            expected_name = " or ".join(t.__name__ for t in expected)
        else:
            expected_name = expected.__name__
        errors.append(f"{path}: expected {expected_name}, got {type(value).__name__}")
        return False
    return True


def require_nullable_string(value: Any, path: str, errors: ValidationErrors) -> None:
    if value is not None and not isinstance(value, str):
        errors.append(f"{path}: expected string or null, got {type(value).__name__}")


def require_prose(value: Any, path: str, errors: ValidationErrors) -> None:
    if value is None or isinstance(value, str):
        return
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return
    errors.append(f"{path}: expected string, string list, or null, got {type(value).__name__}")


def require_string_list(value: Any, path: str, errors: ValidationErrors) -> None:
    if not require_type(value, list, path, errors):
        return
    for index, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"{path_join(path, index)}: expected string, got {type(item).__name__}")


def require_object_list(value: Any, path: str, errors: ValidationErrors) -> None:
    if not require_type(value, list, path, errors):
        return
    for index, item in enumerate(value):
        require_object(item, path_join(path, index), errors)


def validate_status(
    obj: dict[str, Any],
    allowed: set[str],
    path: str,
    errors: ValidationErrors,
) -> str | None:
    status = require_key(obj, "status", path, errors)
    if not isinstance(status, str):
        errors.append(f"{path}.status: expected string, got {type(status).__name__}")
        return None
    if status not in allowed:
        errors.append(f"{path}.status: expected one of {sorted(allowed)}, got {status!r}")
        return None
    return status


def validate_persistence_changes(value: Any, path: str, errors: ValidationErrors) -> None:
    obj = require_object(value, path, errors)
    if obj is None:
        return
    required = require_key(obj, "required", path, errors)
    require_type(required, bool, path_join(path, "required"), errors)
    kind = require_key(obj, "kind", path, errors)
    if isinstance(kind, str):
        if kind not in PERSISTENCE_KINDS:
            errors.append(
                f"{path}.kind: expected one of {sorted(PERSISTENCE_KINDS)}, got {kind!r}"
            )
    else:
        errors.append(f"{path}.kind: expected string, got {type(kind).__name__}")
    require_nullable_string(
        require_key(obj, "description", path, errors),
        path_join(path, "description"),
        errors,
    )


def validate_architect(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    status = validate_status(obj, STATUS_AGENT, "$", errors)
    require_nullable_string(
        require_key(obj, "target_service", "$", errors),
        "$.target_service",
        errors,
    )
    for key in ("questions", "risks", "notes"):
        require_prose(require_key(obj, key, "$", errors), path_join("$", key), errors)
    for key in ("affected_components", "implementation_plan", "edge_cases", "structure_changes"):
        require_string_list(require_key(obj, key, "$", errors), path_join("$", key), errors)
    validate_persistence_changes(
        require_key(obj, "persistence_changes", "$", errors),
        "$.persistence_changes",
        errors,
    )
    require_object_list(
        require_key(obj, "service_contracts", "$", errors),
        "$.service_contracts",
        errors,
    )
    require_object_list(require_key(obj, "context_chain", "$", errors), "$.context_chain", errors)
    if status == "pending_more_info" and not obj.get("questions"):
        errors.append("$.questions: required when status is pending_more_info")
    if status == "done":
        plan = obj.get("implementation_plan")
        if isinstance(plan, list) and not plan:
            errors.append("$.implementation_plan: must not be empty when status is done")


def validate_implementer(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    validate_status(obj, STATUS_DONE_NEEDS, "$", errors)
    require_string_list(require_key(obj, "files_changed", "$", errors), "$.files_changed", errors)
    require_type(
        require_key(obj, "persistence_change_applied", "$", errors),
        bool,
        "$.persistence_change_applied",
        errors,
    )
    require_string_list(
        require_key(obj, "persistence_artifacts", "$", errors),
        "$.persistence_artifacts",
        errors,
    )
    require_type(require_key(obj, "notes", "$", errors), str, "$.notes", errors)


def validate_linter(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    status = validate_status(obj, STATUS_DONE_NEEDS, "$", errors)
    if "mode" in obj:
        require_type(obj["mode"], str, "$.mode", errors)
    for key in ("files_fixed", "errors_fixed", "errors_remaining"):
        require_string_list(require_key(obj, key, "$", errors), path_join("$", key), errors)
    require_type(require_key(obj, "notes", "$", errors), str, "$.notes", errors)
    if status == "done" and obj.get("errors_remaining"):
        errors.append("$.errors_remaining: must be empty when status is done")


def validate_qa(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    status = validate_status(obj, STATUS_DONE_NEEDS, "$", errors)
    require_string_list(require_key(obj, "tests_written", "$", errors), "$.tests_written", errors)
    for key in ("lint_passed", "persistence_valid", "coverage_passed"):
        require_type(require_key(obj, key, "$", errors), bool, path_join("$", key), errors)
    require_string_list(require_key(obj, "issues", "$", errors), "$.issues", errors)
    require_type(require_key(obj, "notes", "$", errors), str, "$.notes", errors)
    if status == "done" and obj.get("issues"):
        errors.append("$.issues: must be empty when status is done")


def validate_devops(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    validate_status(obj, STATUS_DONE_NEEDS, "$", errors)
    require_string_list(require_key(obj, "files_changed", "$", errors), "$.files_changed", errors)
    require_type(require_key(obj, "notes", "$", errors), str, "$.notes", errors)


def validate_refactor_agent(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    validate_status(obj, {"done", "needs_revision", "skipped"}, "$", errors)
    require_string_list(require_key(obj, "files_changed", "$", errors), "$.files_changed", errors)
    require_string_list(require_key(obj, "operations", "$", errors), "$.operations", errors)
    require_type(require_key(obj, "notes", "$", errors), str, "$.notes", errors)


def validate_command_summary(value: Any, errors: ValidationErrors) -> None:
    obj = require_object(value, "$", errors)
    if obj is None:
        return
    for key in ("label", "command", "cwd", "stdout_log", "stderr_log", "generated_at"):
        require_type(require_key(obj, key, "$", errors), str, path_join("$", key), errors)
    for key in ("exit_code", "stdout_chars", "stderr_chars"):
        require_type(require_key(obj, key, "$", errors), int, path_join("$", key), errors)
    require_type(
        require_key(obj, "duration_seconds", "$", errors),
        (int, float),
        "$.duration_seconds",
        errors,
    )
    status = require_key(obj, "status", "$", errors)
    if isinstance(status, str):
        if status not in COMMAND_STATUSES:
            errors.append(f"$.status: expected one of {sorted(COMMAND_STATUSES)}, got {status!r}")
    else:
        errors.append(f"$.status: expected string, got {type(status).__name__}")
    require_string_list(require_key(obj, "argv", "$", errors), "$.argv", errors)
    require_string_list(require_key(obj, "diagnostics", "$", errors), "$.diagnostics", errors)
    for key in ("stdout_tail", "stderr_tail"):
        require_type(require_key(obj, key, "$", errors), str, path_join("$", key), errors)
    for key in ("diagnostics_truncated", "raw_output_truncated"):
        require_type(require_key(obj, key, "$", errors), bool, path_join("$", key), errors)


VALIDATORS: dict[str, Validator] = {
    "architect": validate_architect,
    "implementer": validate_implementer,
    "linter": validate_linter,
    "qa": validate_qa,
    "devops": validate_devops,
    "restructurer": validate_refactor_agent,
    "decomposer": validate_refactor_agent,
    "command_summary": validate_command_summary,
}


def build_summary(stage: str, input_path: Path, errors: ValidationErrors) -> dict[str, object]:
    return {
        "stage": stage,
        "input": input_path.as_posix(),
        "valid": not errors,
        "errors": errors,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    errors: ValidationErrors = []
    data = load_json(input_path, errors)
    if not errors:
        VALIDATORS[args.stage](data, errors)

    summary = build_summary(args.stage, input_path, errors)
    summary_json = json.dumps(summary, indent=2) + "\n"
    if args.summary_file:
        Path(args.summary_file).write_text(summary_json, encoding="utf-8")
    print(summary_json, end="")
    raise SystemExit(0 if not errors else 1)


if __name__ == "__main__":
    main()
