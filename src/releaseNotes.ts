export interface ReleaseNotesSection {
  version: string;
  items: string[];
}

const VERSION_HEADING = /^##\s+v?(\S+)/;

/**
 * Splits an update's notes (the `notes` field of latest.json) into one
 * section per version, newest first. scripts/release.sh writes them as
 * "## <version>" headings, each followed by "- change" lines, covering the
 * last few releases so users who skipped some still see every change. Notes
 * without headings (older releases) belong to `latestVersion`.
 */
export function parseReleaseNotes(
  notes: string | undefined,
  latestVersion: string,
): ReleaseNotesSection[] {
  if (!notes) return [];
  const sections: ReleaseNotesSection[] = [];
  let current: ReleaseNotesSection | null = null;
  for (const rawLine of notes.split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(VERSION_HEADING);
    if (heading) {
      current = { version: heading[1], items: [] };
      sections.push(current);
      continue;
    }
    const item = line.replace(/^[-*]\s+/, "");
    if (!item) continue;
    if (!current) {
      current = { version: latestVersion, items: [] };
      sections.push(current);
    }
    current.items.push(item);
  }
  return sections.filter((section) => section.items.length > 0);
}

/** The sections of versions newer than the installed one. */
export function releaseNotesSince(
  notes: string | undefined,
  latestVersion: string,
  installedVersion: string,
): ReleaseNotesSection[] {
  return parseReleaseNotes(notes, latestVersion).filter(
    (section) => compareVersions(section.version, installedVersion) > 0,
  );
}

/** Compares dotted numeric versions ("0.1.10" > "0.1.9"). */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((part) => parseInt(part, 10) || 0);
  const partsB = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(partsA.length, partsB.length); index++) {
    const difference = (partsA[index] ?? 0) - (partsB[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
