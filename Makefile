PNPM ?= pnpm
NODE ?= node
VERSION := $(shell $(NODE) -p "require('./package.json').version")

.PHONY: all install build dev test lint check examples package release clean distclean check-pnpm

all: build

check-pnpm:
	@command -v $(PNPM) >/dev/null 2>&1 || { \
		echo "ERROR: pnpm not found in PATH. Install from https://pnpm.io/installation"; \
		exit 1; \
	}

install: check-pnpm
	@if [ -f pnpm-lock.yaml ]; then \
		$(PNPM) install --frozen-lockfile; \
	else \
		$(PNPM) install; \
	fi

build: install
	$(NODE) scripts/build.mjs

dev: install
	$(NODE) scripts/build.mjs --watch

test: install
	$(PNPM) test

lint: install
	$(PNPM) lint

check: lint test

examples: build
	@for f in examples/*.html; do \
		echo "Checking $$f..."; \
		grep -q 'rrdnavigator' "$$f" || { echo "  missing reference"; exit 1; }; \
	done
	@echo "All examples reference the bundle."

package: build
	$(PNPM) pack --pack-destination dist

release: check build package

clean:
	rm -rf dist/*
	@touch dist/.gitkeep

distclean: clean
	rm -rf node_modules .pnpm-store
