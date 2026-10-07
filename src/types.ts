// Mirrors the structs serialized by src-tauri/src/deployhq.rs and commands.rs.

export interface SettingsSummary {
  account: string;
  email: string;
}

export interface Project {
  name: string;
  permalink: string;
  identifier: string;
  repository: { branch: string | null } | null;
  last_deployed_at: string | null;
  starred: boolean;
}

export interface Server {
  identifier: string;
  name: string;
  environment: string | null;
  preferred_branch: string | null;
  branch: string | null;
  last_revision: string | null;
  server_group_identifier: string | null;
  enabled: boolean;
}

export interface ServerGroup {
  identifier: string;
  name: string;
  environment: string | null;
  preferred_branch: string | null;
  last_revision: string | null;
  servers: Server[];
}

export interface DeployTargets {
  server_groups: ServerGroup[];
  servers: Server[];
}

export interface DeploymentServer {
  identifier: string;
  name: string;
  server_group_identifier: string | null;
}

export interface DeploymentStep {
  stage: string | null;
  description: string | null;
  status: string | null;
  total_items: number | string | null;
  completed_items: number | string | null;
}

export interface Deployment {
  identifier: string;
  status: string;
  servers: DeploymentServer[];
  branch: string | null;
  deployer: string | null;
  start_revision: { ref: string | null };
  end_revision: { ref: string | null };
  timestamps: {
    queued_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    /** Seconds, once finished. */
    duration: number | null;
  };
  steps: DeploymentStep[];
}

/** Mirrors DeployOptions in src-tauri/src/deployhq.rs. */
export interface DeployOptions {
  copy_config_files: boolean;
  run_build_commands: boolean;
  use_build_cache: boolean;
}

export type NotificationPermission = "authorized" | "denied" | "not_determined" | "unknown";

export type NotificationLevel = "all" | "failures_only" | "off";

/** Mirrors Preferences in src-tauri/src/preferences.rs. */
export interface Preferences {
  notification_level: NotificationLevel;
  notification_sound: boolean;
}

export interface Commit {
  ref: string;
  author: string;
  timestamp: string | null;
  short_message: string | null;
}

export interface RecentCommits {
  /** Newest first. */
  commits: Commit[];
  /** False when DeployHQ could not refresh the repository; newest commits may be missing. */
  is_synced_with_remote: boolean;
}

export interface WatchedProject {
  permalink: string;
  name: string;
}

export interface WatchedDeployment {
  project: string;
  project_name: string;
  target_name: string;
  deployment: Deployment;
}

/** A server or server group, normalized for the deploy list. */
export interface DeployTarget {
  identifier: string;
  name: string;
  kind: "group" | "server";
  environment: string | null;
  branch: string | null;
  lastRevision: string | null;
  serverCount?: number;
}
