"""Run a command while keeping raw terminal output out of agent context."""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_MAX_TAIL_CHARS = 4000
DEFAULT_MAX_DIAGNOSTICS = 80

DIAGNOSTIC_KEYWORDS = (
    "error",
    "failed",
    "failure",
    "exception",
    "traceback",
    "syntaxerror",
    "typeerror",
    "assertionerror",
    "expected",
    "received",
    "warning",
    "fatal",
    "cannot",
    "missing",
    "invalid",
)

FILE_LOCATION_RE = re.compile(
    r"(?P<path>[\w./@-]+\.(?:ts|tsx|js|jsx|py|json|prisma|toml|sql|md))"
    r"(?::(?P<line>\d+))?(?::(?P<column>\d+))?"
)
RULE_RE = re.compile(r"\b(?:TS\d{4}|[A-Z]\d{3,4}|no-[\w-]+|@[A-Za-z0-9_/.-]+)\b")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a command and print a compact JSON summary.",
    )
    parser.add_argument("--label", required=True)
    parser.add_argument("--cwd", default=".")
    parser.add_argument("--log-dir", required=True)
    parser.add_argument("--summary-file")
    parser.add_argument("--command", help="Command string to run, parsed with shlex.")
    parser.add_argument("--timeout-seconds", type=int)
    parser.add_argument("--max-tail-chars", type=int, default=DEFAULT_MAX_TAIL_CHARS)
    parser.add_argument("--max-diagnostics", type=int, default=DEFAULT_MAX_DIAGNOSTICS)
    parser.add_argument("argv", nargs=argparse.REMAINDER)
    return parser.parse_args()


def command_argv(args: argparse.Namespace) -> list[str]:
    if args.command:
        return shlex.split(args.command)
    argv = args.argv
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        raise ValueError("Provide --command or command arguments after --")
    return argv


def safe_label(label: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", label.strip())
    return cleaned.strip("-") or "command"


def tail_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


def interesting_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    lowered = stripped.lower()
    if FILE_LOCATION_RE.search(stripped):
        return True
    if RULE_RE.search(stripped):
        return True
    return any(keyword in lowered for keyword in DIAGNOSTIC_KEYWORDS)


def extract_diagnostics(output: str, max_diagnostics: int) -> list[str]:
    diagnostics: list[str] = []
    seen: set[str] = set()

    for line in output.splitlines():
        stripped = line.strip()
        if not interesting_line(stripped):
            continue
        if stripped in seen:
            continue
        seen.add(stripped)
        diagnostics.append(stripped)
        if len(diagnostics) >= max_diagnostics:
            break

    return diagnostics


def write_log(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", errors="replace")


def portable_path(path: Path, base_dir: Path) -> str:
    resolved_path = path.resolve()
    resolved_base = base_dir.resolve()
    try:
        return resolved_path.relative_to(resolved_base).as_posix()
    except ValueError:
        return resolved_path.as_posix()


def run_command(argv: list[str], cwd: Path, timeout_seconds: int | None) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(
            argv,
            cwd=cwd,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", errors="replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")
        stderr = f"{stderr}\nCommand timed out after {timeout_seconds} seconds.".strip()
        return 124, stdout, stderr

    return completed.returncode, completed.stdout, completed.stderr


def build_summary(
    label: str,
    argv: list[str],
    cwd: Path,
    exit_code: int,
    stdout: str,
    stderr: str,
    duration_seconds: float,
    stdout_log: Path,
    stderr_log: Path,
    path_base_dir: Path,
    max_tail_chars: int,
    max_diagnostics: int,
) -> dict[str, object]:
    combined = "\n".join(part for part in (stdout, stderr) if part)
    diagnostics = extract_diagnostics(combined, max_diagnostics)

    return {
        "label": label,
        "command": " ".join(shlex.quote(part) for part in argv),
        "argv": argv,
        "cwd": portable_path(cwd, path_base_dir),
        "status": "passed" if exit_code == 0 else "failed",
        "exit_code": exit_code,
        "duration_seconds": round(duration_seconds, 3),
        "stdout_log": portable_path(stdout_log, path_base_dir),
        "stderr_log": portable_path(stderr_log, path_base_dir),
        "stdout_chars": len(stdout),
        "stderr_chars": len(stderr),
        "stdout_tail": "" if exit_code == 0 else tail_text(stdout, max_tail_chars),
        "stderr_tail": "" if exit_code == 0 else tail_text(stderr, max_tail_chars),
        "diagnostics": diagnostics,
        "diagnostics_truncated": len(diagnostics) >= max_diagnostics,
        "raw_output_truncated": len(stdout) > max_tail_chars or len(stderr) > max_tail_chars,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    args = parse_args()
    argv = command_argv(args)
    cwd = Path(args.cwd).resolve()
    log_dir = Path(args.log_dir).resolve()
    label = safe_label(args.label)

    started = time.monotonic()
    exit_code, stdout, stderr = run_command(argv, cwd, args.timeout_seconds)
    duration_seconds = time.monotonic() - started

    stdout_log = log_dir / f"{label}.stdout.log"
    stderr_log = log_dir / f"{label}.stderr.log"
    write_log(stdout_log, stdout)
    write_log(stderr_log, stderr)

    summary = build_summary(
        label=label,
        argv=argv,
        cwd=cwd,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        duration_seconds=duration_seconds,
        stdout_log=stdout_log,
        stderr_log=stderr_log,
        path_base_dir=Path.cwd(),
        max_tail_chars=args.max_tail_chars,
        max_diagnostics=args.max_diagnostics,
    )

    summary_json = json.dumps(summary, indent=2) + "\n"
    if args.summary_file:
        summary_file = Path(args.summary_file)
        summary_file.parent.mkdir(parents=True, exist_ok=True)
        summary_file.write_text(summary_json, encoding="utf-8")
    print(summary_json, end="")
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
