// Post a trade ad directly using reqwest, bypassing the roli crate.
// This is for troubleshooting authentication/cookie issues with the Rolimons API.
use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT};
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, ACCEPT_LANGUAGE, ORIGIN, REFERER};
use serde_json::json;

/// Posts a trade ad to Rolimons using reqwest, setting the _RoliVerification cookie manually.
///
/// # Arguments
/// * `roli_verification` - The value of the _RoliVerification cookie
/// * `player_id` - The user's Roblox player ID
/// * `offer_item_ids` - Vec of item IDs to offer
/// * `request_item_ids` - Vec of item IDs to request
/// * `request_tags` - Vec of request tags (strings, e.g. "any", "upgrade")
pub async fn post_trade_ad_direct(
    roli_verification: &str,
    player_id: u64,
    offer_item_ids: Vec<u64>,
    request_item_ids: Vec<u64>,
    request_tags: Vec<String>,
) -> Result<()> {
    let client = reqwest::Client::new();

    // Map request_tags to lowercase strings (as in HAR)
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
    // Send only _RoliVerification cookie, as seen in browser
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
    if !status.is_success() {
        return Err(anyhow!("Failed to post trade ad: {} - {}", status, text));
    }

    println!("Trade ad posted! Response: {}", text);
    Ok(())
}
// trade_ad.rs: Contains trade ad posting logic and request tag mapping for Rolimons automation.

use roli::{trade_ads, Client};

pub fn map_request_tag(s: &str) -> trade_ads::RequestTag {
    match s {
        "any" => trade_ads::RequestTag::Any,
        "demand" => trade_ads::RequestTag::Demand,
        "rares" => trade_ads::RequestTag::Rares,
        "robux" => trade_ads::RequestTag::Robux,
        "upgrade" => trade_ads::RequestTag::Upgrade,
        "downgrade" => trade_ads::RequestTag::Downgrade,
        "rap" => trade_ads::RequestTag::Rap,
        "wishlist" => trade_ads::RequestTag::Wishlist,
        "projecteds" => trade_ads::RequestTag::Projecteds,
        "adds" => trade_ads::RequestTag::Adds,
        other => panic!("Invalid request tag: {other}"),
    }
}

pub async fn post_once(
    client: &Client,
    player_id: u64,
    offer_item_ids: Vec<u64>,
    request_item_ids: Vec<u64>,
    request_tags: Vec<trade_ads::RequestTag>,
) {
    println!("[DEBUG] Preparing CreateTradeAdParams");
    let params = trade_ads::CreateTradeAdParams {
        player_id,
        offer_item_ids,
        request_item_ids,
        request_tags,
    };
    println!("[DEBUG] Params: {:?}", params);
    match client.create_trade_ad(params).await {
        Ok(_) => println!(
            "[DEBUG] Trade ad posted! Visible at https://www.rolimons.com/playertrades/{}",
            player_id
        ),
        Err(e) => eprintln!("[ERROR] CreateTradeAd failed: {e}"),
    }
}
