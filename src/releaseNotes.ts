/**
 * Splits the notes of an update (the `notes` field of latest.json, written by
 * scripts/release.sh as one "- change" line per commit) into plain items.
 */
export function parseReleaseNotes(notes: string | undefined): string[] {
  if (!notes) return [];
  return notes
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter((line) => line.length > 0);
}
