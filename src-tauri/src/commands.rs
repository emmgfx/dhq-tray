use serde::Serialize;
use tauri::{AppHandle, State};

use crate::credentials::{self, Credentials};
use crate::deployhq::{
    DeployHqClient, DeployOptions, DeployRequest, Deployment, Project, Server,
    RecentCommits, ServerGroup,
};
use crate::deployment_watcher::{self, WatchedDeployment};
use crate::error::{AppError, AppResult};
use crate::notifications::{self, NotificationPermission};
use crate::preferences::{self, Preferences};
use crate::state::AppState;
use crate::watched_projects::{self, WatchedProject};

#[derive(Serialize)]
pub struct SettingsSummary {
    account: String,
    email: String,
}

#[derive(Serialize)]
pub struct DeployTargets {
    server_groups: Vec<ServerGroup>,
    servers: Vec<Server>,
}

/// Returns the configured account without exposing the API key to the webview.
// Async so a Keychain permission prompt does not block the main thread.
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<Option<SettingsSummary>> {
    Ok(state.credentials()?.map(|credentials| SettingsSummary {
        account: credentials.account,
        email: credentials.email,
    }))
}

/// Validates the credentials against the API before storing them.
/// An empty `api_key` keeps the currently stored key.
#[tauri::command]
pub async fn save_credentials(
    state: State<'_, AppState>,
    account: String,
    email: String,
    api_key: String,
) -> AppResult<()> {
    let api_key = match api_key.trim() {
        "" => state
            .credentials()?
            .map(|current| current.api_key)
            .ok_or_else(|| AppError::Other("API key is required".into()))?,
        key => key.to_string(),
    };
    let new_credentials = Credentials {
        account: account.trim().to_string(),
        email: email.trim().to_string(),
        api_key,
    };
    DeployHqClient::new(&state.http, &state.api_activity, &new_credentials)
        .list_projects()
        .await?;
    credentials::save(&new_credentials)?;
    state.set_credentials(Some(new_credentials));
    Ok(())
}

#[tauri::command]
pub fn clear_credentials(state: State<'_, AppState>) -> AppResult<()> {
    credentials::delete()?;
    state.set_credentials(None);
    Ok(())
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let credentials = state.require_credentials()?;
    let mut projects = DeployHqClient::new(&state.http, &state.api_activity, &credentials)
        .list_projects()
        .await?;
    projects.sort_by(|a, b| {
        b.starred
            .cmp(&a.starred)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(projects)
}

#[tauri::command]
pub async fn list_deploy_targets(
    state: State<'_, AppState>,
    project: String,
) -> AppResult<DeployTargets> {
    let credentials = state.require_credentials()?;
    let client = DeployHqClient::new(&state.http, &state.api_activity, &credentials);
    let (server_groups, servers) = tokio::try_join!(
        client.list_server_groups(&project),
        client.list_servers(&project)
    )?;
    Ok(DeployTargets {
        server_groups,
        servers,
    })
}

/// Queues a deployment of the latest commit of `branch` and starts tracking it
/// so a native notification is shown when it finishes.
#[tauri::command]
pub async fn trigger_deployment(
    app: AppHandle,
    state: State<'_, AppState>,
    project: String,
    project_name: String,
    target_identifier: String,
    target_name: String,
    branch: String,
    start_revision: Option<String>,
    end_revision: Option<String>,
    options: DeployOptions,
) -> AppResult<Deployment> {
    let credentials = state.require_credentials()?;
    let deployment = DeployHqClient::new(&state.http, &state.api_activity, &credentials)
        .create_deployment(&DeployRequest {
            project: &project,
            target_identifier: &target_identifier,
            branch: &branch,
            start_revision: start_revision.as_deref(),
            end_revision: end_revision.as_deref(),
            options,
        })
        .await?;
    deployment_watcher::watch(
        app,
        WatchedDeployment {
            project,
            project_name,
            target_name,
            deployment: deployment.clone(),
        },
        true,
    );
    Ok(deployment)
}

#[tauri::command]
pub fn list_watched_projects(state: State<'_, AppState>) -> Vec<WatchedProject> {
    state.watched_projects()
}

/// Adds or removes a project from the ones polled for running deployments.
#[tauri::command]
pub fn set_project_watched(
    app: AppHandle,
    state: State<'_, AppState>,
    permalink: String,
    name: String,
    watched: bool,
) -> AppResult<Vec<WatchedProject>> {
    let mut projects = state.watched_projects();
    projects.retain(|project| project.permalink != permalink);
    if watched {
        projects.push(WatchedProject { permalink, name });
        projects.sort_by_key(|project| project.name.to_lowercase());
    }
    watched_projects::save(&app, &projects)?;
    state.set_watched_projects(projects.clone());
    Ok(projects)
}

/// Deployments currently being tracked, oldest first.
#[tauri::command]
pub fn list_tracked_deployments(state: State<'_, AppState>) -> Vec<WatchedDeployment> {
    let mut deployments: Vec<WatchedDeployment> = state
        .tracked_deployments
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect();
    deployments.sort_by(|a, b| {
        a.deployment
            .timestamps
            .queued_at
            .cmp(&b.deployment.timestamps.queued_at)
    });
    deployments
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> Preferences {
    state.preferences()
}

#[tauri::command]
pub fn set_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    preferences: Preferences,
) -> AppResult<()> {
    preferences::save(&app, &preferences)?;
    state.set_preferences(preferences);
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn list_recent_commits(
    state: State<'_, AppState>,
    project: String,
    branch: String,
) -> AppResult<RecentCommits> {
    let credentials = state.require_credentials()?;
    DeployHqClient::new(&state.http, &state.api_activity, &credentials)
        .recent_commits(&project, &branch)
        .await
}

#[tauri::command]
pub async fn list_recent_deployments(
    state: State<'_, AppState>,
    project: String,
) -> AppResult<Vec<Deployment>> {
    let credentials = state.require_credentials()?;
    DeployHqClient::new(&state.http, &state.api_activity, &credentials)
        .list_recent_deployments(&project)
        .await
}

/// Hides the panel (Esc on the first screen, ⌘W).
#[tauri::command]
pub fn hide_window(app: AppHandle) {
    crate::tray::hide_main_window(&app);
}

#[tauri::command]
pub async fn notification_permission() -> NotificationPermission {
    notifications::permission()
}

#[tauri::command]
pub fn send_test_notification(state: State<'_, AppState>) {
    let sound = state.preferences().notification_sound.then_some("Glass");
    notifications::show("DHQ Tray", "Notifications are working.", sound);
}

/// Opens System Settings → Notifications, where the user can allow DHQ Tray.
#[tauri::command]
pub fn open_notification_settings() -> AppResult<()> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
        .spawn()
        .map_err(|error| AppError::Other(format!("Could not open System Settings: {error}")))?;
    Ok(())
}
