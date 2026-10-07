import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ExternalLink,
  X,
} from "lucide-react";
import { onDeploymentUpdated } from "../api";
import { deploymentStatusLabel, isDeploymentInProgress, stepLabel } from "../deploymentStatus";
import { formatDuration, formatElapsedTime, shortRevision } from "../formatters";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import type { DeploymentStep, WatchedDeployment } from "../types";
import { useNow } from "../useNow";
import { ScrollArea } from "./ScrollArea";
import { Spinner } from "./Spinner";

interface DeploymentViewProps {
  account: string;
  watched: WatchedDeployment;
  onBack: () => void;
}

function StepStatusIcon({ status }: { status: string | null }) {
  switch (status) {
    case "completed":
      return <Check className="step-icon" size={12} strokeWidth={3} aria-hidden />;
    case "failed":
      return <X className="step-icon" size={12} strokeWidth={3} aria-hidden />;
    case "running":
      return <Spinner />;
    default:
      return <Circle className="step-icon" size={8} strokeWidth={2} aria-hidden />;
  }
}

/** Detail of one deployment, kept up to date by the deployment watcher's events. */
export function DeploymentView({ account, watched, onBack }: DeploymentViewProps) {
  const [deployment, setDeployment] = useState(watched.deployment);
  // Completed steps start collapsed so what is still relevant stays in view.
  const [isShowingCompletedSteps, setIsShowingCompletedSteps] = useState(false);

  useEffect(() => {
    const unlistenPromise = onDeploymentUpdated((update) => {
      if (update.deployment.identifier === watched.deployment.identifier) {
        setDeployment(update.deployment);
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [watched.deployment.identifier]);

  const isInProgress = isDeploymentInProgress(deployment);
  const now = useNow(isInProgress);
  const { timestamps } = deployment;
  const startedAt = timestamps.started_at ?? timestamps.queued_at;
  const timeLabel = isInProgress
    ? startedAt && formatElapsedTime(startedAt, now)
    : timestamps.duration !== null && formatDuration(timestamps.duration);
  const completedSteps = deployment.steps.filter((step) => step.status === "completed");
  const remainingSteps = deployment.steps.filter((step) => step.status !== "completed");

  const renderStep = (step: DeploymentStep, index: number) => (
    <li
      key={`${step.status}-${index}-${step.description}`}
      className={`step-row step-${step.status ?? "pending"}`}
    >
      <span className="step-status">
        <StepStatusIcon status={step.status} />
      </span>
      <span className="list-row-main">
        <span className="step-title">{stepLabel(step) ?? step.stage ?? "Step"}</span>
      </span>
    </li>
  );

  const deploymentUrl = `https://${account}.deployhq.com/projects/${watched.project}/deployments/${deployment.identifier}`;

  return (
    <div className="screen">
      <header className="toolbar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
        <h1 className="toolbar-title">{watched.project_name}</h1>
        <button
          className="icon-button"
          onClick={() => openUrl(deploymentUrl)}
          aria-label="Open in DeployHQ"
          title="Open in DeployHQ"
        >
          <ExternalLink size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
      </header>

      <ScrollArea>
        <ul className="grouped-list settings-list summary-list">
          <li className={`settings-row status-${deployment.status}`}>
            <span>Status</span>
            <span className="status-pill">
              {deploymentStatusLabel(deployment)}
              {timeLabel && ` ${timeLabel}`}
            </span>
          </li>
          <li className="settings-row">
            <span>Target</span>
            <span className="settings-row-value">{watched.target_name}</span>
          </li>
          <li className="settings-row">
            <span>Branch</span>
            <span className="settings-row-value">{deployment.branch ?? "—"}</span>
          </li>
          <li className="settings-row">
            <span>Revision</span>
            <span className="settings-row-value monospace">
              {deployment.start_revision.ref
                ? shortRevision(deployment.start_revision.ref)
                : "all files"}{" "}
              → {shortRevision(deployment.end_revision.ref)}
            </span>
          </li>
          {deployment.deployer && (
            <li className="settings-row">
              <span>Started by</span>
              <span className="settings-row-value">{deployment.deployer}</span>
            </li>
          )}
        </ul>

        {deployment.steps.length > 0 && (
          <section>
            <h2 className="section-title">Steps</h2>
            <ul className="grouped-list step-list">
              {completedSteps.length > 0 && (
                <li>
                  <button
                    className="step-row step-completed completed-steps-toggle"
                    onClick={() => setIsShowingCompletedSteps((isShowing) => !isShowing)}
                    aria-expanded={isShowingCompletedSteps}
                  >
                    <span className="step-status">
                      <StepStatusIcon status="completed" />
                    </span>
                    <span className="step-title">
                      {completedSteps.length === deployment.steps.length ? "All " : ""}
                      {completedSteps.length} completed step{completedSteps.length === 1 ? "" : "s"}
                    </span>
                    {isShowingCompletedSteps ? (
                      <ChevronDown className="chevron" size={ICON_SIZE} aria-hidden />
                    ) : (
                      <ChevronRight className="chevron" size={ICON_SIZE} aria-hidden />
                    )}
                  </button>
                </li>
              )}
              {isShowingCompletedSteps && completedSteps.map(renderStep)}
              {remainingSteps.map(renderStep)}
            </ul>
          </section>
        )}
      </ScrollArea>
    </div>
  );
}
