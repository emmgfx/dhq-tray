import type { WatchedDeployment } from "./types";

/** How many deployments the Recent tab lists. */
export const RECENT_ACTIVITY_LIMIT = 20;

const queuedAtTime = ({ deployment }: WatchedDeployment) => {
  const { queued_at, started_at } = deployment.timestamps;
  const time = new Date(queued_at ?? started_at ?? 0).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/**
 * The polled list plus the live updates from the watcher, which are newer
 * (and include deployments of projects that are not watched), newest first.
 */
export function mergeRecentActivity(
  polled: WatchedDeployment[],
  liveById: Record<string, WatchedDeployment>,
): WatchedDeployment[] {
  const byId = new Map(polled.map((watched) => [watched.deployment.identifier, watched]));
  for (const [identifier, live] of Object.entries(liveById)) byId.set(identifier, live);
  return [...byId.values()]
    .sort((a, b) => queuedAtTime(b) - queuedAtTime(a))
    .slice(0, RECENT_ACTIVITY_LIMIT);
}
