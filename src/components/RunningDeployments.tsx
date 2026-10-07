import { useEffect, useRef, useState } from "react";
import { listTrackedDeployments, onDeploymentUpdated } from "../api";
import { Check, X } from "lucide-react";
import {
  currentStepLabel,
  deploymentStatusLabel,
  isDeploymentInProgress,
} from "../deploymentStatus";
import { formatDuration, formatElapsedTime, shortRevision } from "../formatters";
import { useNow } from "../useNow";
import type { Deployment, WatchedDeployment } from "../types";

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
        {deployments.map(({ project, project_name, target_name, deployment }) => (
          <li key={deployment.identifier} className={`status-${deployment.status}`}>
            <button
              className="grouped-list-row"
              onClick={() => onSelectDeployment({ project, project_name, target_name, deployment })}
              data-nav-item
            >
              <DeploymentStatusIndicator deployment={deployment} />
              <span className="list-row-main">
                <span className="list-row-title">{project_name}</span>
                <span className="list-row-subtitle">
                  {deployment.branch ?? "?"} @ {shortRevision(deployment.end_revision.ref)} →{" "}
                  {target_name}
                  {deployment.deployer && ` · ${deployment.deployer}`}
                </span>
                {isDeploymentInProgress(deployment) && currentStepLabel(deployment) && (
                  <span className="list-row-subtitle current-step">
                    {currentStepLabel(deployment)}
                  </span>
                )}
              </span>
              <span className="status-pill">
                {deploymentStatusLabel(deployment)} {deploymentTimeLabel(deployment, now)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Live elapsed time while in progress, total duration once finished. */
function deploymentTimeLabel(deployment: Deployment, now: number) {
  const { timestamps } = deployment;
  if (!isDeploymentInProgress(deployment)) {
    return timestamps.duration !== null ? formatDuration(timestamps.duration) : "";
  }
  const since = timestamps.started_at ?? timestamps.queued_at;
  return since ? formatElapsedTime(since, now) : "";
}

function DeploymentStatusIndicator({ deployment }: { deployment: Deployment }) {
  if (isDeploymentInProgress(deployment)) {
    return <span className="status-indicator status-dot" aria-hidden />;
  }
  const Icon = deployment.status === "completed" ? Check : X;
  return <Icon className="status-indicator" size={12} strokeWidth={3} aria-hidden />;
}
