// post.rs
// Responsibility: Post trade ads to Rolimons API using reqwest.

use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT};
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, ACCEPT_LANGUAGE, ORIGIN, REFERER};
use serde_json::json;

/// Posts a trade ad to Rolimons using reqwest, setting the _RoliVerification cookie manually.
pub async fn post_trade_ad_direct(
    roli_verification: &str,
    player_id: u64,
    offer_item_ids: Vec<u64>,
    request_item_ids: Vec<u64>,
    request_tags: Vec<String>,
) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    // Map request_tags to lowercase strings
    let mapped_tags: Vec<String> = request_tags.iter().map(|tag| tag.to_lowercase()).collect();

    let payload = json!({
        "player_id": player_id,
        "offer_item_ids": offer_item_ids,
        "request_item_ids": request_item_ids,
        "request_tags": mapped_tags,
    });

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/json, text/plain, */*"),
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    headers.insert(
        ACCEPT_ENCODING,
        HeaderValue::from_static("gzip, deflate, br"),
    );
    headers.insert(ORIGIN, HeaderValue::from_static("https://www.rolimons.com"));
    headers.insert(
        REFERER,
        HeaderValue::from_static("https://www.rolimons.com/tradeads"),
    );

    // Send only _RoliVerification cookie
    let cookie_header = format!("_RoliVerification={}", roli_verification);
    headers.insert(COOKIE, HeaderValue::from_str(&cookie_header).unwrap());

    let url = "https://api.rolimons.com/tradeads/v1/createad";

    let resp = client
        .post(url)
        .headers(headers)
        .json(&payload)
        .send()
        .await?;

    let status = resp.status();
    let bytes = resp.bytes().await.unwrap_or_default();
    let text = match String::from_utf8(bytes.to_vec()) {
        Ok(t) => t,
        Err(_) => format!("<non-UTF8 response: {} bytes>", bytes.len()),
    };

    // Detect common verification-related failures so callers can act only on those.
    let lower = text.to_lowercase();
    let verification_related = matches!(status.as_u16(), 401 | 403)
        || lower.contains("verification")
        || lower.contains("roli_verification")
        || lower.contains("invalid token")
        || lower.contains("not authenticated");

    if !status.is_success() {
        if verification_related {
            // Special error marker so the runner/frontend can detect verification expiration
            return Err(anyhow!("verification_required: {} - {}", status, text));
        }
        return Err(anyhow!("Failed to post trade ad: {} - {}", status, text));
    }

    // Return a concise, UI-friendly success string (frontend will display this)
    Ok("trade ad post success".to_string())
}
