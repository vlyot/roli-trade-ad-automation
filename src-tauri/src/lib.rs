// lib.rs: Tauri commands for Rolimons trade ad automation GUI application.

mod auth_storage;
mod avatar_thumbnails;
mod roblox_user;
mod rolimons_players;
mod trade_ad;
mod verification;

use serde::{Deserialize, Serialize};

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
            generate_verification_code,
            verify_user,
            // avatar thumbnails for user search
            avatar_thumbnails::fetch_avatar_thumbnails,
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
