import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./releaseNotes";

describe("parseReleaseNotes", () => {
  it("returns one item per bullet", () => {
    expect(
      parseReleaseNotes("- Add a Recent tab\n* Open the panel on the right screen\n"),
    ).toEqual(["Add a Recent tab", "Open the panel on the right screen"]);
  });

  it("keeps lines without a bullet and skips blank ones", () => {
    expect(parseReleaseNotes("Bug fixes\n\n  - Faster loading  ")).toEqual([
      "Bug fixes",
      "Faster loading",
    ]);
  });

  it("is empty when the update has no notes", () => {
    expect(parseReleaseNotes(undefined)).toEqual([]);
    expect(parseReleaseNotes("")).toEqual([]);
  });
});
