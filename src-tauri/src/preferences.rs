//! User preferences, persisted as JSON in the app config directory.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config_store;
use crate::error::AppResult;

const FILE_NAME: &str = "preferences.json";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationLevel {
    #[default]
    All,
    FailuresOnly,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Preferences {
    pub notification_level: NotificationLevel,
    pub notification_sound: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            notification_level: NotificationLevel::All,
            notification_sound: true,
        }
    }
}

pub fn load(app: &AppHandle) -> AppResult<Preferences> {
    Ok(config_store::load(app, FILE_NAME)?.unwrap_or_default())
}

pub fn save(app: &AppHandle, preferences: &Preferences) -> AppResult<()> {
    config_store::save(app, FILE_NAME, preferences)
}
