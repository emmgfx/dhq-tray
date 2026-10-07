//! Polls a deployment until it finishes, forwarding updates to the webview
//! and showing a native notification with the result.

use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::deployhq::{DeployHqClient, Deployment};
use crate::notifications;
use crate::preferences::NotificationLevel;
use crate::state::AppState;
use crate::user_activity;

const POLL_INTERVAL: Duration = Duration::from_secs(5);
// Safety net so a deployment stuck in an unknown status is not polled forever.
const MAX_WATCH_DURATION: Duration = Duration::from_secs(2 * 60 * 60);
const MAX_CONSECUTIVE_ERRORS: u32 = 5;

pub const DEPLOYMENT_UPDATED_EVENT: &str = "deployment-updated";

#[derive(Clone, Serialize)]
pub struct WatchedDeployment {
    pub project: String,
    pub project_name: String,
    pub target_name: String,
    pub deployment: Deployment,
}

/// Polls the deployment until it finishes, notifying its start when
/// `announce_start` is set. Does nothing if it is already tracked.
pub fn watch(app: AppHandle, watched: WatchedDeployment, announce_start: bool) {
    let identifier = watched.deployment.identifier.clone();
    {
        let state = app.state::<AppState>();
        let mut tracked_deployments = state.tracked_deployments.lock().unwrap();
        if tracked_deployments.contains_key(&identifier) {
            return;
        }
        tracked_deployments.insert(identifier.clone(), watched.clone());
    }
    // Let the UI list it right away instead of after the first poll.
    let _ = app.emit(DEPLOYMENT_UPDATED_EVENT, &watched);
    if announce_start {
        notify_started(&app, &watched);
    }

    tauri::async_runtime::spawn(async move {
        poll_until_finished(&app, watched).await;
        app.state::<AppState>()
            .tracked_deployments
            .lock()
            .unwrap()
            .remove(&identifier);
    });
}

async fn poll_until_finished(app: &AppHandle, mut watched: WatchedDeployment) {
    // Wall-clock deadline so time spent asleep counts towards it.
    let gives_up_at = SystemTime::now() + MAX_WATCH_DURATION;
    let mut consecutive_errors = 0;

    while SystemTime::now() < gives_up_at {
        tokio::time::sleep(POLL_INTERVAL).await;
        // Paused while the user is away; the result is checked when they return.
        if user_activity::is_user_away() {
            continue;
        }

        // Read credentials on every poll so a logout stops the watcher.
        let state = app.state::<AppState>();
        let credentials = match state.credentials() {
            Ok(Some(credentials)) => credentials,
            Ok(None) => return,
            // Keychain temporarily unreadable: try again on the next poll.
            Err(_) => continue,
        };
        let result = DeployHqClient::new(&state.http, &state.api_activity, &credentials)
            .get_deployment(&watched.project, &watched.deployment.identifier)
            .await;

        match result {
            Ok(deployment) => {
                consecutive_errors = 0;
                watched.deployment = deployment;
                state
                    .tracked_deployments
                    .lock()
                    .unwrap()
                    .insert(watched.deployment.identifier.clone(), watched.clone());
                let _ = app.emit(DEPLOYMENT_UPDATED_EVENT, &watched);
                if watched.deployment.is_finished() {
                    notify_finished(app, &watched);
                    return;
                }
            }
            Err(error) => {
                consecutive_errors += 1;
                eprintln!("Polling deployment failed: {error}");
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    notify(
                        app,
                        &watched.project_name,
                        &format!(
                            "Stopped following the deployment to {} (DeployHQ kept failing). \
                             Check it in DeployHQ.",
                            watched.target_name
                        ),
                        Outcome::Failure,
                    );
                    return;
                }
            }
        }
    }
}

fn notify_started(app: &AppHandle, watched: &WatchedDeployment) {
    let target = &watched.target_name;
    let body = match &watched.deployment.deployer {
        Some(deployer) => format!("{deployer} started deploying to {target}"),
        None => format!("Deploying to {target}"),
    };
    notify(app, &watched.project_name, &body, Outcome::Started);
}

fn notify_finished(app: &AppHandle, watched: &WatchedDeployment) {
    // The project is the notification title; the body only says where and how it ended.
    let target = &watched.target_name;
    let (body, outcome) = match watched.deployment.status.as_str() {
        "completed" => (format!("Deployed to {target}"), Outcome::Success),
        "failed" => (format!("Deployment to {target} failed"), Outcome::Failure),
        status => (
            format!("Deployment to {target} finished: {status}"),
            Outcome::Failure,
        ),
    };
    notify(app, &watched.project_name, &body, outcome);
}

#[derive(Clone, Copy)]
enum Outcome {
    Started,
    Success,
    Failure,
}

fn notify(app: &AppHandle, title: &str, body: &str, outcome: Outcome) {
    let preferences = app.state::<AppState>().preferences();
    let is_wanted = match preferences.notification_level {
        NotificationLevel::All => true,
        NotificationLevel::FailuresOnly => matches!(outcome, Outcome::Failure),
        NotificationLevel::Off => false,
    };
    if !is_wanted {
        return;
    }
    // macOS system sound names (/System/Library/Sounds).
    let sound = preferences.notification_sound.then_some(match outcome {
        Outcome::Started => "Pop",
        Outcome::Success => "Glass",
        Outcome::Failure => "Basso",
    });
    notifications::show(title, body, sound);
}
