use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

const KEYCHAIN_SERVICE: &str = "com.emmgfx.dhqtray";
const KEYCHAIN_ACCOUNT: &str = "deployhq-credentials";

/// DeployHQ API credentials. Stored as a single JSON entry in the macOS Keychain.
#[derive(Clone, Serialize, Deserialize)]
pub struct Credentials {
    /// Account permalink, i.e. the `<account>` in `https://<account>.deployhq.com`.
    pub account: String,
    pub email: String,
    pub api_key: String,
}

fn keychain_entry() -> AppResult<Entry> {
    Ok(Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)?)
}

pub fn load() -> AppResult<Option<Credentials>> {
    match keychain_entry()?.get_password() {
        Ok(serialized) => Ok(Some(serde_json::from_str(&serialized)?)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn save(credentials: &Credentials) -> AppResult<()> {
    keychain_entry()?.set_password(&serde_json::to_string(credentials)?)?;
    Ok(())
}

pub fn delete() -> AppResult<()> {
    match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}
