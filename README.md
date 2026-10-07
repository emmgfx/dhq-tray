# DHQ Tray

macOS menu bar app for quick access to [DeployHQ](https://www.deployhq.com) deployments. Built with Tauri 2 + React + TypeScript.

## Features

- Lists the account's projects (starred first) with search.
- Shows each project's server groups and servers with their branch and deployed revision.
- Deploys the latest commit of the target's preferred branch, after an inline confirmation.
- Watched projects (bell icon in the project list): their running deployments are checked continuously, including ones started outside the app: every 20 s for 10 minutes after the tray is opened, every 2 minutes otherwise.
- Tracks deployments (started from the app or found while polling, whoever started them) and notifies when they start and when they finish, including ones that started and ended between two polls. Tracking survives restarts and updates.
- Failed deployments show why (DeployHQ's log summary or the failing step's log) in the notification and in the detail, where the step log can be opened.
- From a deployment's detail: abort it while running, retry it if it failed, or roll back to it.
- Clicking a notification opens that deployment's detail.
- If DeployHQ rate limits or is busy (429/503), background polling pauses and backs off (30 s up to 15 min).
- The tray icon shows a dot while a deployment is running and a "!" when one failed since the panel was last opened.
- Polling pauses while there has been no keyboard/mouse input for 5 minutes (or the Mac sleeps) and resumes when you are back.
- Project and server lists are cached and shown instantly, then refreshed in the background.
- Deploying opens a screen with the summary, the pending commits (between the target's deployed revision and the branch head) and the options: copy config files, run build commands and use build cache (preselected), plus deploy all files (no start revision, full upload). The revision shown is the one deployed.
- Each server and group shows when it was last deployed, from the project's recent deployments.
- Settings: open at login, notification level (all / only failures / off) and sound, app version and Quit. Preferences are stored in `preferences.json` in the app config directory.

## Setup

Requires [Rust](https://www.rust-lang.org/tools/install) and Node.js.

```sh
npm install
npm run tauri dev     # development
npm run tauri build   # .app and .dmg in src-tauri/target/release/bundle
```

On first launch, click the menu bar icon and enter the account permalink (`<account>.deployhq.com`), your email and the API key from **Settings → Security** in DeployHQ. Credentials are validated against the API and stored in the macOS Keychain.

## Architecture

- `src-tauri/src/deployhq.rs`: API client (HTTP basic auth). Calls go through Rust to avoid CORS and keep the API key out of the webview.
- `src-tauri/src/credentials.rs`: Keychain storage.
- `src-tauri/src/deployment_watcher.rs`: polls a deployment every 5 s, emits `deployment-updated` to the webview and notifies when it finishes.
- `src-tauri/src/running_deployments_poller.rs`: continuous poller over watched projects; active pace after the tray opens, slow pace otherwise, paused while away.
- `src-tauri/src/watched_projects.rs`: watched projects, stored in the app config directory.
- `src-tauri/src/tray.rs`: menu bar icon; left click toggles the popover window, right click shows the Quit menu.
- `src-tauri/src/api_health.rs`: backoff shared by background polling when DeployHQ throttles.
- `src/`: React UI.

App and tray icons are rendered from Lucide's `rocket` with `npm run icons`.

API reference: <https://api.deployhq.com/docs>

## Tests

```sh
npm test                                          # frontend (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # backend
```

CI (`.github/workflows/ci.yml`) runs both and builds the frontend on every push.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Esc | Back; on the project list, clears the search, then closes the panel |
| ↑ / ↓, ↩︎ | Move through lists and open the selected item |
| ⌘F | Focus the search |
| ⌘R | Refresh |
| ⌘, | Settings |
| ⌘W | Close the panel |
| ⌘Q | Quit |

## Releases and updates

The app checks `https://github.com/emmgfx/dhq-tray/releases/latest/download/latest.json` at launch and every 6 hours, and offers to install newer versions (Settings → Updates, or the banner on the main screen).

To publish a version, from a clean working tree on the release Mac:

```sh
npm run release -- 0.2.0
```

It sets the version, builds and signs the app, commits and tags `v0.2.0`, pushes, and creates the GitHub release with the `.dmg` (fresh installs), the update archive and `latest.json`.

The release Mac needs:

- **Code signing:** the self-signed `DHQ Tray Local Signing` certificate in the login Keychain, trusted for code signing. It gives the app a stable identity, which macOS requires to authorize its notifications. It does not avoid Keychain prompts: without an Apple-issued Team ID the Keychain identifies each build by its hash, so after every update it asks once for permission to read the API key ("Always Allow").
- **Update signing:** `~/.tauri/dhq-tray.key`, with its password in the Keychain as `dhq-tray-updater-key`. Installed apps only accept updates signed with this key.

Both are backed up outside the repository. Losing the update key means users must reinstall manually once.

First install on another Mac: open the `.dmg`, drag the app to Applications, then allow it once in System Settings → Privacy & Security → "Open Anyway" (the app is not notarized). Updates installed from the app do not ask again.
