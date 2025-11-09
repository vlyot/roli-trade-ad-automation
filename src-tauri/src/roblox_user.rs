// roblox_user.rs
// Responsibility: Interface with Roblox user search and details endpoints.

use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use rand::Rng;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::Duration;
use std::time::Instant;
use tokio::time::sleep;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RobloxUser {
    pub id: u64,
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "hasVerifiedBadge")]
    pub has_verified_badge: bool,
    #[serde(rename = "previousUsernames", default)]
    pub previous_usernames: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserSearchResponse {
    #[serde(rename = "previousPageCursor")]
    pub previous_page_cursor: Option<String>,
    #[serde(rename = "nextPageCursor")]
    pub next_page_cursor: Option<String>,
    pub data: Vec<RobloxUser>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UserDetails {
    pub id: u64,
    pub name: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub description: String,
    pub created: String,
    #[serde(rename = "isBanned")]
    pub is_banned: bool,
    #[serde(rename = "hasVerifiedBadge")]
    pub has_verified_badge: bool,
    #[serde(rename = "externalAppDisplayName")]
    pub external_app_display_name: Option<String>,
}

/// Search for Roblox users by keyword.
/// Returns up to `limit` results (default 10).
pub async fn search_users(keyword: &str, limit: Option<u32>) -> Result<UserSearchResponse> {
    if keyword.len() < 3 {
        return Err(anyhow!("Keyword must be at least 3 characters"));
    }

    // Simple in-memory cache to reduce Roblox API calls and avoid 429 rate limits.
    // Keyed by normalized lowercase keyword and optional limit (as string).
    static SEARCH_CACHE: Lazy<RwLock<HashMap<String, (Instant, UserSearchResponse)>>> =
        Lazy::new(|| RwLock::new(HashMap::new()));
    const SEARCH_TTL: Duration = Duration::from_secs(60); // cache for 60s

    let norm_key = format!("{}::{}", keyword.to_lowercase(), limit.unwrap_or(10));
    if let Ok(cache) = SEARCH_CACHE.read() {
        if let Some((ts, resp)) = cache.get(&norm_key) {
            if ts.elapsed() < SEARCH_TTL {
                eprintln!(
                    "roblox_user: cache hit for '{}' (age {:?})",
                    norm_key,
                    ts.elapsed()
                );
                return Ok(resp.clone());
            }
        }
    }

    let limit = limit.unwrap_or(10);
    let url = format!(
        "https://users.roblox.com/v1/users/search?keyword={}&limit={}",
        urlencoding::encode(keyword),
        limit
    );

    let client = reqwest::Client::new();

    // Retry loop with exponential backoff and jitter to handle 429 rate limits.
    let mut attempt: u32 = 0;
    let max_attempts: u32 = 4;
    loop {
        attempt += 1;
        let resp = client
            .get(&url)
            .header(USER_AGENT, "roblox-user-search/1.0")
            .send()
            .await?;

        if resp.status().as_u16() == 429 {
            // Respect Retry-After header if present, otherwise exponential backoff with jitter
            if attempt >= max_attempts {
                // If we have a cached response, return it instead of failing immediately.
                if let Ok(cache) = SEARCH_CACHE.read() {
                    if let Some((_, cached)) = cache.get(&norm_key) {
                        eprintln!(
                            "roblox_user: 429 exhausted; returning cached response for {}",
                            norm_key
                        );
                        return Ok(cached.clone());
                    }
                }

                return Err(anyhow!(
                    "Too many requests (429) from Roblox API; please try again later"
                ));
            }
            let retry_after = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());

            if let Some(secs) = retry_after {
                eprintln!(
                    "roblox_user: 429 received; retrying after {}s (Retry-After header)",
                    secs
                );
                sleep(Duration::from_secs(secs)).await;
            } else {
                // exponential backoff: base 1s * 2^(attempt-1) plus jitter up to 500ms
                let exp = std::cmp::min(attempt.saturating_sub(1), 4) as u32; // cap exponent to avoid huge waits
                let base = 1u64.checked_shl(exp).unwrap_or(16); // 1 << exp
                let jitter_ms: u64 = {
                    let mut r = rand::thread_rng();
                    r.gen_range(0..500)
                };
                let wait = Duration::from_millis(base * 1000 + jitter_ms);
                eprintln!(
                    "roblox_user: 429 received; retrying after {:?} (attempt {}/{})",
                    wait, attempt, max_attempts
                );
                sleep(wait).await;
            }

            continue;
        }

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to search users: {}", resp.status()));
        }

        let body = resp.text().await?;
        let result: UserSearchResponse = serde_json::from_str(&body)?;

        // Store in cache
        if let Ok(mut cache) = SEARCH_CACHE.write() {
            cache.insert(norm_key.clone(), (Instant::now(), result.clone()));
        }

        return Ok(result);
    }
}

/// Fetch detailed information for a specific Roblox user by ID.
pub async fn get_user_details(user_id: u64) -> Result<UserDetails> {
    let url = format!("https://users.roblox.com/v1/users/{}", user_id);

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header(USER_AGENT, "roblox-user-details/1.0")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(anyhow!("Failed to fetch user details: {}", resp.status()));
    }

    let body = resp.text().await?;
    let details: UserDetails = serde_json::from_str(&body)?;
    Ok(details)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_search_users() {
        let result = search_users("test", Some(5)).await;
        assert!(result.is_ok());
    }
}
