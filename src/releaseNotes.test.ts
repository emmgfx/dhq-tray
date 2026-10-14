import { describe, expect, it } from "vitest";
import { compareVersions, parseReleaseNotes, releaseNotesSince } from "./releaseNotes";

describe("parseReleaseNotes", () => {
  it("returns one section per version heading", () => {
    expect(
      parseReleaseNotes("## 0.1.8\n- Faster loading\n\n## 0.1.7\n* Fewer notifications\n", "0.1.8"),
    ).toEqual([
      { version: "0.1.8", items: ["Faster loading"] },
      { version: "0.1.7", items: ["Fewer notifications"] },
    ]);
  });

  it("puts notes without headings under the latest version", () => {
    expect(parseReleaseNotes("Bug fixes\n\n  - Faster loading  ", "0.1.7")).toEqual([
      { version: "0.1.7", items: ["Bug fixes", "Faster loading"] },
    ]);
  });

  it("is empty when the update has no notes", () => {
    expect(parseReleaseNotes(undefined, "0.1.7")).toEqual([]);
    expect(parseReleaseNotes("", "0.1.7")).toEqual([]);
  });
});

describe("releaseNotesSince", () => {
  it("keeps only the versions newer than the installed one", () => {
    const notes = "## 0.1.9\n- C\n## 0.1.8\n- B\n## 0.1.7\n- A";
    expect(releaseNotesSince(notes, "0.1.9", "0.1.7").map(({ version }) => version)).toEqual([
      "0.1.9",
      "0.1.8",
    ]);
  });
});

describe("compareVersions", () => {
  it("compares each part as a number", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
});
