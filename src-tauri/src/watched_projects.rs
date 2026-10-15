//! Projects whose deployments are discovered while the tray is in use,
//! persisted as JSON in the app config directory.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config_store;
use crate::deployhq::Deployment;
use crate::error::AppResult;

const FILE_NAME: &str = "watched-projects.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedProject {
    pub permalink: String,
    pub name: String,
    /// Identifiers of the servers and server groups whose deployments are not
    /// followed. Muting (rather than choosing) keeps new servers followed, and
    /// an empty list follows the whole project.
    #[serde(default)]
    pub muted_targets: Vec<String>,
}

impl WatchedProject {
    /// Whether every server the deployment touches is muted, directly or
    /// through its group. A deployment with no known servers is followed.
    pub fn is_muted(&self, deployment: &Deployment) -> bool {
        let is_target_muted =
            |identifier: &str| self.muted_targets.iter().any(|muted| muted == identifier);
        !deployment.servers.is_empty()
            && deployment.servers.iter().all(|server| {
                is_target_muted(&server.identifier)
                    || server
                        .server_group_identifier
                        .as_deref()
                        .is_some_and(is_target_muted)
            })
    }
}

pub fn load(app: &AppHandle) -> AppResult<Vec<WatchedProject>> {
    Ok(config_store::load(app, FILE_NAME)?.unwrap_or_default())
}

pub fn save(app: &AppHandle, projects: &[WatchedProject]) -> AppResult<()> {
    config_store::save(app, FILE_NAME, &projects)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::deployhq::DeploymentServer;

    fn project(muted_targets: &[&str]) -> WatchedProject {
        WatchedProject {
            permalink: "site".into(),
            name: "Site".into(),
            muted_targets: muted_targets.iter().map(|&target| target.into()).collect(),
        }
    }

    fn deployment(servers: &[(&str, Option<&str>)]) -> Deployment {
        Deployment {
            servers: servers
                .iter()
                .map(|&(identifier, group)| DeploymentServer {
                    identifier: identifier.into(),
                    name: identifier.into(),
                    server_group_identifier: group.map(str::to_owned),
                })
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn unfiltered_project_follows_everything() {
        assert!(!project(&[]).is_muted(&deployment(&[("staging", None)])));
    }

    #[test]
    fn muted_server_or_group_is_not_followed() {
        let watched = project(&["staging", "staging-group"]);
        assert!(watched.is_muted(&deployment(&[("staging", None)])));
        assert!(watched.is_muted(&deployment(&[("web-1", Some("staging-group"))])));
        assert!(!watched.is_muted(&deployment(&[("production", None)])));
    }

    #[test]
    fn deployment_touching_any_followed_server_is_followed() {
        let watched = project(&["staging"]);
        assert!(!watched.is_muted(&deployment(&[("staging", None), ("production", None)])));
        assert!(!watched.is_muted(&deployment(&[])));
    }

    #[test]
    fn projects_saved_before_muting_existed_load_unfiltered() {
        let restored: WatchedProject =
            serde_json::from_str(r#"{ "permalink": "site", "name": "Site" }"#).unwrap();
        assert!(restored.muted_targets.is_empty());
    }
}
