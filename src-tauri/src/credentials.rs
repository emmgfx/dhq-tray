use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

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

/// The account permalink from what was typed: also accepts the account's
/// address (`https://mycompany.deployhq.com/...`). Only letters, digits and
/// hyphens are allowed, since it becomes the host the API key is sent to.
pub fn normalize_account(input: &str) -> AppResult<String> {
    let input = input.trim().to_ascii_lowercase();
    let without_scheme = input
        .strip_prefix("https://")
        .or_else(|| input.strip_prefix("http://"))
        .unwrap_or(&input);
    let host = without_scheme.split('/').next().unwrap_or_default();
    let account = host.strip_suffix(".deployhq.com").unwrap_or(host);
    let is_valid = !account.is_empty()
        && account
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if is_valid {
        Ok(account.to_string())
    } else {
        Err(AppError::Other(
            "Enter the account as it appears in its address: <account>.deployhq.com".into(),
        ))
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_account_accepts_permalink_or_address() {
        assert_eq!(normalize_account(" MyCompany ").unwrap(), "mycompany");
        assert_eq!(
            normalize_account("my-company.deployhq.com").unwrap(),
            "my-company"
        );
        assert_eq!(
            normalize_account("https://mycompany.deployhq.com/projects").unwrap(),
            "mycompany"
        );
    }

    #[test]
    fn normalize_account_rejects_other_hosts() {
        for input in [
            "",
            "evil.com/?",
            "evil.com#",
            "user@evil.com",
            "a.b",
            "my company",
        ] {
            assert!(normalize_account(input).is_err(), "{input:?} was accepted");
        }
    }
}
