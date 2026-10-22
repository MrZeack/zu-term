SHELL := /bin/bash
ROOT_DIR := $(CURDIR)
# Pinned toolchains from Homebrew (macOS) take precedence; harmless elsewhere.
export PATH := /opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/rustup/bin:$(HOME)/.cargo/bin:$(PATH)

TAURI_DIR := apps/desktop/src-tauri

.PHONY: env install up down restart logs status test lint typecheck audit check bundle \
	install-app uninstall-app

env: ## Check tools, Node version and .env
	@for tool in node pnpm cargo lsof zsh; do \
		command -v $$tool >/dev/null || { echo "Falta $$tool" >&2; exit 1; }; done
	@want=$$(cat .nvmrc); have=$$(node -p 'process.versions.node.split(".")[0]'); \
		[ "$$have" = "$$want" ] || { echo "Node $$want requerido (tienes $$have)" >&2; exit 1; }
	@[ -f .env ] || cp .env.example .env
	@chmod 600 .env

install: env ## Install JS dependencies from the lockfile
	@pnpm install --frozen-lockfile

up: install ## Start the desktop app in dev mode (background)
	@scripts/desktop.sh start

down: ## Stop everything started by `up`
	@scripts/desktop.sh stop

restart: down up

logs: ## Follow the app log
	@scripts/desktop.sh logs

status: ## Show whether the app is running
	@scripts/desktop.sh status

test: env ## Unit tests: frontend, Rust, shell integration and operations
	@pnpm run test
	@cd $(TAURI_DIR) && cargo test --quiet
	@zsh shell/osc7_spec.zsh
	@bash scripts/operations.test.sh

lint: env ## ESLint + Prettier + rustfmt + clippy
	@pnpm run lint
	@cd $(TAURI_DIR) && cargo fmt --check && cargo clippy --quiet --all-targets -- -D warnings

typecheck: env
	@pnpm run typecheck

audit: env ## Known vulnerabilities in npm packages and Rust crates
	@pnpm audit --audit-level low
	@command -v cargo-audit >/dev/null || { echo "Falta cargo-audit (brew install cargo-audit o cargo install cargo-audit --locked)" >&2; exit 1; }
	@cd $(TAURI_DIR) && cargo audit --deny warnings

check: lint typecheck test audit ## Everything above

bundle: install ## Build the installable app (.app/.dmg on macOS, .deb/.AppImage on Linux)
	@cd apps/desktop && pnpm tauri build

install-app: install ## Build in release and install into the OS app launcher
	@scripts/install-app.sh install

uninstall-app: ## Remove the installed app (only if it is Zylo)
	@scripts/install-app.sh uninstall
