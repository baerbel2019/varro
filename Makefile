# Makefile
#
# Run `make` or `make help` to list targets.
# Extra npm arguments: make test ARGS='src/webview/components/ChatInput.test.ts'

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m [ARGS='\''...'\'']\n"} \
		/^[a-zA-Z0-9_.-]+:.*?##/ { printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@printf "\n"

##@ Setup
.PHONY: install
install: ## Install npm dependencies
	npm install

##@ Build
.PHONY: build
build: ## Build extension and webview
	npm run build

.PHONY: build-extension
build-extension: ## Build the VS Code extension bundle
	npm run build:extension

.PHONY: build-webview
build-webview: ## Build the webview
	npm run build:webview

.PHONY: watch-extension
watch-extension: ## Rebuild the extension on change
	npm run watch:extension

.PHONY: watch-webview
watch-webview: ## Rebuild the webview on change
	npm run watch:webview

.PHONY: dev
dev: ## Watch extension and webview, and open the webview preview
	npm run dev

.PHONY: preview
preview: ## Open the webview preview only
	npm run preview:webview

##@ Quality
.PHONY: lint
lint: ## Lint and auto-fix
	npm run lint

.PHONY: lint-check
lint-check: ## Lint without writing fixes
	npm run lint:check

.PHONY: fmt
fmt: ## Format src/
	npm run fmt

.PHONY: fmt-check
fmt-check: ## Check formatting of src/ without writing
	npm run fmt:check

.PHONY: typecheck
typecheck: ## Typecheck all TypeScript sources
	npm run typecheck

.PHONY: typecheck-suggestions
typecheck-suggestions: ## Fail on editor TypeScript suggestion diagnostics
	npm run typecheck:suggestions

.PHONY: check
check: lint-check fmt-check typecheck typecheck-suggestions ## Lint, format, and typecheck without writing fixes

##@ Test
.PHONY: test
test: ## Run unit tests (ARGS=file or -t pattern)
	npm run test -- $(ARGS)

.PHONY: test-coverage
test-coverage: ## Run unit tests with coverage
	npm run test:coverage

.PHONY: test-e2e
test-e2e: ## Run Playwright e2e tests (ARGS=spec path)
	npm run test:e2e -- $(ARGS)

.PHONY: test-e2e-raster
test-e2e-raster: ## Run Playwright e2e tests in raster mode
	npm run test:e2e:raster -- $(ARGS)

##@ Package
.PHONY: package
package: ## Build and create the VSIX
	npm run package

.PHONY: package-vsix
package-vsix: ## Create the VSIX from the current build
	npm run package:vsix

.PHONY: vscode-install
vscode-install: ## Build, package, and install the extension in VS Code
	npm run vscode:install

.PHONY: artifacts-prune
artifacts-prune: ## Prune generated artifacts
	npm run artifacts:prune
