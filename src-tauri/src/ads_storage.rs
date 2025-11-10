// ads_storage.rs
// Persist Advertisement presets to disk in the same app config directory as auth.json

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdData {
    pub id: String,
    pub name: String,
    pub player_id: u64,
    pub roli_verification: Option<String>,
    pub offer_item_ids: Vec<u64>,
    pub request_item_ids: Vec<u64>,
    pub request_tags: Vec<String>,
    pub interval_minutes: u64,
}

fn get_ads_file_path() -> Result<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| anyhow::anyhow!("Failed to get config directory"))?;
    let app_dir = config_dir.join("roli-trade-ad-automation");
    fs::create_dir_all(&app_dir)?;
    Ok(app_dir.join("ads.json"))
}

pub fn list_ads() -> Result<Vec<AdData>> {
    let path = get_ads_file_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    let ads: Vec<AdData> = serde_json::from_str(&raw)?;
    Ok(ads)
}

pub fn save_ad(ad: &AdData) -> Result<()> {
    let mut ads = list_ads()?;
    if let Some(idx) = ads.iter().position(|a| a.id == ad.id) {
        ads[idx] = ad.clone();
    } else {
        ads.push(ad.clone());
    }
    let path = get_ads_file_path()?;
    let raw = serde_json::to_string_pretty(&ads)?;
    fs::write(path, raw)?;
    eprintln!("ads_storage: saved ad id={}", ad.id);
    Ok(())
}

pub fn delete_ad(id: &str) -> Result<()> {
    let mut ads = list_ads()?;
    ads.retain(|a| a.id != id);
    let path = get_ads_file_path()?;
    let raw = serde_json::to_string_pretty(&ads)?;
    fs::write(path, raw)?;
    eprintln!("ads_storage: deleted ad id={}", id);
    Ok(())
}

pub fn get_ad(id: &str) -> Result<Option<AdData>> {
    let ads = list_ads()?;
    Ok(ads.into_iter().find(|a| a.id == id))
}
