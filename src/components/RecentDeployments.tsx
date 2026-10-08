import { useEffect, useMemo, useState } from "react";
import {
  listRecentActivity,
  listTrackedDeployments,
  onDeploymentUpdated,
  onRecentDeploymentsUpdated,
} from "../api";
import { isDeploymentInProgress } from "../deploymentStatus";
import { mergeRecentActivity } from "../recentActivity";
import type { WatchedDeployment } from "../types";
import { useNow } from "../useNow";
import { DeploymentRow } from "./DeploymentRow";
import { Spinner } from "./Spinner";

interface RecentDeploymentsProps {
  /** Filters by project name. */
  searchQuery: string;
  hasWatchedProjects: boolean;
  onSelectDeployment: (watched: WatchedDeployment) => void;
}

/**
 * Latest deployments of the watched projects, as polled in the background,
 * kept live with the watcher's updates (which also cover deployments started
 * from the app in projects that are not watched).
 */
export function RecentDeployments({
  searchQuery,
  hasWatchedProjects,
  onSelectDeployment,
}: RecentDeploymentsProps) {
  const [polled, setPolled] = useState<WatchedDeployment[] | null>(null);
  const [liveById, setLiveById] = useState<Record<string, WatchedDeployment>>({});

  useEffect(() => {
    const reload = () => listRecentActivity().then(setPolled);
    const upsertLive = (watched: WatchedDeployment) =>
      setLiveById((current) => ({
        ...current,
        [watched.deployment.identifier]: watched,
      }));

    reload();
    listTrackedDeployments().then((tracked) => tracked.forEach(upsertLive));
    const unlistenPromises = [onRecentDeploymentsUpdated(reload), onDeploymentUpdated(upsertLive)];
    return () => {
      unlistenPromises.forEach((promise) => promise.then((unlisten) => unlisten()));
    };
  }, []);

  const deployments = useMemo(() => {
    const merged = mergeRecentActivity(polled ?? [], liveById);
    const query = searchQuery.trim().toLowerCase();
    return query
      ? merged.filter(({ project_name }) => project_name.toLowerCase().includes(query))
      : merged;
  }, [polled, liveById, searchQuery]);

  const now = useNow(deployments.some(({ deployment }) => isDeploymentInProgress(deployment)));

  if (!polled) {
    return (
      <p className="empty-message">
        <Spinner />
      </p>
    );
  }
  if (deployments.length === 0) {
    return (
      <p className="empty-message">
        {searchQuery.trim()
          ? "No deployments found"
          : hasWatchedProjects
            ? "No recent deployments"
            : "Watch projects with the bell to see their deployments here"}
      </p>
    );
  }

  return (
    <section>
      <ul className="grouped-list">
        {deployments.map((watched) => (
          <DeploymentRow
            key={watched.deployment.identifier}
            watched={watched}
            now={now}
            showQueuedAt
            onSelect={() => onSelectDeployment(watched)}
          />
        ))}
      </ul>
    </section>
  );
}
