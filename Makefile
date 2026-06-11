# Languee — Makefile
# POSIX-compatible. Requires docker compose v2, yarn, uv, and Android Gradle tooling
# when running languee-droid checks.
#
# Usage:
#   make <target> [CONTAINER=api] [TAIL=100]
#   make redis languee-back
#   make cc [languee-back|languee-nlp|languee-droid]

COMPOSE = docker compose
APP_DIR = apps/languee-back
REDIS_SERVICE = $(word 2,$(MAKECMDGOALS))
OBSERVABILITY_SERVICES = loki alloy grafana

# Optional flags for make logs
CONTAINER ?=
TAIL      ?= 200

# uv binary — override if uv is not in PATH: UV=/path/to/uv make cc languee-nlp
UV ?= uv

# Service argument for cc — set by the second word in the make invocation
_CC_SVC := $(word 2,$(MAKECMDGOALS))

.PHONY: start migrate down build restart clean logs redis languee-back languee-nlp languee-droid cc

# Start infrastructure, run database migrations, then start the API and observability stack
start:
	$(COMPOSE) up -d postgres redis
	$(COMPOSE) run --rm migrate yarn prisma migrate deploy
	$(COMPOSE) up -d api
	$(COMPOSE) up -d $(OBSERVABILITY_SERVICES)

# Run pending database migrations against the Compose Postgres service
migrate:
	$(COMPOSE) up -d postgres
	$(COMPOSE) run --rm migrate yarn prisma migrate deploy

# Stop and remove containers
down:
	$(COMPOSE) down

# Rebuild all images
build:
	$(COMPOSE) build

# Stop all containers then start them again
restart: down start

# Stop containers, remove volumes and orphaned containers
clean:
	$(COMPOSE) down --volumes --remove-orphans

# Tail service logs. Use CONTAINER=api to filter, TAIL=100 to set line count.
logs:
	$(if $(CONTAINER), \
		$(COMPOSE) logs -f --tail=$(TAIL) $(CONTAINER), \
		$(COMPOSE) logs -f --tail=$(TAIL))

# Open redis-cli for an app service. Usage: make redis languee-back
redis:
	@if [ "$(REDIS_SERVICE)" != "languee-back" ]; then \
		echo "Usage: make redis languee-back"; \
		exit 2; \
	fi
	$(COMPOSE) up -d redis
	sh ./scripts/load-env.sh sh -c 'REDISCLI_AUTH="$$LANGUEE_BACK_REDIS_PASSWORD" exec docker compose exec -e REDISCLI_AUTH redis redis-cli'

languee-back:
	@:

languee-nlp:
	@:

languee-droid:
	@:

# Full CI check: format → lint → test → build/validate → commitlint
# Runs for all services by default, or a single service when named:
#   make cc                  — all services
#   make cc languee-back     — NestJS checks only
#   make cc languee-nlp      — FastAPI/uv checks only
#   make cc languee-droid    — Android/Kotlin checks only
cc:
	@[ -z "$(_CC_SVC)" ] || [ "$(_CC_SVC)" = "languee-back" ] || [ "$(_CC_SVC)" = "languee-nlp" ] || [ "$(_CC_SVC)" = "languee-droid" ] || \
		{ echo "Unknown service '$(_CC_SVC)'. Valid: languee-back, languee-nlp, languee-droid"; exit 1; }
	@if [ -z "$(_CC_SVC)" ] || [ "$(_CC_SVC)" = "languee-back" ]; then \
		echo "==> cc languee-back"; \
		cd apps/languee-back && \
		yarn format && \
		yarn lint && \
		yarn test && \
		yarn build && \
		yarn prisma validate; \
	fi
	@if [ -z "$(_CC_SVC)" ] || [ "$(_CC_SVC)" = "languee-nlp" ]; then \
		echo "==> cc languee-nlp"; \
		cd apps/languee-nlp && \
		$(UV) run --extra dev ruff format . && \
		$(UV) run --extra dev ruff check . && \
		$(UV) run --extra dev pytest; \
	fi
	@if [ -z "$(_CC_SVC)" ] && [ ! -d apps/languee-droid ]; then \
		echo "==> cc languee-droid skipped (apps/languee-droid not present)"; \
	elif [ -z "$(_CC_SVC)" ] || [ "$(_CC_SVC)" = "languee-droid" ]; then \
		if [ ! -x apps/languee-droid/gradlew ]; then \
			echo "apps/languee-droid/gradlew is missing or not executable"; \
			exit 1; \
		fi; \
		echo "==> cc languee-droid"; \
		cd apps/languee-droid && \
		./gradlew ktlintFormat && \
		./gradlew lintDebug && \
		./gradlew testDebugUnitTest && \
		./gradlew assembleDebug; \
	fi
	@npx --no -- commitlint --from HEAD~1 --to HEAD
