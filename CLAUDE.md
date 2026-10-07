# DHQ Tray

macOS menu bar app (Tauri 2 + React + TypeScript) for DeployHQ deployments. Read `README.md` for features and `MAINTAINING.md` for building, releasing, secrets and the reasons behind non-obvious decisions before changing signing, notifications, the Keychain or window handling.

## Conventions

- Everything in English: code, comments, docs and UI copy.
- Commits, PRs and releases carry no AI attribution (no `Co-Authored-By`, no "Generated with").
- Descriptive names; fix root causes rather than patching symptoms.
- The owner tests the UI; do not start dev servers or drive the UI unless asked.

## Working on it

- Rust lives in `~/.cargo/bin`, which may not be on the shell's PATH: `export PATH="$HOME/.cargo/bin:$PATH"`.
- Checks: `npx tsc --noEmit`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`. CI runs the same on every push.
- Signed builds need the updater key variables (see `MAINTAINING.md`). Each new build makes the Keychain ask the owner for a password, so batch changes before building.
- To stop a local build, match its full path (`src-tauri/target/release/bundle/...`). A bare `pkill -f "DHQ Tray.app"` also kills the copy installed in `/Applications`.
- Release with `npm run release -- <version>` only when the owner asks; it pushes and publishes publicly.
- DeployHQ API reference: <https://api.deployhq.com/docs> (OpenAPI at `/docs.json`). It is not always accurate; trust real responses and keep deserialization lenient.
