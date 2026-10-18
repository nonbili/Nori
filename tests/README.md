Run all TypeScript tests with `bun test`. The workflow wrappers launch each suite
in a separate process so their host-service mocks cannot affect library tests.

To see individual workflow cases, run one suite directly:

```sh
bun test ./tests/sync.cases.ts
bun test ./tests/state-bridge.cases.tsx
bun test ./tests/accounts.cases.ts
bun test ./tests/quick-share.cases.ts
bun test ./tests/preview-workflows.cases.tsx
```

These exercise real application orchestration with in-memory host adapters.
The component suites render React in Happy DOM; native layout, gestures, and
OS share delivery still need device testing. Sync tests use fake timers and
deferred requests to control when edits and account changes happen.

Desktop tests run with `cd desktop && go test ./...`. Linux needs the Wails GTK
and WebKit development packages; use `-tags gtk3` with GTK3/WebKitGTK 4.1.
Chrome, Chromium, or Edge is needed for browser-dependent cases. The desktop
CI job checks that Chrome exists so those cases run rather than skip.
