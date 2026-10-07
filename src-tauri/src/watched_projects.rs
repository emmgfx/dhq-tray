//! Projects whose deployments are discovered while the tray is in use,
//! persisted as JSON in the app config directory.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config_store;
use crate::error::AppResult;

const FILE_NAME: &str = "watched-projects.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedProject {
    pub permalink: String,
    pub name: String,
}

pub fn load(app: &AppHandle) -> AppResult<Vec<WatchedProject>> {
    Ok(config_store::load(app, FILE_NAME)?.unwrap_or_default())
}

pub fn save(app: &AppHandle, projects: &[WatchedProject]) -> AppResult<()> {
    config_store::save(app, FILE_NAME, &projects)
}
