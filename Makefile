.PHONY: db-up db-down db-reset backend-dev web-dev test lint format help

help:
	@echo "Available targets:"
	@echo "  db-up        Start Postgres 16 container"
	@echo "  db-down      Stop Postgres container"
	@echo "  db-reset     Reset Postgres database and reload schema"
	@echo "  backend-dev  Run FastAPI dev server"
	@echo "  web-dev      Run Next.js dev server"
	@echo "  test         Run backend and web test suites"
	@echo "  lint         Run linters across backend and web"
	@echo "  format       Run formatters across backend and web"

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d postgres

backend-dev:
	cd backend && uvicorn app.main:app --reload --port 8000

web-dev:
	cd web && npm run dev

test:
	cd backend && pytest
	cd web && npm test

lint:
	cd backend && ruff check . && ruff format --check . && mypy app
	cd web && npm run lint && npm run typecheck

format:
	cd backend && ruff format . && ruff check --fix .
	cd web && npm run format
