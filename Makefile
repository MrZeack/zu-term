SHELL := /bin/bash
ROOT_DIR := $(CURDIR)
RUN_DIR := $(ROOT_DIR)/.run
NODE_BIN_DIR := $(RUN_DIR)/node-bin
# Pinned toolchains from Homebrew (macOS) take precedence; harmless elsewhere.
export PATH := $(NODE_BIN_DIR):/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/rustup/bin:$(HOME)/.cargo/bin:$(PATH)

TAURI_DIR := apps/desktop/src-tauri

.PHONY: env deps icons install uninstall up down restart logs status test lint typecheck audit build check bundle bump

env: ## Check tools, Node version and .env
	@set -e; \
		mkdir -p "$(NODE_BIN_DIR)"; \
		rm -f "$(NODE_BIN_DIR)/node"; \
		node_path="$$(scripts/resolve-node.sh)"; \
		ln -sfn "$$node_path" "$(NODE_BIN_DIR)/node"; \
		echo "Usando Node $$(node --version) ($$node_path)"
	@for tool in node pnpm cargo lsof zsh; do \
		command -v $$tool >/dev/null || { echo "Falta $$tool" >&2; exit 1; }; done
	@want=$$(cat .nvmrc); have=$$(node -p 'process.versions.node.split(".")[0]'); \
		[ "$$have" = "$$want" ] || { echo "Node $$want requerido (tienes $$have)" >&2; exit 1; }
	@[ -f .env ] || cp .env.example .env
	@chmod 600 .env

deps: env ## Install JS dependencies from the lockfile
	@pnpm install --frozen-lockfile

icons: env ## Generate platform icons from the project icon
	@cd apps/desktop && pnpm tauri icon ../../icon.png --output src-tauri/icons

install: deps icons ## Build in release and install into the OS app launcher
	@scripts/install-app.sh install

uninstall: ## Remove the installed app (only if it is Zu Term)
	@scripts/install-app.sh uninstall

up: deps ## Start the desktop app in dev mode (background)
	@scripts/desktop.sh start

down: ## Stop everything started by `up`
	@scripts/desktop.sh stop

restart: down up

logs: ## Follow the app log
	@scripts/desktop.sh logs

status: ## Show whether the app is running
	@scripts/desktop.sh status

test: deps ## Unit tests: frontend, Rust, shell integration and operations
	@pnpm run test
	@cd $(TAURI_DIR) && cargo test --quiet
	@zsh shell/osc7_spec.zsh
	@bash scripts/node-selection.test.sh
	@bash scripts/operations.test.sh

lint: deps ## ESLint + Prettier + rustfmt + clippy
	@pnpm run lint
	@cd $(TAURI_DIR) && cargo fmt --check && cargo clippy --quiet --all-targets -- -D warnings

typecheck: deps
	@pnpm run typecheck

audit: deps ## Known vulnerabilities in npm packages and Rust crates
	@pnpm audit --audit-level low
	@command -v cargo-audit >/dev/null || { echo "Falta cargo-audit (brew install cargo-audit o cargo install cargo-audit --locked)" >&2; exit 1; }
	@cd $(TAURI_DIR) && cargo audit --deny warnings

build: deps ## Build the frontend bundle
	@pnpm run build

check: deps lint typecheck test audit build ## Everything above

bundle: deps icons ## Build the installable app (.app/.dmg on macOS, .deb/.AppImage on Linux)
	@cd apps/desktop && pnpm tauri build

bump: ## Increment patch version across manifests and tests (make bump [TYPE=patch|minor|major])
	@scripts/bump.sh $(or $(TYPE),patch)
