//! Keeps looking for running deployments in the watched projects (including
//! ones started outside the app) and hands them to the deployment watcher.
//!
//! It never stops while the app runs, it only changes pace: frequent for a
//! while after the tray is opened, slow otherwise, and paused while the user
//! is away (the Mac being asleep or unused).

use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter, Manager};

use crate::deployhq::{DeployHqClient, Deployment};
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
        loop {
            let state = app.state::<AppState>();
            // Paused while the user is away or DeployHQ is throttling requests.
            if !user_activity::is_user_away() && !state.api_health.is_backing_off() {
                poll_watched_projects(&app).await;
            }
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

/// The Recent tab reloads its list when this is emitted.
pub const RECENT_DEPLOYMENTS_UPDATED_EVENT: &str = "recent-deployments-updated";

/// How many of each project's latest deployments are checked per poll.
const RECENT_DEPLOYMENTS_PER_POLL: u32 = 10;

/// What to do with a deployment seen in a project's recent list.
#[derive(Debug, PartialEq, Eq)]
enum Sighting {
    /// Already known, or part of the first look at the project: nothing to report.
    Ignore,
    /// New and running: follow it, announcing its start unless it is the first look.
    Track { announce_start: bool },
    /// New and already finished (it started and ended between polls): report how it ended.
    AnnounceFinished,
}

fn classify(
    deployment: &Deployment,
    is_known: bool,
    is_first_look_at_project: bool,
) -> Sighting {
    match (is_known, deployment.is_finished()) {
        (true, _) => Sighting::Ignore,
        (false, false) => Sighting::Track {
            announce_start: !is_first_look_at_project,
        },
        (false, true) if is_first_look_at_project => Sighting::Ignore,
        (false, true) => Sighting::AnnounceFinished,
    }
}

async fn poll_watched_projects(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(Some(credentials)) = state.credentials() else {
        return;
    };
    let client = DeployHqClient::new(&state.http, &state.api_health, &credentials);
    let watched_projects = state.watched_projects();

    for project in &watched_projects {
        let deployments = match client
            .list_recent_deployments(&project.permalink, RECENT_DEPLOYMENTS_PER_POLL)
            .await
        {
            Ok(deployments) => deployments,
            Err(error) => {
                eprintln!("Polling deployments of {} failed: {error}", project.permalink);
                continue;
            }
        };
        // A project's first look (at launch or when its bell is turned on) only
        // records what is there, so old deployments are not announced.
        let is_first_look = state
            .polled_projects
            .lock()
            .unwrap()
            .insert(project.permalink.clone());

        let mut recent = Vec::with_capacity(deployments.len());
        for deployment in deployments {
            let identifier = deployment.identifier.clone();
            let is_tracked = state
                .tracked_deployments
                .lock()
                .unwrap()
                .contains_key(&identifier);
            let was_seen = !state.seen_deployments.lock().unwrap().insert(identifier);
            let watched = WatchedDeployment {
                project: project.permalink.clone(),
                project_name: project.name.clone(),
                target_name: deployment.target_name(),
                deployment,
                failure_reason: None,
            };
            recent.push(watched.clone());
            match classify(&watched.deployment, is_tracked || was_seen, is_first_look) {
                Sighting::Ignore => {}
                Sighting::Track { announce_start } => {
                    deployment_watcher::watch(app.clone(), watched, announce_start);
                }
                Sighting::AnnounceFinished => {
                    deployment_watcher::announce_finished(app, watched).await;
                }
            }
        }
        state
            .recent_deployments
            .lock()
            .unwrap()
            .insert(project.permalink.clone(), recent);
    }

    // Projects unwatched meanwhile leave the Recent tab.
    state.recent_deployments.lock().unwrap().retain(|permalink, _| {
        watched_projects
            .iter()
            .any(|project| &project.permalink == permalink)
    });
    let _ = app.emit(RECENT_DEPLOYMENTS_UPDATED_EVENT, ());
}

/// Forgets a project's recent deployments (it is no longer watched).
pub fn forget_project(app: &AppHandle, permalink: &str) {
    let removed = app
        .state::<AppState>()
        .recent_deployments
        .lock()
        .unwrap()
        .remove(permalink);
    if removed.is_some() {
        let _ = app.emit(RECENT_DEPLOYMENTS_UPDATED_EVENT, ());
    }
}

/// Polls right away, e.g. so a newly watched project shows up without waiting.
pub fn poll_now(app: &AppHandle) {
    app.state::<AppState>().poller_wakeup.notify_one();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deployment(status: &str) -> Deployment {
        Deployment {
            status: status.to_owned(),
            ..Default::default()
        }
    }

    #[test]
    fn first_look_tracks_running_silently_and_skips_finished() {
        assert_eq!(
            classify(&deployment("running"), false, true),
            Sighting::Track { announce_start: false }
        );
        assert_eq!(classify(&deployment("completed"), false, true), Sighting::Ignore);
    }

    #[test]
    fn new_deployments_after_first_look_are_reported() {
        assert_eq!(
            classify(&deployment("pending"), false, false),
            Sighting::Track { announce_start: true }
        );
        assert_eq!(
            classify(&deployment("failed"), false, false),
            Sighting::AnnounceFinished
        );
    }

    #[test]
    fn known_deployments_are_ignored() {
        assert_eq!(classify(&deployment("running"), true, false), Sighting::Ignore);
        assert_eq!(classify(&deployment("completed"), true, false), Sighting::Ignore);
    }
}
