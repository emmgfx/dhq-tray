//! Minimal DeployHQ API client. Only models the fields the app uses.
//! API reference: https://api.deployhq.com/docs

use std::time::Duration;

use reqwest::{header, Client, Method, RequestBuilder, Response, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::json;

use crate::api_health::ApiHealth;
use crate::credentials::Credentials;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectRepository {
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Project {
    pub name: String,
    pub permalink: String,
    pub identifier: String,
    pub repository: Option<ProjectRepository>,
    pub last_deployed_at: Option<String>,
    pub starred: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Server {
    pub identifier: String,
    pub name: String,
    pub environment: Option<String>,
    pub preferred_branch: Option<String>,
    pub branch: Option<String>,
    pub last_revision: Option<String>,
    pub server_group_identifier: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ServerGroup {
    pub identifier: String,
    pub name: String,
    pub environment: Option<String>,
    pub preferred_branch: Option<String>,
    pub last_revision: Option<String>,
    pub servers: Vec<Server>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Revision {
    #[serde(rename = "ref")]
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DeploymentTimestamps {
    pub queued_at: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    /// Seconds. Documented as a string, but DeployHQ sends a number once the
    /// deployment finishes; both are accepted.
    #[serde(deserialize_with = "seconds_from_number_or_string")]
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DeploymentServer {
    pub identifier: String,
    pub name: String,
    pub server_group_identifier: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DeploymentStep {
    pub identifier: Option<String>,
    pub stage: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    // Documented as strings but kept raw in case the API sends numbers.
    pub total_items: serde_json::Value,
    pub completed_items: serde_json::Value,
    /// Whether DeployHQ has log entries for this step.
    pub logs: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct StepLogEntry {
    pub message: Option<String>,
    pub detail: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Deployment {
    pub identifier: String,
    pub status: String,
    #[serde(deserialize_with = "null_as_default")]
    pub servers: Vec<DeploymentServer>,
    pub branch: Option<String>,
    pub deployer: Option<String>,
    // `null` when there is no start revision (a full, all-files deployment).
    #[serde(deserialize_with = "null_as_default")]
    pub start_revision: Revision,
    #[serde(deserialize_with = "null_as_default")]
    pub end_revision: Revision,
    #[serde(deserialize_with = "null_as_default")]
    pub timestamps: DeploymentTimestamps,
    #[serde(deserialize_with = "null_as_default")]
    pub steps: Vec<DeploymentStep>,
    pub log_summary: Option<String>,
}

fn seconds_from_number_or_string<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(match Option::<serde_json::Value>::deserialize(deserializer)? {
        Some(serde_json::Value::Number(number)) => number.as_f64(),
        Some(serde_json::Value::String(text)) => text.trim().parse().ok(),
        _ => None,
    })
}

/// Treats an explicit JSON `null` like a missing field (`#[serde(default)]`
/// only covers the latter).
fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct DeploymentPage {
    records: Vec<Deployment>,
}

impl Deployment {
    /// Human-readable list of the servers being deployed to.
    pub fn target_name(&self) -> String {
        let names: Vec<&str> = self.servers.iter().map(|server| server.name.as_str()).collect();
        if names.is_empty() {
            "unknown servers".to_string()
        } else {
            names.join(", ")
        }
    }

    /// Documented statuses: pending, running, completed, failed, preview_pending,
    /// preview_ready, preview_failed. Anything not in progress counts as finished,
    /// so an undocumented status never keeps the watcher polling.
    pub fn is_finished(&self) -> bool {
        !matches!(
            self.status.as_str(),
            "pending" | "running" | "preview_pending"
        )
    }
}

/// Per-deployment options; the UI preselects them like DeployHQ's own form.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct DeployOptions {
    pub copy_config_files: bool,
    pub run_build_commands: bool,
    pub use_build_cache: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Commit {
    #[serde(rename = "ref")]
    pub reference: String,
    pub author: String,
    pub timestamp: Option<String>,
    pub short_message: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct RecentCommitsResponse {
    commits: Vec<Commit>,
}

#[derive(Debug, Serialize)]
pub struct RecentCommits {
    /// Newest first.
    pub commits: Vec<Commit>,
    /// False when DeployHQ could not fetch from the remote and returned what it
    /// had synced, so the newest commits may be missing.
    pub is_synced_with_remote: bool,
}

pub struct DeployRequest<'a> {
    pub project: &'a str,
    /// Identifier of a server or a server group.
    pub target_identifier: &'a str,
    pub branch: &'a str,
    /// Revision currently deployed on the target; `None` deploys everything.
    pub start_revision: Option<&'a str>,
    /// Revision to deploy; the latest of `branch` when `None`.
    pub end_revision: Option<&'a str>,
    pub options: DeployOptions,
}

pub struct DeployHqClient<'a> {
    http: &'a Client,
    health: &'a ApiHealth,
    credentials: &'a Credentials,
}

impl<'a> DeployHqClient<'a> {
    pub fn new(http: &'a Client, health: &'a ApiHealth, credentials: &'a Credentials) -> Self {
        Self {
            http,
            health,
            credentials,
        }
    }

    fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let url = format!("https://{}.deployhq.com{}", self.credentials.account, path);
        self.http
            .request(method, url)
            .basic_auth(&self.credentials.email, Some(&self.credentials.api_key))
            .header(header::ACCEPT, "application/json")
    }

    async fn send<T: DeserializeOwned>(&self, request: RequestBuilder) -> AppResult<T> {
        /// DeployHQ answers 503 (busy, e.g. updating a repository) or 429 (rate
        /// limit) with `Retry-After`; reads are retried, honoring it, up to this
        /// many attempts. If it persists, `ApiHealth` pauses background polling.
        const MAX_ATTEMPTS: u32 = 3;
        const DEFAULT_RETRY_DELAY: Duration = Duration::from_secs(2);
        const MAX_RETRY_DELAY: Duration = Duration::from_secs(10);

        let request = request.build()?;
        // Only reads are safe to repeat; a failed POST could still have been applied.
        let is_retryable = request.method() == Method::GET;

        let mut attempt = 1;
        let response = loop {
            let attempt_request = request
                .try_clone()
                .expect("API requests have no streaming body");
            let response = self.http.execute(attempt_request).await?;
            if !response.status().is_success() {
                eprintln!(
                    "DeployHQ {} {} -> {} (attempt {attempt}, retry-after: {:?})",
                    request.method(),
                    request.url().path(),
                    response.status(),
                    response.headers().get(header::RETRY_AFTER),
                );
            }
            if !is_throttled(response.status())
                || !is_retryable
                || attempt == MAX_ATTEMPTS
            {
                break response;
            }
            let delay = retry_after(&response)
                .unwrap_or(DEFAULT_RETRY_DELAY)
                .min(MAX_RETRY_DELAY);
            tokio::time::sleep(delay).await;
            attempt += 1;
        };

        let status = response.status();
        if is_throttled(status) {
            self.health.record_throttled(retry_after(&response));
            return Err(AppError::Unavailable);
        }
        self.health.record_success();
        if status == StatusCode::UNAUTHORIZED {
            return Err(AppError::Unauthorized);
        }
        if status == StatusCode::FORBIDDEN {
            return Err(AppError::Forbidden);
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            eprintln!("DeployHQ error body: {body}");
            return Err(AppError::from_api_response(status.as_u16(), &body));
        }
        let path = request.url().path().to_owned();
        let body = response.text().await?;
        serde_json::from_str(&body).map_err(|error| {
            // The serde message names the offending type and position in the body.
            eprintln!("Unexpected DeployHQ response for {path}: {error}");
            AppError::Json(error)
        })
    }

    pub async fn list_projects(&self) -> AppResult<Vec<Project>> {
        self.send(self.request(Method::GET, "/projects")).await
    }

    pub async fn list_servers(&self, project: &str) -> AppResult<Vec<Server>> {
        let path = format!("/projects/{project}/servers");
        self.send(self.request(Method::GET, &path)).await
    }

    pub async fn list_server_groups(&self, project: &str) -> AppResult<Vec<ServerGroup>> {
        let path = format!("/projects/{project}/server_groups");
        self.send(self.request(Method::GET, &path)).await
    }

    pub async fn latest_revision(&self, project: &str, branch: &str) -> AppResult<String> {
        let path = format!("/projects/{project}/repository/latest_revision");
        let revision: Revision = self
            .send(self.request(Method::GET, &path).query(&[("branch", branch)]))
            .await?;
        revision
            .reference
            .ok_or_else(|| AppError::Other(format!("No revisions found on branch {branch}")))
    }

    /// Recent commits of `branch`, newest first. Asks DeployHQ to fetch from the
    /// remote first; if that is unavailable, returns what it already has synced.
    pub async fn recent_commits(&self, project: &str, branch: &str) -> AppResult<RecentCommits> {
        let path = format!("/projects/{project}/repository/recent_commits");
        let fetch = |update_repository: bool| {
            let mut query = vec![("branch", branch)];
            if update_repository {
                query.push(("update", "1"));
            }
            self.send::<RecentCommitsResponse>(self.request(Method::GET, &path).query(&query))
        };
        let (response, is_synced_with_remote) = match fetch(true).await {
            Err(AppError::Unavailable) => (fetch(false).await?, false),
            result => (result?, true),
        };
        Ok(RecentCommits {
            commits: response.commits,
            is_synced_with_remote,
        })
    }

    pub async fn get_deployment(&self, project: &str, identifier: &str) -> AppResult<Deployment> {
        let path = format!("/projects/{project}/deployments/{identifier}");
        self.send(self.request(Method::GET, &path)).await
    }

    /// Most recent deployments of the project, newest first (first page only).
    pub async fn list_recent_deployments(
        &self,
        project: &str,
        page_size: u32,
    ) -> AppResult<Vec<Deployment>> {
        let path = format!("/projects/{project}/deployments");
        let page: DeploymentPage = self
            .send(self.request(Method::GET, &path).query(&[("per_page", page_size)]))
            .await?;
        Ok(page.records)
    }

    pub async fn step_logs(
        &self,
        project: &str,
        deployment: &str,
        step: &str,
    ) -> AppResult<Vec<StepLogEntry>> {
        let path = format!("/projects/{project}/deployments/{deployment}/steps/{step}/logs");
        self.send(self.request(Method::GET, &path)).await
    }

    pub async fn abort_deployment(&self, project: &str, identifier: &str) -> AppResult<()> {
        let path = format!("/projects/{project}/deployments/{identifier}/abort");
        self.send::<serde_json::Value>(self.request(Method::POST, &path))
            .await
            .map(|_| ())
    }

    /// Re-queues a finished deployment (DeployHQ resets and reruns it).
    pub async fn retry_deployment(&self, project: &str, identifier: &str) -> AppResult<Deployment> {
        let path = format!("/projects/{project}/deployments/{identifier}/retry");
        self.send(self.request(Method::POST, &path)).await
    }

    /// Creates a new deployment that brings the servers back to this deployment's state.
    pub async fn rollback_deployment(
        &self,
        project: &str,
        identifier: &str,
    ) -> AppResult<Deployment> {
        let path = format!("/projects/{project}/deployments/{identifier}/rollback");
        self.send(self.request(Method::POST, &path)).await
    }

    pub async fn create_deployment(&self, deploy: &DeployRequest<'_>) -> AppResult<Deployment> {
        let end_revision = match deploy.end_revision {
            Some(revision) => revision.to_string(),
            None => self.latest_revision(deploy.project, deploy.branch).await?,
        };
        let mut deployment = json!({
            "parent_identifier": deploy.target_identifier,
            "branch": deploy.branch,
            "end_revision": end_revision,
            "mode": "queue",
            "copy_config_files": deploy.options.copy_config_files,
            "run_build_commands": deploy.options.run_build_commands,
            "use_build_cache": deploy.options.use_build_cache,
        });
        if let Some(start_revision) = deploy.start_revision {
            deployment["start_revision"] = json!(start_revision);
        }
        let path = format!("/projects/{}/deployments", deploy.project);
        self.send(
            self.request(Method::POST, &path)
                .json(&json!({ "deployment": deployment })),
        )
        .await
    }
}

fn is_throttled(status: StatusCode) -> bool {
    status == StatusCode::SERVICE_UNAVAILABLE || status == StatusCode::TOO_MANY_REQUESTS
}

/// `Retry-After` in seconds. Other forms (an HTTP date) fall back to the default delay.
fn retry_after(response: &Response) -> Option<Duration> {
    let seconds = response
        .headers()
        .get(header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()?;
    Some(Duration::from_secs(seconds))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deployment_accepts_numeric_duration_and_null_fields() {
        let deployment: Deployment = serde_json::from_str(
            r#"{
                "identifier": "abc",
                "status": "completed",
                "servers": null,
                "start_revision": null,
                "end_revision": { "ref": "f00ba12" },
                "timestamps": { "started_at": "2026-10-07T10:00:00Z", "duration": 147.0 },
                "steps": null
            }"#,
        )
        .unwrap();
        assert_eq!(deployment.timestamps.duration, Some(147.0));
        assert_eq!(deployment.start_revision.reference, None);
        assert!(deployment.steps.is_empty() && deployment.servers.is_empty());
    }

    #[test]
    fn deployment_accepts_string_or_missing_duration() {
        let with_string: Deployment =
            serde_json::from_str(r#"{ "timestamps": { "duration": "68" } }"#).unwrap();
        assert_eq!(with_string.timestamps.duration, Some(68.0));
        let without: Deployment = serde_json::from_str(r#"{ "timestamps": {} }"#).unwrap();
        assert_eq!(without.timestamps.duration, None);
    }
}
