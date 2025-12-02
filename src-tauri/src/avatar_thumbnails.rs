use reqwest::header::USER_AGENT;
use serde_json::Value;
use std::collections::HashMap;

/// Tauri command: fetch avatar bust thumbnails from Rolimons for a list of user IDs.
/// Returns a mapping from user id string -> thumbnail URL (only entries with a URL are returned).
#[tauri::command]
pub async fn fetch_avatar_thumbnails(
    user_ids: Vec<u64>,
) -> Result<HashMap<String, String>, String> {
    if user_ids.is_empty() {
        return Ok(HashMap::new());
    }

    // Only fetch up to 50 ids in one request to avoid extremely long URLs.
    let chunk: Vec<String> = user_ids.iter().take(50).map(|id| id.to_string()).collect();
    let url = format!(
        "https://thumbnails.rolimons.com/avatarbust?userIds={}&size=150x150",
        chunk.join(",")
    );

    let start = std::time::Instant::now();
    eprintln!(
        "avatar_thumbnails: fetching for ids={} url={}",
        chunk.join(","),
        url
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header(USER_AGENT, "rolimons-avatar-fetcher/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("thumbnail HTTP error: {}", resp.status()));
    }

    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut map: HashMap<String, String> = HashMap::new();

    if let Some(thumbs) = json.get("thumbnails").and_then(|v| v.as_object()) {
        for (k, v) in thumbs.iter() {
            if let Some(url_val) = v.get("url").and_then(|s| s.as_str()) {
                map.insert(k.clone(), url_val.to_string());
            }
        }
    }

    eprintln!("avatar_thumbnails: fetched {} thumbnails in {:?}", map.len(), start.elapsed());
    Ok(map)
}
