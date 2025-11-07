// trade_ad.rs: Contains trade ad posting logic and request tag mapping for Rolimons automation.
// Refactored for Tauri GUI application.

use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT};
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, ACCEPT_LANGUAGE, ORIGIN, REFERER};
use roli::trade_ads;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ItemInfo {
    pub id: u64,
    pub name: String,
    pub abbreviation: Option<String>,
    pub rap: u64,
    pub value: u64,
}

/// Fetches Rolimons item details from their public item API, maps indices to fields,
/// sorts by RAP descending and returns a page of items plus total count.
pub async fn fetch_item_details(
    page: usize,
    per_page: usize,
    search: Option<String>,
) -> Result<(Vec<ItemInfo>, usize)> {
    // The public Rolimons item details endpoint
    let url = "https://www.rolimons.com/itemapi/itemdetails";
    let client = reqwest::Client::new();

    let resp = client
        .get(url)
        .header(USER_AGENT, HeaderValue::from_static("rolimons-fetcher/1.0"))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(anyhow!("Failed to fetch item details: {}", resp.status()));
    }

    let body = resp.text().await.unwrap_or_default();
    // The response has top-level keys: success, item_count, items
    println!("[fetch_item_details] fetched body length: {}", body.len());
    let root: serde_json::Value = serde_json::from_str(&body)?;
    if let serde_json::Value::Object(root_map) = &root {
        println!(
            "[fetch_item_details] root keys: {:?}",
            root_map.keys().collect::<Vec<_>>()
        );
    }
    // Extract items object
    let items_value = match root.get("items") {
        Some(v) => v,
        None => {
            println!("[fetch_item_details] no 'items' key in response");
            return Ok((Vec::new(), 0));
        }
    };
    let items_map = match items_value {
        serde_json::Value::Object(m) => m,
        other => {
            println!("[fetch_item_details] 'items' is not an object: {}", other);
            return Ok((Vec::new(), 0));
        }
    };
    println!(
        "[fetch_item_details] parsed items entries: {}",
        items_map.len()
    );

    let mut items: Vec<ItemInfo> = Vec::with_capacity(items_map.len());

    for (key, val) in items_map.iter() {
        // key is the item id as string
        let id: u64 = match key.parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Expecting an array like: [name, abbreviation, rap, value, ...]
        if let serde_json::Value::Array(arr) = val {
            let name = arr
                .get(0)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let abbr = arr
                .get(1)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());
            // rap at index 2
            let rap = arr.get(2).and_then(|v| v.as_i64()).unwrap_or(0) as i64;
            // value at index 3 (may be -1)
            let value_raw = arr.get(3).and_then(|v| v.as_i64()).unwrap_or(-1) as i64;
            let rap_u = if rap < 0 { 0 } else { rap as u64 };
            let value_u = if value_raw < 0 {
                rap_u
            } else {
                value_raw as u64
            };

            let item = ItemInfo {
                id,
                name,
                abbreviation: abbr,
                rap: rap_u,
                value: value_u,
            };
            items.push(item);
        }
    }

    // Optional filtering by search (match name or abbreviation)
    let filtered: Vec<ItemInfo> = if let Some(q) = search {
        let ql = q.to_lowercase();
        items
            .into_iter()
            .filter(|it| {
                it.name.to_lowercase().contains(&ql)
                    || it
                        .abbreviation
                        .as_ref()
                        .map(|a| a.to_lowercase().contains(&ql))
                        .unwrap_or(false)
            })
            .collect()
    } else {
        items
    };

    // Sort by RAP desc
    let mut sorted = filtered;
    sorted.sort_by(|a, b| b.rap.cmp(&a.rap));

    let total = sorted.len();
    let start = page.saturating_sub(1) * per_page;
    let end = std::cmp::min(start + per_page, total);
    let page_items = if start >= total {
        Vec::new()
    } else {
        sorted[start..end].to_vec()
    };

    Ok((page_items, total))
}

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
) -> Result<String> {
    let client = reqwest::Client::new();

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

    if !status.is_success() {
        return Err(anyhow!("Failed to post trade ad: {} - {}", status, text));
    }

    Ok(format!("Trade ad posted successfully! Response: {}", text))
}
