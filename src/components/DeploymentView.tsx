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
import { abortDeployment, errorMessage, listStepLogs, onDeploymentUpdated, redeploy } from "../api";
import { deploymentStatusLabel, isDeploymentInProgress, stepLabel } from "../deploymentStatus";
import { formatDuration, formatElapsedTime, shortRevision } from "../formatters";
import { ICON_SIZE, ICON_STROKE_WIDTH } from "../icons";
import type { DeploymentStep, StepLogEntry, WatchedDeployment } from "../types";
import { useNow } from "../useNow";
import { ScrollArea } from "./ScrollArea";
import { Spinner } from "./Spinner";

interface DeploymentViewProps {
  account: string;
  watched: WatchedDeployment;
  onBack: () => void;
  /** Shows another deployment, e.g. the one created by a retry or rollback. */
  onShowDeployment: (watched: WatchedDeployment) => void;
}

/** Only the end of a log matters to see why a step failed. */
const VISIBLE_LOG_ENTRIES = 40;

type PendingAction = "abort" | "retry" | "rollback";

const ACTION_LABELS: Record<PendingAction, { button: string; confirm: string }> = {
  abort: { button: "Abort deployment", confirm: "Abort this deployment?" },
  retry: { button: "Retry", confirm: "Run this deployment again?" },
  rollback: {
    button: "Roll back to this deployment",
    confirm: "Deploy this revision again to bring the servers back to it?",
  },
};

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

function StepLog({
  project,
  deployment,
  step,
}: {
  project: string;
  deployment: string;
  step: string;
}) {
  const [entries, setEntries] = useState<StepLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStepLogs(project, deployment, step)
      .then(setEntries)
      .catch((loadError) => setError(errorMessage(loadError)));
  }, [project, deployment, step]);

  if (error) return <p className="error-message">{error}</p>;
  if (!entries) {
    return (
      <p className="empty-message">
        <Spinner />
      </p>
    );
  }
  const visibleEntries = entries.filter((entry) => entry.message?.trim());
  return (
    <pre className="step-log">
      {visibleEntries
        .slice(-VISIBLE_LOG_ENTRIES)
        .map((entry) => entry.message)
        .join("\n") || "No log entries."}
    </pre>
  );
}

/** Detail of one deployment, kept up to date by the deployment watcher's events. */
export function DeploymentView({
  account,
  watched,
  onBack,
  onShowDeployment,
}: DeploymentViewProps) {
  const [current, setCurrent] = useState(watched);
  // Completed steps start collapsed so what is still relevant stays in view.
  const [isShowingCompletedSteps, setIsShowingCompletedSteps] = useState(false);
  const [openLogStep, setOpenLogStep] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<PendingAction | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const unlistenPromise = onDeploymentUpdated((update) => {
      if (update.deployment.identifier === watched.deployment.identifier) {
        setCurrent(update);
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [watched.deployment.identifier]);

  const { deployment } = current;
  const isInProgress = isDeploymentInProgress(deployment);
  const now = useNow(isInProgress);
  const { timestamps } = deployment;
  const startedAt = timestamps.started_at ?? timestamps.queued_at;
  const timeLabel = isInProgress
    ? startedAt && formatElapsedTime(startedAt, now)
    : timestamps.duration !== null && formatDuration(timestamps.duration);
  const completedSteps = deployment.steps.filter((step) => step.status === "completed");
  const remainingSteps = deployment.steps.filter((step) => step.status !== "completed");
  const availableAction: PendingAction = isInProgress
    ? "abort"
    : deployment.status === "completed"
      ? "rollback"
      : "retry";

  const runAction = async (action: PendingAction) => {
    setIsActing(true);
    setActionError(null);
    try {
      if (action === "abort") {
        // The watcher reports the new status on its next poll.
        await abortDeployment(current.project, deployment.identifier);
      } else {
        onShowDeployment(await redeploy(current, action));
      }
      setConfirmingAction(null);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setIsActing(false);
    }
  };

  const renderStep = (step: DeploymentStep, index: number) => {
    const canShowLog = step.status === "failed" && step.logs && step.identifier;
    const isLogOpen = canShowLog && openLogStep === step.identifier;
    return (
      <li
        key={`${step.status}-${index}-${step.description}`}
        className={`step-row-container step-${step.status ?? "pending"}`}
      >
        <div className="step-row">
          <span className="step-status">
            <StepStatusIcon status={step.status} />
          </span>
          <span className="list-row-main">
            <span className="step-title">{stepLabel(step) ?? step.stage ?? "Step"}</span>
          </span>
          {canShowLog && (
            <button
              className="link-button"
              onClick={() => setOpenLogStep(isLogOpen ? null : step.identifier)}
            >
              {isLogOpen ? "Hide log" : "Show log"}
            </button>
          )}
        </div>
        {isLogOpen && step.identifier && (
          <StepLog
            project={current.project}
            deployment={deployment.identifier}
            step={step.identifier}
          />
        )}
      </li>
    );
  };

  const deploymentUrl = `https://${account}.deployhq.com/projects/${current.project}/deployments/${deployment.identifier}`;

  return (
    <div className="screen">
      <header className="toolbar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          <ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        </button>
        <h1 className="toolbar-title">{current.project_name}</h1>
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
          {current.failure_reason && (
            <li className="settings-row failure-row">
              <span>Error</span>
              <span className="failure-reason">{current.failure_reason}</span>
            </li>
          )}
          <li className="settings-row">
            <span>Target</span>
            <span className="settings-row-value">{current.target_name}</span>
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

      <footer className="screen-footer">
        {actionError && <p className="error-message">{actionError}</p>}
        {confirmingAction ? (
          <div className="confirm-row">
            <span>{ACTION_LABELS[confirmingAction].confirm}</span>
            <div className="form-actions">
              <button
                className="button button-secondary button-small"
                onClick={() => setConfirmingAction(null)}
                disabled={isActing}
              >
                Cancel
              </button>
              <button
                className="button button-primary button-small"
                onClick={() => runAction(confirmingAction)}
                disabled={isActing}
                autoFocus
              >
                {isActing ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <button
            className={`button button-block ${
              availableAction === "retry" ? "button-primary" : "button-secondary"
            }`}
            onClick={() => setConfirmingAction(availableAction)}
          >
            {ACTION_LABELS[availableAction].button}
          </button>
        )}
      </footer>
    </div>
  );
}
