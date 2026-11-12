import { describe, expect, it } from "vitest";
import { describeCommit, pendingCommits, summarizeAuthors } from "./pendingChanges";
import type { Commit } from "./types";

const commit = (overrides: Partial<Commit>): Commit => ({
  ref: "abc1234def",
  author: "Josep",
  timestamp: null,
  short_message: null,
  message: null,
  ...overrides,
});

describe("pendingCommits", () => {
  const commits = ["c3", "c2", "c1"].map((ref) => commit({ ref }));

  it("keeps the commits newer than the deployed revision", () => {
    expect(pendingCommits(commits, "c2")).toEqual({ commits: [commits[0]], isTruncated: false });
  });

  it("keeps every commit when the deployed revision is older than the list", () => {
    expect(pendingCommits(commits, "c0")).toEqual({ commits, isTruncated: true });
  });

  it("keeps every commit when nothing is deployed", () => {
    expect(pendingCommits(commits, null)).toEqual({ commits, isTruncated: false });
  });
});

describe("describeCommit", () => {
  it("uses the subject of a regular commit", () => {
    expect(describeCommit(commit({ short_message: "Fix the login form" }))).toEqual({
      title: "Fix the login form",
      pullRequest: null,
      isBranchMerge: false,
    });
  });

  it("turns a pull request merge into the pull request title", () => {
    const merge = commit({
      short_message: "Merge pull request #15 from emmgfx/deps-update",
      message: "Merge pull request #15 from emmgfx/deps-update\n\nUpdate dependencies\n\nMore text",
    });
    expect(describeCommit(merge)).toEqual({
      title: "Update dependencies",
      pullRequest: 15,
      isBranchMerge: false,
    });
  });

  it("keeps the merge subject when the message has no pull request title", () => {
    const merge = commit({ short_message: "Merge pull request #15 from emmgfx/deps-update" });
    expect(describeCommit(merge)).toMatchObject({
      title: "Merge pull request #15 from emmgfx/deps-update",
      pullRequest: 15,
    });
  });

  it("flags branch merges", () => {
    expect(describeCommit(commit({ short_message: "Merge branch 'main' into feature" })))
      .toMatchObject({ isBranchMerge: true });
    expect(describeCommit(commit({ short_message: "Merge remote-tracking branch 'origin/main'" })))
      .toMatchObject({ isBranchMerge: true });
  });

  it("falls back to the full message, then the revision", () => {
    expect(describeCommit(commit({ message: "Subject\n\nBody" })).title).toBe("Subject");
    expect(describeCommit(commit({})).title).toBe("abc1234def");
  });
});

describe("summarizeAuthors", () => {
  const by = (...authors: string[]) => authors.map((author) => commit({ author }));

  it("lists up to three authors, the most active first", () => {
    expect(summarizeAuthors(by("Josep"))).toBe("Josep");
    expect(summarizeAuthors(by("Ana", "Josep", "Josep"))).toBe("Josep and Ana");
    expect(summarizeAuthors(by("Ana", "Josep", "Marc"))).toBe("Ana, Josep and Marc");
  });

  it("counts the rest beyond that", () => {
    expect(summarizeAuthors(by("Ana", "Josep", "Marc", "Laia", "Josep"))).toBe(
      "Josep, Ana and 2 others",
    );
  });
});
