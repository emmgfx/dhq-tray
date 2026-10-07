//! Keeps looking for running deployments in the watched projects (including
//! ones started outside the app) and hands them to the deployment watcher.
//!
//! It never stops while the app runs, it only changes pace: frequent for a
//! while after the tray is opened, slow otherwise, and paused while the user
//! is away (the Mac being asleep or unused).

use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Manager};

use crate::deployhq::DeployHqClient;
use crate::deployment_watcher::{self, WatchedDeployment};
use crate::state::AppState;
use crate::user_activity;

const ACTIVE_POLL_INTERVAL: Duration = Duration::from_secs(20);
const BACKGROUND_POLL_INTERVAL: Duration = Duration::from_secs(2 * 60);
/// How long the active pace lasts after the tray was last opened.
const ACTIVE_DURATION: Duration = Duration::from_secs(10 * 60);

/// Starts the poller; call once at startup.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Deployments already running at launch are listed, not announced.
        let mut is_initial_poll = true;
        loop {
            if !user_activity::is_user_away() {
                poll_watched_projects(&app, is_initial_poll).await;
                is_initial_poll = false;
            }
            let state = app.state::<AppState>();
            let interval = if is_active(&state) {
                ACTIVE_POLL_INTERVAL
            } else {
                BACKGROUND_POLL_INTERVAL
            };
            // Opening the tray wakes the poller early instead of waiting.
            tokio::select! {
                _ = tokio::time::sleep(interval) => {}
                _ = state.poller_wakeup.notified() => {}
            }
        }
    });
}

/// Switches to the active pace (the tray was opened) and polls right away.
pub fn mark_active(app: &AppHandle) {
    let state = app.state::<AppState>();
    *state.poller_active_until.lock().unwrap() = Some(SystemTime::now() + ACTIVE_DURATION);
    state.poller_wakeup.notify_one();
}

/// Wall-clock based, because `Instant` does not advance while the Mac sleeps.
fn is_active(state: &AppState) -> bool {
    state
        .poller_active_until
        .lock()
        .unwrap()
        .is_some_and(|active_until| SystemTime::now() < active_until)
}

async fn poll_watched_projects(app: &AppHandle, is_initial_poll: bool) {
    let state = app.state::<AppState>();
    let Ok(Some(credentials)) = state.credentials() else {
        return;
    };
    let client = DeployHqClient::new(&state.http, &state.api_activity, &credentials);

    for project in state.watched_projects() {
        let deployments = match client.list_running_deployments(&project.permalink).await {
            Ok(deployments) => deployments,
            Err(error) => {
                eprintln!("Polling running deployments of {} failed: {error}", project.permalink);
                continue;
            }
        };
        for deployment in deployments {
            let watched = WatchedDeployment {
                project: project.permalink.clone(),
                project_name: project.name.clone(),
                target_name: deployment.target_name(),
                deployment,
            };
            // Already-tracked ones (e.g. started from the app) are ignored.
            deployment_watcher::watch(app.clone(), watched, !is_initial_poll);
        }
    }
}
