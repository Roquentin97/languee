#!/usr/bin/env python3
"""Render the server's env files from the OCI Secrets Management config secret.

The secret is one versioned JSON object and the only human-maintained source of
application and backup configuration. This script fetches it with Instance
Principal auth, validates every key and relationship, and only then replaces
these generated files in the app directory (default /opt/languee):

  .env               compose interpolation + backup script (also shell-sourced)
  languee-back.env   languee-back env_file
  languee-nlp.env    languee-nlp env_file
  .deploy-state.json image tag + applied secret version (bookkeeping, not config)

Secret values are never printed, logged, or passed on a command line. Standard
library only, so it runs on a bare Ubuntu host.

Usage:
  sync-vault-config.py --tag sha-1a2b3c4      # code deploy: pin this image tag
  sync-vault-config.py --preserve-tag         # config-only: keep the deployed tag
  sync-vault-config.py --check --preserve-tag # validate only, write nothing
  sync-vault-config.py --secret-version 7 ... # apply a specific secret version
  sync-vault-config.py --restore-previous     # undo the last apply
  sync-vault-config.py --status               # show applied version and tag
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Mapping

DEFAULT_APP_DIR = Path("/opt/languee")
DEFAULT_REGION = "eu-frankfurt-1"
COMPOSE_FILE = "docker-compose.prod.yml"

STACK_ENV = ".env"
BACK_ENV = "languee-back.env"
NLP_ENV = "languee-nlp.env"
STATE_FILE = ".deploy-state.json"
PREVIOUS_DIR = ".config-previous"
MANAGED_FILES = (STACK_ENV, BACK_ENV, NLP_ENV, STATE_FILE)

TAG_PATTERN = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}")
PLACEHOLDER_SECRETS = {"changeme", "replace-with-at-least-16-characters"}


class ConfigError(Exception):
    """Actionable failure. Messages name keys and rules, never values."""


@dataclass(frozen=True)
class Rule:
    check: Callable[[str], bool]
    hint: str
    required: bool = True
    allow_empty: bool = False


def _re(pattern: str, hint: str, **kw: bool) -> Rule:
    compiled = re.compile(pattern)
    return Rule(lambda v: compiled.fullmatch(v) is not None, hint, **kw)


def _secret(min_len: int, charset: str = r"[A-Za-z0-9._~-]") -> Rule:
    compiled = re.compile(f"{charset}{{{min_len},}}")
    return Rule(
        lambda v: compiled.fullmatch(v) is not None and v.lower() not in PLACEHOLDER_SECRETS,
        f"at least {min_len} characters from {charset}, not a placeholder",
    )


def _equals(expected: str, why: str) -> Rule:
    return Rule(lambda v: v == expected, f"must be exactly {expected} ({why})")


def _one_of(*options: str) -> Rule:
    return Rule(lambda v: v in options, "one of: " + ", ".join(options))


def _port() -> Rule:
    return Rule(lambda v: v.isdigit() and 1 <= int(v) <= 65535, "a TCP port number")


BOOL = _one_of("true", "false")
TOKEN = _re(r"[A-Za-z0-9._-]+", "letters, digits, '.', '_' or '-'")
HOSTNAME = _re(
    r"(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}",
    "a lowercase DNS hostname (no scheme, port, or path)",
)
SQL_IDENT = _re(r"[a-z_][a-z0-9_]{0,62}", "lowercase letters, digits, '_' (max 63)")

# Keys written to /opt/languee/.env. That file is read by compose AND sourced by
# backup-db.sh, so its values are restricted to a shell-inert character set.
STACK_SCHEMA: dict[str, Rule] = {
    "DOMAIN": HOSTNAME,
    "LANGUEE_BACK_POSTGRES_USER": SQL_IDENT,
    "LANGUEE_BACK_POSTGRES_PASSWORD": _secret(16),  # interpolated into DATABASE_URL
    "LANGUEE_BACK_POSTGRES_DB": SQL_IDENT,
    "LANGUEE_BACK_REDIS_PASSWORD": _secret(16),
    "BACKUP_RCLONE_REMOTE": _re(r"[A-Za-z0-9_-]+:[A-Za-z0-9._/-]+", "rclone 'remote:bucket'"),
    "BACKUP_RETENTION_DAYS": Rule(lambda v: v.isdigit() and int(v) >= 1, "a positive integer"),
    "BACKUP_HEALTHCHECK_URL": _re(
        r"https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/[A-Za-z0-9._/~-]*",
        "an https URL without query string, or empty to disable the heartbeat",
        allow_empty=True,
    ),
}

BACK_SCHEMA: dict[str, Rule] = {
    "PORT": _equals("3000", "compose healthcheck and Caddyfile hardcode it"),
    "NODE_ENV": _one_of("production", "development"),
    "REDIS_HOST": _equals("redis", "the compose service name"),
    "REDIS_PORT": _equals("6379", "the compose redis port"),
    "JWT_SECRET": _secret(16, r"[A-Za-z0-9._~+/=-]"),
    "JWT_EXPIRES_IN": _re(r"[0-9]+[smhd]", "a duration such as 15m"),
    "BASIC_AUTH": TOKEN,
    "BASIC_PASSWORD": _secret(12, r"[A-Za-z0-9._~+/=-]"),
    "LANGUEE_NLP_BASE_URL": _equals("http://languee-nlp:8000", "the compose service address"),
    "LANGUEE_NLP_BASIC_AUTH_LOGIN": TOKEN,
    "LANGUEE_NLP_BASIC_AUTH_PASSWORD": _secret(12, r"[A-Za-z0-9._~+/=-]"),
    "LOG_FORMAT": TOKEN,
    "SERVICE_NAME": TOKEN,
    "PRINT_DEBUG_LOGS": BOOL,
    "PRINT_PRETTY_JSON_LOGS": BOOL,
    "TRACING_ENABLED": BOOL,
    "OTEL_TRACES_SAMPLER": TOKEN,
    "OTEL_TRACES_SAMPLER_ARG": _re(r"[0-9]+(\.[0-9]+)?", "a number such as 1.0"),
    "OTEL_EXPORTER_OTLP_PROTOCOL": _re(r"[a-z/]+", "e.g. http/protobuf", required=False),
    "OTEL_EXPORTER_OTLP_ENDPOINT": _re(r"https?://\S+", "an http(s) URL", required=False),
    "OTEL_EXPORTER_OTLP_HEADERS": _re(r"[ -~]+", "printable ASCII", required=False),
}

NLP_SCHEMA: dict[str, Rule] = {
    "LANGUEE_NLP_SPACY_MODEL": _re(r"[a-z][a-z0-9_]*", "a spaCy package name"),
    "LANGUEE_NLP_LOG_FORMAT": TOKEN,
    "LANGUEE_NLP_LOG_LEVEL": TOKEN,
    "LANGUEE_NLP_SERVICE_NAME": TOKEN,
    "LANGUEE_NLP_ENVIRONMENT": TOKEN,
    "LANGUEE_NLP_TRACING_ENABLED": BOOL,
    "LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT": _re(
        r"https?://\S+", "an http(s) URL", required=False
    ),
}

# NLP basic-auth credentials live once in the secret (under the backend's
# LANGUEE_NLP_BASIC_AUTH_* names) and are written to both service files. The
# backend's own BASIC_PASSWORD is Swagger auth and never feeds the NLP service.
NLP_DERIVED = {
    "BASIC_LOGIN": "LANGUEE_NLP_BASIC_AUTH_LOGIN",
    "BASIC_PASSWORD": "LANGUEE_NLP_BASIC_AUTH_PASSWORD",
}

ALL_SCHEMAS = (STACK_SCHEMA, BACK_SCHEMA, NLP_SCHEMA)
ALLOWED_KEYS = frozenset(k for schema in ALL_SCHEMAS for k in schema)
SERVICE_ENV_FORBIDDEN = set("$\"'`\\#")
STACK_ENV_SAFE = re.compile(r"[A-Za-z0-9_.@%+=:,/~-]*")


def parse_secret_json(payload: bytes) -> dict[str, str]:
    """Decode and normalize the secret into a flat str->str mapping."""

    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        seen: dict[str, object] = {}
        for key, value in pairs:
            if key in seen:
                raise ConfigError(f"secret JSON repeats key {key}")
            seen[key] = value
        return seen

    try:
        raw = json.loads(payload.decode("utf-8"), object_pairs_hook=reject_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        kind = "UTF-8" if isinstance(exc, UnicodeDecodeError) else "JSON"
        raise ConfigError(f"secret content is not valid {kind}") from None
    if not isinstance(raw, dict):
        raise ConfigError("secret JSON must be an object of key/value pairs")

    config: dict[str, str] = {}
    errors: list[str] = []
    for key, value in raw.items():
        if isinstance(value, bool):
            config[key] = "true" if value else "false"
        elif isinstance(value, int):
            config[key] = str(value)
        elif isinstance(value, str):
            config[key] = value
        else:
            errors.append(f"{key}: unsupported JSON type {type(value).__name__} (use a string)")
    if errors:
        raise ConfigError("\n".join(errors))
    return config


def validate(config: Mapping[str, str]) -> None:
    errors: list[str] = []
    unknown = sorted(set(config) - ALLOWED_KEYS)
    if unknown:
        errors.append("unknown keys (typo or unapproved): " + ", ".join(unknown))

    destinations = (
        (STACK_SCHEMA, "stack"),
        (BACK_SCHEMA, "service"),
        (NLP_SCHEMA, "service"),
    )
    for schema, kind in destinations:
        for key, rule in schema.items():
            if key not in config:
                if rule.required:
                    errors.append(f"{key}: missing")
                continue
            problem = _value_problem(config[key], rule, kind)
            if problem:
                errors.append(f"{key}: {problem}")

    if not errors:
        errors.extend(_relationship_problems(config))
    if errors:
        raise ConfigError("invalid secret content:\n  " + "\n  ".join(errors))


def _value_problem(value: str, rule: Rule, kind: str) -> str | None:
    if value == "":
        return None if rule.allow_empty else "empty"
    if any(not 0x20 <= ord(c) <= 0x7E for c in value):
        return "contains control or non-ASCII characters (multiline values are not allowed)"
    if value != value.strip():
        return "has leading or trailing whitespace"
    if kind == "stack":
        if not STACK_ENV_SAFE.fullmatch(value):
            return "contains characters unsafe for the shell-sourced .env"
    elif SERVICE_ENV_FORBIDDEN & set(value):
        return "contains one of $ \" ' ` \\ # which env_file parsing would alter"
    if not rule.check(value):
        return f"does not match expected format: {rule.hint}"
    return None


def _relationship_problems(config: Mapping[str, str]) -> list[str]:
    problems = []
    if config["TRACING_ENABLED"] == "true" and not config.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        problems.append("OTEL_EXPORTER_OTLP_ENDPOINT: required when TRACING_ENABLED=true")
    if config["LANGUEE_NLP_TRACING_ENABLED"] == "true" and not config.get(
        "LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT"
    ):
        problems.append(
            "LANGUEE_NLP_OTEL_EXPORTER_OTLP_ENDPOINT: required when LANGUEE_NLP_TRACING_ENABLED=true"
        )
    if ":" in config["LANGUEE_NLP_BASIC_AUTH_LOGIN"]:
        problems.append("LANGUEE_NLP_BASIC_AUTH_LOGIN: must not contain ':' (HTTP basic auth)")
    return problems


def render(config: Mapping[str, str], tag: str, secret_version: int) -> dict[str, str]:
    """Map validated secret keys onto the three env files (explicit allowlist)."""
    header = (
        f"# Generated from OCI secret version {secret_version}. Do not edit: the next\n"
        "# deploy overwrites this file. Change the secret in OCI Vault instead.\n"
    )

    def lines(pairs: list[tuple[str, str]]) -> str:
        return header + "".join(f"{k}={v}\n" for k, v in pairs)

    stack = [("COMPOSE_FILE", COMPOSE_FILE), ("TAG", tag)]
    stack += [(k, config[k]) for k in STACK_SCHEMA if k in config]
    back = [(k, config[k]) for k in BACK_SCHEMA if k in config]
    nlp = [(k, config[k]) for k in NLP_SCHEMA if k in config]
    nlp += [(target, config[source]) for target, source in NLP_DERIVED.items()]
    return {STACK_ENV: lines(stack), BACK_ENV: lines(back), NLP_ENV: lines(nlp)}


def validate_tag(tag: str) -> str:
    if not TAG_PATTERN.fullmatch(tag):
        raise ConfigError("image tag must match [A-Za-z0-9_][A-Za-z0-9_.-]{0,127}")
    return tag


def read_state(app_dir: Path) -> dict[str, object]:
    path = app_dir / STATE_FILE
    if not path.exists():
        return {}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ConfigError(f"{STATE_FILE} is unreadable; pass --tag explicitly") from None
    if not isinstance(state, dict):
        raise ConfigError(f"{STATE_FILE} is malformed; pass --tag explicitly")
    return state


def deployed_tag(app_dir: Path) -> str | None:
    """Tag currently deployed: managed state first, then a pre-existing .env."""
    tag = read_state(app_dir).get("tag")
    if isinstance(tag, str) and TAG_PATTERN.fullmatch(tag):
        return tag
    env_path = app_dir / STACK_ENV
    if env_path.exists():
        match = re.search(r"^TAG=(\S+)$", env_path.read_text(encoding="utf-8"), re.MULTILINE)
        if match and TAG_PATTERN.fullmatch(match.group(1)):
            return match.group(1)
    return None


def _write_private(directory: Path, text: str) -> Path:
    fd, name = tempfile.mkstemp(dir=directory, prefix=".tmp-")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise
    return Path(name)


def _fsync_dir(directory: Path) -> None:
    fd = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _snapshot(app_dir: Path) -> None:
    """Copy current managed files to PREVIOUS_DIR so an apply can be undone."""
    previous = app_dir / PREVIOUS_DIR
    shutil.rmtree(previous, ignore_errors=True)
    previous.mkdir(mode=0o700)
    absent = []
    for name in MANAGED_FILES:
        source = app_dir / name
        if source.exists():
            _write_private(previous, source.read_text(encoding="utf-8")).rename(previous / name)
        else:
            absent.append(name)
    (previous / "manifest.json").write_text(json.dumps({"absent": absent}), encoding="utf-8")


def restore_previous(app_dir: Path, *, allow_initial: bool = False) -> None:
    previous = app_dir / PREVIOUS_DIR
    try:
        absent = set(json.loads((previous / "manifest.json").read_text(encoding="utf-8"))["absent"])
    except (OSError, ValueError, KeyError):
        raise ConfigError("no previous configuration snapshot to restore") from None
    if STACK_ENV in absent and not allow_initial:
        raise ConfigError("the last apply was the initial one; there is no earlier configuration")
    for name in MANAGED_FILES:
        target = app_dir / name
        if name in absent:
            target.unlink(missing_ok=True)
            continue
        text = (previous / name).read_text(encoding="utf-8")
        os.replace(_write_private(app_dir, text), target)
    _fsync_dir(app_dir)


def apply(app_dir: Path, files: Mapping[str, str], tag: str, secret_version: int) -> list[str]:
    """Replace the managed files together; undo everything if any step fails.

    Returns the names of env files whose content changed (empty = no-op).
    """
    current = {
        name: (app_dir / name).read_text(encoding="utf-8") if (app_dir / name).exists() else None
        for name in files
    }
    state = read_state(app_dir)
    changed = [name for name, text in files.items() if current[name] != text]
    if not changed and state.get("tag") == tag and state.get("secret_version") == secret_version:
        return []

    new_state = json.dumps(
        {
            "tag": tag,
            "previous_tag": state.get("tag"),
            "secret_version": secret_version,
            "applied_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        indent=2,
    )
    contents = {**files, STATE_FILE: new_state + "\n"}
    temps: dict[str, Path] = {}
    try:
        for name, text in contents.items():
            temps[name] = _write_private(app_dir, text)
        _snapshot(app_dir)
        try:
            for name in contents:
                os.replace(temps[name], app_dir / name)
            _fsync_dir(app_dir)
        except BaseException:
            restore_previous(app_dir, allow_initial=True)
            raise
    finally:
        for temp in temps.values():
            temp.unlink(missing_ok=True)
    return changed


def find_oci(explicit: str | None) -> str:
    candidates = [explicit, os.environ.get("OCI_CLI_BIN"), str(Path.home() / ".venvs/oci/bin/oci")]
    for candidate in candidates:
        if candidate and os.access(candidate, os.X_OK):
            return candidate
    found = shutil.which("oci")
    if found:
        return found
    raise ConfigError("OCI CLI not found; pass --oci-bin or set OCI_CLI_BIN")


def fetch_with_oci_cli(
    *, oci_bin: str | None, secret_ocid: str, region: str, version: int | None
) -> tuple[bytes, int]:
    """Return (secret JSON bytes, version number) via Instance Principal auth."""
    cmd = [
        find_oci(oci_bin), "secrets", "secret-bundle", "get",
        "--secret-id", secret_ocid,
        "--auth", "instance_principal",
        "--region", region,
    ]  # fmt: skip
    cmd += ["--version-number", str(version)] if version is not None else ["--stage", "CURRENT"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
    except subprocess.TimeoutExpired:
        raise ConfigError("OCI CLI timed out fetching the secret") from None
    if proc.returncode != 0:
        # stdout holds the secret only on success; stderr is safe to surface.
        raise ConfigError(f"OCI CLI failed (exit {proc.returncode}): {proc.stderr.strip()[:500]}")
    try:
        data = json.loads(proc.stdout)["data"]
        content = data["secret-bundle-content"]
        if content["content-type"] != "BASE64":
            raise ValueError
        return base64.b64decode(content["content"], validate=True), int(data["version-number"])
    except (KeyError, TypeError, ValueError):
        raise ConfigError("unexpected secret bundle response shape") from None


Fetcher = Callable[..., "tuple[bytes, int]"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--app-dir", type=Path, default=DEFAULT_APP_DIR)
    parser.add_argument("--secret-ocid", help="default: $VAULT_SECRET_OCID")
    parser.add_argument("--region", help=f"default: $OCI_REGION or {DEFAULT_REGION}")
    parser.add_argument("--oci-bin", help="default: $OCI_CLI_BIN, ~/.venvs/oci/bin/oci, PATH")
    parser.add_argument("--secret-version", type=int, help="default: CURRENT version")
    parser.add_argument("--tag", help="image tag to pin (code deploy)")
    parser.add_argument("--preserve-tag", action="store_true", help="keep the deployed tag")
    parser.add_argument("--check", action="store_true", help="validate only; write nothing")
    parser.add_argument("--restore-previous", action="store_true")
    parser.add_argument("--status", action="store_true")
    return parser


def run(args: argparse.Namespace, fetcher: Fetcher) -> None:
    app_dir: Path = args.app_dir
    if args.status:
        print(json.dumps(read_state(app_dir), indent=2))
        return
    if args.restore_previous:
        restore_previous(app_dir)
        print("restored previous configuration")
        return

    if args.tag and args.preserve_tag:
        raise ConfigError("use either --tag or --preserve-tag, not both")
    if not (args.tag or args.preserve_tag or args.check):
        raise ConfigError("pass --tag <tag> or --preserve-tag")
    secret_ocid = args.secret_ocid or os.environ.get("VAULT_SECRET_OCID")
    if not secret_ocid:
        raise ConfigError("secret OCID missing: pass --secret-ocid or set VAULT_SECRET_OCID")
    region = args.region or os.environ.get("OCI_REGION") or DEFAULT_REGION

    tag = "unset"
    if args.tag:
        tag = validate_tag(args.tag)
    elif args.preserve_tag:
        existing = deployed_tag(app_dir)
        if existing is None:
            raise ConfigError("no deployed tag recorded; use --tag on the first deploy")
        tag = existing

    payload, version = fetcher(
        oci_bin=args.oci_bin,
        secret_ocid=secret_ocid,
        region=region,
        version=args.secret_version,
    )
    config = parse_secret_json(payload)
    validate(config)
    files = render(config, tag, version)
    print(f"secret version {version} validated")
    if args.check:
        return

    changed = apply(app_dir, files, tag, version)
    print(f"tag {tag}; updated: {', '.join(changed) if changed else 'no env changes'}")


def main(argv: list[str] | None = None, fetcher: Fetcher = fetch_with_oci_cli) -> int:
    try:
        run(build_parser().parse_args(argv), fetcher)
    except ConfigError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
