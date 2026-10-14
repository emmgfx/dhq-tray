//! Small JSON files in the app config directory.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

fn file_path(app: &AppHandle, file_name: &str) -> AppResult<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| AppError::Other(format!("No config directory: {error}")))?;
    Ok(config_dir.join(file_name))
}

/// Reads `file_name`, or returns `None` if it does not exist yet.
pub fn load<T: DeserializeOwned>(app: &AppHandle, file_name: &str) -> AppResult<Option<T>> {
    let path = file_path(app, file_name)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| AppError::Other(format!("Could not read {file_name}: {error}")))?;
    Ok(Some(serde_json::from_str(&contents)?))
}

pub fn save<T: Serialize>(app: &AppHandle, file_name: &str, value: &T) -> AppResult<()> {
    let path = file_path(app, file_name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::Other(format!("Could not create config directory: {error}"))
        })?;
    }
    // Written next to it and renamed over it, so a crash or power loss mid-write
    // leaves the previous file instead of a truncated one that fails to load.
    // Each save gets its own temporary file, as watchers can save concurrently.
    static NEXT_SAVE_ID: AtomicU64 = AtomicU64::new(0);
    let save_id = NEXT_SAVE_ID.fetch_add(1, Ordering::Relaxed);
    let temporary_path = path.with_extension(format!("json.{save_id}.tmp"));
    fs::write(&temporary_path, serde_json::to_string_pretty(value)?)
        .and_then(|()| fs::rename(&temporary_path, &path))
        .map_err(|error| AppError::Other(format!("Could not save {file_name}: {error}")))
}
