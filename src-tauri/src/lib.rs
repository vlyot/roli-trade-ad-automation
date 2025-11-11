// lib.rs: Tauri commands for Rolimons trade ad automation GUI application.

mod ads_runner;
mod ads_storage;
mod auth_storage;
mod avatar_thumbnails;
mod player_assets;
mod roblox_user;
mod rolimons_players;
mod trade_ad;
mod verification;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct TradeAdRequest {
    player_id: u64,
    offer_item_ids: Vec<u64>,
    request_item_ids: Vec<u64>,
    request_tags: Vec<String>,
    roli_verification: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TradeAdResponse {
    success: bool,
    logs: Vec<String>,
}

/// Tauri command to post a trade ad to Rolimons
#[tauri::command]
async fn post_trade_ad(request: TradeAdRequest) -> Result<TradeAdResponse, String> {
    // Validate inputs
    let mut logs = Vec::new();
    logs.push("Connecting to Rolimons API...".to_string());

    if request.offer_item_ids.is_empty() {
        logs.push("You must offer at least one item".to_string());
        return Ok(TradeAdResponse {
            success: false,
            logs,
        });
    }
    if request.offer_item_ids.len() > 4 {
        logs.push("You can only offer up to 4 items".to_string());
        return Ok(TradeAdResponse {
            success: false,
            logs,
        });
    }
    let total_requests = request.request_item_ids.len() + request.request_tags.len();
    if total_requests == 0 {
        logs.push("You must request at least one item or tag".to_string());
        return Ok(TradeAdResponse {
            success: false,
            logs,
        });
    }
    if total_requests > 4 {
        logs.push("You can only request up to 4 items (combined item IDs and tags)".to_string());
        return Ok(TradeAdResponse {
            success: false,
            logs,
        });
    }
    if request.roli_verification.trim().is_empty() {
        logs.push("Roli verification cookie is required".to_string());
        return Ok(TradeAdResponse {
            success: false,
            logs,
        });
    }
    logs.push("Posting trade ad...".to_string());
    match trade_ad::post_trade_ad_direct(
        &request.roli_verification,
        request.player_id,
        request.offer_item_ids,
        request.request_item_ids,
        request.request_tags,
    )
    .await
    {
        Ok(message) => {
            logs.push(message);
            Ok(TradeAdResponse {
                success: true,
                logs,
            })
        }
        Err(e) => {
            logs.push(format!("Failed to post trade ad: {}", e));
            Ok(TradeAdResponse {
                success: false,
                logs,
            })
        }
    }
}

// ===== Ads storage commands =====

#[tauri::command]
fn list_ads() -> Result<Vec<ads_storage::AdData>, String> {
    ads_storage::list_ads().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_ad(ad: ads_storage::AdData) -> Result<(), String> {
    // Validate interval: enforce minimum 15 minutes
    if ad.interval_minutes < 15 {
        return Err("Interval must be at least 15 minutes".to_string());
    }
    ads_storage::save_ad(&ad).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_ad(id: String) -> Result<(), String> {
    ads_storage::delete_ad(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_ad(id: String) -> Result<Option<ads_storage::AdData>, String> {
    ads_storage::get_ad(&id).map_err(|e| e.to_string())
}

// ===== Ads runner commands =====

#[tauri::command]
fn start_ad(
    window: tauri::Window,
    id: String,
    interval_minutes: Option<u64>,
) -> Result<(), String> {
    let ad_opt = ads_storage::get_ad(&id).map_err(|e| e.to_string())?;
    let mut ad = ad_opt.ok_or_else(|| "Ad not found".to_string())?;
    if let Some(i) = interval_minutes {
        if i < 15 {
            return Err("Interval must be at least 15 minutes".to_string());
        }
        ad.interval_minutes = i;
    }
    // Validate stored ad interval as well
    if ad.interval_minutes < 15 {
        return Err("Interval must be at least 15 minutes".to_string());
    }
    ads_runner::start_ad(ad, window).map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_ad(id: String) -> Result<(), String> {
    ads_runner::stop_ad(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_running_ads() -> Result<Vec<String>, String> {
    ads_runner::list_running_ads().map_err(|e| e.to_string())
}

/// Tauri command to validate request tags
#[tauri::command]
fn validate_request_tag(tag: String) -> bool {
    matches!(
        tag.to_lowercase().as_str(),
        "any"
            | "demand"
            | "rares"
            | "robux"
            | "upgrade"
            | "downgrade"
            | "rap"
            | "wishlist"
            | "projecteds"
            | "adds"
    )
}

/// Tauri command to get available request tags
#[tauri::command]
fn get_available_tags() -> Vec<String> {
    vec![
        "any".to_string(),
        "demand".to_string(),
        "rares".to_string(),
        "robux".to_string(),
        "upgrade".to_string(),
        "downgrade".to_string(),
        "rap".to_string(),
        "wishlist".to_string(),
        "projecteds".to_string(),
        "adds".to_string(),
    ]
}

// ===== Auth Commands =====

/// Search for Roblox users by keyword (min 3 characters)
#[tauri::command]
async fn search_users(
    keyword: String,
    limit: Option<u32>,
) -> Result<roblox_user::UserSearchResponse, String> {
    roblox_user::search_users(&keyword, limit)
        .await
        .map_err(|e| e.to_string())
}

/// Get detailed user information by user ID
#[tauri::command]
async fn get_user_details(user_id: u64) -> Result<roblox_user::UserDetails, String> {
    roblox_user::get_user_details(user_id)
        .await
        .map_err(|e| e.to_string())
}

/// Generate a random verification code (5-10 words)
#[tauri::command]
fn generate_verification_code() -> String {
    verification::generate_verification_code()
}

/// Verify a user by checking if their Roblox profile description contains the verification code
#[tauri::command]
async fn verify_user(
    user_id: u64,
    username: String,
    display_name: String,
    verification_code: String,
) -> Result<bool, String> {
    let details = roblox_user::get_user_details(user_id)
        .await
        .map_err(|e| e.to_string())?;

    let verified = details.description.contains(&verification_code);

    if verified {
        // Save auth data on successful verification
        let auth = auth_storage::AuthData {
            user_id,
            username,
            display_name,
            roli_verification: None,
        };
        auth_storage::save_auth(&auth).map_err(|e| e.to_string())?;
    }

    Ok(verified)
}

/// Save authentication data
#[tauri::command]
fn save_auth_data(
    user_id: u64,
    username: String,
    display_name: String,
    roli_verification: Option<String>,
) -> Result<(), String> {
    let auth = auth_storage::AuthData {
        user_id,
        username,
        display_name,
        roli_verification,
    };
    auth_storage::save_auth(&auth).map_err(|e| e.to_string())
}

/// Load authentication data
#[tauri::command]
fn load_auth_data() -> Result<Option<auth_storage::AuthData>, String> {
    auth_storage::load_auth().map_err(|e| e.to_string())
}

/// Update the roli_verification token for the logged-in user
#[tauri::command]
fn update_roli_verification(roli_verification: String) -> Result<(), String> {
    auth_storage::update_roli_verification(roli_verification).map_err(|e| e.to_string())
}

/// Logout (clear auth data)
#[tauri::command]
fn logout() -> Result<(), String> {
    auth_storage::clear_auth().map_err(|e| e.to_string())
}

/// Tauri command: fetch the full catalog for a given search term (no caching)
#[tauri::command]
async fn get_full_catalog(search: Option<String>) -> Result<serde_json::Value, String> {
    // Fetch via existing fetch_item_details with a very large page size and return fresh results.
    match trade_ad::fetch_item_details(1usize, 10_000_000usize, search.clone()).await {
        Ok((items, _total)) => {
            // convert ItemInfo -> JsonValue and filter rap > 0
            let mut filtered: Vec<serde_json::Value> = Vec::with_capacity(items.len());
            for it in items.into_iter() {
                if it.rap > 0 {
                    if let Ok(v) = serde_json::to_value(&it) {
                        filtered.push(v);
                    }
                }
            }
            let t = filtered.len();
            Ok(serde_json::json!({"items": filtered, "total": t}))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Tauri command: fetch a player's inventory and enrich with catalog metadata
#[tauri::command]
async fn fetch_enriched_inventory(player_id: u64) -> Result<serde_json::Value, String> {
    // call existing player assets inventory fetch
    let inv = crate::player_assets::fetch_player_inventory(player_id)
        .await
        .map_err(|e| e.to_string())?;
    let items_arr = inv
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // collect missing catalog ids
    let mut missing = Vec::new();
    for it in &items_arr {
        if let Some(cid) = it
            .get("catalog_id")
            .or_else(|| it.get("catalogId"))
            .and_then(|v| v.as_i64())
        {
            missing.push(cid as u64);
        }
    }
    missing.sort_unstable();
    missing.dedup();

    let mut catalog_map: HashMap<u64, JsonValue> = HashMap::new();
    if !missing.is_empty() {
        match trade_ad::fetch_items_by_ids(missing.clone()).await {
            Ok(ci) => {
                for item in ci {
                    let idv = item.id;
                    if let Ok(jv) = serde_json::to_value(&item) {
                        catalog_map.insert(idv as u64, jv);
                    }
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }

    // enrich inventory entries
    let enriched: Vec<JsonValue> = items_arr
        .into_iter()
        .map(|mut inv_item| {
            let cid = inv_item
                .get("catalog_id")
                .or_else(|| inv_item.get("catalogId"))
                .and_then(|v| v.as_i64())
                .map(|v| v as u64);
            if let Some(c) = cid {
                if let Some(meta) = catalog_map.get(&c) {
                    // merge selected fields
                    if let Some(name) = meta.get("name") {
                        inv_item
                            .as_object_mut()
                            .unwrap()
                            .insert("name".to_string(), name.clone());
                    }
                    if let Some(abbr) = meta.get("abbreviation") {
                        inv_item
                            .as_object_mut()
                            .unwrap()
                            .insert("abbreviation".to_string(), abbr.clone());
                    }
                    if let Some(rap) = meta.get("rap") {
                        inv_item
                            .as_object_mut()
                            .unwrap()
                            .insert("rap".to_string(), rap.clone());
                    }
                    if let Some(value) = meta.get("value") {
                        inv_item
                            .as_object_mut()
                            .unwrap()
                            .insert("value".to_string(), value.clone());
                    }
                    if let Some(th) = meta.get("thumbnail") {
                        inv_item
                            .as_object_mut()
                            .unwrap()
                            .insert("thumbnail".to_string(), th.clone());
                    }
                }
            }
            inv_item
        })
        .collect();

    Ok(serde_json::json!({"items": enriched}))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            post_trade_ad,
            // fetch catalog pages from Rolimons
            get_catalog_items,
            validate_request_tag,
            get_available_tags,
            // auth commands
            search_users,
            get_user_details,
            // rolimons players search + thumbnails
            rolimons_players::search_players_with_thumbnails,
            // player assets (inventory)
            player_assets::fetch_player_assets,
            player_assets::fetch_player_inventory,
            // targeted catalog lookup by ids
            get_catalog_items_by_ids,
            get_full_catalog,
            // ads storage
            list_ads,
            save_ad,
            delete_ad,
            get_ad,
            // ads runner (start/stop/list)
            start_ad,
            stop_ad,
            list_running_ads,
            generate_verification_code,
            verify_user,
            // avatar thumbnails for user search
            avatar_thumbnails::fetch_avatar_thumbnails,
            fetch_enriched_inventory,
            save_auth_data,
            load_auth_data,
            update_roli_verification,
            logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Tauri command to fetch catalog items from Rolimons with pagination and optional search.
#[tauri::command]
async fn get_catalog_items(
    page: usize,
    per_page: usize,
    search: Option<String>,
) -> Result<serde_json::Value, String> {
    match trade_ad::fetch_item_details(page, per_page, search).await {
        Ok((items, total)) => Ok(serde_json::json!({"items": items, "total": total})),
        Err(e) => Err(e.to_string()),
    }
}

/// Tauri command: fetch catalog entries for specific catalog IDs (targeted lookup)
#[tauri::command]
async fn get_catalog_items_by_ids(ids: Vec<u64>) -> Result<serde_json::Value, String> {
    match trade_ad::fetch_items_by_ids(ids).await {
        Ok(items) => Ok(serde_json::json!({"items": items})),
        Err(e) => Err(e.to_string()),
    }
}
