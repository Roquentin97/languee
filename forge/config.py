import os
import tomllib
from pathlib import Path


def _required(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {key}")
    return value


class NotionConfig:
    spec_database_id: str = _required("NOTION_SPEC_DB_ID")
    context_database_id: str = _required("NOTION_CONTEXT_DB_ID")
    target_field: str = "Target"


class PipelineConfig:
    trigger_status: str = "ready-for-dev"
    in_progress_status: str = "in-progress"
    done_status: str = "done"
    pending_more_info_status: str = "pending-more-info"
    failed_status: str = "failed"
    dry_run: bool = os.environ.get("FORGE_DRY_RUN", "false").lower() == "true"


class PipelineType:
    FEATURE = "feature"
    INFRA = "infra"
    REFACTOR = "refactor"


COMMAND_KEYS = [
    "install",
    "format",
    "lint",
    "test",
    "coverage",
    "build",
    "validate_persistence",
    "persistence_migrate",
    "persistence_generate",
]


def _load_services() -> dict[str, dict[str, object]]:
    manifest_path = Path(__file__).with_name("services.toml")
    data = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
    services: dict[str, dict[str, object]] = {}

    for service_name, service_data in data["services"].items():
        commands = service_data.get("commands", {})
        persistence = service_data.get("persistence") or None
        service: dict[str, object] = {
            "path": service_data["path"],
            "runtime": service_data["runtime"],
            "framework": service_data["framework"],
            "package_manager": service_data["package_manager"],
            "persistence": persistence,
            "dev_port": service_data["dev_port"],
            "api_docs_url": service_data.get("api_docs_url"),
            "api_docs_port_env": service_data.get("api_docs_port_env"),
            "affected_components": service_data.get("affected_components", []),
            "rulesets": service_data.get("rulesets", []),
            "environment": service_data.get("environment", []),
            "context": service_data.get("context", {}),
        }
        for key in COMMAND_KEYS:
            service[key] = commands.get(key)
        services[service_name] = service

    return services


class Config:
    notion = NotionConfig()
    pipeline = PipelineConfig()
    pipeline_type = PipelineType()

    # Service registry used by the Lead agent to route specs to the right app, commands,
    # and framework-specific agent instructions.
    services: dict[str, dict[str, object]] = _load_services()


config = Config()

# Fields the agent writes back to Notion on completion or failure
AGENT_WRITTEN_FIELDS = [
    "Affected modules",
    "Agent output",
    "Last run",
    "Status",  # only on done or failed
]
