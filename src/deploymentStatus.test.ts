import { describe, expect, it } from "vitest";
import {
  currentStepLabel,
  deploymentStatusLabel,
  isDeploymentInProgress,
  stepLabel,
} from "./deploymentStatus";
import type { Deployment, DeploymentStep } from "./types";

const step = (overrides: Partial<DeploymentStep>): DeploymentStep => ({
  identifier: null,
  stage: null,
  description: "Uploading files",
  status: "pending",
  total_items: null,
  completed_items: null,
  logs: false,
  ...overrides,
});

const deployment = (overrides: Partial<Deployment>): Deployment => ({
  identifier: "abc",
  status: "running",
  servers: [],
  branch: "main",
  deployer: null,
  start_revision: { ref: null },
  end_revision: { ref: null },
  timestamps: { queued_at: null, started_at: null, completed_at: null, duration: null },
  steps: [],
  log_summary: null,
  ...overrides,
});

describe("isDeploymentInProgress", () => {
  it("matches the documented in-progress statuses only", () => {
    expect(isDeploymentInProgress(deployment({ status: "pending" }))).toBe(true);
    expect(isDeploymentInProgress(deployment({ status: "running" }))).toBe(true);
    expect(isDeploymentInProgress(deployment({ status: "completed" }))).toBe(false);
    expect(isDeploymentInProgress(deployment({ status: "something-new" }))).toBe(false);
  });
});

describe("deploymentStatusLabel", () => {
  it("labels known statuses and passes unknown ones through", () => {
    expect(deploymentStatusLabel(deployment({ status: "running" }))).toBe("Deploying…");
    expect(deploymentStatusLabel(deployment({ status: "preview_ready" }))).toBe("preview_ready");
  });
});

describe("stepLabel", () => {
  it("adds item progress when the API gives it, as numbers or strings", () => {
    expect(stepLabel(step({ completed_items: 12, total_items: 40 }))).toBe(
      "Uploading files (12/40)",
    );
    expect(stepLabel(step({ completed_items: "3", total_items: "9" }))).toBe(
      "Uploading files (3/9)",
    );
    expect(stepLabel(step({}))).toBe("Uploading files");
    expect(stepLabel(step({ description: null }))).toBeNull();
  });
});

describe("currentStepLabel", () => {
  it("describes the running step", () => {
    const running = deployment({
      steps: [step({ status: "completed", description: "Preparing" }), step({ status: "running" })],
    });
    expect(currentStepLabel(running)).toBe("Uploading files");
    expect(currentStepLabel(deployment({}))).toBeNull();
  });
});
