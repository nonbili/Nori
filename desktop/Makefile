# Wails v3 needs GTK4 + WebKitGTK 6; distributions that only ship the GTK3
# stack build with the `gtk3` tag instead. The probe is Linux-only: elsewhere
# pkg-config is usually absent, and its failure would wrongly select `gtk3`.
ifeq ($(shell uname -s),Linux)
TAGS := $(shell pkg-config --exists gtk4 webkitgtk-6.0 2>/dev/null || echo gtk3)
endif
GOFLAGS := $(if $(TAGS),-tags $(TAGS),)
# `go build -o` takes the name literally, so Windows needs the suffix spelled out.
EXE := $(if $(filter Windows_NT,$(OS)),.exe,)
# `wails3 dev` picks the Vite port and exports it, defaulting to its own 9245.
VITE_PORT ?= $(or $(WAILS_VITE_PORT),9245)

.PHONY: frontend dev dev-build dev-frontend build clean

frontend:
	cd frontend && bun run build

# Runs the app from source. Re-run after frontend changes, or use `wails3 dev`
# below to get a Vite dev server plus Go rebuilds on change.
dev: frontend
	go run $(GOFLAGS) .

# The two halves `wails3 dev` drives (see build/config.yml). main.go proxies to
# the Vite server whenever FRONTEND_DEVSERVER_URL is set, so the Go build only
# needs frontend/dist to exist for the embed directive to resolve.
dev-build: frontend/dist
	go build $(GOFLAGS) -o bin/nori$(EXE) .

# --host 127.0.0.1 is required, not cosmetic: Vite's default `localhost` binds
# IPv6-only on this stack, while the Wails dev proxy pins localhost dials to
# tcp4, so the app would get connection refused for every asset.
dev-frontend:
	cd frontend && bun run dev --host 127.0.0.1 --port $(VITE_PORT) --strictPort

frontend/dist:
	cd frontend && bun run build

build: frontend
	go build $(GOFLAGS) -o bin/nori$(EXE) .

clean:
	rm -rf bin frontend/dist
