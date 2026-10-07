use serde::{Serialize, Serializer};

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
    #[error("DeployHQ responded {status}: {body}")]
    Api { status: u16, body: String },
    #[error("Network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Keychain error: {0}")]
    Keychain(#[from] keyring::Error),
    #[error("Invalid data: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Other(String),
}

// Tauri commands must return serializable errors; the frontend only needs the message.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
