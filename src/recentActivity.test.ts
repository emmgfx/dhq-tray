import { describe, expect, it } from "vitest";
import { mergeRecentActivity, RECENT_ACTIVITY_LIMIT } from "./recentActivity";
import type { WatchedDeployment } from "./types";

const watched = (
  identifier: string,
  queuedAt: string,
  status = "completed",
): WatchedDeployment => ({
  project: "site",
  project_name: "Site",
  target_name: "Production",
  failure_reason: null,
  deployment: {
    identifier,
    status,
    servers: [],
    branch: "main",
    deployer: null,
    start_revision: { ref: null },
    end_revision: { ref: null },
    timestamps: {
      queued_at: queuedAt,
      started_at: null,
      completed_at: null,
      duration: null,
    },
    steps: [],
    log_summary: null,
  },
});

describe("mergeRecentActivity", () => {
  it("sorts newest first across time zones", () => {
    const merged = mergeRecentActivity(
      [watched("old", "2026-10-08T09:00:00+02:00"), watched("new", "2026-10-08T08:30:00Z")],
      {},
    );
    expect(merged.map(({ deployment }) => deployment.identifier)).toEqual(["new", "old"]);
  });

  it("prefers live updates and adds deployments the poll has not seen", () => {
    const merged = mergeRecentActivity([watched("a", "2026-10-08T08:00:00Z", "running")], {
      a: watched("a", "2026-10-08T08:00:00Z", "failed"),
      b: watched("b", "2026-10-08T09:00:00Z", "running"),
    });
    expect(merged.map(({ deployment }) => [deployment.identifier, deployment.status])).toEqual([
      ["b", "running"],
      ["a", "failed"],
    ]);
  });

  it("keeps only the latest ones", () => {
    const polled = Array.from({ length: RECENT_ACTIVITY_LIMIT + 5 }, (_, index) =>
      watched(String(index), new Date(Date.UTC(2026, 9, 8, 0, index)).toISOString()),
    );
    const merged = mergeRecentActivity(polled, {});
    expect(merged).toHaveLength(RECENT_ACTIVITY_LIMIT);
    expect(merged[0].deployment.identifier).toBe(String(RECENT_ACTIVITY_LIMIT + 4));
  });
});
