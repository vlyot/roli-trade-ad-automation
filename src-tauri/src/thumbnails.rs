use once_cell::sync::Lazy;
use reqwest::header::USER_AGENT;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Simple in-memory cache with TTL for thumbnails map.
static THUMB_CACHE: Lazy<RwLock<(Instant, HashMap<String, String>)>> =
    Lazy::new(|| RwLock::new((Instant::now() - Duration::from_secs(3600), HashMap::new())));
const THUMB_TTL: Duration = Duration::from_secs(60 * 10); // 10 minutes

/// Fetch Rolimons small thumbnails map and return a HashMap mapping item ID string -> data URL
/// The function accepts a reqwest client reference to reuse connections. Results are cached for THUMB_TTL.
pub async fn fetch_thumbnails_map(
    client: &reqwest::Client,
) -> Result<HashMap<String, String>, reqwest::Error> {
    // Check cache first
    if let Ok(cache_guard) = THUMB_CACHE.read() {
        let (ts, ref map) = &*cache_guard;
        if ts.elapsed() < THUMB_TTL && !map.is_empty() {
            eprintln!(
                "thumbnails: cache hit ({} entries, age {:?})",
                map.len(),
                ts.elapsed()
            );
            return Ok(map.clone());
        }
    }

    // fetch fresh
    let mut map: HashMap<String, String> = HashMap::new();

    let resp = client
        .get("https://api.rolimons.com/itemthumbs/v1/thumbssm")
        .header(USER_AGENT, "rolimons-thumbs-fetcher/1.0")
        .send()
        .await?;

    if resp.status().is_success() {
        // Read the response text once and reuse it for parsing and diagnostics.
        let text = resp.text().await.unwrap_or_default();
        match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(mut obj)) => {
                // The Rolimons endpoint returns a wrapper like { success: true, item_count: N, items: { id: url, ... } }
                // Prefer the nested `items` object when present.
                if let Some(items_val) = obj.remove("items") {
                    if let Value::Object(items_map) = items_val {
                        eprintln!("thumbnails: items_map length {}", items_map.len());
                        let mut seen = 0usize;
                        for (k, v) in items_map.into_iter() {
                            match v {
                                Value::String(s) => {
                                    // Preserve data: URLs and remote http(s) URLs; otherwise assume base64 and prefix.
                                    let val = if s.starts_with("data:")
                                        || s.starts_with("http:")
                                        || s.starts_with("https:")
                                    {
                                        s
                                    } else {
                                        format!("data:image/webp;base64,{}", s)
                                    };
                                    map.insert(k, val);
                                }
                                other => {
                                    // Log a sample of unexpected value types to help debugging.
                                    if seen < 3 {
                                        eprintln!("thumbnails: items_map[{}] = {}", k, other);
                                        seen += 1;
                                    }
                                }
                            }
                        }
                    } else {
                        eprintln!("thumbnails: 'items' field present but not an object");
                    }
                } else {
                    // Fallback: top-level object might itself be the map of id->string
                    for (k, v) in obj.into_iter() {
                        if let Value::String(s) = v {
                            let val = if s.starts_with("data:")
                                || s.starts_with("http:")
                                || s.starts_with("https:")
                            {
                                s
                            } else {
                                format!("data:image/webp;base64,{}", s)
                            };
                            map.insert(k, val);
                        }
                    }
                }
                eprintln!("thumbnails: fetched {} entries", map.len());
            }
            Ok(_) => eprintln!("thumbnails: unexpected JSON shape from thumbs endpoint"),
            Err(e) => eprintln!("thumbnails: JSON parse error: {}", e),
        }

        // If we fetched zero entries, print a small preview of the response body to help
        // diagnose whether the endpoint returned an empty object, an HTML error page,
        // or a different JSON shape than expected.
        if map.is_empty() {
            let preview = if text.len() > 400 {
                format!("{}...", &text[..400])
            } else {
                text.clone()
            };
            eprintln!("thumbnails: response preview (truncated): {}", preview);
        }
    } else {
        eprintln!(
            "thumbnails: HTTP error {} when fetching thumbnails",
            resp.status()
        );
    }

    // update cache
    if let Ok(mut cache_guard) = THUMB_CACHE.write() {
        *cache_guard = (Instant::now(), map.clone());
    }

    Ok(map)
}
