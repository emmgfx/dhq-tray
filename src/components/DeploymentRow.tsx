import { Check, X } from "lucide-react";
import {
  currentStepLabel,
  deploymentStatusLabel,
  isDeploymentInProgress,
} from "../deploymentStatus";
import {
  formatDuration,
  formatElapsedTime,
  formatRelativeTime,
  shortRevision,
} from "../formatters";
import type { Deployment, WatchedDeployment } from "../types";

interface DeploymentRowProps {
  watched: WatchedDeployment;
  /** Current time, for the live elapsed time of running deployments. */
  now: number;
  /** Adds when it was queued, for lists that go back in time. */
  showQueuedAt?: boolean;
  onSelect: () => void;
}

/** A deployment in a list: project, what went where, and its status. */
export function DeploymentRow({
  watched,
  now,
  showQueuedAt = false,
  onSelect,
}: DeploymentRowProps) {
  const { project_name, target_name, deployment } = watched;
  const queuedAt = deployment.timestamps.queued_at ?? deployment.timestamps.started_at;
  const isInProgress = isDeploymentInProgress(deployment);
  return (
    <li className={`status-${deployment.status}`}>
      <button className="grouped-list-row" onClick={onSelect} data-nav-item>
        <DeploymentStatusIndicator deployment={deployment} />
        <span className="list-row-main">
          <span className="list-row-title">{project_name}</span>
          <span className="list-row-subtitle">
            {deployment.branch ?? "?"} @ {shortRevision(deployment.end_revision.ref)} →{" "}
            {target_name}
            {deployment.deployer && ` · ${deployment.deployer}`}
          </span>
          {showQueuedAt && queuedAt && (
            <span className="list-row-subtitle">{formatRelativeTime(queuedAt)}</span>
          )}
          {isInProgress && currentStepLabel(deployment) && (
            <span className="list-row-subtitle current-step">{currentStepLabel(deployment)}</span>
          )}
          {watched.failure_reason && (
            <span className="list-row-subtitle current-step">{watched.failure_reason}</span>
          )}
        </span>
        <span className="status-pill">
          {deploymentStatusLabel(deployment)} {deploymentTimeLabel(deployment, now)}
        </span>
      </button>
    </li>
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
