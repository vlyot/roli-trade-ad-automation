use reqwest::header::USER_AGENT;
use serde_json::Value;

/// Search players via Rolimons players API.
/// This command returns player `id` and `name` quickly. Thumbnails should be fetched separately
/// using the `fetch_avatar_thumbnails` command so the UI can display names immediately.
#[tauri::command]
pub async fn search_players_with_thumbnails(
    searchstring: String,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    if searchstring.trim().len() < 1 {
        return Err("searchstring must be provided".into());
    }

    let encoded = urlencoding::encode(&searchstring);
    let url = format!(
        "https://api.rolimons.com/players/v1/playersearch?searchstring={}",
        encoded
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header(USER_AGENT, "rolimons-players-search/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!(
            "Rolimons players search HTTP error: {}",
            resp.status()
        ));
    }

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;

    // Extract players array ([[id, name], ...])
    let players_arr = match body.get("players") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };

    // Build vector of (id, name)
    let mut players: Vec<(u64, String)> = Vec::new();
    for p in players_arr.iter() {
        if let Value::Array(pair) = p {
            if pair.len() >= 2 {
                if let (Some(idv), Some(namev)) = (pair.get(0), pair.get(1)) {
                    if let (Some(id), Some(name)) = (idv.as_u64(), namev.as_str()) {
                        players.push((id, name.to_string()));
                    }
                }
            }
        }
    }

    // Apply optional limit
    let limit = limit.unwrap_or(players.len());
    if players.len() > limit {
        players.truncate(limit);
    }

    // Build result players array (id + name). Thumbnails will be fetched separately.
    let mut out_players: Vec<Value> = Vec::new();
    let mut ids: Vec<String> = Vec::new();
    for (id, name) in players.into_iter() {
        ids.push(id.to_string());
        out_players.push(serde_json::json!({ "id": id, "name": name }));
    }

    let result = serde_json::json!({
        "success": true,
        "result_count": out_players.len(),
        "players": out_players,
        "ids": ids,
    });

    Ok(result)
}
