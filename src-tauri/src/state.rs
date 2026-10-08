use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::time::SystemTime;

use reqwest::Client;

use crate::api_health::ApiHealth;
use crate::credentials::{self, Credentials};
use crate::deployment_watcher::WatchedDeployment;
use crate::error::{AppError, AppResult};
use crate::preferences::Preferences;
use crate::watched_projects::WatchedProject;

pub struct AppState {
    pub http: Client,
    pub api_health: ApiHealth,
    // Cached copy of the Keychain entry so each API call does not hit the Keychain.
    // Outer `None` means not read yet (or the last read failed), so it is retried.
    credentials: Mutex<Option<Option<Credentials>>>,
    watched_projects: Mutex<Vec<WatchedProject>>,
    preferences: Mutex<Preferences>,
    /// Deployments the watcher is currently polling, by identifier.
    pub tracked_deployments: Mutex<HashMap<String, WatchedDeployment>>,
    /// Until when the running-deployments poller keeps its active pace.
    pub poller_active_until: Mutex<Option<SystemTime>>,
    /// Wakes the poller early (when the tray is opened).
    pub poller_wakeup: tokio::sync::Notify,
    /// Deployments the poller has already seen, so each is reported once.
    pub seen_deployments: Mutex<HashSet<String>>,
    /// Latest deployments of each watched project, by project permalink, as of
    /// the last poll. Feeds the panel's Recent tab.
    pub recent_deployments: Mutex<HashMap<String, Vec<WatchedDeployment>>>,
    /// Watched projects polled at least once (their first look is silent).
    pub polled_projects: Mutex<HashSet<String>>,
    /// A deployment failed since the panel was last opened (tray icon badge).
    pub has_unseen_failure: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            http: Client::builder()
                .user_agent(concat!("dhq-tray/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("failed to build HTTP client"),
            api_health: ApiHealth::default(),
            credentials: Mutex::default(),
            watched_projects: Mutex::default(),
            preferences: Mutex::default(),
            tracked_deployments: Mutex::default(),
            poller_active_until: Mutex::default(),
            poller_wakeup: tokio::sync::Notify::new(),
            seen_deployments: Mutex::default(),
            recent_deployments: Mutex::default(),
            polled_projects: Mutex::default(),
            has_unseen_failure: AtomicBool::new(false),
        }
    }

    /// Stored credentials, read from the Keychain on first use. A Keychain
    /// failure (e.g. access denied after a rebuild) is an error, not "no
    /// credentials", so the stored ones are never mistaken for missing.
    pub fn credentials(&self) -> AppResult<Option<Credentials>> {
        let mut cached = self.credentials.lock().unwrap();
        if let Some(credentials) = cached.as_ref() {
            return Ok(credentials.clone());
        }
        let loaded = credentials::load()?;
        *cached = Some(loaded.clone());
        Ok(loaded)
    }

    pub fn require_credentials(&self) -> AppResult<Credentials> {
        self.credentials()?.ok_or(AppError::MissingCredentials)
    }

    pub fn set_credentials(&self, new_credentials: Option<Credentials>) {
        *self.credentials.lock().unwrap() = Some(new_credentials);
    }

    pub fn watched_projects(&self) -> Vec<WatchedProject> {
        self.watched_projects.lock().unwrap().clone()
    }

    pub fn set_watched_projects(&self, projects: Vec<WatchedProject>) {
        *self.watched_projects.lock().unwrap() = projects;
    }

    pub fn preferences(&self) -> Preferences {
        self.preferences.lock().unwrap().clone()
    }

    pub fn set_preferences(&self, preferences: Preferences) {
        *self.preferences.lock().unwrap() = preferences;
    }
}
