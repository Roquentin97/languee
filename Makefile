# Languee — Makefile
# POSIX-compatible. Requires docker compose v2 and yarn.
#
# Usage:
#   make <target> [CONTAINER=api] [TAIL=100]

COMPOSE = docker compose
APP_DIR = apps/languee-back

# Optional flags for make logs
CONTAINER ?=
TAIL      ?= 200

.PHONY: start migrate down build restart clean logs cc

# Start infrastructure, run database migrations, then start the API
start:
	$(COMPOSE) up -d postgres redis
	$(COMPOSE) run --rm migrate yarn prisma migrate deploy
	$(COMPOSE) up -d api

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

# Full CI check: format → lint → test → build → prisma validate → commitlint
# Runs inside the app directory. Stops on first failure.
cc:
	cd $(APP_DIR) && \
	yarn format && \
	yarn lint && \
	yarn test && \
	yarn build && \
	yarn prisma validate && \
	cd ../.. && \
	npx --no -- commitlint --from HEAD~1 --to HEAD
