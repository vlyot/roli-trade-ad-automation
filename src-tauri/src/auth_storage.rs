// auth_storage.rs
// Responsibility: Persist and load authentication data (user_id and roli_verification).

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthData {
    pub user_id: u64,
    pub username: String,
    pub display_name: String,
    pub roli_verification: Option<String>,
}

/// Get the path to the auth storage file.
fn get_auth_file_path() -> Result<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| anyhow::anyhow!("Failed to get config directory"))?;
    let app_dir = config_dir.join("roli-trade-ad-automation");
    fs::create_dir_all(&app_dir)?;
    Ok(app_dir.join("auth.json"))
}

/// Save authentication data to disk.
pub fn save_auth(auth: &AuthData) -> Result<()> {
    let path = get_auth_file_path()?;
    let json = serde_json::to_string_pretty(auth)?;
    fs::write(path, json)?;
    eprintln!("auth_storage: saved auth for user_id={}", auth.user_id);
    Ok(())
}

/// Load authentication data from disk. Returns None if no auth file exists.
pub fn load_auth() -> Result<Option<AuthData>> {
    let path = get_auth_file_path()?;

    if !path.exists() {
        eprintln!("auth_storage: no auth file found");
        return Ok(None);
    }

    let contents = fs::read_to_string(path)?;
    let auth: AuthData = serde_json::from_str(&contents)?;
    eprintln!("auth_storage: loaded auth for user_id={}", auth.user_id);
    Ok(Some(auth))
}

/// Update the roli_verification for the current user.
pub fn update_roli_verification(roli_verification: String) -> Result<()> {
    let mut auth = load_auth()?.ok_or_else(|| anyhow::anyhow!("No auth data found"))?;
    auth.roli_verification = Some(roli_verification);
    save_auth(&auth)?;
    eprintln!("auth_storage: updated roli_verification");
    Ok(())
}

/// Clear authentication data (logout).
pub fn clear_auth() -> Result<()> {
    let path = get_auth_file_path()?;
    if path.exists() {
        fs::remove_file(path)?;
        eprintln!("auth_storage: cleared auth");
    }
    Ok(())
}
