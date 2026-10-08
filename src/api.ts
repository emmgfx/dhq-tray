import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { clearCache } from "./responseCache";
import type {
  DeployTargets,
  DeployOptions,
  RecentCommits,
  StepLogEntry,
  Deployment,
  NotificationPermission,
  Preferences,
  Project,
  SettingsSummary,
  WatchedDeployment,
  WatchedProject,
} from "./types";

export const getSettings = () => invoke<SettingsSummary | null>("get_settings");

export const saveCredentials = async (account: string, email: string, apiKey: string) => {
  await invoke<void>("save_credentials", { account, email, apiKey });
  clearCache();
};

export const clearCredentials = async () => {
  await invoke<void>("clear_credentials");
  clearCache();
};

export const listProjects = () => invoke<Project[]>("list_projects");

export const listDeployTargets = (project: string) =>
  invoke<DeployTargets>("list_deploy_targets", { project });

export interface TriggerDeploymentParams {
  project: string;
  projectName: string;
  targetIdentifier: string;
  targetName: string;
  branch: string;
  startRevision: string | null;
  /** Revision shown to the user; the backend resolves the branch head when null. */
  endRevision: string | null;
  options: DeployOptions;
}

export const triggerDeployment = (params: TriggerDeploymentParams) =>
  invoke<Deployment>("trigger_deployment", { ...params });

export const listRecentCommits = (project: string, branch: string) =>
  invoke<RecentCommits>("list_recent_commits", { project, branch });

export const listRecentDeployments = (project: string) =>
  invoke<Deployment[]>("list_recent_deployments", { project });

export const listStepLogs = (project: string, deployment: string, step: string) =>
  invoke<StepLogEntry[]>("list_step_logs", { project, deployment, step });

export const abortDeployment = (project: string, identifier: string) =>
  invoke<void>("abort_deployment", { project, identifier });

/** Retries or rolls back a finished deployment; returns the resulting one. */
export const redeploy = (watched: WatchedDeployment, action: "retry" | "rollback") =>
  invoke<WatchedDeployment>("redeploy", { watched, action });

export const listWatchedProjects = () => invoke<WatchedProject[]>("list_watched_projects");

export const setProjectWatched = (permalink: string, name: string, watched: boolean) =>
  invoke<WatchedProject[]>("set_project_watched", { permalink, name, watched });

export const listTrackedDeployments = () => invoke<WatchedDeployment[]>("list_tracked_deployments");

export const getPreferences = () => invoke<Preferences>("get_preferences");

export const setPreferences = (preferences: Preferences) =>
  invoke<void>("set_preferences", { preferences });

export const quitApp = () => invoke<void>("quit_app");

export const hideWindow = () => invoke<void>("hide_window");

export const getNotificationPermission = () =>
  invoke<NotificationPermission>("notification_permission");

export const sendTestNotification = () => invoke<void>("send_test_notification");

export const openNotificationSettings = () => invoke<void>("open_notification_settings");

export const onDeploymentUpdated = (
  handler: (watched: WatchedDeployment) => void,
): Promise<UnlistenFn> =>
  listen<WatchedDeployment>("deployment-updated", (event) => handler(event.payload));

/** A notification was clicked: show that deployment. */
export const onOpenDeployment = (
  handler: (watched: WatchedDeployment) => void,
): Promise<UnlistenFn> =>
  listen<WatchedDeployment>("open-deployment", (event) => handler(event.payload));

/** What the UI shows for a failure. Backend commands reject with this shape. */
export interface ErrorDetails {
  message: string;
  hint?: string | null;
}

export const toErrorDetails = (error: unknown): ErrorDetails => {
  if (typeof error === "string") return { message: error };
  if (error instanceof Error) return { message: error.message };
  if (error && typeof error === "object" && "message" in error) {
    const { message, hint } = error as { message: unknown; hint?: unknown };
    return {
      message: String(message),
      hint: typeof hint === "string" ? hint : null,
    };
  }
  return { message: String(error) };
};

export const errorMessage = (error: unknown) => toErrorDetails(error).message;
