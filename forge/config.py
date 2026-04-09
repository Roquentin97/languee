import os


def _required(key: str) -> str:
    value = os.environ.get(key)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {key}")
    return value


class NotionConfig:
    spec_database_id: str = _required("NOTION_SPEC_DB_ID")
    context_database_id: str = _required("NOTION_CONTEXT_DB_ID")


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


class Config:
    notion = NotionConfig()
    pipeline = PipelineConfig()
    pipeline_type = PipelineType()

    # Reference list used by the Lead agent when writing Affected modules back to Notion.
    # Extend this as new modules are added to the codebase.
    modules: list[str] = ["auth", "users"]


config = Config()

# Fields the agent writes back to Notion on completion or failure
AGENT_WRITTEN_FIELDS = [
    "Affected modules",
    "Agent output",
    "Last run",
    "Status",  # only on done or failed
]