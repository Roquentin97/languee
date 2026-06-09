"""Generate compact repository context artifacts for Forge agents."""

from __future__ import annotations

import argparse
import ast
import fnmatch
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

DEFAULT_INCLUDE = [
    "src/**/*.py",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.py",
    "test/**/*.ts",
    "prisma/schema.prisma",
    "package.json",
    "pyproject.toml",
]

DEFAULT_EXCLUDE = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "**/.pytest_cache/**",
    "**/.ruff_cache/**",
    "**/*.map",
    "**/*.tsbuildinfo",
]

@dataclass
class FileEntry:
    path: str
    mode: str
    language: str
    original_lines: int
    compacted_lines: int
    original_chars: int
    compacted_chars: int


class BodyStripper(ast.NodeTransformer):
    """Replace Python function bodies with docstrings plus pass statements."""

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.AST:
        self.generic_visit(node)
        node.body = self._compact_body(node.body)
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> ast.AST:
        self.generic_visit(node)
        node.body = self._compact_body(node.body)
        return node

    @staticmethod
    def _compact_body(body: list[ast.stmt]) -> list[ast.stmt]:
        compacted: list[ast.stmt] = []
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            compacted.append(body[0])
        compacted.append(ast.Pass())
        return compacted


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate compact skeleton context for a Forge target service.",
    )
    parser.add_argument("--service-name", required=True)
    parser.add_argument("--service-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--include", action="append", default=[])
    parser.add_argument("--exclude", action="append", default=[])
    parser.add_argument("--always-full", action="append", default=[])
    return parser.parse_args()


def normalize_patterns(patterns: Iterable[str]) -> list[str]:
    return [pattern.strip() for pattern in patterns if pattern.strip()]


def is_match(path: str, patterns: Iterable[str]) -> bool:
    return any(fnmatch.fnmatch(path, pattern) for pattern in patterns)


def discover_files(service_path: Path, includes: list[str], excludes: list[str]) -> list[Path]:
    discovered: set[Path] = set()
    for pattern in includes:
        discovered.update(path for path in service_path.glob(pattern) if path.is_file())
    return sorted(
        path
        for path in discovered
        if not is_match(path.relative_to(service_path).as_posix(), excludes)
    )


def compact_python(source: str, path: Path) -> str:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source
    stripped = BodyStripper().visit(tree)
    ast.fix_missing_locations(stripped)
    try:
        return ast.unparse(stripped) + "\n"
    except Exception as exc:
        raise RuntimeError(f"Failed to unparse {path}") from exc


def starts_collapsible_typescript_body(signature: str) -> bool:
    signature_lines = [
        line.strip()
        for line in signature.splitlines()
        if line.strip() and not line.strip().startswith("@")
    ]
    stripped = signature.strip()
    head = signature_lines[-1] if signature_lines else stripped
    if "{" not in head:
        return False
    if head.startswith("@"):
        return False
    if head.startswith(("import ", "export type ", "type ", "interface ")):
        return False
    if head.startswith(("class ", "export class ", "enum ", "export enum ")):
        return False
    if head.startswith(("if ", "for ", "while ", "switch ", "catch ", "try", "else")):
        return False
    if "=>" in stripped:
        return True
    if "function " in stripped:
        return True
    if "(" in stripped and ")" in stripped:
        return True
    return False


def compact_typescript(source: str) -> str:
    lines = source.splitlines()
    output: list[str] = []
    signature: list[str] = []
    skip_depth = 0
    skip_indent = ""

    for line in lines:
        if skip_depth:
            skip_depth += line.count("{") - line.count("}")
            if skip_depth <= 0:
                close_index = line.find("}")
                suffix = line[close_index + 1 :] if close_index >= 0 else ""
                output.append(f"{skip_indent}}}{suffix}")
                skip_depth = 0
                skip_indent = ""
            continue

        candidate = "\n".join([*signature, line])
        output.append(line)
        if starts_collapsible_typescript_body(candidate):
            indent = line[: len(line) - len(line.lstrip())]
            depth = candidate.count("{") - candidate.count("}")
            if depth <= 0:
                signature = []
                continue
            output.append(f"{indent}  /* body omitted */")
            skip_depth = depth
            skip_indent = indent
            signature = []
            continue

        stripped = line.strip()
        if signature:
            if not stripped or stripped.endswith(";"):
                signature = []
            else:
                signature.append(line)
        elif stripped.startswith("@"):
            signature = []
        elif is_typescript_signature_start(stripped):
            signature.append(line)

    return "\n".join(output) + ("\n" if source.endswith("\n") else "")


