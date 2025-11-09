use once_cell::sync::Lazy;
use reqwest::header::USER_AGENT;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// Simple in-memory TTL cache for player assets: player_id -> (json, expiry_unix_secs)
static PLAYER_ASSETS_CACHE: Lazy<Mutex<HashMap<u64, (Value, u64)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
const PLAYER_ASSETS_TTL_SECS: u64 = 30; // 30 seconds TTL

async fn fetch_player_assets_raw(player_id: u64) -> Result<Value, String> {
    let url = format!(
        "https://api.rolimons.com/players/v1/playerassets/{}",
        player_id
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header(USER_AGENT, "rolimons-player-assets-fetcher/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!(
            "Rolimons player assets HTTP error: {}",
            resp.status()
        ));
    }

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// Fetch player assets with a small TTL cache to avoid repeated Rolimons calls when navigating UI.
#[tauri::command]
pub async fn fetch_player_assets(player_id: u64) -> Result<serde_json::Value, String> {
    // Check cache
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_secs();
    {
        let cache = PLAYER_ASSETS_CACHE.lock().unwrap();
        if let Some((val, expiry)) = cache.get(&player_id) {
            if *expiry > now {
                // return cloned value
                return Ok(val.clone());
            }
        }
    }

    // Miss or expired -> fetch
    let fetched = fetch_player_assets_raw(player_id).await?;

    // Store in cache
    let expiry = now + PLAYER_ASSETS_TTL_SECS;
    {
        let mut cache = PLAYER_ASSETS_CACHE.lock().unwrap();
        cache.insert(player_id, (fetched.clone(), expiry));
    }

    // Return trimmed subset: playerId, playerAssets, holds
    let player_id_val = fetched.get("playerId").cloned().unwrap_or(Value::Null);
    let player_assets = fetched.get("playerAssets").cloned().unwrap_or(Value::Null);
    let holds = fetched
        .get("holds")
        .cloned()
        .unwrap_or(Value::Array(vec![]));

    let out = json!({
        "success": true,
        "playerId": player_id_val,
        "playerAssets": player_assets,
        "holds": holds,
    });

    Ok(out)
}

/// Return a flattened inventory list: [{ catalog_id: String, instance_id: u64, held: bool }, ...]
#[tauri::command]
pub async fn fetch_player_inventory(player_id: u64) -> Result<serde_json::Value, String> {
    let data = fetch_player_assets(player_id).await?;
    let player_id_val = data.get("playerId").cloned().unwrap_or(Value::Null);
    let holds_arr = data
        .get("holds")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_else(|| vec![]);
    // build set of held instance ids
    let mut held_set: HashSet<u64> = HashSet::new();
    for h in holds_arr.iter() {
        if let Some(hv) = h.as_u64() {
            held_set.insert(hv);
        }
    }

    let mut items: Vec<Value> = Vec::new();
    if let Some(obj) = data.get("playerAssets").and_then(|v| v.as_object()) {
        for (catalog_id, instances_val) in obj.iter() {
            if let Some(arr) = instances_val.as_array() {
                for inst in arr.iter() {
                    if let Some(inst_id) = inst.as_u64() {
                        let held = held_set.contains(&inst_id);
                        items.push(json!({ "catalog_id": catalog_id, "instance_id": inst_id, "held": held }));
                    }
                }
            }
        }
    }

    let out = json!({
        "success": true,
        "playerId": player_id_val,
        "items": items,
    });

    Ok(out)
}
