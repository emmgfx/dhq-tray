//! Polls a deployment until it finishes, forwarding updates to the webview
//! and showing a native notification with the result.
//!
//! Tracked deployments are persisted, so a restart (e.g. an app update) in the
//! middle of a deployment resumes following it.

use std::sync::atomic::Ordering;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::config_store;
use crate::deployhq::{DeployHqClient, Deployment, StepLogEntry};
use crate::notifications::{self, OnClick};
use crate::preferences::NotificationLevel;
use crate::state::AppState;
use crate::tray;
use crate::user_activity;

const POLL_INTERVAL: Duration = Duration::from_secs(5);
// Safety net so a deployment stuck in an unknown status is not polled forever.
const MAX_WATCH_DURATION: Duration = Duration::from_secs(2 * 60 * 60);
const MAX_CONSECUTIVE_ERRORS: u32 = 5;
const TRACKED_FILE_NAME: &str = "tracked-deployments.json";
/// Notification bodies get cut by macOS anyway; keep the reason readable.
const MAX_REASON_LENGTH: usize = 160;

pub const DEPLOYMENT_UPDATED_EVENT: &str = "deployment-updated";
/// Asks the webview to show a deployment's detail (a notification was clicked).
pub const OPEN_DEPLOYMENT_EVENT: &str = "open-deployment";

#[derive(Clone, Serialize, Deserialize)]
pub struct WatchedDeployment {
    pub project: String,
    pub project_name: String,
    pub target_name: String,
    pub deployment: Deployment,
    /// Why it failed, once known (from DeployHQ's log summary or step logs).
    #[serde(default)]
    pub failure_reason: Option<String>,
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
    // The watcher reports its end, so the poller must not report it again.
    app.state::<AppState>()
        .seen_deployments
        .lock()
        .unwrap()
        .insert(identifier.clone());
    save_tracked(&app);
    tray::refresh_icon(&app);
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
        save_tracked(&app);
        tray::refresh_icon(&app);
    });
}

/// Resumes following the deployments that were tracked when the app quit.
pub fn resume_saved(app: &AppHandle) {
    let saved: Vec<WatchedDeployment> = match config_store::load(app, TRACKED_FILE_NAME) {
        Ok(saved) => saved.unwrap_or_default(),
        Err(error) => {
            eprintln!("Could not load tracked deployments: {error}");
            return;
        }
    };
    for watched in saved {
        // The first poll reports how it ended if it finished meanwhile.
        watch(app.clone(), watched, false);
    }
}

fn save_tracked(app: &AppHandle) {
    let tracked: Vec<WatchedDeployment> = app
        .state::<AppState>()
        .tracked_deployments
        .lock()
        .unwrap()
        .values()
        .cloned()
        .collect();
    if let Err(error) = config_store::save(app, TRACKED_FILE_NAME, &tracked) {
        eprintln!("Could not save tracked deployments: {error}");
    }
}

async fn poll_until_finished(app: &AppHandle, mut watched: WatchedDeployment) {
    // Wall-clock deadline so time spent asleep counts towards it.
    let gives_up_at = SystemTime::now() + MAX_WATCH_DURATION;
    let mut consecutive_errors = 0;

    while SystemTime::now() < gives_up_at {
        tokio::time::sleep(POLL_INTERVAL).await;
        let state = app.state::<AppState>();
        // Paused while the user is away or DeployHQ is throttling; checked again later.
        if user_activity::is_user_away() || state.api_health.is_backing_off() {
            continue;
        }

        // Read credentials on every poll so a logout stops the watcher.
        let credentials = match state.credentials() {
            Ok(Some(credentials)) => credentials,
            Ok(None) => return,
            // Keychain temporarily unreadable: try again on the next poll.
            Err(_) => continue,
        };
        let result = DeployHqClient::new(&state.http, &state.api_health, &credentials)
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
                    announce_finished(app, watched).await;
                    return;
                }
            }
            Err(error) => {
                consecutive_errors += 1;
                eprintln!("Polling deployment failed: {error}");
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    let body = format!(
                        "Stopped following the deployment to {} (DeployHQ kept failing). \
                         Check it in DeployHQ.",
                        watched.target_name
                    );
                    notify(app, &watched.project_name, &body, Outcome::Failure, None);
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
    let open = open_deployment_on_click(app, watched);
    notify(app, &watched.project_name, &body, Outcome::Started, Some(open));
}

/// Reports a finished deployment: works out why it failed, if it did, updates
/// the UI and the tray, and notifies. Also used for deployments the poller
/// only saw once they had already finished.
pub async fn announce_finished(app: &AppHandle, mut watched: WatchedDeployment) {
    let failed = watched.deployment.status != "completed";
    if failed {
        watched.failure_reason = failure_reason(app, &watched).await;
        let _ = app.emit(DEPLOYMENT_UPDATED_EVENT, &watched);
        let is_panel_visible = app
            .get_webview_window(tray::MAIN_WINDOW_LABEL)
            .is_some_and(|window| window.is_visible().unwrap_or(false));
        if !is_panel_visible {
            app.state::<AppState>()
                .has_unseen_failure
                .store(true, Ordering::SeqCst);
            tray::refresh_icon(app);
        }
    }

    // The project is the notification title; the body says where and how it ended.
    let target = &watched.target_name;
    let body = match (watched.deployment.status.as_str(), &watched.failure_reason) {
        ("completed", _) => format!("Deployed to {target}"),
        ("failed", Some(reason)) => format!("Deployment to {target} failed: {reason}"),
        ("failed", None) => format!("Deployment to {target} failed"),
        (status, _) => format!("Deployment to {target} finished: {status}"),
    };
    let outcome = if failed {
        Outcome::Failure
    } else {
        Outcome::Success
    };
    let open = open_deployment_on_click(app, &watched);
    notify(app, &watched.project_name, &body, outcome, Some(open));
}