def is_typescript_signature_start(stripped: str) -> bool:
    if not stripped or "(" not in stripped:
        return False
    if stripped.startswith(("if ", "for ", "while ", "switch ", "catch ")):
        return False
    if stripped.startswith(("import ", "describe(", "it(", "expect(")):
        return False
    if stripped.endswith(";"):
        return False
    return True


def language_for(path: Path) -> str:
    suffix = path.suffix
    if suffix == ".py":
        return "python"
    if suffix in {".ts", ".tsx"}:
        return "typescript"
    if suffix == ".prisma":
        return "prisma"
    if suffix == ".toml":
        return "toml"
    if suffix == ".json":
        return "json"
    return suffix.lstrip(".") or "text"


def compact_file(path: Path, rel_path: str, always_full: list[str]) -> tuple[str, str]:
    source = path.read_text(encoding="utf-8")
    if is_match(rel_path, always_full):
        return "full", source
    suffix = path.suffix
    if suffix == ".py":
        return "skeleton", compact_python(source, path)
    if suffix in {".ts", ".tsx"}:
        return "skeleton", compact_typescript(source)
    return "full", source


def fence_for(path: Path) -> str:
    language = language_for(path)
    if language == "typescript":
        return "ts"
    if language == "python":
        return "py"
    return language


def build_artifacts(
    service_name: str,
    service_path: Path,
    output_dir: Path,
    includes: list[str],
    excludes: list[str],
    always_full: list[str],
) -> None:
    files = discover_files(service_path, includes, excludes)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries: list[FileEntry] = []
    skeleton_parts = [
        f"# Context Skeleton: {service_name}",
        "",
        "Function and method bodies are intentionally compacted. Use this as an",
        "architecture map only; read full files before editing or judging behavior.",
        "",
    ]

    for path in files:
        rel_path = path.relative_to(service_path).as_posix()
        source = path.read_text(encoding="utf-8")
        mode, compacted = compact_file(path, rel_path, always_full)
        original_lines = len(source.splitlines())
        compacted_lines = len(compacted.splitlines())

        manifest_entries.append(
            FileEntry(
                path=rel_path,
                mode=mode,
                language=language_for(path),
                original_lines=original_lines,
                compacted_lines=compacted_lines,
                original_chars=len(source),
                compacted_chars=len(compacted),
            )
        )
        skeleton_parts.extend(
            [
                f"## {rel_path}",
                "",
                f"- mode: {mode}",
                f"- original_lines: {original_lines}",
                f"- compacted_lines: {compacted_lines}",
                "",
                f"```{fence_for(path)}",
                compacted.rstrip(),
                "```",
                "",
            ]
        )

    original_chars = sum(entry.original_chars for entry in manifest_entries)
    compacted_chars = sum(entry.compacted_chars for entry in manifest_entries)
    stats = {
        "service_name": service_name,
        "service_path": service_path.as_posix(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "file_count": len(manifest_entries),
        "original_chars": original_chars,
        "compacted_chars": compacted_chars,
        "char_reduction_ratio": (
            round(1 - (compacted_chars / original_chars), 4) if original_chars else 0
        ),
        "original_lines": sum(entry.original_lines for entry in manifest_entries),
        "compacted_lines": sum(entry.compacted_lines for entry in manifest_entries),
    }

    (output_dir / "repo-skeleton.md").write_text("\n".join(skeleton_parts), encoding="utf-8")
    (output_dir / "context-manifest.json").write_text(
        json.dumps(
            {
                "service_name": service_name,
                "service_path": service_path.as_posix(),
                "include": includes,
                "exclude": excludes,
                "always_full": always_full,
                "files": [asdict(entry) for entry in manifest_entries],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (output_dir / "compaction-stats.json").write_text(
        json.dumps(stats, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    service_path = Path(args.service_path).resolve()
    output_dir = Path(args.output_dir).resolve()
    includes = normalize_patterns(args.include) or DEFAULT_INCLUDE
    excludes = [*DEFAULT_EXCLUDE, *normalize_patterns(args.exclude)]
    always_full = normalize_patterns(args.always_full)
    build_artifacts(args.service_name, service_path, output_dir, includes, excludes, always_full)


if __name__ == "__main__":
    main()
