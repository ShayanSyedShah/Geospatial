DOCKER_COMPOSE ?= docker compose
COMPOSE_PROJECT_NAME ?= flood-risk-map
COMPOSE := COMPOSE_PROJECT_NAME=$(COMPOSE_PROJECT_NAME) $(DOCKER_COMPOSE)

.PHONY: help up up-detached down restart build rebuild logs logs-backend logs-frontend ps urls health shell-backend shell-frontend frontend-install frontend-build download-data precompute clean check-compose

help: ## Show available commands.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Build and run the backend and frontend containers.
	$(COMPOSE) up --build

up-detached: ## Build and run the app in the background.
	$(COMPOSE) up --build -d
	@$(MAKE) urls

down: ## Stop and remove the app containers.
	$(COMPOSE) down

restart: ## Restart the running containers.
	$(COMPOSE) restart

build: ## Build Docker images.
	$(COMPOSE) build

rebuild: ## Rebuild Docker images without cache.
	$(COMPOSE) build --no-cache

logs: ## Follow logs for every service.
	$(COMPOSE) logs -f

logs-backend: ## Follow backend logs.
	$(COMPOSE) logs -f backend

logs-frontend: ## Follow frontend logs.
	$(COMPOSE) logs -f frontend

ps: ## Show container status.
	$(COMPOSE) ps

urls: ## Print local app URLs.
	@printf "Frontend:   http://localhost:5173\n"
	@printf "Backend:    http://localhost:8001\n"
	@printf "API health: http://localhost:8001/health\n"

health: ## Check backend health.
	curl -fsS http://localhost:8001/health
	@printf "\n"

shell-backend: ## Open a shell in the backend container.
	$(COMPOSE) exec backend sh

shell-frontend: ## Open a shell in the frontend container.
	$(COMPOSE) exec frontend sh

frontend-install: ## Install frontend dependencies into the Docker node_modules volume.
	$(COMPOSE) run --rm --no-deps frontend npm ci

frontend-build: ## Run the frontend production build in Docker.
	$(COMPOSE) run --rm --no-deps frontend sh -c 'npm ci && npm run build'

download-data: ## Download source geospatial data inside the backend container.
	$(COMPOSE) run --rm backend python scripts/download_data.py

precompute: ## Build backend/data/hexagons.parquet inside the backend container.
	$(COMPOSE) run --rm backend python scripts/precompute.py

clean: ## Stop containers and remove Compose volumes.
	$(COMPOSE) down --volumes --remove-orphans

check-compose: ## Validate the Compose configuration.
	$(COMPOSE) config --quiet
