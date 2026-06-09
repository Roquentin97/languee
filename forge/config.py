import os


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


class Config:
    notion = NotionConfig()
    pipeline = PipelineConfig()
    pipeline_type = PipelineType()

    # Service registry used by the Lead agent to route specs to the right app, commands,
    # and framework-specific agent instructions.
    services: dict[str, dict[str, object]] = {
        "languee-back": {
            "path": "apps/languee-back",
            "runtime": "node",
            "framework": "nestjs",
            "package_manager": "yarn",
            "install": "yarn install --frozen-lockfile",
            "format": "yarn format",
            "lint": "yarn lint",
            "test": "yarn test",
            "coverage": "yarn test:cov",
            "build": "yarn build",
            "persistence": "prisma",
            "validate_persistence": "yarn prisma validate",
            "dev_port": 3000,
            "affected_components": ["auth", "users"],
            "context": {
                "include": [
                    "src/**/*.ts",
                    "test/**/*.ts",
                    "prisma/schema.prisma",
                    "package.json",
                ],
                "exclude": [
                    "node_modules/**",
                    "dist/**",
                    "build/**",
                    "coverage/**",
                ],
                "always_full": [
                    "prisma/schema.prisma",
                    "package.json",
                ],
            },
        },
        "languee-nlp": {
            "path": "apps/languee-nlp",
            "runtime": "python",
            "framework": "fastapi",
            "package_manager": "uv",
            "install": "uv sync",
            "format": "uv run ruff format .",
            "lint": "uv run ruff check .",
            "test": "uv run pytest",
            "coverage": "uv run pytest --cov=languee_nlp",
            "build": None,
            "persistence": None,
            "validate_persistence": None,
            "dev_port": 8000,
            "affected_components": ["api", "nlp", "spacy"],
            "context": {
                "include": [
                    "src/**/*.py",
                    "tests/**/*.py",
                    "pyproject.toml",
                ],
                "exclude": [
                    ".venv/**",
                    "__pycache__/**",
                    ".pytest_cache/**",
                    ".ruff_cache/**",
                    "dist/**",
                    "build/**",
                    "coverage/**",
                ],
                "always_full": [
                    "pyproject.toml",
                ],
            },
        },
    }


config = Config()

# Fields the agent writes back to Notion on completion or failure
AGENT_WRITTEN_FIELDS = [
    "Affected modules",
    "Agent output",
    "Last run",
    "Status",  # only on done or failed
]
