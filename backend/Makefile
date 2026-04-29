COMPOSE ?= docker compose
CARGO ?= cargo
NODE ?= node
SHELL := /bin/bash

.PHONY: db-up db-bootstrap db-down migrate api worker fmt clippy test load-test load-test-restart backup-rehearsal migrate-tidb ops-check idle-ram-capture idle-ram-summary idle-ram-compare

db-up:
	$(COMPOSE) -f docker-compose.yml up -d tidb minio

db-bootstrap:
	@echo "No bootstrap required for TiDB local dev."

db-down:
	$(COMPOSE) -f docker-compose.yml down --remove-orphans

migrate:
	@echo "Run migrations via the app/worker against TiDB."

api:
	$(CARGO) run -p ielts-backend-api

worker:
	$(CARGO) run -p ielts-backend-worker

fmt:
	$(CARGO) fmt --all

clippy:
	$(CARGO) clippy --workspace --all-targets -- -D warnings

test:
	$(CARGO) test --workspace

load-test:
	$(NODE) ./scripts/load-test.js

load-test-restart:
	LOAD_TEST_SCENARIO=restart-during-live-traffic $(NODE) ./scripts/load-test.js

idle-ram-capture:
	$(NODE) ./scripts/idle-ram-window.js capture

idle-ram-summary:
	$(NODE) ./scripts/idle-ram-window.js summary $(FILE)

idle-ram-compare:
	$(NODE) ./scripts/idle-ram-window.js compare $(BASELINE) $(TUNED)

backup-rehearsal:
	bash ./scripts/backup-rehearsal.sh

migrate-tidb:
	bash ./scripts/migrate-tidb-to-tidb.sh

ops-check:
	$(CARGO) fmt --all --check
	$(CARGO) clippy --workspace --all-targets -- -D warnings
	$(CARGO) test --workspace
	$(NODE) ./scripts/load-test.js
	bash ./scripts/backup-rehearsal.sh
