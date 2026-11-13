import type { Commit } from "./types";

/** Commits newer than `deployedRevision`; all of them if it is not in the list. */
export function pendingCommits(commits: Commit[], deployedRevision: string | null) {
  const deployedIndex = deployedRevision
    ? commits.findIndex((commit) => commit.ref === deployedRevision)
    : -1;
  return {
    commits: deployedIndex === -1 ? commits : commits.slice(0, deployedIndex),
    // The deployed revision is older than the commits the API returns.
    isTruncated: Boolean(deployedRevision) && deployedIndex === -1,
  };
}

export interface CommitDescription {
  title: string;
  /** Number of the pull request this commit merged, if any. */
  pullRequest: number | null;
  /** Branch this commit merged into the deployed one, if any. */
  mergedBranch: string | null;
  /** The deployed branch merged back into another one: no change of its own. */
  isBranchSync: boolean;
}

const PULL_REQUEST_MERGE = /^Merge pull request #(\d+) from \S+/;
// "Merge branch 'feature'", "Merge branch 'main' of github.com:org/repo",
// "Merge remote-tracking branch 'origin/main' into feature".
const BRANCH_MERGE = /^Merge (?:remote-tracking )?branch '([^']+)'(?: of \S+)?(?: into (\S+))?$/;

function firstLine(text: string | null | undefined) {
  return text?.trim().split("\n")[0]?.trim() || null;
}

const withoutRemote = (branch: string) => branch.replace(/^origin\//, "");

/**
 * What a commit changed, in words, for a deployment of `deployedBranch`.
 * GitHub's pull request merges become the pull request title (the message's
 * second paragraph) when the message has it. DeployHQ does not say which
 * branch a commit was made on, so the commits of merged branches stay listed.
 */
export function describeCommit(commit: Commit, deployedBranch: string): CommitDescription {
  const subject = firstLine(commit.short_message) ?? firstLine(commit.message) ?? commit.ref;
  const description: CommitDescription = {
    title: subject,
    pullRequest: null,
    mergedBranch: null,
    isBranchSync: false,
  };

  const pullRequestMatch = PULL_REQUEST_MERGE.exec(subject);
  if (pullRequestMatch) {
    const body = commit.message?.trim().split("\n").slice(1).join("\n");
    return {
      ...description,
      title: firstLine(body) ?? subject,
      pullRequest: Number(pullRequestMatch[1]),
    };
  }

  const branchMatch = BRANCH_MERGE.exec(subject);
  if (branchMatch) {
    const source = withoutRemote(branchMatch[1]);
    const target = branchMatch[2] ? withoutRemote(branchMatch[2]) : null;
    if (source === deployedBranch || (target !== null && target !== deployedBranch)) {
      return { ...description, isBranchSync: true };
    }
    return { ...description, title: `Merged ${source}`, mergedBranch: source };
  }
  return description;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]) {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Authors by number of commits, e.g. "Ana, Josep and 2 others". */
export function summarizeAuthors(commits: Commit[], maxNames = 2): string {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const author = commit.author.trim() || "Unknown";
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  const authors = [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([author]) => author);
  // "and 1 other" reads worse than the name itself.
  if (authors.length <= maxNames + 1) return joinNames(authors);
  const others = authors.length - maxNames;
  return joinNames([...authors.slice(0, maxNames), `${others} others`]);
}
