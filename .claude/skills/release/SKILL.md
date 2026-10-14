---
name: release
description: Publish a new DHQ Tray version with user-facing release notes. Use only when the owner asks to release or publish a version.
---

# Release DHQ Tray

Only when the owner asks for a release: it pushes and publishes publicly. Read the "Releasing" section of `MAINTAINING.md` first.

## 1. Pick the version

Use the version the owner gave. If they gave none, propose the next one from the latest tag (`git describe --tags --abbrev=0`): patch for fixes, minor for new features, and confirm it with them.

## 2. Draft the release notes

The notes are shown in the app ("What's new") before users install the update, and they are the GitHub release text. Write them for users of the app, not for developers.

- Read what changed since the previous tag: `git log --no-merges <previous tag>..HEAD` (skip `chore(release)` commits) and, where a subject is unclear, the diff itself.
- One `- ` line per change a user can notice, in English, starting with what they can now do or what got better: "- See the latest deployments of your watched projects in the new Recent tab".
- Group related commits into one line. Leave out refactors, tests, CI, docs and other internal changes. If only internal changes remain, write a single line such as "- Small fixes and improvements".
- No commit hashes, file names, function names or jargon. Short sentences, no trailing period needed.
- No headings or lines starting with `#`: the release script drops them.

## 3. Confirm with the owner

Show the version and the notes and wait for their go-ahead or edits. Releasing cannot be undone once published.

## 4. Release

Write the notes to a file outside the repository (the script needs a clean working tree) and run the script with it:

```sh
notes_file="$(mktemp -t dhq-tray-notes)"
cat >"$notes_file" <<'NOTES'
- ...
NOTES
RELEASE_NOTES_FILE="$notes_file" npm run release -- <version>
```

The build makes the Keychain ask the owner for passwords; tell them before starting. Afterwards check that `https://github.com/emmgfx/dhq-tray/releases/latest/download/latest.json` shows the new version and its `notes`.
