// lib.rs: Tauri commands for Rolimons trade ad automation GUI application.

mod cookie;
mod trade_ad;

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
        return Ok(TradeAdResponse { success: false, logs });
    }
    if request.offer_item_ids.len() > 4 {
        logs.push("You can only offer up to 4 items".to_string());
        return Ok(TradeAdResponse { success: false, logs });
    }
    let total_requests = request.request_item_ids.len() + request.request_tags.len();
    if total_requests == 0 {
        logs.push("You must request at least one item or tag".to_string());
        return Ok(TradeAdResponse { success: false, logs });
    }
    if total_requests > 4 {
        logs.push("You can only request up to 4 items (combined item IDs and tags)".to_string());
        return Ok(TradeAdResponse { success: false, logs });
    }
    if request.roli_verification.trim().is_empty() {
        logs.push("Roli verification cookie is required".to_string());
        return Ok(TradeAdResponse { success: false, logs });
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
            Ok(TradeAdResponse { success: true, logs })
        },
        Err(e) => {
            logs.push(format!("Failed to post trade ad: {}", e));
            Ok(TradeAdResponse { success: false, logs })
        },
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            post_trade_ad,
            validate_request_tag,
            get_available_tags
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
