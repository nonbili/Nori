# Nori Desktop (Wails v3)

A desktop build of Nori that reuses the browser extension's UI and sync stack
verbatim. Go supplies the window and the few capabilities a webview lacks.

## What is reused

Nothing about the app UI is reimplemented here. The bundle pulls in:

- `components/` at the repo root — the React Native screens, via
  `react-native-web` and the same `@/` alias rewrite the extension uses.
- `extension/components/` — `NativeApp`, the shared settings sheet, the
  snapshot hooks and the Legend State bridge.
- `extension/entrypoints/background.ts` — state ownership, Supabase sync,
  periodic sync, sign-in orchestration.
- `extension/lib/` — storage, client messaging, the sync API, i18n helpers.

The only desktop-specific frontend code is `frontend/src/wxt-shim.ts`, which is
aliased over `wxt/browser` and implements the slice of the WebExtension API
that shared code touches:

| Extension API | Desktop |
| --- | --- |
| `browser.storage.local` | `StoreService` → `~/.config/Nori/state.json` |
| `browser.runtime.sendMessage` / `onMessage` | in-page bus (the background script runs in the same page) |
| `browser.tabs.create` | `ShellService.OpenURL` → system browser |
| `browser.identity.*` | `AuthService` loopback redirect (see below) |
| `browser.alarms` | `setInterval` |
| `browser.i18n.getUILanguage` | `navigator.language` |

The UI runs in the extension's `tab` mode, which is the chrome-less
single-window layout a desktop window wants.

## Sign-in

There is no `chromiumapp.org` redirect target on desktop, so `AuthService`
listens on `127.0.0.1` on a random port and hands that URL to the hosted
sign-in page as `redirect_uri`. The page must allow loopback redirects for
cloud sync to complete; local-only use needs nothing.

## Build

Requires Go, `bun`, and the Wails Linux dependencies (GTK4 + WebKitGTK 6.0, or
GTK3 + WebKit2GTK 4.1 — the Makefile picks the `gtk3` build tag automatically
when the GTK4 stack is missing).

```sh
make dev     # build the frontend, then run the app from source
make build   # produces bin/nori
```

`go build` on its own will fail until `make frontend` has produced
`frontend/dist`, which `main.go` embeds.

## Live reload

`wails3 dev` runs the standard v3 dev loop: a Vite dev server the app proxies
to (so frontend edits hot-reload), plus a Go rebuild and app restart whenever a
`.go` file changes.

```sh
go install -tags gtk3 github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.15
wails3 dev   # from this directory
```

Drop `-tags gtk3` when installing on a host with the GTK4 stack.

`build/config.yml` holds the watcher config. It is the only piece of the v3
`build/` scaffolding this project carries — packaging, icons and the platform
Taskfiles are not generated, and its `executes` call the Makefile targets above
so both entry points share one build definition.
