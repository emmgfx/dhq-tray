#!/usr/bin/env bash
# Builds a signed release on this Mac and publishes it on GitHub Releases,
# together with the latest.json manifest the in-app updater reads.
#
# Usage: npm run release -- <version>     e.g. npm run release -- 0.2.0
#
# Needs on this Mac:
#   - the "DHQ Tray Local Signing" certificate in the login Keychain (code signing)
#   - ~/.tauri/dhq-tray.key (updater signing key) and its password stored in the
#     Keychain as "dhq-tray-updater-key"
#   - gh authenticated with push access to the repository
set -euo pipefail

VERSION="${1:?Usage: npm run release -- <version>}"
REPO="emmgfx/dhq-tray"
TAG="v$VERSION"
PLATFORM="darwin-aarch64" # Apple silicon builds only, for now.

cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree has uncommitted changes; commit or stash them first." >&2
  exit 1
fi
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists." >&2
  exit 1
fi

echo "→ Setting version $VERSION"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
node -e '
  const fs = require("fs");
  const path = "src-tauri/tauri.conf.json";
  const config = JSON.parse(fs.readFileSync(path, "utf8"));
  config.version = process.argv[1];
  fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
' "$VERSION"
# Only the [package] version: the first `version =` line of Cargo.toml.
sed -i '' "1,/^version = /s/^version = .*/version = \"$VERSION\"/" src-tauri/Cargo.toml

echo "→ Building and signing"
TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/dhq-tray.key")"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -s dhq-tray-updater-key -w)"
export TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
npm run tauri build -- --bundles app,dmg

BUNDLE_DIR="src-tauri/target/release/bundle"
PUBLISH_DIR="src-tauri/target/release/publish"
rm -rf "$PUBLISH_DIR" && mkdir -p "$PUBLISH_DIR"
# GitHub replaces spaces in asset names, so publish them without spaces.
UPDATE_ARCHIVE="DHQ-Tray.app.tar.gz"
INSTALLER="DHQ-Tray_${VERSION}_aarch64.dmg"
cp "$BUNDLE_DIR/macos/DHQ Tray.app.tar.gz" "$PUBLISH_DIR/$UPDATE_ARCHIVE"
cp "$BUNDLE_DIR/dmg/DHQ Tray_${VERSION}_aarch64.dmg" "$PUBLISH_DIR/$INSTALLER"

node -e '
  const fs = require("fs");
  const [version, tag, repo, platform, archive, signaturePath, outPath] = process.argv.slice(1);
  const manifest = {
    version,
    pub_date: new Date().toISOString(),
    platforms: {
      [platform]: {
        signature: fs.readFileSync(signaturePath, "utf8").trim(),
        url: `https://github.com/${repo}/releases/download/${tag}/${archive}`,
      },
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
' "$VERSION" "$TAG" "$REPO" "$PLATFORM" "$UPDATE_ARCHIVE" \
  "$BUNDLE_DIR/macos/DHQ Tray.app.tar.gz.sig" "$PUBLISH_DIR/latest.json"

echo "→ Committing and tagging $TAG"
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git diff --cached --quiet || git commit -q -m "chore(release): $TAG"
git tag "$TAG"
git push -q origin HEAD "$TAG"

echo "→ Publishing GitHub release"
gh release create "$TAG" \
  "$PUBLISH_DIR/$INSTALLER" "$PUBLISH_DIR/$UPDATE_ARCHIVE" "$PUBLISH_DIR/latest.json" \
  --repo "$REPO" --title "DHQ Tray $VERSION" --generate-notes

echo "✓ Released $TAG"
