use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("No credentials configured")]
    MissingCredentials,
    #[error("Invalid credentials (check email and API key)")]
    Unauthorized,
    #[error("Not allowed: the API key is read-only or your DeployHQ user lacks permission")]
    Forbidden,
    #[error("DeployHQ is busy or rate limiting requests. Try again in a moment.")]
    Unavailable,
    #[error("{message}")]
    Api {
        message: String,
        hint: Option<String>,
    },
    #[error("Network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Keychain error: {0}")]
    Keychain(#[from] keyring::Error),
    #[error("Invalid data: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(String),
}

/// Error bodies look like `{"error": "...", "error_code": "...", "hint": "..."}`,
/// but every field is optional and some endpoints answer with plain text or HTML.
#[derive(Deserialize)]
struct ApiErrorBody {
    #[serde(alias = "message")]
    error: Option<String>,
    hint: Option<String>,
}

impl AppError {
    pub fn from_api_response(status: u16, body: &str) -> Self {
        let parsed = serde_json::from_str::<ApiErrorBody>(body).ok();
        let non_empty = |text: Option<String>| text.filter(|text| !text.trim().is_empty());
        let message = parsed
            .as_ref()
            .and_then(|parsed| non_empty(parsed.error.clone()))
            .unwrap_or_else(|| format!("DeployHQ responded with an unexpected error ({status})"));
        let hint = parsed.and_then(|parsed| non_empty(parsed.hint));
        AppError::Api { message, hint }
    }

    fn hint(&self) -> Option<&str> {
        match self {
            AppError::Api { hint, .. } => hint.as_deref(),
            _ => None,
        }
    }
}

// Tauri commands must return serializable errors; the frontend shows the
// message and, when DeployHQ suggests one, the hint.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("hint", &self.hint())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_error_uses_message_and_hint_from_json_body() {
        let error = AppError::from_api_response(
            502,
            r#"{"error":"Could not read from the repository.","error_code":"repository_unreachable","hint":"Check the repository URL and credentials, then try again"}"#,
        );
        assert_eq!(error.to_string(), "Could not read from the repository.");
        assert_eq!(
            error.hint(),
            Some("Check the repository URL and credentials, then try again")
        );
    }

    #[test]
    fn api_error_falls_back_to_status_for_non_json_body() {
        let error = AppError::from_api_response(500, "<html>Internal Server Error</html>");
        assert_eq!(
            error.to_string(),
            "DeployHQ responded with an unexpected error (500)"
        );
        assert_eq!(error.hint(), None);
    }

    #[test]
    fn serializes_message_and_hint() {
        let error = AppError::from_api_response(422, r#"{"message":"Branch not found"}"#);
        assert_eq!(
            serde_json::to_string(&error).unwrap(),
            r#"{"message":"Branch not found","hint":null}"#
        );
    }
}
