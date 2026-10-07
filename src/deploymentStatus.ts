import type { Deployment, DeploymentStep } from "./types";

// Must match Deployment::is_finished in src-tauri/src/deployhq.rs.
const IN_PROGRESS_STATUSES = ["pending", "running", "preview_pending"];

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  running: "Deploying…",
  completed: "Deployed",
  failed: "Failed",
};

export const isDeploymentInProgress = (deployment: Deployment) =>
  IN_PROGRESS_STATUSES.includes(deployment.status);

/** Step description with its item progress when known, e.g. "Uploading files (12/40)". */
export function stepLabel(step: DeploymentStep): string | null {
  if (!step.description) return null;
  const completed = Number(step.completed_items);
  const total = Number(step.total_items);
  return total > 0 && Number.isFinite(completed)
    ? `${step.description} (${completed}/${total})`
    : step.description;
}

/** The step being executed right now. */
export function currentStepLabel(deployment: Deployment): string | null {
  const step = deployment.steps.find((candidate) => candidate.status === "running");
  return step ? stepLabel(step) : null;
}

export const deploymentStatusLabel = (deployment: Deployment) =>
  STATUS_LABELS[deployment.status] ?? deployment.status;
