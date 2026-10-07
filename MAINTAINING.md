# Maintaining DHQ Tray

Notes for whoever picks this project up again (likely its author, a year later). The README covers what the app does; this covers how to build, release and debug it, and why things are the way they are.

## Secrets and where they live

Two signing secrets exist outside the repository. **Both are backed up in Bitwarden** (owner: emmgfx) as secure notes, as text: the updater key as is, the `.p12` base64-encoded, each with its password.

| Secret | Used for | On the release Mac | If lost |
| --- | --- | --- | --- |
| `dhq-tray-signing-certificate.p12` + its password | macOS code signing ("DHQ Tray Local Signing", self-signed, valid until 2036) | Identity in the login Keychain, trusted for code signing | Create a new one. Installed apps see "a different app": the Keychain asks once more for the API key and notification permission must be granted again. |
| `dhq-tray.key` + its password | Signing update archives (Tauri updater, minisign) | `~/.tauri/dhq-tray.key`; password in the Keychain as generic password `dhq-tray-updater-key` | **Installed apps reject every future update.** Each user has to reinstall manually once with a build carrying the new public key. |

The updater's public key is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). It must match `dhq-tray.key`.

To back them up again: `pbcopy < ~/.tauri/dhq-tray.key` and, for the certificate, export it from Keychain Access (or `security export`) and `base64 -i <file>.p12 | pbcopy`.

## Setting up a new Mac to release

1. Tooling: Node (see CI for the version), Rust via rustup, Xcode Command Line Tools, `gh` logged in with push access to `emmgfx/dhq-tray`.
2. Code signing certificate, from Bitwarden (copy the base64 note's content first):
   ```sh
   pbpaste | base64 -d > dhq-tray-signing-certificate.p12
   security import dhq-tray-signing-certificate.p12 -k ~/Library/Keychains/login.keychain-db -P '<p12 password>' -T /usr/bin/codesign
   security find-certificate -c "DHQ Tray Local Signing" -p > /tmp/dhq-cert.pem
   security add-trusted-cert -r trustRoot -p codeSign -k ~/Library/Keychains/login.keychain-db /tmp/dhq-cert.pem   # asks for your password
   rm /tmp/dhq-cert.pem dhq-tray-signing-certificate.p12
   security find-identity -v -p codesigning   # must list "DHQ Tray Local Signing"
   ```
3. Updater key, from Bitwarden (copy the note's content first):
   ```sh
   mkdir -p ~/.tauri && pbpaste > ~/.tauri/dhq-tray.key && chmod 600 ~/.tauri/dhq-tray.key
   security add-generic-password -U -s dhq-tray-updater-key -a "$USER" -w '<updater key password>' -T /usr/bin/security
   ```
4. `npm ci`, then `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml`.

## Releasing

```sh
npm run release -- 0.2.0
```

Needs a clean working tree. `scripts/release.sh` sets the version in `package.json`, `tauri.conf.json` and `Cargo.toml`, builds and signs, commits and tags `v0.2.0`, pushes, and creates the GitHub release with:

- `DHQ-Tray_<version>_aarch64.dmg` for fresh installs,
- `DHQ-Tray.app.tar.gz` (+ signature) for the updater,
- `latest.json`, which installed apps read from `https://github.com/emmgfx/dhq-tray/releases/latest/download/latest.json` (at launch and every 6 hours).

Check afterwards that `latest.json` at that URL shows the new version. Building the `.dmg` opens a Finder window; close it, do not drag the app from it.

Builds are Apple silicon only (`darwin-aarch64`). Supporting Intel needs `--target universal-apple-darwin` (and `rustup target add x86_64-apple-darwin`) plus a `darwin-x86_64` entry in `latest.json`.

## Local builds

- `npm run tauri dev` for development (no signing needed).
- A signed release bundle without publishing:
  ```sh
  TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/dhq-tray.key)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -s dhq-tray-updater-key -w)" \
  npm run tauri build -- --bundles app
  ```
  Without those variables the build fails, because `createUpdaterArtifacts` is on.
- Every new build is a new app to the Keychain (see below), so it asks for your password to read the API key. Click "Always Allow".

## Why things are the way they are

- **Self-signed certificate, not ad-hoc.** macOS only authorizes the modern notification API (UNUserNotificationCenter) for apps with a real signing identity. Ad-hoc builds get `UNErrorDomain error 1` and fall back to AppleScript notifications, shown as Script Editor.
- **The Keychain asks again after every update.** Its partition list identifies non-Apple-signed apps by their exact build hash (`cdhash:`). Only an Apple-issued Team ID (Apple Developer, 99 USD/year) gives a stable partition. Decided: keep the API key in the Keychain and accept one prompt per version.
- **Gatekeeper.** Not notarized, so first installs need System Settings → Privacy & Security → "Open Anyway" (twice with the `.dmg`: the image and the app). Updates installed by the app carry no quarantine flag and are not blocked.
- **Notifications go through `mac-usernotifications` directly.** `notify-rust` dropped them whenever the main run loop was busy at that instant (`Mainthread not running`). The legacy NSUserNotification API accepts notifications but no longer shows them.
- **The panel hides the whole app (`NSApp hide`)** when it closes. Otherwise macOS keeps treating the app as frontmost and suppresses notification banners.
- **`LSUIElement` in `src-tauri/Info.plist`** keeps the app out of the Dock even when a notification click activates it.
- **Window positioning is custom** (`tray.rs`), not `tauri-plugin-positioner`, which misplaces the panel with displays of different scale (Retina + 1x).
- **DeployHQ's API docs are not always right.** The deployment `duration` is documented as a string but arrives as a number of seconds, and several fields can be `null`. Deserialization is lenient on purpose (`null_as_default`, `seconds_from_number_or_string`) and covered by tests.

## Debugging

- Run the bundled binary from a terminal to see its log:
  ```sh
  "src-tauri/target/release/bundle/macos/DHQ Tray.app/Contents/MacOS/dhq-tray" 2> debug.log
  ```
  Failed API responses, notification errors and decode errors (with the offending field) are logged. `debug.log` is git-ignored.
- `DHQ_TRAY_NOTIFICATION_SELF_TEST=1` on that command sends a notification a few seconds after launch and logs whether macOS delivered it.
- Notification banners not showing although they reach Notification Center: check System Settings → Notifications → DHQ Tray (style "Banners"/"Temporal").
- Old icon in notifications: macOS caches it per bundle id; `killall NotificationCenter usernoted` or log out.
- App data: `~/Library/Application Support/com.emmgfx.dhqtray/` (`preferences.json`, `watched-projects.json`, `tracked-deployments.json`). Credentials: Keychain item `com.emmgfx.dhqtray` / `deployhq-credentials`.

## Regenerating icons

`npm run icons` renders the app icon and tray icons from Lucide's `rocket` (`scripts/generate-icons.mjs`) and runs `tauri icon` for every bundle size.
