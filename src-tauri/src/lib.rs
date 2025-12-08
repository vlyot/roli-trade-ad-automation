// lib.rs: Tauri commands for Rolimons trade ad automation GUI application.

mod ads_runner;
mod ads_storage;
mod auth_storage;
mod avatar_thumbnails;
mod notification_settings;
mod player_assets;
mod roblox_user;
mod rolimons_players;
mod thumbnails;
mod trade_ad;
mod value_change_detector;
mod verification;

use chrono::Local;
use dirs::data_local_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;

// Top-level helper: write a timestamped line to the app-local log so release runs can be diagnosed.
fn append_app_log(msg: &str) {
    if let Some(mut dir) = data_local_dir() {
        dir.push("roli-trade-ad-automation");
        let _ = std::fs::create_dir_all(&dir);
        dir.push("app.log");
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&dir) {
            let _ = writeln!(f, "{}: {}", Local::now().to_rfc3339(), msg);
        }
    }
}

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
    // Validate interval: allow 0 to mean "use global interval"; otherwise enforce minimum 15 minutes
    if ad.interval_minutes != 0 && ad.interval_minutes < 15 {
        return Err(
            "Interval must be at least 15 minutes or 0 to inherit global interval".to_string(),
        );
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
    // use the top-level logger

    let ad_opt = match ads_storage::get_ad(&id) {
        Ok(v) => v,
        Err(e) => {
            let msg = format!("start_ad: failed to read ad {} from storage: {}", id, e);
            append_app_log(&msg);
            return Err(msg);
        }
    };
    let mut ad = ad_opt.ok_or_else(|| "Ad not found".to_string())?;
    if let Some(i) = interval_minutes {
        if i < 15 {
            let msg = format!("start_ad: provided interval {} is below minimum", i);
            append_app_log(&msg);
            return Err("Interval must be at least 15 minutes".to_string());
        }
        ad.interval_minutes = i;
    }
    // Validate stored ad interval as well (0 means inherit global interval)
    if ad.interval_minutes != 0 && ad.interval_minutes < 15 {
        let msg = format!(
            "start_ad: stored ad interval {} is invalid (must be 0 or >=15)",
            ad.interval_minutes
        );
        append_app_log(&msg);
        return Err(
            "Interval must be at least 15 minutes or 0 to inherit global interval".to_string(),
        );
    }
    // If neither the stored ad interval nor the provided override are set,
    // we cannot start the runner because the frontend's global interval is required.
    if ad.interval_minutes == 0 && interval_minutes.is_none() {
        let msg = format!(
            "start_ad: no interval provided for ad {} (stored=0, no override)",
            id
        );
        append_app_log(&msg);
        return Err("No posting interval specified. Set a global interval in the Ads manager or provide an interval_minutes when starting the ad.".to_string());
    }
    match ads_runner::start_ad(ad, window, interval_minutes) {
        Ok(()) => Ok(()),
        Err(e) => {
            let msg = format!("start_ad: runner failed to start ad {}: {}", id, e);
            append_app_log(&msg);
            Err(e.to_string())
        }
    }
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

/// Save a global roli_verification token for the current user or create a minimal auth entry.
#[tauri::command]
fn save_global_verification(roli_verification: String) -> Result<(), String> {
    match auth_storage::load_auth() {
        Ok(Some(mut a)) => {
            a.roli_verification = Some(roli_verification.clone());
            auth_storage::save_auth(&a).map_err(|e| e.to_string())?;
            append_app_log(&format!(
                "save_global_verification: updated existing auth roli_verification"
            ));
            Ok(())
        }
        Ok(None) => {
            // create a minimal auth entry so verification is persisted globally
            let auth = auth_storage::AuthData {
                user_id: 0,
                username: "".to_string(),
                display_name: "".to_string(),
                roli_verification: Some(roli_verification.clone()),
            };
            auth_storage::save_auth(&auth).map_err(|e| e.to_string())?;
            append_app_log(&format!(
                "save_global_verification: created auth with roli_verification"
            ));
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Tauri command: fetch the full catalog for a given search term (no caching)
#[tauri::command]
async fn get_full_catalog(search: Option<String>) -> Result<serde_json::Value, String> {
    let start = std::time::Instant::now();
    append_app_log(&format!(
        "get_full_catalog: starting fetch for search={:?}",
        search
    ));
    // Cap the fetch to a reasonable upper bound to avoid parsing enormous JSON blobs.
    // If you really need everything, implement paged/batched fetching instead.
    const MAX_FULL_CATALOG: usize = 100_000;
    match trade_ad::fetch_item_details(1usize, MAX_FULL_CATALOG, search.clone()).await {
        Ok((items, _total)) => {
            append_app_log(&format!(
                "get_full_catalog: fetched {} items in {:?}",
                items.len(),
                start.elapsed()
            ));
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
            append_app_log(&format!(
                "get_full_catalog: filtered to {} items, total duration {:?}",
                t,
                start.elapsed()
            ));
            Ok(serde_json::json!({"items": filtered, "total": t}))
        }
        Err(e) => {
            append_app_log(&format!(
                "get_full_catalog: error after {:?}: {}",
                start.elapsed(),
                e
            ));
            Err(e.to_string())
        }
    }
}

/// Tauri command: fetch a player's inventory and enrich with catalog metadata
#[tauri::command]
async fn fetch_enriched_inventory(
    app: tauri::AppHandle,
    player_id: Option<u64>,
    playerId: Option<u64>,
    user_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let start = std::time::Instant::now();
    // Accept either `player_id` (snake_case) or `playerId` (camelCase) from the frontend.
    let pid = player_id
        .or(playerId)
        .ok_or_else(|| "player_id is required".to_string())?;
    append_app_log(&format!(
        "fetch_enriched_inventory: starting for player {}",
        pid
    ));
    // call existing player assets inventory fetch
    let inv = crate::player_assets::fetch_player_inventory(pid)
        .await
        .map_err(|e| e.to_string())?;
    append_app_log(&format!(
        "fetch_enriched_inventory: fetched inventory in {:?}",
        start.elapsed()
    ));
    let items_arr = inv
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // collect missing catalog ids
    let mut missing = Vec::new();
    for it in &items_arr {
        // catalog id may be a number or a string (player_assets returns keys as strings).
        if let Some(v) = it.get("catalog_id").or_else(|| it.get("catalogId")) {
            let maybe = if v.is_number() {
                v.as_u64()
            } else if v.is_string() {
                v.as_str().and_then(|s| s.parse::<u64>().ok())
            } else {
                None
            };
            if let Some(cid) = maybe {
                missing.push(cid);
            }
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
            // parse catalog id from number or string
            let cid = inv_item
                .get("catalog_id")
                .or_else(|| inv_item.get("catalogId"))
                .and_then(|v| {
                    if v.is_number() {
                        v.as_u64()
                    } else if v.is_string() {
                        v.as_str().and_then(|s| s.parse::<u64>().ok())
                    } else {
                        None
                    }
                });
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

    // Check for value changes and send notifications if enabled
    if let Some(uid) = user_id {
        match notification_settings::get_notification_enabled(&uid) {
            Ok(true) => {
                let changes = value_change_detector::detect_value_changes(&enriched);
                for change in changes {
                    let body = format!(
                        "Item: {}\nOld Value: {}\nNew Value: {}",
                        change.name, change.old_value, change.new_value
                    );

                    match tauri_plugin_notification::NotificationExt::notification(&app)
                        .builder()
                        .title("Item Value Changed")
                        .body(&body)
                        .show()
                    {
                        Ok(_) => {
                            if let Some(thumbnail_url) = &change.thumbnail {
                                append_app_log(&format!(
                                    "Value change notification sent for {} (thumbnail: {})",
                                    change.name, thumbnail_url
                                ));
                            } else {
                                append_app_log(&format!(
                                    "Value change notification sent for {} (no thumbnail)",
                                    change.name
                                ));
                            }
                        }
                        Err(e) => {
                            append_app_log(&format!(
                                "Failed to send notification for {}: {}",
                                change.name, e
                            ));
                        }
                    }
                }
            }
            Ok(false) => {
                // Notifications disabled, still update cache but don't notify
                let _ = value_change_detector::detect_value_changes(&enriched);
            }
            Err(e) => {
                append_app_log(&format!("Failed to check notification settings: {}", e));
            }
        }
    }

    append_app_log(&format!(
        "fetch_enriched_inventory: returning {} enriched items, total duration {:?}",
        enriched.len(),
        start.elapsed()
    ));
    Ok(serde_json::json!({"items": enriched}))
}

/// Wrapper Tauri command to expose thumbnail fetching for specific IDs.
/// The actual logic lives in `thumbnails::fetch_thumbnails_for_ids_cmd`.
#[tauri::command]
async fn fetch_thumbnails_for_ids_cmd(
    ids: Vec<u64>,
) -> Result<std::collections::HashMap<String, String>, String> {
    thumbnails::fetch_thumbnails_for_ids_cmd(ids).await
}

/// Get notification enabled status for user
#[tauri::command]
fn get_notification_enabled(user_id: String) -> Result<bool, String> {
    notification_settings::get_notification_enabled(&user_id)
}

/// Set notification enabled status for user
#[tauri::command]
fn set_notification_enabled(user_id: String, enabled: bool) -> Result<(), String> {
    notification_settings::set_notification_enabled(&user_id, enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
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
            // lazy thumbnail fetching by IDs
            fetch_thumbnails_for_ids_cmd,
            fetch_enriched_inventory,
            save_auth_data,
            load_auth_data,
            save_global_verification,
            update_roli_verification,
            logout,
            // notification settings
            get_notification_enabled,
            set_notification_enabled
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
