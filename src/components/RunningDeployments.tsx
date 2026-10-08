import { useEffect, useRef, useState } from "react";
import { listTrackedDeployments, onDeploymentUpdated } from "../api";
import { isDeploymentInProgress } from "../deploymentStatus";
import { useNow } from "../useNow";
import type { WatchedDeployment } from "../types";
import { DeploymentRow } from "./DeploymentRow";

/** How long a finished deployment stays listed with its result. */
const FINISHED_VISIBLE_MS = 60_000;

interface RunningDeploymentsProps {
  onSelectDeployment: (watched: WatchedDeployment) => void;
}

/**
 * Deployments the app is tracking, across all projects. Finished ones stay
 * listed with their result for a minute, then leave the list.
 */
export function RunningDeployments({ onSelectDeployment }: RunningDeploymentsProps) {
  const [deploymentsById, setDeploymentsById] = useState<Record<string, WatchedDeployment>>({});

  const removalTimers = useRef(new Map<string, number>());

  useEffect(() => {
    const timers = removalTimers.current;

    const upsert = (watched: WatchedDeployment) => {
      const { identifier } = watched.deployment;
      setDeploymentsById((current) => ({ ...current, [identifier]: watched }));
      if (!isDeploymentInProgress(watched.deployment) && !timers.has(identifier)) {
        const timerId = window.setTimeout(() => {
          timers.delete(identifier);
          setDeploymentsById(({ [identifier]: _finished, ...remaining }) => remaining);
        }, FINISHED_VISIBLE_MS);
        timers.set(identifier, timerId);
      }
    };

    listTrackedDeployments().then((tracked) => tracked.forEach(upsert));
    const unlistenPromise = onDeploymentUpdated(upsert);
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const deployments = Object.values(deploymentsById);
  const now = useNow(deployments.some(({ deployment }) => isDeploymentInProgress(deployment)));
  if (deployments.length === 0) return null;

  return (
    <section>
      <h2 className="section-title">Running deployments</h2>
      <ul className="grouped-list">
        {deployments.map((watched) => (
          <DeploymentRow
            key={watched.deployment.identifier}
            watched={watched}
            now={now}
            onSelect={() => onSelectDeployment(watched)}
          />
        ))}
      </ul>
    </section>
  );
}
