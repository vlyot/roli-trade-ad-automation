// catalog.rs
// Responsibility: Fetch Rolimons item details and provide ItemInfo type.

use anyhow::{anyhow, Result};
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ItemInfo {
    pub id: u64,
    pub name: String,
    pub abbreviation: Option<String>,
    pub rap: u64,
    pub value: u64,
    // data URL (e.g. data:image/webp;base64,...) or remote URL for the item's thumbnail
    pub thumbnail: Option<String>,
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
        .header(USER_AGENT, "rolimons-fetcher/1.0")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(anyhow!("Failed to fetch item details: {}", resp.status()));
    }

    let body = resp.text().await.unwrap_or_default();
    let root: serde_json::Value = serde_json::from_str(&body)?;

    // Extract items object
    let items_value = match root.get("items") {
        Some(v) => v,
        None => return Ok((Vec::new(), 0)),
    };
    let items_map = match items_value {
        serde_json::Value::Object(m) => m,
        _ => return Ok((Vec::new(), 0)),
    };

    let mut items: Vec<ItemInfo> = Vec::with_capacity(items_map.len());

    for (key, val) in items_map.iter() {
        let id: u64 = match key.parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

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
            let rap = arr.get(2).and_then(|v| v.as_i64()).unwrap_or(0) as i64;
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
                thumbnail: None,
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

    // Sort by value desc (prefer higher value items first for requests)
    let mut sorted = filtered;
    sorted.sort_by(|a, b| b.value.cmp(&a.value));

    let total = sorted.len();
    let start = page.saturating_sub(1) * per_page;
    let end = std::cmp::min(start + per_page, total);
    let page_items = if start >= total {
        Vec::new()
    } else {
        let mut page_slice: Vec<ItemInfo> = sorted[start..end].to_vec();
        match super::thumbnails::fetch_thumbnails_map(&client).await {
            Ok(map) => {
                eprintln!("thumbnails: helper returned {} entries", map.len());
                for it in page_slice.iter_mut() {
                    let key = it.id.to_string();
                    it.thumbnail = map.get(&key).cloned();
                }
            }
            Err(e) => {
                eprintln!("thumbnails: helper error: {}", e);
            }
        }
        page_slice
    };

    Ok((page_items, total))
}

/// Fetch a small list of items by their catalog IDs. Returns the ItemInfo list (no paging).
pub async fn fetch_items_by_ids(ids: Vec<u64>) -> Result<Vec<ItemInfo>> {
    // Short-circuit empty
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    // Fetch the Rolimons itemdetails JSON once and pick only requested ids
    let url = "https://www.rolimons.com/itemapi/itemdetails";
    let client = reqwest::Client::new();

    let resp = client
        .get(url)
        .header(USER_AGENT, "rolimons-fetcher/1.0")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(anyhow!("Failed to fetch item details: {}", resp.status()));
    }

    let body = resp.text().await.unwrap_or_default();
    let root: serde_json::Value = serde_json::from_str(&body)?;
    let items_value = match root.get("items") {
        Some(v) => v,
        None => return Ok(Vec::new()),
    };
    let items_map = match items_value {
        serde_json::Value::Object(m) => m,
        _ => return Ok(Vec::new()),
    };

    let mut out: Vec<ItemInfo> = Vec::new();
    for id in ids.into_iter() {
        let key = id.to_string();
        if let Some(val) = items_map.get(&key) {
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
                let rap = arr.get(2).and_then(|v| v.as_i64()).unwrap_or(0) as i64;
                let value_raw = arr.get(3).and_then(|v| v.as_i64()).unwrap_or(-1) as i64;
                let rap_u = if rap < 0 { 0 } else { rap as u64 };
                let value_u = if value_raw < 0 {
                    rap_u
                } else {
                    value_raw as u64
                };

                out.push(ItemInfo {
                    id,
                    name,
                    abbreviation: abbr,
                    rap: rap_u,
                    value: value_u,
                    thumbnail: None,
                });
            }
        }
    }

    // attach thumbnails for requested ids
    match super::thumbnails::fetch_thumbnails_map(&client).await {
        Ok(map) => {
            for it in out.iter_mut() {
                let key = it.id.to_string();
                it.thumbnail = map.get(&key).cloned();
            }
        }
        Err(e) => {
            eprintln!("thumbnails: helper error: {}", e);
        }
    }

    Ok(out)
}
