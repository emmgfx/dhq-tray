import { Bell, ChevronRight } from "lucide-react";
import { deploymentStatusLabel } from "../deploymentStatus";
import { formatDuration, formatRelativeTime, shortRevision } from "../formatters";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import type { DeployTarget, Deployment } from "../types";

interface DeployTargetRowProps {
  target: DeployTarget;
  branch: string | null;
  /** When the last successful deployment to this target finished, if known. */
  lastDeployedAt: string | null;
  /** In-progress or just-finished deployment to show under the name. */
  deployment: Deployment | undefined;
  isDeploying: boolean;
  onDeploy: () => void;
  /** Present when the project is watched: whether deployments to this target notify. */
  follow?: {
    isFollowed: boolean;
    /** Set when the target's group is muted, which decides for it. */
    isMutedByGroup: boolean;
    onToggle: () => void;
  };
}

export function DeployTargetRow({
  target,
  branch,
  lastDeployedAt,
  deployment,
  isDeploying,
  onDeploy,
  follow,
}: DeployTargetRowProps) {
  const details = [
    target.environment,
    target.serverCount !== undefined ? `${target.serverCount} servers` : null,
    branch ?? "no branch",
    lastDeployedAt ? `deployed ${formatRelativeTime(lastDeployedAt)}` : null,
  ].filter(Boolean);

  const canDeploy = Boolean(branch) && !isDeploying;

  return (
    <li
      className={
        [follow && "followable-row", deployment && `status-${deployment.status}`]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      {follow && <FollowButton targetName={target.name} {...follow} />}
      <button
        className="grouped-list-row target-row"
        onClick={onDeploy}
        data-nav-item
        disabled={!canDeploy}
        title={branch ? undefined : "No branch configured for this target"}
      >
        <span className="list-row-main">
          <span className="list-row-title">{target.name}</span>
          <span className="list-row-subtitle">{details.join(" · ")}</span>
          {deployment && (
            <span className="list-row-subtitle current-step">
              {deploymentStatusLabel(deployment)}
              {deployment.end_revision.ref && ` · ${shortRevision(deployment.end_revision.ref)}`}
              {deployment.timestamps.duration !== null &&
                ` · ${formatDuration(deployment.timestamps.duration)}`}
            </span>
          )}
        </span>
        <span className="row-action">Deploy</span>
        <ChevronRight
          className="chevron"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE_WIDTH}
          aria-hidden
        />
      </button>
    </li>
  );
}

function FollowButton({
  targetName,
  isFollowed,
  isMutedByGroup,
  onToggle,
}: NonNullable<DeployTargetRowProps["follow"]> & { targetName: string }) {
  const label = isMutedByGroup
    ? "Muted with its server group"
    : isFollowed
      ? `Stop notifying deployments to ${targetName}`
      : `Notify deployments to ${targetName}`;
  return (
    <button
      className={`icon-button watch-button${isFollowed ? " is-watched" : ""}`}
      onClick={onToggle}
      disabled={isMutedByGroup}
      aria-pressed={isFollowed}
      aria-label={label}
      title={label}
    >
      <Bell
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE_WIDTH}
        fill={isFollowed ? "currentColor" : "none"}
        aria-hidden
      />
    </button>
  );
}