/// Short explanation of a failure: DeployHQ's own log summary when present,
/// otherwise the last error logged by the failed step.
async fn failure_reason(app: &AppHandle, watched: &WatchedDeployment) -> Option<String> {
    if let Some(summary) = summary_reason(&watched.deployment) {
        return Some(summary);
    }
    let failed_step = watched
        .deployment
        .steps
        .iter()
        .find(|step| step.status.as_deref() == Some("failed"))?;
    let step_name = failed_step.description.clone().unwrap_or_default();
    let message = match (&failed_step.identifier, failed_step.logs) {
        (Some(step_identifier), true) => {
            let state = app.state::<AppState>();
            let credentials = state.credentials().ok()??;
            DeployHqClient::new(&state.http, &state.api_health, &credentials)
                .step_logs(&watched.project, &watched.deployment.identifier, step_identifier)
                .await
                .ok()
                .and_then(|entries| last_error_message(&entries))
        }
        _ => None,
    };
    let reason = match message {
        Some(message) if !step_name.is_empty() => format!("{step_name}: {message}"),
        Some(message) => message,
        None if !step_name.is_empty() => step_name,
        None => return None,
    };
    Some(truncate(&reason, MAX_REASON_LENGTH))
}

/// First line of DeployHQ's `log_summary`, if it has any text.
fn summary_reason(deployment: &Deployment) -> Option<String> {
    let first_line = deployment
        .log_summary
        .as_deref()?
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    Some(truncate(first_line, MAX_REASON_LENGTH))
}

/// The last entry flagged as an error, or else the last one with a message.
fn last_error_message(entries: &[StepLogEntry]) -> Option<String> {
    let message_of = |entry: &StepLogEntry| {
        entry
            .message
            .as_deref()
            .map(str::trim)
            .filter(|message| !message.is_empty())
            .map(str::to_owned)
    };
    let is_error = |entry: &&StepLogEntry| {
        entry
            .kind
            .as_deref()
            .is_some_and(|kind| kind.to_ascii_lowercase().contains("error"))
    };
    entries
        .iter()
        .rev()
        .filter(is_error)
        .find_map(message_of)
        .or_else(|| entries.iter().rev().find_map(message_of))
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_owned();
    }
    let cut: String = text.chars().take(max_chars - 1).collect();
    format!("{}…", cut.trim_end())
}

/// Clicking the notification opens the panel on this deployment's detail.
fn open_deployment_on_click(app: &AppHandle, watched: &WatchedDeployment) -> OnClick {
    let app = app.clone();
    let watched = watched.clone();
    Box::new(move || {
        let main_thread_app = app.clone();
        let _ = app.run_on_main_thread(move || {
            tray::show_main_window(&main_thread_app);
            let _ = main_thread_app.emit(OPEN_DEPLOYMENT_EVENT, &watched);
        });
    })
}

#[derive(Clone, Copy)]
enum Outcome {
    Started,
    Success,
    Failure,
}

fn notify(app: &AppHandle, title: &str, body: &str, outcome: Outcome, on_click: Option<OnClick>) {
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
    notifications::show(title, body, sound, on_click);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(kind: &str, message: &str) -> StepLogEntry {
        StepLogEntry {
            message: Some(message.to_owned()),
            detail: None,
            kind: Some(kind.to_owned()),
        }
    }

    #[test]
    fn last_error_message_prefers_errors_then_last_message() {
        let entries = [
            entry("info", "Connecting"),
            entry("error", "Permission denied"),
            entry("info", "Cleaning up"),
        ];
        assert_eq!(last_error_message(&entries).as_deref(), Some("Permission denied"));

        let without_errors = [entry("info", "Connecting"), entry("info", "  ")];
        assert_eq!(last_error_message(&without_errors).as_deref(), Some("Connecting"));
        assert_eq!(last_error_message(&[]), None);
    }

    #[test]
    fn summary_reason_uses_first_non_empty_line() {
        let deployment = Deployment {
            log_summary: Some("\n  Build command failed  \nmore".to_owned()),
            ..Default::default()
        };
        assert_eq!(summary_reason(&deployment).as_deref(), Some("Build command failed"));
        assert_eq!(summary_reason(&Deployment::default()), None);
    }

    #[test]
    fn truncate_adds_ellipsis_only_when_needed() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("abcdefghij", 5), "abcd…");
    }

    #[test]
    fn watched_deployment_round_trips_through_json() {
        let watched = WatchedDeployment {
            project: "site".into(),
            project_name: "Site".into(),
            target_name: "Production".into(),
            deployment: serde_json::from_str(
                r#"{ "identifier": "abc", "status": "running",
                     "timestamps": { "duration": 12.0 } }"#,
            )
            .unwrap(),
            failure_reason: None,
        };
        let restored: WatchedDeployment =
            serde_json::from_str(&serde_json::to_string(&watched).unwrap()).unwrap();
        assert_eq!(restored.deployment.identifier, "abc");
        assert_eq!(restored.deployment.timestamps.duration, Some(12.0));
    }
}
